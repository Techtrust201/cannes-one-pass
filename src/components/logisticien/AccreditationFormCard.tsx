"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { Accreditation } from "@/types";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Info, PlusCircle, Phone, MessageCircle, Send, Save, Copy, Check, Loader2 } from "lucide-react";
import VehicleForm from "@/components/accreditation/VehicleForm";
import AccreditationHistory from "./AccreditationHistory";
import DailyTimeSlotHistory from "./DailyTimeSlotHistory";
import AccreditationChat from "./AccreditationChat";
import type { Vehicle } from "@/types";
import { getTelLink, getWhatsAppLink } from "@/lib/contact-utils";
import ActionButtons from "./ActionButtons";

function useEventOptions() {
  const [options, setOptions] = React.useState<
    { value: string; label: string; id: string; logo: string | null }[]
  >([]);

  React.useEffect(() => {
    fetch("/api/events")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setOptions(
            data.map((e: { id: string; slug: string; name: string; logo: string | null }) => ({
              value: e.slug,
              label: e.name,
              id: e.id,
              logo: e.logo || `/api/events/${e.id}/logo`,
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  return options;
}

interface Props {
  acc: Accreditation;
}

export default function AccreditationFormCard({ acc }: Props) {
  const router = useRouter();
  const EVENT_OPTIONS = useEventOptions();
  const [company, setCompany] = useState(acc.company ?? "");
  const [stand, setStand] = useState(acc.stand ?? "");
  const [unloading, setUnloading] = useState(acc.unloading ?? "");
  const [saving, setSaving] = useState(false);

  const [event, setEvent] = useState(acc.event ?? "");
  const [message, setMessage] = useState(acc.message ?? "");

  const [email, setEmail] = useState(acc.email ?? "");
  const [sending, setSending] = useState(false);

  const [emailHistory, setEmailHistory] = useState<
    { email: string; sentAt: string }[]
  >([]);

  const refreshEmailHistory = useCallback(async () => {
    const res = await fetch(`/api/accreditations/${acc.id}/emails`);
    if (res.ok) setEmailHistory(await res.json());
  }, [acc.id]);

  useEffect(() => {
    refreshEmailHistory();
  }, [refreshEmailHistory]);

  const [editVehicleId, setEditVehicleId] = useState<number | null>(null);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  async function handleEditVehicle(v: Vehicle) {
    setEditVehicleId(v.id);
    setEditVehicle({ ...v });
  }
  async function handleSaveEditVehicle() {
    const res = await fetch(`/api/vehicles/${editVehicleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editVehicle),
    });
    if (res.ok) {
      setEditVehicleId(null);
      setEditVehicle(null);
      router.refresh();
    } else {
      alert("Erreur modification véhicule");
    }
  }
  async function handleDeleteVehicle(id: number) {
    if (!confirm("Supprimer ce véhicule ?")) return;
    const res = await fetch(`/api/vehicles/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else alert("Erreur suppression véhicule");
  }

  const [historyVersion, setHistoryVersion] = useState(0);
  const [conflictError, setConflictError] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyId() {
    navigator.clipboard.writeText(acc.id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function save() {
    setSaving(true);
    setConflictError(false);
    try {
      const res = await fetch(`/api/accreditations/${acc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: acc.status, // on garde le statut actuel — les changements passent par ActionButtons
          company,
          stand,
          unloading,
          event,
          message,
          version: acc.version, // Optimistic locking
          vehicles: [
            {
              ...acc.vehicles[0],
              phoneCode: acc.vehicles[0]?.phoneCode ?? "+33",
              phoneNumber: acc.vehicles[0]?.phoneNumber ?? "",
              date: acc.vehicles[0]?.date ?? "",
              time: acc.vehicles[0]?.time ?? "",
              size: acc.vehicles[0]?.size ?? "",
              city: acc.vehicles[0]?.city ?? "",
              unloading: acc.vehicles[0]?.unloading ?? "lat",
            },
          ],
        }),
      });
      if (res.status === 409) {
        setConflictError(true);
        return;
      }
      if (!res.ok) throw new Error("Erreur");
      setConflictError(false);
      router.refresh();
      setHistoryVersion((v) => v + 1);
    } catch {
      alert("Erreur d'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  async function sendAccreditation() {
    if (!email) return;
    try {
      setSending(true);
      const res = await fetch(`/api/accreditations/${acc.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("Erreur envoi");
      await refreshEmailHistory();
      router.refresh();
      alert("E-mail envoyé");
      setHistoryVersion((v) => v + 1);
    } catch {
      alert("Impossible d'envoyer l'e-mail");
    } finally {
      setSending(false);
    }
  }

  const handleDuplicateForNewVehicle = () => {
    const params = new URLSearchParams({
      step: "1",
      company,
      stand,
      unloading,
      event,
      message: message || "",
      email: email || "",
      city: acc.vehicles[0]?.city || "",
    });
    router.push(`/logisticien/nouveau?${params.toString()}`);
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl shadow-xl w-full max-h-[85vh] overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="bg-[#4F587E] text-white rounded-t-2xl px-6 py-4 shadow-md flex items-center gap-3">
        <div className="p-1.5 bg-white/15 rounded-lg">
          <Info size={18} />
        </div>
        <h1 className="text-sm font-bold tracking-wide">Infos accréditation</h1>
      </div>

      {/* Contenu scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 overflow-x-hidden p-5">

        {/* ── WORKFLOW : Statut + Actions ── */}
        <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <ActionButtons
            acc={acc}
            onActionComplete={() => setHistoryVersion((v) => v + 1)}
          />
        </div>

        {/* Historique des créneaux (remplace "Durée sur site") */}
        <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <DailyTimeSlotHistory accreditationId={acc.id} refreshKey={historyVersion} />
        </div>

        {/* Liste des véhicules */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-base text-gray-800 flex items-center gap-2">
              <div className="w-3 h-3 bg-[#4F587E] rounded-full"></div>
              Véhicules accrédités
            </h3>
            <button
              onClick={handleDuplicateForNewVehicle}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#4F587E]/10 text-[#4F587E] border border-[#4F587E]/20 hover:bg-[#4F587E]/20 transition"
            >
              <PlusCircle size={14} />
              Ajouter un véhicule
            </button>
          </div>
          {acc.vehicles && acc.vehicles.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-gray-300 rounded-xl overflow-hidden mb-6 min-w-full shadow-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-4 text-left font-semibold text-gray-800">
                      Plaque
                    </th>
                    <th className="p-4 text-left font-semibold text-gray-800">
                      Taille
                    </th>
                    <th className="p-4 text-left font-semibold text-gray-800">
                      Téléphone
                    </th>
                    <th className="p-4 text-left font-semibold text-gray-800">
                      Date
                    </th>
                    <th className="p-4 text-left font-semibold text-gray-800">
                      Heure
                    </th>
                    <th className="p-4 text-left font-semibold text-gray-800">
                      Ville
                    </th>
                    <th className="p-4 text-left font-semibold text-gray-800">
                      Déchargement
                    </th>
                    <th className="p-4 text-left font-semibold text-gray-800">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {acc.vehicles.map((v) => (
                    <React.Fragment key={v.id}>
                      <tr className="border-b border-gray-200 hover:bg-gray-100 transition-all duration-200">
                        <td className="p-4 font-medium text-gray-800">
                          <div>{v.plate}</div>
                          {v.size === "SEMI_REMORQUE" && (
                            <div className="text-xs text-gray-500 mt-0.5">
                              Remorque: {v.trailerPlate || <span className="italic text-gray-400">Non renseignée</span>}
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-gray-700">{v.size}</td>
                        <td className="p-4 text-gray-700">
                          <div className="flex items-center gap-2">
                            <span>{v.phoneCode} {v.phoneNumber}</span>
                            {v.phoneNumber && (
                              <div className="flex gap-1">
                                <a
                                  href={getTelLink(v.phoneCode, v.phoneNumber)}
                                  className="p-1 rounded-md bg-green-100 text-green-700 hover:bg-green-200 transition"
                                  title="Appeler"
                                >
                                  <Phone size={14} />
                                </a>
                                <a
                                  href={getWhatsAppLink(v.phoneCode, v.phoneNumber)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition"
                                  title="WhatsApp"
                                >
                                  <MessageCircle size={14} />
                                </a>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-gray-700">{v.date}</td>
                        <td className="p-4 text-gray-700">{v.time}</td>
                        <td className="p-4 text-gray-700">{v.city}</td>
                        <td className="p-4 text-gray-700">
                          {v.unloading.includes("lat") &&
                          v.unloading.includes("rear")
                            ? "Latéral + Arrière"
                            : v.unloading.includes("lat")
                              ? "Latéral"
                              : v.unloading.includes("rear")
                                ? "Arrière"
                                : "Non défini"}
                        </td>
                        <td className="p-4 flex gap-2">
                          <button
                            onClick={() => handleEditVehicle(v)}
                            title="Éditer"
                            className="text-[#4F587E] hover:bg-gray-200 rounded-lg p-2 transition-all duration-200"
                          >
                            <Pencil size={18} />
                          </button>
                          <button
                            onClick={() => handleDeleteVehicle(v.id)}
                            title="Supprimer"
                            className="text-red-400 hover:text-red-600 rounded-lg p-2 transition-all duration-200"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                      {editVehicleId === v.id && (
                        <tr>
                          <td colSpan={8} className="bg-gray-50 p-6">
                            <VehicleForm
                              data={editVehicle!}
                              update={(patch) =>
                                setEditVehicle((veh) =>
                                  veh ? { ...veh, ...patch } : null
                                )
                              }
                              onValidityChange={() => {}}
                            />
                            <div className="flex gap-3 justify-end mt-4">
                              <button
                                onClick={() => {
                                  setEditVehicleId(null);
                                  setEditVehicle(null);
                                }}
                                className="px-4 py-2 rounded-lg border border-gray-400 hover:bg-gray-200 transition-colors duration-200"
                              >
                                Annuler
                              </button>
                              <button
                                onClick={handleSaveEditVehicle}
                                className="px-4 py-2 rounded-lg bg-[#4F587E] text-white hover:bg-[#3B4252] transition-colors duration-200"
                              >
                                Enregistrer
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4 bg-white rounded-xl border border-gray-200">
              Aucun véhicule ajouté
            </p>
          )}
        </div>

        {/* ── Form grid — informations éditables ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
          {/* ID Badge */}
          <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex items-center gap-3">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">ID</span>
            <button
              onClick={copyId}
              className="group inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 transition-all duration-150"
              title="Copier l'ID"
            >
              <span className="text-xs font-mono font-semibold text-gray-600 truncate max-w-[180px]">{acc.id}</span>
              {copied ? (
                <Check size={12} className="text-green-500 shrink-0" />
              ) : (
                <Copy size={12} className="text-gray-400 group-hover:text-gray-600 shrink-0" />
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4 p-5 text-sm">
            {/* Company */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Nom du décorateur</label>
              <input
                className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm bg-white focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 transition-all duration-150 placeholder:text-gray-300"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Nom..."
              />
            </div>

            {/* Stand */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Stand desservi</label>
              <input
                className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm bg-white focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 transition-all duration-150 placeholder:text-gray-300"
                value={stand}
                onChange={(e) => setStand(e.target.value)}
                placeholder="Stand..."
              />
            </div>

            {/* Unloading */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Déchargement par</label>
              <select
                className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm bg-white focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 transition-all duration-150 appearance-none cursor-pointer"
                value={unloading}
                onChange={(e) => setUnloading(e.target.value)}
              >
                <option value="">Choisir</option>
                <option value="Palais">Palais</option>
                <option value="SVMM">SVMM</option>
                <option value="Autonome">Déchargement manuel</option>
              </select>
            </div>

            {/* Event */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Événement</label>
              <select
                className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm bg-white focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 transition-all duration-150 appearance-none cursor-pointer"
                value={event}
                onChange={(e) => setEvent(e.target.value)}
              >
                <option value="">Choisir un événement</option>
                {event && !EVENT_OPTIONS.some((o) => o.value === event) && (
                  <option value={event}>{event}</option>
                )}
                {EVENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Message */}
            <div className="space-y-1.5 col-span-full">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Message du conducteur</label>
              <textarea
                className="w-full rounded-lg border border-gray-200 px-3 py-2 min-h-[68px] text-sm bg-white focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 transition-all duration-150 resize-none placeholder:text-gray-300"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Aucun message..."
              />
            </div>

            {/* Email + inline send */}
            <div className="space-y-1.5 col-span-full">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">E-mail du destinataire</label>
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  className="flex-1 h-9 rounded-lg border border-gray-200 px-3 text-sm bg-white focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 transition-all duration-150 placeholder:text-gray-300"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="conducteur@email.com"
                />
                <button
                  onClick={sendAccreditation}
                  disabled={sending || !email}
                  title="Envoyer l'accréditation par e-mail"
                  className="shrink-0 w-9 h-9 rounded-lg bg-[#4F587E] text-white flex items-center justify-center hover:bg-[#3B4252] active:scale-95 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#4F587E] shadow-sm"
                >
                  {sending ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Send size={15} />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Alerte conflit */}
          {conflictError && (
            <div className="mx-5 mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-800">
                  Modifié par un autre utilisateur
                </p>
                <p className="text-[10px] text-amber-600 mt-0.5">
                  Rafraîchissez pour voir la dernière version.
                </p>
              </div>
              <button
                onClick={() => { setConflictError(false); router.refresh(); }}
                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition shrink-0"
              >
                Rafraîchir
              </button>
            </div>
          )}

          {/* Bouton Enregistrer */}
          <div className="px-5 pb-5 pt-1">
            <button
              disabled={saving}
              onClick={save}
              className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-lg bg-white border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 hover:border-gray-300 active:scale-[0.99] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <Save size={14} />
                  Enregistrer
                </>
              )}
            </button>
          </div>
        </div>
        {/* Historique des emails envoyés */}
        {emailHistory.length > 0 && (
          <div className="mb-6 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Envois e-mails</span>
              <span className="ml-auto text-[10px] text-gray-400 font-medium">{emailHistory.length}</span>
            </div>
            <div className="divide-y divide-gray-100">
              {emailHistory.map((h, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50/60 transition-colors">
                  <span className="text-xs font-medium text-gray-700 truncate">{h.email}</span>
                  <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap ml-3">
                    {new Date(h.sentAt).toLocaleString("fr-FR")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Discussion agents */}
        <div className="mb-6">
          <AccreditationChat accreditationId={acc.id} defaultCollapsed={true} />
        </div>

        {/* Historique des modifications */}
        <div className="mb-4">
          <AccreditationHistory accreditationId={acc.id} key={historyVersion} />
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { Accreditation, Zone } from "@/types";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Info, PlusCircle, Phone, MessageCircle, Save, Send } from "lucide-react";
import VehicleForm from "@/components/accreditation/VehicleForm";
import AccreditationHistory from "./AccreditationHistory";
import type { Vehicle } from "@/types";
import { getTelLink, getWhatsAppLink } from "@/lib/contact-utils";
import { getZoneLabel, isFinalDestination, ZONE_COLORS } from "@/lib/zone-utils";
import ActionButtons from "./ActionButtons";
import { truncateText } from "@/lib/utils";

const EVENT_OPTIONS = [
  { value: "waicf", label: "WAICF" },
  { value: "festival", label: "Festival du Film" },
  { value: "miptv", label: "MIPTV" },
  { value: "mipcom", label: "MIPCOM" },
];

interface Props {
  acc: Accreditation;
}

export default function AccreditationFormCard({ acc }: Props) {
  const router = useRouter();
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

  async function save() {
    setSaving(true);
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
      if (!res.ok) throw new Error("Erreur");
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

  function formatDuration(entryAt: string | null, exitAt: string | null) {
    if (!entryAt || !exitAt) return "-";
    const d1 = new Date(entryAt);
    const d2 = new Date(exitAt);
    const ms = d2.getTime() - d1.getTime();
    if (ms <= 0) return "-";
    const min = Math.floor(ms / 60000) % 60;
    const h = Math.floor(ms / 3600000);
    return `${h}h ${min}min`;
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
    <div className="bg-gray-50 border border-gray-300 rounded-lg md:rounded-2xl shadow-lg w-full max-h-[85vh] overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="bg-[#4F587E] text-white rounded-t-2xl px-8 py-5 shadow flex items-center justify-between">
        <h1 className="text-lg font-bold flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-lg">
            <Info size={22} />
          </div>
          Infos accréditations
        </h1>
        {/* Zone badge */}
        {acc.currentZone && (
          <span 
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold ${ZONE_COLORS[acc.currentZone as Zone].bg} ${ZONE_COLORS[acc.currentZone as Zone].text}`}
            title={getZoneLabel(acc.currentZone as Zone)}
          >
            {isFinalDestination(acc.currentZone as Zone) ? "✓ " : ""}
            {truncateText(getZoneLabel(acc.currentZone as Zone), 12)}
            {!isFinalDestination(acc.currentZone as Zone) && (
              <span className="text-[10px] opacity-75 ml-1">→ Palais</span>
            )}
          </span>
        )}
      </div>

      {/* Contenu scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 overflow-x-hidden p-8">

        {/* ── WORKFLOW : Statut + Actions ── */}
        <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <ActionButtons
            acc={acc}
            onActionComplete={() => setHistoryVersion((v) => v + 1)}
          />
        </div>

        {/* Durée sur site */}
        {(acc.entryAt || acc.exitAt) && (
          <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <label className="font-semibold text-sm text-red-700">
              Durée sur site
            </label>
            <p className="text-red-700 font-semibold text-lg mt-1">
              {formatDuration(
                acc.entryAt?.toISOString() ?? null,
                acc.exitAt?.toISOString() ?? null
              )}
            </p>
          </div>
        )}

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
                          {v.plate}
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

        {/* Form grid — informations éditables */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 text-sm bg-white rounded-lg md:rounded-2xl p-3 md:p-8 border border-gray-200 mb-4 md:mb-8 w-full">
          {/* ID */}
          <div className="flex flex-col">
            <label className="font-semibold mb-3 text-gray-800">#ID</label>
            <input
              className="w-full h-10 rounded-lg md:rounded-xl border border-gray-400 px-3 md:px-4 focus:ring-2 focus:ring-[#4F587E] focus:border-[#4F587E] transition-all duration-200 bg-gray-100 text-sm md:text-base"
              value={acc.id}
              readOnly
            />
          </div>
          {/* Company */}
          <div className="flex flex-col">
            <label className="font-semibold mb-3 text-gray-800">
              Nom de l&apos;entreprise
            </label>
            <input
              className="w-full h-10 rounded-lg md:rounded-xl border border-gray-400 px-3 md:px-4 focus:ring-2 focus:ring-[#4F587E] focus:border-[#4F587E] transition-all duration-200 bg-white text-sm md:text-base"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
          {/* Stand */}
          <div className="flex flex-col">
            <label className="font-semibold mb-3 text-gray-800">
              Stand desservi
            </label>
            <input
              className="w-full h-10 rounded-lg md:rounded-xl border border-gray-400 px-3 md:px-4 focus:ring-2 focus:ring-[#4F587E] focus:border-[#4F587E] transition-all duration-200 bg-white text-sm md:text-base"
              value={stand}
              onChange={(e) => setStand(e.target.value)}
            />
          </div>
          {/* Unloading */}
          <div className="flex flex-col">
            <label className="font-semibold mb-3 text-gray-800">
              Déchargement par
            </label>
            <select
              className="w-full h-10 rounded-lg md:rounded-xl border border-gray-400 px-3 md:px-4 focus:ring-2 focus:ring-[#4F587E] focus:border-[#4F587E] transition-all duration-200 bg-white text-sm md:text-base"
              value={unloading}
              onChange={(e) => setUnloading(e.target.value)}
            >
              <option value="">Choisir</option>
              <option value="Palais">Palais</option>
              <option value="SVMM">SVMM</option>
              <option value="Autonome">Autonome</option>
            </select>
          </div>
          {/* Event */}
          <div className="flex flex-col">
            <label className="font-semibold mb-3 text-gray-800">
              Événement
            </label>
            <select
              className="w-full h-10 rounded-lg md:rounded-xl border border-gray-400 px-3 md:px-4 focus:ring-2 focus:ring-[#4F587E] focus:border-[#4F587E] transition-all duration-200 bg-white text-sm md:text-base"
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
          <div className="flex flex-col col-span-full">
            <label className="font-semibold mb-3 text-gray-800">
              Message du conducteur
            </label>
            <textarea
              className="w-full rounded-lg md:rounded-xl border border-gray-400 px-3 md:px-4 py-2 md:py-3 min-h-[80px] md:min-h-[100px] focus:ring-2 focus:ring-[#4F587E] focus:border-[#4F587E] transition-all duration-200 resize-none text-sm md:text-base"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          {/* Email */}
          <div className="flex flex-col col-span-full">
            <label className="font-semibold mb-3 text-gray-800">
              E-mail du destinataire
            </label>
            <input
              type="email"
              className="w-full h-10 rounded-lg md:rounded-xl border border-gray-400 px-3 md:px-4 focus:ring-2 focus:ring-[#4F587E] focus:border-[#4F587E] transition-all duration-200 bg-white text-sm md:text-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="conducteur@email.com"
            />
          </div>
        </div>

        {/* ── Actions principales ── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <button
            disabled={saving}
            onClick={save}
            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white border-2 border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 hover:border-gray-400 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            <Save size={16} />
            {saving ? "Enregistrement…" : "Enregistrer les modifications"}
          </button>

          <button
            onClick={sendAccreditation}
            disabled={sending || !email}
            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#4F587E] text-white font-semibold shadow-sm hover:bg-[#3B4252] transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            <Send size={16} />
            {sending ? "Envoi…" : "Envoyer l'accréditation"}
          </button>
        </div>
        {/* Historique des emails envoyés */}
        {emailHistory.length > 0 && (
          <div className="px-6 pb-6">
            <h3 className="font-semibold mb-4 text-base text-gray-800 flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              Historique des envois d&apos;e-mails
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden min-w-full shadow-sm">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-50 to-gray-100">
                    <th className="p-4 text-left font-semibold text-gray-700">
                      E-mail
                    </th>
                    <th className="p-4 text-left font-semibold text-gray-700">
                      Date d&apos;envoi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {emailHistory.map((h, i) => (
                    <tr
                      key={i}
                      className="border-b border-gray-100 hover:bg-green-50/50 transition-all duration-200"
                    >
                      <td className="p-4 font-medium">{h.email}</td>
                      <td className="p-4 text-gray-600">
                        {new Date(h.sentAt).toLocaleString("fr-FR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Historique des modifications */}
        <div className="px-6 pb-6">
          <AccreditationHistory accreditationId={acc.id} key={historyVersion} />
        </div>
      </div>
    </div>
  );
}

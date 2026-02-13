"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  XCircle,
  Truck,
  ArrowRight,
  Ban,
  LogOut,
  MapPin,
  Archive,
  RotateCcw,
  Loader2,
  Navigation,
} from "lucide-react";
import type { Accreditation, AccreditationStatus } from "@/types";
import {
  getZoneLabel,
  getAllZones,
  getTransferTargets,
  isFinalDestination,
  getZoneColors,
} from "@/lib/zone-utils";


/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface ActionDef {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  color: string;
  confirm?: string;
  needsZonePicker?: boolean; // si true, le modal de confirmation inclut un sélecteur de zone
  execute: (selectedZone?: string) => Promise<void>;
}

interface Props {
  acc: Accreditation;
  onActionComplete?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Composant                                                         */
/* ------------------------------------------------------------------ */

export default function ActionButtons({ acc, onActionComplete }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ActionDef | null>(null);
  const [selectedZone, setSelectedZone] = useState<string>("");

  const status = acc.status as AccreditationStatus;
  const currentZone = acc.currentZone || undefined;

  /* ---------- helpers API ---------- */

  async function handleConflict(res: Response) {
    if (res.status === 409) {
      alert("Cette accréditation a été modifiée par un autre utilisateur. La page va être rafraîchie.");
      router.refresh();
      throw new Error("CONFLICT_HANDLED");
    }
  }

  async function patchStatus(newStatus: AccreditationStatus, zone?: string) {
    const body: Record<string, unknown> = {
      status: newStatus,
      company: acc.company,
      stand: acc.stand,
      unloading: acc.unloading,
      event: acc.event,
      message: acc.message,
      version: acc.version, // Optimistic locking
    };
    if (zone) body.currentZone = zone;
    const res = await fetch(`/api/accreditations/${acc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await handleConflict(res);
    if (!res.ok) throw new Error(await res.text());
  }

  async function patchZoneOnly(zone: string) {
    const res = await fetch(`/api/accreditations/${acc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: acc.status,
        company: acc.company,
        stand: acc.stand,
        unloading: acc.unloading,
        event: acc.event,
        message: acc.message,
        currentZone: zone,
        version: acc.version, // Optimistic locking
      }),
    });
    await handleConflict(res);
    if (!res.ok) throw new Error(await res.text());
  }

  async function zoneAction(action: "ENTRY" | "EXIT", zone: string) {
    const res = await fetch(`/api/accreditations/${acc.id}/zones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, zone, version: acc.version }),
    });
    await handleConflict(res);
    if (!res.ok) throw new Error(await res.text());
  }

  async function transfer(targetZone: string) {
    const res = await fetch(`/api/accreditations/${acc.id}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetZone, version: acc.version }),
    });
    await handleConflict(res);
    if (!res.ok) throw new Error(await res.text());
  }

  /* ---------- règles de workflow ---------- */

  function getActions(): ActionDef[] {
    switch (status) {
      /* ── NOUVEAU : créé par chauffeur, en attente de validation ── */
      case "NOUVEAU":
        return [
          {
            id: "validate",
            label: "Valider la demande",
            description: "Approuver et choisir la zone d'attente",
            icon: CheckCircle,
            color: "bg-green-600 hover:bg-green-700 text-white",
            confirm:
              "Valider cette demande et choisir la zone où le camion sera attendu.",
            needsZonePicker: true,
            execute: (zone?: string) => patchStatus("ATTENTE", zone),
          },
          {
            id: "refuse",
            label: "Refuser",
            icon: XCircle,
            color: "bg-red-600 hover:bg-red-700 text-white",
            confirm: "Refuser cette demande ?",
            execute: () => patchStatus("REFUS"),
          },
        ];

      /* ── ATTENTE : validé, camion pas encore arrivé ── */
      case "ATTENTE":
        return [
          {
            id: "arrived",
            label: "Camion arrivé",
            description: currentZone
              ? `Marquer l'entrée dans la zone ${getZoneLabel(currentZone)}`
              : "Marquer l'arrivée du camion",
            icon: Truck,
            color: "bg-green-600 hover:bg-green-700 text-white",
            confirm: currentZone
              ? `Le camion est arrivé à ${getZoneLabel(currentZone)} ? Le chrono de présence sera activé.`
              : "Le camion est arrivé ?",
            execute: async () => {
              if (currentZone) {
                await zoneAction("ENTRY", currentZone);
              } else {
                await patchStatus("ENTREE");
              }
            },
          },
          {
            id: "change_zone",
            label: "Changer la zone d'attente",
            description: "Modifier la zone où le camion est attendu",
            icon: MapPin,
            color: "bg-[#4F587E] hover:bg-[#3B4252] text-white",
            confirm: "Choisir la nouvelle zone d'attente :",
            needsZonePicker: true,
            execute: async (zone?: string) => {
              if (zone) await patchZoneOnly(zone);
            },
          },
          {
            id: "absent",
            label: "Absent",
            icon: Ban,
            color: "bg-gray-500 hover:bg-gray-600 text-white",
            confirm: "Marquer ce camion comme absent ?",
            execute: () => patchStatus("ABSENT"),
          },
        ];

      /* ── ENTREE : camion entré dans une zone ── */
      case "ENTREE":
        return [
          {
            id: "exit",
            label: currentZone
              ? `Sortie de ${getZoneLabel(currentZone)}`
              : "Sortie de zone",
            description: "Le camion quitte la zone actuelle",
            icon: LogOut,
            color: "bg-orange-500 hover:bg-orange-600 text-white",
            confirm: currentZone
              ? `Confirmer la sortie de ${getZoneLabel(currentZone)} ?`
              : "Confirmer la sortie ?",
            execute: async () => {
              if (currentZone) {
                await zoneAction("EXIT", currentZone);
              } else {
                await patchStatus("SORTIE");
              }
            },
          },
        ];

      /* ── SORTIE : camion sorti, prêt pour transfert ou archivage ── */
      case "SORTIE": {
        const sortieActions: ActionDef[] = [];

        if (currentZone) {
          sortieActions.push(
            ...getTransferTargets(currentZone).map((targetZone) => ({
              id: `transfer_${targetZone}`,
              label: `${getZoneLabel(targetZone)}`,
              description: isFinalDestination(targetZone)
                ? "Destination finale"
                : "Zone intermédiaire",
              icon: ArrowRight,
              color: isFinalDestination(targetZone)
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-[#4F587E] hover:bg-[#3B4252] text-white",
              confirm: `Transférer le véhicule vers ${getZoneLabel(targetZone)} ?`,
              execute: () => transfer(targetZone),
            }))
          );
        }

        // Retour véhicule (avec sélecteur de zone obligatoire)
        sortieActions.push({
          id: "return_vehicle",
          label: "Retour véhicule",
          description: "Le véhicule revient – choisir la zone de retour",
          icon: RotateCcw,
          color: "bg-teal-600 hover:bg-teal-700 text-white",
          confirm: "Sélectionnez la zone de retour du véhicule :",
          needsZonePicker: true,
          execute: async (zone?: string) => {
            const res = await fetch(`/api/accreditations/${acc.id}/return`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                zone: zone || "PALAIS_DES_FESTIVALS",
              }),
            });
            if (!res.ok) throw new Error(await res.text());
          },
        });

        // Archiver
        if (!acc.isArchived) {
          sortieActions.push({
            id: "archive",
            label: "Archiver",
            description: "Déplacer cette accréditation dans les archives",
            icon: Archive,
            color: "bg-gray-600 hover:bg-gray-700 text-white",
            confirm: "Archiver cette accréditation ?",
            execute: async () => {
              const res = await fetch(`/api/accreditations/${acc.id}/archive`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ archive: true }),
              });
              if (!res.ok) throw new Error(await res.text());
            },
          });
        }

        return sortieActions;
      }

      /* ── Statuts terminaux (REFUS, ABSENT) ── */
      default: {
        const archiveActions: ActionDef[] = [];
        if (!acc.isArchived) {
          archiveActions.push({
            id: "archive",
            label: "Archiver",
            description: "Déplacer cette accréditation dans les archives",
            icon: Archive,
            color: "bg-gray-600 hover:bg-gray-700 text-white",
            confirm: "Archiver cette accréditation ?",
            execute: async () => {
              const res = await fetch(`/api/accreditations/${acc.id}/archive`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ archive: true }),
              });
              if (!res.ok) throw new Error(await res.text());
            },
          });
        }
        return archiveActions;
      }
    }
  }

  const actions = getActions();

  /* ---------- exécution d'une action ---------- */

  async function executeAction(action: ActionDef) {
    // Si confirmation requise, afficher le modal
    if (action.confirm && !confirmAction) {
      setConfirmAction(action);
      setSelectedZone(currentZone ?? "");
      return;
    }

    // Si zone picker requis et pas de zone sélectionnée
    if (action.needsZonePicker && !selectedZone) {
      return; // ne rien faire, le bouton est disabled de toute façon
    }

    try {
      setLoading(action.id);
      setConfirmAction(null);
      await action.execute(selectedZone || undefined);
      setSelectedZone("");
      router.refresh();
      onActionComplete?.();
    } catch (err) {
      // Ne pas afficher d'erreur si le conflit a déjà été géré
      if (err instanceof Error && err.message === "CONFLICT_HANDLED") return;
      alert(
        `Erreur : ${err instanceof Error ? err.message : "Erreur inconnue"}`
      );
    } finally {
      setLoading(null);
    }
  }

  /* ---------- séparer les actions principales et secondaires ---------- */

  const isTransferAction = (id: string) => id.startsWith("transfer_");
  const isSecondaryAction = (id: string) => id === "return_vehicle" || id === "archive";

  const transferActions = actions.filter((a) => isTransferAction(a.id));
  const primaryActions = actions.filter((a) => !isTransferAction(a.id) && !isSecondaryAction(a.id));
  const secondaryActions = actions.filter((a) => isSecondaryAction(a.id));

  /* ---------- rendu ---------- */

  function ActionBtn({ action }: { action: ActionDef }) {
    const Icon = action.icon;
    const isLoading = loading === action.id;
    return (
      <button
        onClick={() => executeAction(action)}
        disabled={isLoading || loading !== null}
        className={`group flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition-all duration-150 hover:shadow-md hover:scale-[1.02] active:scale-[0.98] ${action.color} disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100`}
      >
        <span className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
        </span>
        <div className="text-left min-w-0">
          <span className="block leading-tight">{action.label}</span>
          {action.description && (
            <span className="block text-[9px] opacity-70 font-medium leading-tight mt-0.5 truncate">{action.description}</span>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Carte zone actuelle ── */}
      {currentZone && (() => {
        const zc = getZoneColors(currentZone);
        const isFinal = isFinalDestination(currentZone);
        return (
          <div className={`relative rounded-xl overflow-hidden border ${isFinal ? "border-green-200" : "border-gray-200"}`}>
            {/* Barre latérale colorée */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${isFinal ? "bg-green-500" : zc.dot}`} />
            <div className={`flex items-center gap-3 pl-4 pr-4 py-3 ${isFinal ? "bg-green-50/60" : "bg-gradient-to-r from-gray-50 to-white"}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isFinal ? "bg-green-100" : zc.bg}`}>
                {isFinal ? (
                  <CheckCircle size={16} className="text-green-600" />
                ) : (
                  <MapPin size={16} className={zc.text} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-xs font-bold ${isFinal ? "text-green-800" : "text-gray-800"}`}>
                  {getZoneLabel(currentZone)}
                </p>
                {!isFinal && (
                  <p className="text-[10px] text-gray-400 font-medium flex items-center gap-1 mt-0.5">
                    <Navigation size={8} className="shrink-0" />
                    Destination : Palais des festivals
                  </p>
                )}
                {isFinal && status !== "SORTIE" && (
                  <p className="text-[10px] text-green-600 font-semibold mt-0.5">Destination finale atteinte</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Pas de zone assignée */}
      {!currentZone && status === "NOUVEAU" && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-amber-50/60 border border-amber-200 text-amber-700">
          <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <MapPin size={14} />
          </div>
          <span className="text-xs font-semibold">Aucune zone assignée — à définir lors de la validation</span>
        </div>
      )}

      {/* ── Actions principales ── */}
      {primaryActions.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Actions</p>
          <div className="flex flex-wrap gap-2">
            {primaryActions.map((action) => (
              <ActionBtn key={action.id} action={action} />
            ))}
          </div>
        </div>
      )}

      {/* ── Transferts ── */}
      {transferActions.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
            <ArrowRight size={10} />
            Transférer vers
          </p>
          <div className="flex flex-wrap gap-2">
            {transferActions.map((action) => (
              <ActionBtn key={action.id} action={action} />
            ))}
          </div>
        </div>
      )}

      {/* ── Actions secondaires (séparées visuellement) ── */}
      {secondaryActions.length > 0 && (
        <>
          <div className="border-t border-dashed border-gray-200 my-1" />
          <div className="flex flex-wrap gap-2">
            {secondaryActions.map((action) => {
              const Icon = action.icon;
              const isLoading = loading === action.id;
              return (
                <button
                  key={action.id}
                  onClick={() => executeAction(action)}
                  disabled={isLoading || loading !== null}
                  className="group flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Aucune action disponible */}
      {actions.length === 0 && (status === "REFUS" || status === "ABSENT") && (
        <div className="text-xs text-gray-400 italic bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
          Aucune action disponible (statut final)
        </div>
      )}

      {/* ── Modal de confirmation ── */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-gray-100 animate-in zoom-in-95 fade-in duration-200">
            <div className="w-10 h-10 rounded-xl bg-[#4F587E]/10 flex items-center justify-center mx-auto mb-4">
              {(() => { const CIcon = confirmAction.icon; return <CIcon size={20} className="text-[#4F587E]" />; })()}
            </div>
            <h2 className="text-base font-bold mb-2 text-gray-900 text-center">
              Confirmation
            </h2>
            <p className="mb-5 text-gray-500 leading-relaxed text-center text-xs">
              {confirmAction.confirm}
            </p>

            {/* Zone picker dans le modal */}
            {confirmAction.needsZonePicker && (
              <div className="mb-5">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                  Zone
                </label>
                <select
                  value={selectedZone}
                  onChange={(e) => setSelectedZone(e.target.value)}
                  className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm font-medium focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 transition bg-white"
                >
                  <option value="">-- Choisir une zone --</option>
                  {getAllZones().map((zone) => (
                    <option key={zone} value={zone}>
                      {getZoneLabel(zone)}
                      {isFinalDestination(zone) ? " (destination finale)" : ""}
                    </option>
                  ))}
                </select>
                {!selectedZone && (
                  <p className="text-[10px] text-red-500 mt-1.5 font-medium">
                    Veuillez sélectionner une zone
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setConfirmAction(null);
                  setSelectedZone("");
                }}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-all duration-150"
              >
                Annuler
              </button>
              <button
                onClick={() => executeAction(confirmAction)}
                disabled={
                  loading !== null ||
                  (confirmAction.needsZonePicker && !selectedZone)
                }
                className={`flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm shadow-sm transition-all duration-150 hover:shadow-md ${confirmAction.color} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin mx-auto" />
                ) : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
} from "lucide-react";
import type { Accreditation, AccreditationStatus, Zone } from "@/types";
import {
  getZoneLabel,
  getAllZones,
  getTransferTargets,
  isFinalDestination,
  ZONE_COLORS,
} from "@/lib/zone-utils";
import StatusPill from "./StatusPill";

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
  execute: (selectedZone?: Zone) => Promise<void>;
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
  const [selectedZone, setSelectedZone] = useState<Zone | "">("");

  const status = acc.status as AccreditationStatus;
  const currentZone = acc.currentZone as Zone | undefined;

  /* ---------- helpers API ---------- */

  async function handleConflict(res: Response) {
    if (res.status === 409) {
      alert("Cette accréditation a été modifiée par un autre utilisateur. La page va être rafraîchie.");
      router.refresh();
      throw new Error("CONFLICT_HANDLED");
    }
  }

  async function patchStatus(newStatus: AccreditationStatus, zone?: Zone) {
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

  async function patchZoneOnly(zone: Zone) {
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

  async function zoneAction(action: "ENTRY" | "EXIT", zone: Zone) {
    const res = await fetch(`/api/accreditations/${acc.id}/zones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, zone, version: acc.version }),
    });
    await handleConflict(res);
    if (!res.ok) throw new Error(await res.text());
  }

  async function transfer(targetZone: Zone) {
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
            execute: (zone?: Zone) => patchStatus("ATTENTE", zone),
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
            execute: async (zone?: Zone) => {
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

      /* ── SORTIE : camion sorti, prêt pour transfert ── */
      case "SORTIE":
        if (!currentZone) return [];

        return getTransferTargets(currentZone).map((targetZone) => ({
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
        }));

      /* ── Statuts terminaux ── */
      default:
        return [];
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
      await action.execute(selectedZone as Zone || undefined);
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

  /* ---------- rendu ---------- */

  const statusLabel: Record<AccreditationStatus, string> = {
    NOUVEAU: "Nouvelle demande — en attente de validation",
    ATTENTE: "Validé — en attente d'arrivée du camion",
    ENTREE: "Camion présent sur zone",
    SORTIE: "Camion sorti — prêt pour transfert",
    REFUS: "Demande refusée",
    ABSENT: "Camion absent",
  };

  return (
    <div className="space-y-3">
      {/* Statut actuel */}
      <div className="flex items-center gap-3 flex-wrap">
        <StatusPill
          status={status}
          zone={currentZone as Zone | undefined}
        />
        <span className="text-xs text-gray-500">
          {statusLabel[status]}
        </span>
      </div>

      {/* Zone actuelle */}
      {currentZone && (
        <div
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold ${
            ZONE_COLORS[currentZone]?.bg ?? "bg-gray-100"
          } ${ZONE_COLORS[currentZone]?.text ?? "text-gray-800"}`}
        >
          {isFinalDestination(currentZone) ? "✓ " : "📍 "}
          Zone : {getZoneLabel(currentZone)}
          {!isFinalDestination(currentZone) && (
            <span className="opacity-60">→ Palais des festivals</span>
          )}
        </div>
      )}

      {/* Pas de zone assignée */}
      {!currentZone && status === "NOUVEAU" && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-yellow-50 text-yellow-800 border border-yellow-200">
          <MapPin size={12} />
          Aucune zone assignée — à définir lors de la validation
        </div>
      )}

      {/* Destination finale atteinte */}
      {currentZone && isFinalDestination(currentZone) && status !== "SORTIE" && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-green-800 font-semibold text-xs flex items-center gap-1">
          ✓ Destination finale atteinte – Palais des festivals
        </div>
      )}

      {/* Boutons d'action */}
      {actions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {status === "SORTIE"
              ? "Transférer vers :"
              : "Actions disponibles :"}
          </p>
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => {
              const Icon = action.icon;
              const isLoading = loading === action.id;
              return (
                <button
                  key={action.id}
                  onClick={() => executeAction(action)}
                  disabled={isLoading || loading !== null}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all duration-150 ${action.color} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Icon size={16} />
                  <span>{action.label}</span>
                  {isLoading && (
                    <span className="animate-spin ml-1">⏳</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Aucune action disponible */}
      {actions.length === 0 && (status === "REFUS" || status === "ABSENT") && (
        <div className="text-sm text-gray-400 italic bg-gray-50 rounded-lg px-3 py-2">
          Aucune action disponible (statut final)
        </div>
      )}

      {/* Modal de confirmation */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-gray-200">
            <h2 className="text-lg font-bold mb-3 text-gray-900 text-center">
              Confirmation
            </h2>
            <p className="mb-4 text-gray-700 leading-relaxed text-center text-sm">
              {confirmAction.confirm}
            </p>

            {/* Zone picker dans le modal */}
            {confirmAction.needsZonePicker && (
              <div className="mb-5">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Zone d&apos;attente :
                </label>
                <select
                  value={selectedZone}
                  onChange={(e) => setSelectedZone(e.target.value as Zone | "")}
                  className="w-full h-11 rounded-xl border border-gray-300 px-3 text-sm font-medium focus:ring-2 focus:ring-[#4F587E] focus:border-[#4F587E] transition bg-white"
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
                  <p className="text-xs text-red-500 mt-1">
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
                className="flex-1 px-4 py-3 rounded-xl border border-gray-300 bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition"
              >
                Annuler
              </button>
              <button
                onClick={() => executeAction(confirmAction)}
                disabled={
                  loading !== null ||
                  (confirmAction.needsZonePicker && !selectedZone)
                }
                className={`flex-1 px-4 py-3 rounded-xl font-semibold shadow transition ${confirmAction.color} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading ? "..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  Building2,
  MapPin,
  Truck,
  Phone,
  LogIn,
  LogOut,
  CheckCircle,
  XCircle,
  Loader2,
  X,
  AlertTriangle,
} from "lucide-react";
import { PortalOverlay } from "@/components/ui/PortalOverlay";
import StatusPill from "@/components/logisticien/StatusPill";
import { getZoneLabel } from "@/lib/zone-utils";
import type {
  AccreditationScanSummary,
  ScanAction,
  ScanType,
} from "@/lib/scan-types";

export interface ScanActionResult {
  type: "success" | "error" | "info";
  message: string;
}

interface Props {
  summary: AccreditationScanSummary;
  /** Zone de poste de l'agent (clé). */
  zone: string;
  scanType: ScanType;
  scannedValue: string;
  onClose: () => void;
  /** Appelé après une action réussie/échouée pour fermer la popup + toast + relancer le scan. */
  onResult: (result: ScanActionResult) => void;
}

/** Libellé de présence dérivé du statut (jamais un simple texte de statut brut). */
function presenceLabel(summary: AccreditationScanSummary): string {
  const zoneLabel = summary.currentZone ? getZoneLabel(summary.currentZone) : null;
  switch (summary.status) {
    case "ENTREE":
      return zoneLabel ? `Dans la zone ${zoneLabel}` : "Dans une zone";
    case "SORTIE":
      return zoneLabel
        ? `Hors zone — dernière zone connue : ${zoneLabel}`
        : "Hors zone";
    case "NOUVEAU":
      return "Demande à valider (pas encore sur site)";
    case "ATTENTE":
      return zoneLabel ? `Attendu en zone ${zoneLabel}` : "Attendu";
    case "REFUS":
      return "Accès refusé";
    case "ABSENT":
      return "Marqué absent";
    default:
      return "—";
  }
}

export default function AccreditationScanModal({
  summary,
  zone,
  scanType,
  scannedValue,
  onClose,
  onResult,
}: Props) {
  const [loading, setLoading] = useState<ScanAction | null>(null);
  const [confirmingRefuse, setConfirmingRefuse] = useState(false);
  const zoneLabel = getZoneLabel(zone);

  const phone = summary.vehicles.find((v) => v.phone)?.phone ?? null;

  const isNew = summary.status === "NOUVEAU";
  const isValidated =
    summary.status === "ATTENTE" ||
    summary.status === "ENTREE" ||
    summary.status === "SORTIE";
  const isBlocked = summary.status === "REFUS" || summary.status === "ABSENT";

  // Action proposée = état réel du véhicule vs zone de poste de l'agent.
  // - ENTRÉ dans LA zone du poste -> seule la SORTIE a du sens.
  // - sinon (attendu, sorti/hors zone, ou entré dans une AUTRE zone) -> ENTRÉE.
  //   (Pour « entré ailleurs », l'ENTRÉE déclenche côté backend la sortie auto
  //    de l'ancienne zone puis l'entrée dans la zone du poste.)
  const enteredInAgentZone =
    summary.status === "ENTREE" &&
    !!summary.currentZone &&
    summary.currentZone === zone;

  // currentZone en SORTIE = dernière zone connue (pas zone actuelle).
  const zoneFieldLabel =
    summary.status === "SORTIE" ? "Dernière zone connue" : "Zone actuelle";

  async function runAction(action: ScanAction) {
    if (loading) return; // garde anti double-clic
    setLoading(action);
    try {
      const res = await fetch(
        `/api/accreditations/${summary.id}/scan-action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            zone: action === "REFUSE" ? undefined : zone,
            scanType,
            scannedValue,
            version: summary.version,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onResult({
          type: "error",
          message: data?.error || "Action impossible. Réessayez.",
        });
        return;
      }
      if (data?.noop) {
        const infoMsg =
          data.reason === "already_in_zone"
            ? `Véhicule déjà dans ${zoneLabel}.`
            : data.reason === "already_out"
              ? "Véhicule déjà sorti."
              : "Aucun changement.";
        onResult({ type: "info", message: infoMsg });
        return;
      }
      // Messages de succès contextualisés.
      let message = "Action enregistrée.";
      if (action === "VALIDATE_ENTRY")
        message = `Accès validé — entrée ${zoneLabel}.`;
      else if (action === "REFUSE") message = "Accès refusé.";
      else if (action === "ENTRY")
        message = data?.autoExit
          ? `Entrée ${zoneLabel} (sortie auto de la zone précédente).`
          : `Entrée ${zoneLabel}.`;
      else if (action === "EXIT") message = `Sortie ${zoneLabel}.`;
      onResult({ type: "success", message });
    } catch {
      onResult({
        type: "error",
        message: "Erreur réseau. Vérifiez la connexion et réessayez.",
      });
    } finally {
      setLoading(null);
    }
  }

  return (
    <PortalOverlay>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[80] p-0 sm:p-4">
        <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-100 animate-in slide-in-from-bottom sm:zoom-in-95 fade-in duration-200 overflow-hidden">
          {/* En-tête */}
          <div className="bg-[#4F587E] text-white px-5 py-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-white/70">
                Résultat du scan
              </p>
              <h2 className="text-base font-bold truncate flex items-center gap-2">
                <Building2 size={16} className="shrink-0" />
                {summary.company}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition"
              aria-label="Fermer"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Statut + présence */}
            <div className="flex items-start justify-between gap-3">
              <StatusPill status={summary.status} zone={summary.currentZone} />
              <p className="text-xs text-gray-500 text-right max-w-[60%]">
                {presenceLabel(summary)}
              </p>
            </div>

            {/* Infos clés */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Stand
                </p>
                <p className="font-medium text-gray-900">{summary.stand || "—"}</p>
              </div>
              <div className="flex items-start gap-1.5">
                <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    {zoneFieldLabel}
                  </p>
                  <p className="font-medium text-gray-900 truncate">
                    {summary.currentZone ? getZoneLabel(summary.currentZone) : "Hors zone"}
                  </p>
                </div>
              </div>
              {phone && (
                <div className="flex items-start gap-1.5">
                  <Phone size={14} className="text-gray-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      Téléphone
                    </p>
                    <a href={`tel:${phone.replace(/\s/g, "")}`} className="font-medium text-[#4F587E]">
                      {phone}
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Véhicule(s) */}
            {summary.vehicles.length > 0 && (
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 space-y-2">
                {summary.vehicles.map((v) => (
                  <div key={v.id} className="flex items-center gap-2 text-sm flex-wrap">
                    <span className="font-mono font-bold text-gray-900 bg-white px-2 py-0.5 rounded border border-gray-200">
                      {v.plate || "Plaque à l'arrivée"}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-[#4F587E] font-medium">
                      <Truck size={12} />
                      {v.vehicleLabel}
                    </span>
                    {v.trailerPlate && (
                      <span className="text-xs text-gray-500">
                        Rem. <span className="font-mono">{v.trailerPlate}</span>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Rappel de la zone de poste */}
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-blue-50/60 border border-blue-100 rounded-lg px-3 py-2">
              <MapPin size={13} className="text-blue-500 shrink-0" />
              Poste agent : <span className="font-semibold text-gray-700">{zoneLabel}</span>
            </div>
          </div>

          {/* Actions contextuelles */}
          <div className="border-t border-gray-100 p-4 space-y-2">
            {isBlocked && (
              <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2.5">
                <AlertTriangle size={15} className="text-gray-400 shrink-0" />
                Aucune action disponible ({summary.status === "REFUS" ? "accès refusé" : "absent"}).
              </div>
            )}

            {isNew && (
              <div className="flex gap-2">
                <button
                  onClick={() => runAction("VALIDATE_ENTRY")}
                  disabled={loading !== null}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-green-600 hover:bg-green-700 text-white shadow-sm transition disabled:opacity-50"
                >
                  {loading === "VALIDATE_ENTRY" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle size={16} />
                  )}
                  Valider l&apos;entrée
                </button>
                <button
                  onClick={() => {
                    if (confirmingRefuse) runAction("REFUSE");
                    else setConfirmingRefuse(true);
                  }}
                  disabled={loading !== null}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold shadow-sm transition disabled:opacity-50 ${
                    confirmingRefuse
                      ? "bg-red-700 hover:bg-red-800 text-white"
                      : "bg-red-600 hover:bg-red-700 text-white"
                  }`}
                >
                  {loading === "REFUSE" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <XCircle size={16} />
                  )}
                  {confirmingRefuse ? "Confirmer le refus" : "Refuser l'accès"}
                </button>
              </div>
            )}

            {isValidated &&
              (enteredInAgentZone ? (
                // Déjà entré dans la zone du poste : seule la sortie est cohérente.
                <button
                  onClick={() => runAction("EXIT")}
                  disabled={loading !== null}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white shadow-sm transition disabled:opacity-50"
                >
                  {loading === "EXIT" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <LogOut size={16} />
                  )}
                  Sortie {zoneLabel}
                </button>
              ) : (
                // Attendu, sorti/hors zone, ou entré dans une autre zone :
                // l'entrée dans la zone du poste est la seule action cohérente.
                <button
                  onClick={() => runAction("ENTRY")}
                  disabled={loading !== null}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-green-600 hover:bg-green-700 text-white shadow-sm transition disabled:opacity-50"
                >
                  {loading === "ENTRY" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <LogIn size={16} />
                  )}
                  Entrée {zoneLabel}
                </button>
              ))}

            <button
              onClick={onClose}
              disabled={loading !== null}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-500 font-semibold text-sm hover:bg-gray-50 transition disabled:opacity-50"
            >
              Annuler
            </button>
          </div>
        </div>
      </div>
    </PortalOverlay>
  );
}

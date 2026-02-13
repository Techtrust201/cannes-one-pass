"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Clock,
  ChevronDown,
  ChevronUp,
  MapPin,
  LogIn,
  LogOut,
  Timer,
  Loader2,
  Truck,
  CheckCircle2,
  ArrowDown,
} from "lucide-react";
import { getZoneLabel, getZoneColors } from "@/lib/zone-utils";

/* ────────────────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────────────────── */

interface TimeSlotData {
  id: number;
  stepNumber: number;
  zone: string;
  entryAt: string;
  exitAt: string | null;
  duration: number | null;
  vehiclePlate: string;
  vehicleSize: string;
}

interface TransferData {
  fromZone: string;
  toZone: string;
  departureAt: string;
  arrivalAt: string;
  transitMinutes: number;
}

interface DayGroup {
  date: string;
  slots: TimeSlotData[];
  transfers: TransferData[];
  totalMinutes: number;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────────── */

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return "< 1min";
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Durée temps réel : calcule la durée entre une date ISO et maintenant. */
function liveMinutes(start: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(start).getTime()) / 60000));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Props
 * ──────────────────────────────────────────────────────────────────────────── */

interface Props {
  accreditationId: string;
  className?: string;
  /** Incrémenter cette valeur déclenche un re-fetch instantané (après une action). */
  refreshKey?: number;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Composant principal
 * ──────────────────────────────────────────────────────────────────────────── */

export default function DailyTimeSlotHistory({ accreditationId, className = "", refreshKey = 0 }: Props) {
  const [days, setDays] = useState<DayGroup[]>([]);
  const [grandTotalMinutes, setGrandTotalMinutes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const fetchSlots = useCallback(async () => {
    try {
      const res = await fetch(`/api/accreditations/${accreditationId}/timeslots`);
      if (res.ok) {
        const data = await res.json();
        setDays(data.days || []);
        setGrandTotalMinutes(data.grandTotalMinutes || 0);
        // Auto-expand le jour le plus récent
        if (data.days && data.days.length > 0) {
          setExpandedDays((prev) => {
            if (prev.size === 0) return new Set([data.days[0].date]);
            return prev;
          });
        }
      }
    } catch (err) {
      console.error("Erreur chargement time slots:", err);
    } finally {
      setLoading(false);
    }
  }, [accreditationId]);

  // Chargement initial + polling 15s (pour les autres users) + refresh instantané via refreshKey
  useEffect(() => {
    fetchSlots();
    const interval = setInterval(fetchSlots, 15000);
    return () => clearInterval(interval);
  }, [fetchSlots, refreshKey]);

  const toggleDay = (date: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  /* ── Rendu ── */

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-gray-400 text-sm py-3 ${className}`}>
        <Loader2 size={14} className="animate-spin" />
        Chargement des créneaux...
      </div>
    );
  }

  if (days.length === 0) {
    return (
      <div className={`text-xs text-gray-400 py-2 ${className}`}>
        Aucun créneau horaire enregistré.
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Titre */}
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
        <Timer size={16} className="text-[#4F587E]" />
        Historique des créneaux
      </div>

      {days.map((day) => {
        const isExpanded = expandedDays.has(day.date);

        return (
          <div key={day.date} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
            {/* ── En-tête du jour ── */}
            <button
              onClick={() => toggleDay(day.date)}
              className="w-full flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3 hover:bg-gray-50 transition gap-2"
            >
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                <Clock size={14} className="text-[#4F587E] shrink-0" />
                <span className="text-xs sm:text-sm font-semibold text-gray-800 capitalize truncate">
                  {formatDate(day.date)}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 bg-[#4F587E]/10 text-[#4F587E] rounded-full font-bold whitespace-nowrap">
                  {day.slots.length} étape{day.slots.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {day.totalMinutes > 0 && (
                  <span className="text-[10px] sm:text-xs text-gray-500 hidden sm:inline">
                    Total : <span className="font-bold text-[#4F587E]">{formatDuration(day.totalMinutes)}</span>
                  </span>
                )}
                {isExpanded ? (
                  <ChevronUp size={16} className="text-gray-400" />
                ) : (
                  <ChevronDown size={16} className="text-gray-400" />
                )}
              </div>
            </button>

            {/* ── Timeline du jour ── */}
            {isExpanded && (
              <div className="px-2 pb-3 sm:px-4 sm:pb-4 border-t border-gray-100">
                <div className="relative ml-2 pl-4 sm:ml-4 sm:pl-6 border-l-2 border-[#4F587E]/20 space-y-0 py-3">
                  {day.slots.map((slot, idx) => {
                    const isInProgress = !slot.exitAt;
                    const liveDuration = isInProgress ? liveMinutes(slot.entryAt) : slot.duration;
                    const zoneColors = getZoneColors(slot.zone);
                    const transfer = day.transfers[idx]; // Transfert après cette étape

                    return (
                      <div key={slot.id}>
                        {/* ── ÉTAPE ── */}
                        <div className="relative">
                          {/* Point sur la timeline */}
                          <div className={`absolute -left-[21px] sm:-left-[31px] top-3 w-3 h-3 sm:w-4 sm:h-4 rounded-full border-2 sm:border-[3px] border-white shadow-sm ${
                            isInProgress ? "bg-blue-500 animate-pulse" : "bg-[#4F587E]"
                          }`} />

                          <div className={`rounded-xl p-3 sm:p-4 border ${
                            isInProgress
                              ? "bg-blue-50/60 border-blue-200 shadow-sm"
                              : "bg-gray-50 border-gray-200"
                          }`}>
                            {/* Ligne 1 : numéro d'étape + zone + statut */}
                            <div className="flex flex-wrap items-start gap-1.5 sm:gap-2 mb-2.5">
                              <span className="text-[10px] sm:text-xs font-bold text-[#4F587E] bg-[#4F587E]/10 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full">
                                Étape {slot.stepNumber}
                              </span>
                              <span className={`inline-flex items-center gap-1 text-[10px] sm:text-[11px] px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full font-semibold ${zoneColors.bg} ${zoneColors.text}`}>
                                <MapPin size={10} />
                                {getZoneLabel(slot.zone)}
                              </span>
                              <span className="text-[9px] sm:text-[10px] text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                                {slot.vehiclePlate}
                              </span>
                              {/* Statut */}
                              {isInProgress ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full ml-auto">
                                  <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                                  </span>
                                  En cours
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full ml-auto">
                                  <CheckCircle2 size={10} />
                                  Terminé
                                </span>
                              )}
                            </div>

                            {/* Ligne 2 : horaires */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:gap-x-5 text-xs">
                              <div className="flex items-center gap-1 sm:gap-1.5 text-green-700">
                                <LogIn size={12} />
                                <span className="font-medium">Arrivée</span>
                                <span className="font-bold">{formatTime(slot.entryAt)}</span>
                              </div>
                              {slot.exitAt ? (
                                <div className="flex items-center gap-1 sm:gap-1.5 text-red-600">
                                  <LogOut size={12} />
                                  <span className="font-medium">Sortie</span>
                                  <span className="font-bold">{formatTime(slot.exitAt)}</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 sm:gap-1.5 text-gray-400">
                                  <LogOut size={12} />
                                  <span className="font-medium">Sortie</span>
                                  <span className="font-bold">--:--</span>
                                </div>
                              )}
                              {/* Durée sur site */}
                              <div className={`flex items-center gap-1 sm:gap-1.5 ml-auto ${
                                isInProgress ? "text-blue-600" : "text-[#4F587E]"
                              }`}>
                                <Timer size={12} />
                                <span className="font-medium hidden sm:inline">Durée</span>
                                <span className={`font-bold px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] ${
                                  isInProgress
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-[#4F587E]/10 text-[#4F587E]"
                                }`}>
                                  {liveDuration != null ? formatDuration(liveDuration) : "—"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* ── TRANSFERT (entre cette étape et la suivante) ── */}
                        {transfer && (
                          <div className="relative my-1">
                            {/* Ligne de connexion */}
                            <div className="absolute -left-[24px] top-0 bottom-0 flex flex-col items-center">
                              <ArrowDown size={14} className="text-[#4F587E]/30" />
                            </div>

                            <div className="ml-1 sm:ml-2 my-2 rounded-lg bg-amber-50/80 border border-dashed border-amber-300 px-2.5 py-2 sm:px-4 sm:py-3">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 sm:gap-3">
                                {/* Icône */}
                                <div className="flex items-center gap-1.5 text-amber-700">
                                  <div className="p-1 bg-amber-200 rounded-md">
                                    <Truck size={12} className="text-amber-700" />
                                  </div>
                                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wide">
                                    Transfert
                                  </span>
                                </div>

                                {/* Trajet */}
                                <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-gray-700">
                                  <span className="font-medium">{getZoneLabel(transfer.fromZone)}</span>
                                  <span className="text-amber-500 font-bold">→</span>
                                  <span className="font-medium">{getZoneLabel(transfer.toZone)}</span>
                                </div>

                                {/* Heure de départ */}
                                <div className="flex items-center gap-1 text-[10px] text-gray-500">
                                  <Clock size={10} />
                                  <span className="font-semibold">{formatTime(transfer.departureAt)}</span>
                                </div>

                                {/* Temps de trajet */}
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-200 px-2 py-0.5 rounded-full ml-auto">
                                  <Timer size={10} />
                                  {transfer.transitMinutes > 0
                                    ? formatDuration(transfer.transitMinutes)
                                    : "en transit…"
                                  }
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Espace entre étapes s'il n'y a pas de transfert */}
                        {!transfer && idx < day.slots.length - 1 && (
                          <div className="h-2" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Total global ── */}
      {grandTotalMinutes > 0 && (
        <div className="flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3 bg-[#4F587E]/5 border border-[#4F587E]/20 rounded-xl">
          <span className="text-xs sm:text-sm font-semibold text-[#4F587E] flex items-center gap-1.5 sm:gap-2">
            <Timer size={14} className="shrink-0" />
            Durée totale
          </span>
          <span className="text-xs sm:text-sm font-bold text-[#4F587E]">
            {formatDuration(grandTotalMinutes)}
          </span>
        </div>
      )}
    </div>
  );
}

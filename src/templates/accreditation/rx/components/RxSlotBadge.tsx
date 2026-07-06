"use client";

/**
 * Badge "places restantes" pour un créneau RX.
 *
 * Interroge GET /api/rx/availability (read-only) et affiche :
 *   - rien si hasQuota=false (aucun quota configuré) ou si les paramètres sont incomplets
 *   - badge vert/bleu avec le nombre de places si remaining > 0
 *   - badge orange "Créneau complet" si isFull = true
 *
 * Ce composant est purement informatif et ne bloque pas la soumission.
 *
 * @see src/app/api/rx/availability/route.ts
 * @see docs/rx/RX_CAPACITY_CONTRACT.md
 */
import { useEffect, useRef, useState } from "react";

interface RxSlotParams {
  organizationId: string;
  eventId: string;
  zone: string;
  date: string;
  startTime: string;
  endTime: string;
  vehicleFamily: "LIGHT" | "HEAVY";
  phase: "MONTAGE" | "DEMONTAGE";
}

interface RxSlotState {
  hasQuota: boolean;
  remaining: number;
  isFull: boolean;
}

function buildUrl(p: RxSlotParams): string {
  const q = new URLSearchParams({
    organizationId: p.organizationId,
    eventId: p.eventId,
    zone: p.zone,
    date: p.date,
    startTime: p.startTime,
    endTime: p.endTime,
    vehicleFamily: p.vehicleFamily,
    phase: p.phase,
  });
  return `/api/rx/availability?${q.toString()}`;
}

/**
 * Hook qui retourne la disponibilité d'un créneau RX.
 * Retourne `null` tant que les paramètres sont incomplets ou pendant le chargement.
 */
export function useRxSlotAvailability(
  params: Partial<RxSlotParams> | null
): RxSlotState | null {
  const [result, setResult] = useState<RxSlotState | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const p = params;
    if (
      !p ||
      !p.organizationId ||
      !p.eventId ||
      !p.zone ||
      !p.date ||
      !p.startTime ||
      !p.endTime ||
      !p.vehicleFamily ||
      !p.phase
    ) {
      setResult(null);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setResult(null);
    fetch(buildUrl(p as RxSlotParams), { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || ctrl.signal.aborted) return;
        setResult({
          hasQuota: Boolean(data.hasQuota),
          remaining: Number(data.remaining ?? 0),
          isFull: Boolean(data.isFull),
        });
      })
      .catch(() => {
        // réseau ou 401/403 — on n'affiche rien
      });

    return () => {
      ctrl.abort();
    };
    // Serialize params pour la dépendance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    params?.organizationId,
    params?.eventId,
    params?.zone,
    params?.date,
    params?.startTime,
    params?.endTime,
    params?.vehicleFamily,
    params?.phase,
  ]);

  return result;
}

interface RxSlotBadgeProps {
  params: Partial<RxSlotParams> | null;
}

/**
 * Badge compact affiché sous un sélecteur de créneau RX.
 * Invisible si aucun quota n'est configuré ou si les params sont incomplets.
 */
export function RxSlotBadge({ params }: RxSlotBadgeProps) {
  const availability = useRxSlotAvailability(params);

  if (!availability || !availability.hasQuota) return null;

  if (availability.isFull) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5 mt-1">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
        Créneau complet
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5 mt-1">
      <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
      {availability.remaining} place{availability.remaining > 1 ? "s" : ""}
    </span>
  );
}

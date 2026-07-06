"use client";

/**
 * Badge "places restantes" pour un créneau RX.
 *
 * Interroge GET /api/rx/availability/public (route PUBLIQUE, read-only,
 * accessible au formulaire exposant sans session) et affiche :
 *   - rien si hasQuota=false (aucun quota configuré) ou si les paramètres
 *     sont incomplets ;
 *   - badge teal avec le nombre de places si remaining > 0 ;
 *   - badge orange "Créneau complet" si isFull = true.
 *
 * Purement informatif : ne bloque pas la soumission (le blocage réel est
 * assuré côté serveur par POST /api/accreditations).
 *
 * @see src/app/api/rx/availability/public/route.ts
 * @see docs/rx/RX_CAPACITY_CONTRACT.md
 */
import { useEffect, useRef, useState } from "react";
import { suggestZone } from "@/lib/rx-zone-rules";
import {
  resolveVehicleFamilyFromConfig,
  resolveVehicleFamilyFromText,
  type VehicleFamily,
} from "@/lib/vehicle-family";
import type { VehicleTypeData } from "@/lib/vehicle-utils";

interface RxSlotParams {
  orgSlug: string;
  eventSlug: string;
  zone: string;
  date: string;
  startTime: string;
  endTime: string;
  vehicleFamily: VehicleFamily;
  phase: "MONTAGE" | "DEMONTAGE";
}

interface RxSlotState {
  hasQuota: boolean;
  remaining: number;
  isFull: boolean;
}

/** Clé logique (zone + famille) d'un véhicule pour un créneau donné. */
export interface RxSlotEntry {
  zone: string;
  vehicleFamily: VehicleFamily;
}

const FAMILY_LABEL: Record<VehicleFamily, string> = {
  LIGHT: "Véhicule léger",
  HEAVY: "Poids lourd",
};

/**
 * Résout la zone de déchargement + la famille véhicule pour un code gabarit.
 * Logique métier centralisée (pas de duplication dans les steps) :
 *   - famille via config VehicleTypeConfig (pdfCode/vehicleFamily) puis repli texte ;
 *   - zone via `suggestZone` (matrice gabarit × port) avec repli Palm Beach.
 * Retourne `null` si le code est vide ou si la zone n'est pas déterminable.
 */
export function computeRxSlotParts(
  vehicleTypeCode: string,
  sector: string,
  vehicleTypes: VehicleTypeData[]
): RxSlotEntry | null {
  const code = (vehicleTypeCode ?? "").trim();
  if (!code) return null;
  const matched = vehicleTypes.find(
    (vt) => vt.code === code || vt.code === code.toUpperCase()
  );
  const vehicleFamily =
    resolveVehicleFamilyFromConfig(matched) ?? resolveVehicleFamilyFromText(code);
  const palmBeachCodes = new Set(
    vehicleTypes.filter((vt) => vt.rxPalmBeachAtCanto).map((vt) => vt.code)
  );
  const zone = suggestZone(code, sector, palmBeachCodes);
  if (!zone || !vehicleFamily) return null;
  return { zone, vehicleFamily };
}

function buildUrl(p: RxSlotParams): string {
  const q = new URLSearchParams({
    orgSlug: p.orgSlug,
    eventSlug: p.eventSlug,
    zone: p.zone,
    date: p.date,
    startTime: p.startTime,
    endTime: p.endTime,
    vehicleFamily: p.vehicleFamily,
    phase: p.phase,
  });
  return `/api/rx/availability/public?${q.toString()}`;
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
      !p.orgSlug ||
      !p.eventSlug ||
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
        // réseau ou erreur — on n'affiche rien (badge simplement masqué)
      });

    return () => {
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    params?.orgSlug,
    params?.eventSlug,
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
  /** Préfixe optionnel (ex. libellé famille) affiché quand plusieurs badges coexistent. */
  prefix?: string;
}

/**
 * Badge compact affiché sous un sélecteur de créneau RX.
 * Invisible si aucun quota n'est configuré ou si les params sont incomplets.
 */
export function RxSlotBadge({ params, prefix }: RxSlotBadgeProps) {
  const availability = useRxSlotAvailability(params);

  if (!availability || !availability.hasQuota) return null;

  if (availability.isFull) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
        {prefix ? `${prefix} · ` : ""}Créneau complet
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
      {prefix ? `${prefix} · ` : ""}
      {availability.remaining} place{availability.remaining > 1 ? "s" : ""}
    </span>
  );
}

interface RxSlotBadgeGroupProps {
  orgSlug: string;
  eventSlug: string;
  /** Date du créneau (YYYY-MM-DD). */
  date: string;
  /** Plage "HH:MM-HH:MM" telle que stockée dans livTime/repTime. */
  slot: string;
  phase: "MONTAGE" | "DEMONTAGE";
  /** Une entrée par véhicule concerné (zone + famille déjà résolues). */
  entries: RxSlotEntry[];
}

/**
 * Groupe de badges : un badge par couple distinct (zone, famille) présent
 * parmi les véhicules de la catégorie. Corrige le biais "premier véhicule" :
 * si plusieurs familles/zones coexistent, chacune est représentée.
 * Le libellé de famille n'est affiché que lorsqu'il y a plusieurs badges.
 */
export function RxSlotBadgeGroup({
  orgSlug,
  eventSlug,
  date,
  slot,
  phase,
  entries,
}: RxSlotBadgeGroupProps) {
  if (!orgSlug || !eventSlug || !date || !slot || !slot.includes("-")) return null;
  if (entries.length === 0) return null;

  const [startTime, endTime] = slot.split("-");

  const seen = new Set<string>();
  const distinct = entries.filter((e) => {
    const k = `${e.zone}|${e.vehicleFamily}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const showLabel = distinct.length > 1;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {distinct.map((e) => (
        <RxSlotBadge
          key={`${e.zone}|${e.vehicleFamily}`}
          prefix={showLabel ? FAMILY_LABEL[e.vehicleFamily] : undefined}
          params={{
            orgSlug,
            eventSlug,
            zone: e.zone,
            date,
            startTime,
            endTime,
            vehicleFamily: e.vehicleFamily,
            phase,
          }}
        />
      ))}
    </div>
  );
}

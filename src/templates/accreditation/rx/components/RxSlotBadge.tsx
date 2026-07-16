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
import { getRxVehicleProcessInstructions } from "@/lib/rx-vehicle-process";

interface RxSlotParams {
  orgSlug: string;
  eventSlug: string;
  zone: string;
  date: string;
  startTime: string;
  endTime: string;
  vehicleFamily: VehicleFamily;
  phase: "MONTAGE" | "DEMONTAGE";
  exhibitorLocationId?: string;
  requestedCount?: number;
}

interface RxSlotState {
  hasQuota: boolean;
  remaining: number;
  isFull: boolean;
  isUnavailable: boolean;
  networkError?: boolean;
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
    ...(p.exhibitorLocationId ? { exhibitorLocationId: p.exhibitorLocationId } : {}),
    ...(p.requestedCount && p.requestedCount > 1 ? { requestedCount: String(p.requestedCount) } : {}),
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
          isUnavailable: Boolean(data.isUnavailable),
        });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) {
          // La soumission sera toujours revalidée côté serveur : l'UI avertit
          // sans bloquer le déposant sur une indisponibilité réseau.
          setResult({ hasQuota: false, remaining: 0, isFull: false, isUnavailable: false, networkError: true });
        }
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
    params?.exhibitorLocationId,
    params?.requestedCount,
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

  if (!availability) return null;
  if (availability.networkError) {
    return <span className="text-xs text-amber-700">Disponibilité non vérifiable — contrôle à l’envoi.</span>;
  }
  if (!availability.hasQuota) return null;

  if (availability.isUnavailable) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
        {prefix ? `${prefix} · ` : ""}{availability.isFull ? "Créneau complet" : "Places insuffisantes"}
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
  exhibitorLocationId?: string;
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
  exhibitorLocationId,
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
            exhibitorLocationId,
            requestedCount: entries.filter(
              (entry) => entry.zone === e.zone && entry.vehicleFamily === e.vehicleFamily
            ).length,
          }}
        />
      ))}
    </div>
  );
}

type RxSlotSelectProps = {
  value: string;
  disabled: boolean;
  slots: string[];
  entries: RxSlotEntry[];
  orgSlug: string;
  eventSlug: string;
  date: string;
  phase: "MONTAGE" | "DEMONTAGE";
  exhibitorLocationId?: string;
  onChange: (value: string) => void;
  placeholder: string;
  className: string;
  formatSlot: (slot: string) => string;
};

/** Sélecteur de créneau qui désactive les options sans capacité suffisante. */
export function RxSlotSelect(props: RxSlotSelectProps) {
  const groups = Array.from(
    new Map(
      props.entries.map((entry) => [`${entry.zone}|${entry.vehicleFamily}`, entry])
    ).values()
  );
  const entriesKey = props.entries
    .map((entry) => `${entry.zone}|${entry.vehicleFamily}`)
    .sort()
    .join(",");
  const slotsKey = props.slots.join(",");
  const [availability, setAvailability] = useState<Record<string, RxSlotState>>({});
  const [networkError, setNetworkError] = useState(false);

  useEffect(() => {
    if (!props.date || groups.length === 0) {
      setAvailability({});
      return;
    }
    const ctrl = new AbortController();
    setNetworkError(false);
    void Promise.all(
      props.slots.flatMap((slot) => {
        const [startTime, endTime] = slot.split("-");
        return groups.map((entry) => {
          const requestedCount = props.entries.filter(
            (candidate) =>
              candidate.zone === entry.zone && candidate.vehicleFamily === entry.vehicleFamily
          ).length;
          const params: RxSlotParams = {
            orgSlug: props.orgSlug,
            eventSlug: props.eventSlug,
            zone: entry.zone,
            date: props.date,
            startTime,
            endTime,
            vehicleFamily: entry.vehicleFamily,
            phase: props.phase,
            exhibitorLocationId: props.exhibitorLocationId,
            requestedCount,
          };
          return fetch(buildUrl(params), { signal: ctrl.signal })
            .then((response) => (response.ok ? response.json() : Promise.reject()))
            .then((data) => ({
              key: `${slot}|${entry.zone}|${entry.vehicleFamily}`,
              value: {
                hasQuota: Boolean(data.hasQuota),
                remaining: Number(data.remaining ?? 0),
                isFull: Boolean(data.isFull),
                isUnavailable: Boolean(data.isUnavailable),
              } satisfies RxSlotState,
            }));
        });
      })
    )
      .then((items) => {
        if (ctrl.signal.aborted) return;
        setAvailability(Object.fromEntries(items.map((item) => [item.key, item.value])));
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setNetworkError(true);
      });
    return () => ctrl.abort();
  }, [entriesKey, props.date, props.eventSlug, props.exhibitorLocationId, props.orgSlug, props.phase, slotsKey]);

  const isBlocked = (slot: string) =>
    groups.some((entry) => availability[`${slot}|${entry.zone}|${entry.vehicleFamily}`]?.isUnavailable);

  useEffect(() => {
    if (props.value && isBlocked(props.value)) props.onChange("");
  }, [availability, props.value]); // le callback est fourni par le parent de formulaire

  return (
    <div>
      <select
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        className={props.className}
      >
        <option value="">{props.placeholder}</option>
        {props.slots.map((slot) => (
          <option key={slot} value={slot} disabled={isBlocked(slot)}>
            {props.formatSlot(slot)}{isBlocked(slot) ? " — complet" : ""}
          </option>
        ))}
      </select>
      {networkError && (
        <p className="mt-1 text-xs text-amber-700">
          Disponibilité non vérifiable — le serveur contrôlera votre demande à l’envoi.
        </p>
      )}
    </div>
  );
}

/** Fallback local sûr ; les règles métier de création restent côté serveur. */
export function RxVehicleProcessInstructions({ family }: { family: VehicleFamily | null }) {
  if (!family) return null;
  const process = getRxVehicleProcessInstructions(family);
  return (
    <div className="mt-1 rounded border border-sky-100 bg-sky-50 px-2 py-1.5 text-xs text-sky-900">
      <strong>{process.title}</strong>
      <ul className="mt-1 list-disc pl-4">
        {process.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}
      </ul>
    </div>
  );
}

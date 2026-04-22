"use client";
import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import type { Vehicle } from "@/types";
import CityAutocomplete from "@/components/CityAutocomplete";
import Image from "next/image";
import { Checkbox } from "@/components/ui/checkbox";
import PhoneInput from "@/components/ui/PhoneInput";
import { getVehicleWeightLimits, getVehicleTypeLabel, getAllVehicleTypes, getAverageWeight } from "@/lib/vehicle-utils";
import type { VehicleType, CountryRegion } from "@/types";
import { useTranslation } from "@/components/accreditation/TranslationProvider";

const COUNTRY_NAME_TO_ENUM: Record<string, CountryRegion> = {
  "France": "FRANCE", "Espagne": "ESPAGNE", "Italie": "ITALIE",
  "Allemagne": "ALLEMAGNE", "Belgique": "BELGIQUE", "Suisse": "SUISSE",
  "Royaume-Uni": "ROYAUME_UNI", "Pays-Bas": "PAYS_BAS", "Portugal": "PORTUGAL",
};

interface Props {
  data: Vehicle;
  update: (patch: Partial<Vehicle>) => void;
  onValidityChange: (v: boolean) => void;
  /**
   * Slug de l'événement sélectionné — si fourni, les créneaux de dépose /
   * récupération seront bornés à partir de GET /api/events/[slug]/timeslots
   * (vision Killian : stand/secteur/event pilotent les créneaux).
   */
  eventSlug?: string;
}

interface EventTimeslots {
  dropOff: { earliest: string | null; latest: string | null; hoursPerDay: string[] };
  pickUp: { earliest: string | null; latest: string | null; hoursPerDay: string[] };
}

const VEHICLE_TYPE_OPTIONS = getAllVehicleTypes().map((vt) => ({
  value: vt,
  label: getVehicleTypeLabel(vt),
  limits: getVehicleWeightLimits(vt),
}));

export default function VehicleForm({ data, update, onValidityChange, eventSlug }: Props) {
  const { t } = useTranslation();
  const plateRef = useRef<HTMLInputElement>(null);
  const trailerPlateRef = useRef<HTMLInputElement>(null);

  // Créneaux proposés selon l'event — fallback: liste complète 00:00-23:30.
  const [timeslots, setTimeslots] = useState<EventTimeslots | null>(null);
  useEffect(() => {
    if (!eventSlug) {
      setTimeslots(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/events/${encodeURIComponent(eventSlug)}/timeslots`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (!cancelled) setTimeslots(json); })
      .catch(() => { if (!cancelled) setTimeslots(null); });
    return () => { cancelled = true; };
  }, [eventSlug]);

  const FALLBACK_HOURS = useMemo(
    () =>
      Array.from({ length: 48 }).map((_, i) => {
        const hh = String(Math.floor(i / 2)).padStart(2, "0");
        const mm = i % 2 === 0 ? "00" : "30";
        return `${hh}:${mm}`;
      }),
    []
  );
  const dropOffHours = timeslots?.dropOff.hoursPerDay ?? FALLBACK_HOURS;
  const pickUpHours = timeslots?.pickUp.hoursPerDay ?? FALLBACK_HOURS;

  // Bornes de dates pour input type=\"date\" (YYYY-MM-DD).
  const toYmd = (iso: string | null | undefined) =>
    iso ? iso.slice(0, 10) : undefined;
  const dropOffMin = toYmd(timeslots?.dropOff.earliest);
  const dropOffMax = toYmd(timeslots?.dropOff.latest);
  const pickUpMin = toYmd(timeslots?.pickUp.earliest) ?? data.date ?? undefined;
  const pickUpMax = toYmd(timeslots?.pickUp.latest);

  // Vision Killian : plaque et gabarit (size) sont optionnels, heure de dépose
  // et date+heure de récupération obligatoires.
  const valid =
    (data.phoneNumber ?? "").trim() &&
    (data.date ?? "").trim() &&
    (data.time ?? "").trim() &&
    (data.returnDate ?? "").trim() &&
    (data.returnTime ?? "").trim() &&
    (data.city ?? "").trim() &&
    Array.isArray(data.unloading) &&
    data.unloading.length > 0;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onValidityChange(!!valid), [valid]);

  const handleSanitizedPlateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, field: "plate" | "trailerPlate") => {
      const input = e.target;
      const rawValue = input.value;
      const cursorPos = input.selectionStart ?? rawValue.length;
      const validCharsBefore = rawValue.slice(0, cursorPos).replace(/[^A-Za-z0-9]/g, "").length;
      const sanitized = rawValue.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      update({ [field]: sanitized });
      const ref = field === "plate" ? plateRef : trailerPlateRef;
      requestAnimationFrame(() => {
        ref.current?.setSelectionRange(validCharsBefore, validCharsBefore);
      });
    },
    [update]
  );

  // Auto-set weight limits + average weight when vehicle type changes
  const handleVehicleTypeChange = (vt: string) => {
    if (vt && getAllVehicleTypes().includes(vt as VehicleType)) {
      const limits = getVehicleWeightLimits(vt as VehicleType);
      const avgWeight = getAverageWeight(vt as VehicleType);
      update({
        size: vt,
        vehicleType: vt as VehicleType,
        emptyWeight: limits.emptyWeight,
        maxWeight: limits.maxWeight,
        currentWeight: avgWeight,
      });
    } else {
      update({ size: vt, vehicleType: undefined, emptyWeight: undefined, maxWeight: undefined, currentWeight: undefined });
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-1">
        {/* Plaque — optionnelle (peut être attribuée sur place) */}
        <div>
          <label className="text-sm font-semibold flex items-center gap-1 mb-1">
            <Image
              src="/accreditation/pict_page2/Group 1.svg"
              width={16}
              height={16}
              className="w-4 h-4"
              alt="Plaque"
            />{" "}
            {t.plate}
            <span className="font-normal text-xs text-gray-500">({t.optional})</span>
          </label>
          <input
            ref={plateRef}
            value={data.plate ?? ""}
            onChange={(e) => handleSanitizedPlateChange(e, "plate")}
            placeholder={t.platePlaceholder}
            className="w-full rounded-md px-3 py-1.5 text-sm shadow-sm focus:ring-primary focus:border-primary border-gray-300"
          />
        </div>
        {/* Type de véhicule (gabarit) — optionnel, peut être précisé sur place */}
        <div>
          <label className="text-sm font-semibold flex items-center gap-1 mb-1">
            <Image
              src="/accreditation/pict_page2/Vector (14).svg"
              width={16}
              height={16}
              className="w-4 h-4"
              alt="Type de véhicule"
            />{" "}
            {t.vehicleType}
            <span className="font-normal text-xs text-gray-500">({t.optional})</span>
          </label>
          <select
            value={data.size ?? ""}
            onChange={(e) => handleVehicleTypeChange(e.target.value)}
            className="w-full rounded-md px-3 py-1.5 text-sm shadow-sm bg-white focus:ring-primary focus:border-primary border-gray-300"
          >
            <option value="">{t.chooseType}</option>
            {VEHICLE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} ({o.limits.emptyWeight}t - {o.limits.maxWeight}t)
              </option>
            ))}
          </select>
        </div>
        {/* Plaque de remorque (semi-remorque uniquement, facultatif) */}
        {data.size === "SEMI_REMORQUE" && (
          <div>
            <label className="text-sm font-semibold flex items-center gap-1 mb-1">
              <Image
                src="/accreditation/pict_page2/Group 1.svg"
                width={16}
                height={16}
                className="w-4 h-4"
                alt="Plaque remorque"
              />{" "}
              {t.trailerPlate}
              <span className="font-normal text-xs text-gray-500">({t.optional})</span>
            </label>
            <input
              ref={trailerPlateRef}
              value={data.trailerPlate ?? ""}
              onChange={(e) => handleSanitizedPlateChange(e, "trailerPlate")}
              placeholder="XX456ZZ"
              className="w-full rounded-md px-3 py-1.5 text-sm shadow-sm focus:ring-primary focus:border-primary border-gray-300"
            />
          </div>
        )}
        {/* ──────────────────────────────────────────────────────────────────
         * CHAMP "POIDS ACTUEL" — DÉSACTIVÉ TEMPORAIREMENT
         * 
         * Raison : Le poids actuel est maintenant calculé automatiquement
         * comme la moyenne entre le poids à vide et le poids max en charge
         * du type de véhicule sélectionné (via getAverageWeight).
         * 
         * Contexte : Les camions peuvent effectuer plusieurs allers-retours
         * par jour (à vide ou chargés), ce qui rend la saisie manuelle
         * du poids peu fiable et bloquante pour l'utilisateur.
         * Le poids moyen est utilisé pour les statistiques du bilan carbone.
         * 
         * RÉACTIVATION PRÉVUE : ~Août 2026 (dans 6 mois)
         * Quand on réactivera ce champ, il faudra :
         * 1. Décommenter le bloc JSX ci-dessous
         * 2. Retirer le `currentWeight: avgWeight` du handleVehicleTypeChange
         * 3. Permettre à l'utilisateur de saisir le poids réel
         * 4. Adapter le bilan carbone pour distinguer trajet à vide vs chargé
         * ──────────────────────────────────────────────────────────────────
        {data.vehicleType && (
          <div className="flex-1 min-w-[180px]">
            <label className="text-sm font-semibold flex items-center gap-1 mb-1">
              Poids actuel (tonnes)
              <span className="font-normal text-xs text-gray-500">
                ({data.emptyWeight}t - {data.maxWeight}t)
              </span>
            </label>
            <input
              type="number"
              value={data.currentWeight ?? ""}
              onChange={(e) => update({ currentWeight: e.target.value ? Number(e.target.value) : undefined })}
              min={data.emptyWeight}
              max={data.maxWeight}
              placeholder={`${data.emptyWeight} - ${data.maxWeight}`}
              className={`w-full rounded-md px-3 py-1.5 text-sm shadow-sm focus:ring-primary focus:border-primary ${
                data.currentWeight != null &&
                (data.currentWeight < (data.emptyWeight ?? 0) || data.currentWeight > (data.maxWeight ?? 100))
                  ? "border-red-500"
                  : "border-gray-300"
              }`}
            />
            {data.currentWeight != null &&
              (data.currentWeight < (data.emptyWeight ?? 0) || data.currentWeight > (data.maxWeight ?? 100)) && (
                <p className="text-xs text-red-500 mt-1">
                  Le poids doit être entre {data.emptyWeight}t et {data.maxWeight}t
                </p>
              )}
          </div>
        )}
        */}
        {/* ──────────────────────────────────────────────────────────────────
         * BLOC "POIDS MOYEN ESTIMÉ" — MASQUÉ VISUELLEMENT
         * 
         * Le poids moyen est toujours calculé automatiquement en background
         * via getAverageWeight() dans handleVehicleTypeChange (currentWeight = avgWeight).
         * Il sert au calcul du bilan carbone mais n'a pas besoin d'être affiché
         * à l'utilisateur pour éviter la confusion.
         * 
         * RÉACTIVATION : Si besoin d'afficher à nouveau, décommenter le bloc ci-dessous.
         *
        {data.vehicleType && (
          <div className="flex-1 min-w-[180px]">
            <label className="text-sm font-semibold flex items-center gap-1 mb-1">
              Poids moyen estimé
            </label>
            <div className="w-full rounded-md px-3 py-1.5 text-sm bg-gray-100 border border-gray-300 text-gray-700">
              {getAverageWeight(data.vehicleType)}t
              <span className="text-xs text-gray-500 ml-1">
                (moy. {data.emptyWeight}t à vide / {data.maxWeight}t en charge)
              </span>
            </div>
          </div>
        )}
         * ────────────────────────────────────────────────────────────────── */}
        {/* Téléphone */}
        <div>
          <label className="text-sm font-semibold flex items-center gap-1 mb-1">
            <Image
              src="/accreditation/pict_page2/Vector (15).svg"
              width={16}
              height={16}
              className="w-4 h-4"
              alt="N° du conducteur"
            />{" "}
            {t.driverPhone}
          </label>
          <PhoneInput
            value={`${data.phoneCode}${data.phoneNumber}`}
            onChange={({ dialCode, nationalNumber }) => {
              update({
                phoneCode: `+${dialCode}`,
                phoneNumber: nationalNumber,
              });
            }}
            error={!data.phoneNumber}
            placeholder="612345678"
          />
        </div>
        {/* Dépose : Date */}
        <div>
          <label className="text-sm font-semibold flex items-center gap-1 mb-1">
            <Image
              src="/accreditation/pict_page2/Vector (10).svg"
              width={16}
              height={16}
              className="w-4 h-4"
              alt="Date de dépose"
            />{" "}
            {t.arrivalDate}
            <span className="text-[10px] text-gray-400 uppercase">
              ({t.dropOffHeader ?? "dépose"})
            </span>
          </label>
          <input
            type="date"
            value={data.date ?? ""}
            onChange={(e) => update({ date: e.target.value })}
            min={dropOffMin}
            max={dropOffMax}
            className={`w-full rounded-md px-3 py-1.5 text-sm shadow-sm focus:ring-primary focus:border-primary ${
              !data.date ? "border-red-500" : "border-gray-300"
            }`}
          />
        </div>
        {/* Dépose : Heure (obligatoire) */}
        <div>
          <label className="text-sm font-semibold flex items-center gap-1 mb-1">
            <Image
              src="/accreditation/pict_page2/Vector (11).svg"
              width={16}
              height={16}
              className="w-4 h-4"
              alt="Heure de dépose"
            />{" "}
            {t.arrivalTime}
            <span className="text-[10px] text-gray-400 uppercase">
              ({t.dropOffHeader ?? "dépose"})
            </span>
          </label>
          <select
            value={data.time}
            onChange={(e) => update({ time: e.target.value })}
            className={`w-full rounded-md px-3 py-1.5 text-sm shadow-sm bg-white focus:ring-primary focus:border-primary ${
              !(data.time ?? "").trim() ? "border-red-500" : "border-gray-300"
            }`}
          >
            <option value="">--:--</option>
            {dropOffHours.map((val) => (
              <option key={val} value={val}>
                {val}
              </option>
            ))}
          </select>
        </div>
        {/* Récupération : Date (obligatoire — vision Killian) */}
        <div>
          <label className="text-sm font-semibold flex items-center gap-1 mb-1">
            <Image
              src="/accreditation/pict_page2/Vector (10).svg"
              width={16}
              height={16}
              className="w-4 h-4"
              alt="Date de récupération"
            />{" "}
            {t.returnDate ?? "Date de récupération"}
            <span className="text-[10px] text-gray-400 uppercase">
              ({t.pickUpHeader ?? "récupération"})
            </span>
          </label>
          <input
            type="date"
            value={data.returnDate ?? ""}
            onChange={(e) => update({ returnDate: e.target.value })}
            min={pickUpMin}
            max={pickUpMax}
            className={`w-full rounded-md px-3 py-1.5 text-sm shadow-sm focus:ring-primary focus:border-primary ${
              !(data.returnDate ?? "").trim() ? "border-red-500" : "border-gray-300"
            }`}
          />
        </div>
        {/* Récupération : Heure (obligatoire — vision Killian) */}
        <div>
          <label className="text-sm font-semibold flex items-center gap-1 mb-1">
            <Image
              src="/accreditation/pict_page2/Vector (11).svg"
              width={16}
              height={16}
              className="w-4 h-4"
              alt="Heure de récupération"
            />{" "}
            {t.returnTime ?? "Heure de récupération"}
            <span className="text-[10px] text-gray-400 uppercase">
              ({t.pickUpHeader ?? "récupération"})
            </span>
          </label>
          <select
            value={data.returnTime ?? ""}
            onChange={(e) => update({ returnTime: e.target.value })}
            className={`w-full rounded-md px-3 py-1.5 text-sm shadow-sm bg-white focus:ring-primary focus:border-primary ${
              !(data.returnTime ?? "").trim() ? "border-red-500" : "border-gray-300"
            }`}
          >
            <option value="">--:--</option>
            {pickUpHours.map((val) => (
              <option key={val} value={val}>
                {val}
              </option>
            ))}
          </select>
        </div>
        {/* City */}
        <div>
          <label className="text-sm font-semibold flex items-center gap-1 mb-1">
            <Image
              src="/accreditation/pict_page2/Vector (13).svg"
              width={16}
              height={16}
              className="w-4 h-4"
              alt="Ville de départ"
            />{" "}
            {t.departureCity}
          </label>
          <CityAutocomplete
            value={data.city ?? ""}
            onChange={(v) => update({ city: v })}
            onCitySelect={(city) => {
              update({
                city: city.name,
                country: COUNTRY_NAME_TO_ENUM[city.country] ?? "AUTRE",
                estimatedKms: city.distance > 0 ? city.distance : undefined,
              });
            }}
            className={`w-full rounded-md px-3 py-1.5 text-sm shadow-sm focus:ring-primary focus:border-primary ${
              !data.city ? "border-red-500" : "border-gray-300"
            }`}
          />
        </div>
      </div>

      {/* Unloading */}
      <div>
        <p className="text-sm font-semibold mb-2">{t.unloading}</p>
        <div className="flex gap-6 items-center">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <Checkbox
              checked={data.unloading.includes("rear")}
              onCheckedChange={(checked) => {
                if (checked) {
                  update({
                    unloading: Array.from(
                      new Set([...(data.unloading || []), "rear"])
                    ),
                  });
                } else {
                  update({
                    unloading: (data.unloading || []).filter(
                      (u) => u !== "rear"
                    ),
                  });
                }
              }}
              id="unload-rear"
            />
            <Image
              src="/accreditation/pict_page2/Vector (5).svg"
              width={24}
              height={24}
              className="w-7 h-6"
              alt="Arrière"
            />
            <span>{t.rear}</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <Checkbox
              checked={data.unloading.includes("lat")}
              onCheckedChange={(checked) => {
                if (checked) {
                  update({
                    unloading: Array.from(
                      new Set([...(data.unloading || []), "lat"])
                    ),
                  });
                } else {
                  update({
                    unloading: (data.unloading || []).filter(
                      (u) => u !== "lat"
                    ),
                  });
                }
              }}
              id="unload-lat"
            />
            <Image
              src="/accreditation/pict_page2/Vector (4).svg"
              width={24}
              height={24}
              className="w-6 h-6"
              alt="Latéral"
            />
            <span>{t.lateral}</span>
          </label>
        </div>
      </div>
    </div>
  );
}

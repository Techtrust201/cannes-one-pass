"use client";
import { useEffect, useRef, useCallback } from "react";
import type { Vehicle } from "@/types";
import CityAutocomplete from "@/components/CityAutocomplete";
import Image from "next/image";
import { Checkbox } from "@/components/ui/checkbox";
import PhoneInput from "@/components/ui/PhoneInput";
import { getAverageWeightFromList } from "@/lib/vehicle-type-resolve";
import { useTranslation } from "@/components/accreditation/TranslationProvider";
import { useVehicleTypes } from "@/hooks/useVehicleTypes";
import { handleSanitizedPlateInput } from "@/lib/plate-utils";
import { mapCitySelectToVehicleFields } from "@/lib/city-form-utils";
import { formInputClass } from "@/lib/form-styles";
import {
  FieldError,
  RequiredFieldsSummary,
  RequiredMark,
} from "@/components/accreditation/FormBits";

interface Props {
  data: Vehicle;
  update: (patch: Partial<Vehicle>) => void;
  onValidityChange: (v: boolean) => void;
  orgSlug?: string;
  showErrors?: boolean;
}

export default function VehicleForm({ data, update, onValidityChange, orgSlug, showErrors = false }: Props) {
  const { t, lang } = useTranslation();
  const { types, loading: typesLoading, getDisplayLabel } = useVehicleTypes(false, orgSlug);
  const plateRef = useRef<HTMLInputElement>(null);
  const trailerPlateRef = useRef<HTMLInputElement>(null);

  const valid =
    (data.plate ?? "").trim() &&
    (data.size ?? "").trim() &&
    (data.phoneNumber ?? "").trim() &&
    (data.date ?? "").trim() &&
    (data.city ?? "").trim() &&
    Array.isArray(data.unloading) &&
    data.unloading.length > 0;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onValidityChange(!!valid), [valid]);

  const requiredFieldLabel = t.requiredField!;
  const missingFields: string[] = [];
  if (!(data.plate ?? "").trim()) missingFields.push(t.plate);
  if (!(data.size ?? "").trim()) missingFields.push(t.vehicleType);
  if (!(data.phoneNumber ?? "").trim()) missingFields.push(t.driverPhone);
  if (!(data.date ?? "").trim()) missingFields.push(t.arrivalDate);
  if (!(data.city ?? "").trim()) missingFields.push(t.departureCity);
  if (!Array.isArray(data.unloading) || data.unloading.length === 0)
    missingFields.push(t.unloading);

  const handleSanitizedPlateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, field: "plate" | "trailerPlate") => {
      const ref = field === "plate" ? plateRef : trailerPlateRef;
      handleSanitizedPlateInput(
        e,
        (sanitized) => update({ [field]: sanitized }),
        ref
      );
    },
    [update]
  );

  // Auto-set weight limits + average weight when vehicle type changes
  const handleVehicleTypeChange = (vt: string) => {
    const typeDef = types.find((t) => t.code === vt);
    if (typeDef) {
      const avgWeight = getAverageWeightFromList(types, vt);
      update({
        size: vt,
        vehicleType: vt,
        emptyWeight: typeDef.tonnageMini,
        maxWeight: typeDef.tonnageMaxi,
        currentWeight: avgWeight,
      });
    } else {
      update({ size: vt, vehicleType: undefined, emptyWeight: undefined, maxWeight: undefined, currentWeight: undefined });
    }
  };

  const showTrailerPlate = types.find((t) => t.code === data.size)?.showTrailerPlate ?? false;

  return (
    <div className="space-y-6">
      <RequiredFieldsSummary
        show={showErrors}
        title={t.requiredFieldsSummary ?? t.completeAllFields}
        fields={missingFields}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-1">
        {/* Plaque */}
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
            <RequiredMark />
          </label>
          <input
            ref={plateRef}
            value={data.plate ?? ""}
            onChange={(e) => handleSanitizedPlateChange(e, "plate")}
            placeholder={t.platePlaceholder}
            aria-invalid={showErrors && !data.plate}
            className={formInputClass(showErrors && !data.plate)}
          />
          <FieldError show={showErrors && !data.plate}>
            {requiredFieldLabel}
          </FieldError>
        </div>
        {/* Type de véhicule */}
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
            <RequiredMark />
          </label>
          {/*
            Affichage i18n des gabarits standards (6 codes) ; repli BDD pour
            les gabarits custom. La valeur envoyée reste le code technique.
          */}
          <select
            value={data.size ?? ""}
            onChange={(e) => handleVehicleTypeChange(e.target.value)}
            aria-invalid={showErrors && !data.size}
            className={formInputClass(showErrors && !data.size)}
          >
            <option value="">{typesLoading ? t.loading : t.chooseType}</option>
            {types.map((o) => (
              <option key={o.code} value={o.code}>
                {getDisplayLabel(o.code, lang)} ({o.tonnageMini}t - {o.tonnageMaxi}t)
              </option>
            ))}
          </select>
          <FieldError show={showErrors && !data.size}>
            {requiredFieldLabel}
          </FieldError>
        </div>
        {/* Plaque de remorque (semi-remorque uniquement, facultatif) */}
        {showTrailerPlate && (
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
              className={formInputClass(false)}
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
            <RequiredMark />
          </label>
          <PhoneInput
            value={`${data.phoneCode}${data.phoneNumber}`}
            onChange={({ dialCode, nationalNumber }) => {
              update({
                phoneCode: `+${dialCode}`,
                phoneNumber: nationalNumber,
              });
            }}
            error={showErrors && !data.phoneNumber}
            placeholder="612345678"
          />
          <FieldError show={showErrors && !data.phoneNumber}>
            {requiredFieldLabel}
          </FieldError>
        </div>
        {/* Date */}
        <div>
          <label className="text-sm font-semibold flex items-center gap-1 mb-1">
            <Image
              src="/accreditation/pict_page2/Vector (10).svg"
              width={16}
              height={16}
              className="w-4 h-4"
              alt="Date d'arrivée"
            />{" "}
            {t.arrivalDate}
            <RequiredMark />
          </label>
          <input
            type="date"
            value={data.date ?? ""}
            onChange={(e) => update({ date: e.target.value })}
            aria-invalid={showErrors && !data.date}
            className={formInputClass(showErrors && !data.date)}
          />
          <FieldError show={showErrors && !data.date}>
            {requiredFieldLabel}
          </FieldError>
        </div>
        {/* Time */}
        <div>
          <label className="text-sm font-semibold flex items-center gap-1 mb-1">
            <Image
              src="/accreditation/pict_page2/Vector (11).svg"
              width={16}
              height={16}
              className="w-4 h-4"
              alt="Heure d'arrivée"
            />{" "}
            {t.arrivalTime}
            <span className="font-normal text-xs text-gray-500">
              ({t.optional})
            </span>
          </label>
          <select
            value={data.time}
            onChange={(e) => update({ time: e.target.value })}
            className={formInputClass(false)}
          >
            <option value="">--:--</option>
            {Array.from({ length: 48 }).map((_, i) => {
              const hh = String(Math.floor(i / 2)).padStart(2, "0");
              const mm = i % 2 === 0 ? "00" : "30";
              const val = `${hh}:${mm}`;
              return (
                <option key={val} value={val}>
                  {val}
                </option>
              );
            })}
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
            <RequiredMark />
          </label>
          <CityAutocomplete
            value={data.city ?? ""}
            onChange={(v) => update({ city: v })}
            onCitySelect={(city) => {
              update(mapCitySelectToVehicleFields(city));
            }}
            className={formInputClass(showErrors && !data.city)}
          />
          <FieldError show={showErrors && !data.city}>
            {requiredFieldLabel}
          </FieldError>
        </div>
      </div>

      {/* Unloading */}
      <div>
        <p className="text-sm font-semibold mb-2">
          {t.unloading}
          <RequiredMark />
        </p>
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
        <FieldError
          show={
            showErrors &&
            (!Array.isArray(data.unloading) || data.unloading.length === 0)
          }
        >
          {requiredFieldLabel}
        </FieldError>
      </div>
    </div>
  );
}

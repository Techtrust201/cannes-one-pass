"use client";
import { useEffect } from "react";
import type { Vehicle } from "@/types";
import CityAutocomplete from "@/components/CityAutocomplete";
import Image from "next/image";
import { Checkbox } from "@/components/ui/checkbox";
import PhoneInput from "@/components/ui/PhoneInput";
import { getVehicleWeightLimits, getVehicleTypeLabel, getAllVehicleTypes, getAverageWeight } from "@/lib/vehicle-utils";
import type { VehicleType } from "@/types";

interface Props {
  data: Vehicle;
  update: (patch: Partial<Vehicle>) => void;
  onValidityChange: (v: boolean) => void;
}

const VEHICLE_TYPE_OPTIONS = getAllVehicleTypes().map((vt) => ({
  value: vt,
  label: getVehicleTypeLabel(vt),
  limits: getVehicleWeightLimits(vt),
}));

export default function VehicleForm({ data, update, onValidityChange }: Props) {
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
      <div className="flex flex-wrap gap-4 p-1 min-w-0">
        {/* Plaque */}
        <div className="flex-1 min-w-[180px]">
          <label className="text-sm font-semibold flex items-center gap-1 mb-1">
            <Image
              src="/accreditation/pict_page2/Group 1.svg"
              width={16}
              height={16}
              className="w-4 h-4"
              alt="Plaque"
            />{" "}
            Plaque
          </label>
          <input
            value={data.plate ?? ""}
            onChange={(e) => {
              // Lettres et chiffres uniquement (pas de - ni de .)
              const sanitized = e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
              update({ plate: sanitized });
            }}
            placeholder="XX123YY"
            className={`w-full rounded-md px-3 py-1.5 text-sm shadow-sm focus:ring-primary focus:border-primary ${
              !data.plate ? "border-red-500" : "border-gray-300"
            }`}
          />
          {data.plate && !/^[A-Za-z0-9]+$/.test(data.plate) && (
            <p className="text-xs text-red-500 mt-0.5">Lettres et chiffres uniquement</p>
          )}
        </div>
        {/* Type de véhicule */}
        <div className="flex-1 min-w-[180px]">
          <label className="text-sm font-semibold flex items-center gap-1 mb-1">
            <Image
              src="/accreditation/pict_page2/Vector (14).svg"
              width={16}
              height={16}
              className="w-4 h-4"
              alt="Type de véhicule"
            />{" "}
            Type de véhicule
          </label>
          <select
            value={data.size ?? ""}
            onChange={(e) => handleVehicleTypeChange(e.target.value)}
            className={`w-full rounded-md px-3 py-1.5 text-sm shadow-sm bg-white focus:ring-primary focus:border-primary ${
              !data.size ? "border-red-500" : "border-gray-300"
            }`}
          >
            <option value="">Choisir un type</option>
            {VEHICLE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} ({o.limits.emptyWeight}t - {o.limits.maxWeight}t)
              </option>
            ))}
          </select>
        </div>
        {/* Plaque de remorque (semi-remorque uniquement, facultatif) */}
        {data.size === "SEMI_REMORQUE" && (
          <div className="flex-1 min-w-[180px]">
            <label className="text-sm font-semibold flex items-center gap-1 mb-1">
              <Image
                src="/accreditation/pict_page2/Group 1.svg"
                width={16}
                height={16}
                className="w-4 h-4"
                alt="Plaque remorque"
              />{" "}
              Plaque de la remorque
              <span className="font-normal text-xs text-gray-500">(facultatif)</span>
            </label>
            <input
              value={data.trailerPlate ?? ""}
              onChange={(e) => {
                const sanitized = e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
                update({ trailerPlate: sanitized });
              }}
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
        <div className="flex-1 min-w-[180px]">
          <label className="text-sm font-semibold flex items-center gap-1 mb-1">
            <Image
              src="/accreditation/pict_page2/Vector (15).svg"
              width={16}
              height={16}
              className="w-4 h-4"
              alt="N° du conducteur"
            />{" "}
            N° du conducteur
          </label>
          <PhoneInput
            value={`${data.phoneCode}${data.phoneNumber}`}
            onChange={(phone) => {
              // Extraire l'indicatif et le numéro pour rétro-compatibilité
              // Le phone est au format "+33612345678"
              const match = phone.match(/^(\+\d{1,4})(.*)$/);
              if (match) {
                update({ phoneCode: match[1], phoneNumber: match[2].replace(/\s/g, "") });
              } else {
                update({ phoneNumber: phone.replace(/[^\d]/g, "") });
              }
            }}
            error={!data.phoneNumber}
            placeholder="612345678"
          />
        </div>
        {/* Date */}
        <div className="flex-1 min-w-[180px]">
          <label className="text-sm font-semibold flex items-center gap-1 mb-1">
            <Image
              src="/accreditation/pict_page2/Vector (10).svg"
              width={16}
              height={16}
              className="w-4 h-4"
              alt="Date d'arrivée"
            />{" "}
            Date d&apos;arrivée
          </label>
          <input
            type="date"
            value={data.date ?? ""}
            onChange={(e) => update({ date: e.target.value })}
            className={`w-full rounded-md px-3 py-1.5 text-sm shadow-sm focus:ring-primary focus:border-primary ${
              !data.date ? "border-red-500" : "border-gray-300"
            }`}
          />
        </div>
        {/* Time */}
        <div className="flex-1 min-w-[180px]">
          <label className="text-sm font-semibold flex items-center gap-1 mb-1">
            <Image
              src="/accreditation/pict_page2/Vector (11).svg"
              width={16}
              height={16}
              className="w-4 h-4"
              alt="Heure d'arrivée"
            />{" "}
            Heure d&apos;arrivée
            <span className="font-normal text-xs text-gray-500">
              (optionnel)
            </span>
          </label>
          <select
            value={data.time}
            onChange={(e) => update({ time: e.target.value })}
            className="w-full rounded-md px-3 py-1.5 text-sm shadow-sm bg-white border-gray-300 focus:ring-primary focus:border-primary"
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
        <div className="flex-1 min-w-[180px]">
          <label className="text-sm font-semibold flex items-center gap-1 mb-1">
            <Image
              src="/accreditation/pict_page2/Vector (13).svg"
              width={16}
              height={16}
              className="w-4 h-4"
              alt="Ville de départ"
            />{" "}
            Ville de départ
          </label>
          <CityAutocomplete
            value={data.city ?? ""}
            onChange={(v) => update({ city: v })}
            className={`w-full rounded-md px-3 py-1.5 text-sm shadow-sm focus:ring-primary focus:border-primary ${
              !data.city ? "border-red-500" : "border-gray-300"
            }`}
          />
        </div>
      </div>

      {/* Unloading */}
      <div>
        <p className="text-sm font-semibold mb-2">Déchargement</p>
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
            <span>Arrière</span>
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
            <span>Latéral</span>
          </label>
        </div>
      </div>
    </div>
  );
}

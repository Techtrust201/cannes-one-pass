"use client";
import { useEffect } from "react";
import type { Vehicle } from "@/types";
import CityAutocomplete from "@/components/CityAutocomplete";
import Image from "next/image";
import { Checkbox } from "@/components/ui/checkbox";
import { getVehicleWeightLimits, getVehicleTypeLabel, getAllVehicleTypes } from "@/lib/vehicle-utils";
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

  // Auto-set weight limits when vehicle type changes
  const handleVehicleTypeChange = (vt: string) => {
    if (vt && getAllVehicleTypes().includes(vt as VehicleType)) {
      const limits = getVehicleWeightLimits(vt as VehicleType);
      update({
        size: vt,
        vehicleType: vt as VehicleType,
        emptyWeight: limits.emptyWeight,
        maxWeight: limits.maxWeight,
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
            onChange={(e) => update({ plate: e.target.value })}
            placeholder="XX-123-YY"
            className={`w-full rounded-md px-3 py-1.5 text-sm shadow-sm focus:ring-primary focus:border-primary ${
              !data.plate ? "border-red-500" : "border-gray-300"
            }`}
          />
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
        {/* Poids actuel */}
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
          <div className="flex gap-2">
            <select
              value={data.phoneCode}
              onChange={(e) => update({ phoneCode: e.target.value })}
              className="max-w-16 rounded-md px-2 py-1.5 text-sm shadow-sm bg-white border-gray-300 focus:ring-primary focus:border-primary flex-shrink-0"
            >
              {["+33", "+32", "+41", "+34"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input
              type="tel"
              value={data.phoneNumber ?? ""}
              onChange={(e) =>
                update({ phoneNumber: e.target.value.replace(/\D/g, "") })
              }
              placeholder="0912345678"
              className={`w-full flex-1 min-w-0 rounded-md px-3 py-1.5 text-sm shadow-sm focus:ring-primary focus:border-primary ${
                !data.phoneNumber ? "border-red-500" : "border-gray-300"
              }`}
              inputMode="numeric"
              pattern="[0-9]*"
            />
          </div>
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  RX_SPACES,
  formatDateFR,
  generateHourlySlots,
} from "../config";
import type { StepProps } from "../../types";
import type { RxFormData, RxDeliveryCategory } from "../types";

interface VehicleTypeOption {
  id: number;
  code: string;
  label: string;
}

/**
 * Step 3 RX — Gestion des livraisons (montage).
 *
 * Aligné sur la card 3 de la maquette validée :
 * - Récap visuel de l'espace logistique
 * - Liste des catégories applicables (cases à cocher)
 * - Pour chaque catégorie cochée : date + créneau horaire (1 h) + N véhicules
 *   - Gabarit obligatoire, plaque optionnelle (saisie au scan QR)
 *   - Badge "RDV Scales" si la catégorie le nécessite
 */
export function StepDeliveryRx({
  data,
  update,
  onValidityChange,
}: StepProps<RxFormData>) {
  const space = data.exhibitor.space ? RX_SPACES[data.exhibitor.space] : null;

  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/vehicle-types?activeOnly=true`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => !cancelled && setVehicleTypes(Array.isArray(d) ? d : []))
      .catch(() => !cancelled && setVehicleTypes([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = data.delivery.categories;
  const setCategories = (next: RxDeliveryCategory[]) => {
    update({ delivery: { categories: next } } as Partial<RxFormData>);
  };

  const toggleCategory = (catId: string) => {
    const existing = categories.find((c) => c.categoryId === catId);
    if (existing) {
      setCategories(categories.filter((c) => c.categoryId !== catId));
      return;
    }
    setCategories([
      ...categories,
      { categoryId: catId, date: "", slot: "", vehicles: [{ vehicleType: "", plate: null }] },
    ]);
  };

  const patchCategory = (catId: string, patch: Partial<RxDeliveryCategory>) => {
    setCategories(
      categories.map((c) => (c.categoryId === catId ? { ...c, ...patch } : c))
    );
  };

  const addVehicle = (catId: string) => {
    setCategories(
      categories.map((c) =>
        c.categoryId === catId
          ? { ...c, vehicles: [...c.vehicles, { vehicleType: "", plate: null }] }
          : c
      )
    );
  };

  const updateVehicle = (
    catId: string,
    idx: number,
    patch: { vehicleType?: string; plate?: string | null; trailerPlate?: string }
  ) => {
    setCategories(
      categories.map((c) =>
        c.categoryId === catId
          ? {
              ...c,
              vehicles: c.vehicles.map((v, i) => (i === idx ? { ...v, ...patch } : v)),
            }
          : c
      )
    );
  };

  const removeVehicle = (catId: string, idx: number) => {
    setCategories(
      categories.map((c) =>
        c.categoryId === catId
          ? { ...c, vehicles: c.vehicles.filter((_, i) => i !== idx) }
          : c
      )
    );
  };

  const isValid = useMemo(() => {
    if (!space) return false;
    if (categories.length === 0) return false;
    return categories.every(
      (c) =>
        !!c.date &&
        !!c.slot &&
        c.vehicles.length > 0 &&
        c.vehicles.every((v) => !!v.vehicleType)
    );
  }, [space, categories]);

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  if (!space) {
    return (
      <div className="rounded-md bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
        Veuillez d&apos;abord sélectionner un exposant à l&apos;étape précédente
        pour configurer les livraisons.
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full gap-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">
          Gestion des livraisons (montage)
        </h2>
        <p className="text-sm text-gray-500">
          Planifiez l&apos;arrivée selon votre espace et vos catégories.
        </p>
      </div>

      <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900">
        📍 <strong>Espace de votre stand :</strong> {space.label}
      </div>

      <p className="text-sm text-gray-700">
        ✅ Cochez <strong>chaque catégorie</strong> applicable à votre stand, puis
        renseignez la date, le créneau et les véhicules attendus.
      </p>

      <div className="space-y-3">
        {space.categories.map((cat) => {
          const selected = categories.find((c) => c.categoryId === cat.id);
          const isChecked = !!selected;
          const dates = Object.keys(cat.liv);
          const slots = selected?.date ? generateHourlySlots(cat.liv[selected.date] ?? "") : [];

          return (
            <div
              key={cat.id}
              className={cn(
                "border rounded-lg p-3 transition",
                isChecked ? "border-primary bg-primary/5" : "border-gray-200 bg-white"
              )}
            >
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleCategory(cat.id)}
                  className="mt-1 accent-primary"
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-800 flex items-center gap-2 flex-wrap">
                    <span>
                      {cat.icon} {cat.name}
                    </span>
                    {cat.scales && (
                      <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-700">
                        ⚠ RDV Scales
                      </span>
                    )}
                  </div>
                </div>
              </label>

              {isChecked && selected && (
                <div className="mt-3 pl-6 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">
                        Date de livraison <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={selected.date}
                        onChange={(e) =>
                          patchCategory(cat.id, { date: e.target.value, slot: "" })
                        }
                        className={cn(
                          "w-full border rounded-md px-2 py-2 text-sm bg-white",
                          !selected.date && "border-red-300"
                        )}
                      >
                        <option value="">— Choisir une date —</option>
                        {dates.map((d) => (
                          <option key={d} value={d}>
                            {formatDateFR(d)} ({cat.liv[d]})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">
                        Créneau <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={selected.slot}
                        onChange={(e) => patchCategory(cat.id, { slot: e.target.value })}
                        disabled={!selected.date}
                        className={cn(
                          "w-full border rounded-md px-2 py-2 text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400",
                          selected.date && !selected.slot && "border-red-300"
                        )}
                      >
                        <option value="">
                          {selected.date ? "— Choisir un créneau —" : "— Choisir d'abord une date —"}
                        </option>
                        {slots.map((s) => (
                          <option key={s} value={s}>
                            {s.replace("-", " – ")}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-700">
                        Véhicule(s) attendu(s)
                        <span className="text-gray-500 font-normal">
                          {" "}— gabarit obligatoire, plaque optionnelle
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => addVehicle(cat.id)}
                        className="text-xs text-primary hover:underline font-semibold"
                      >
                        + Ajouter un véhicule
                      </button>
                    </div>
                    {selected.vehicles.length === 0 && (
                      <p className="text-xs text-gray-500 italic">
                        Ajoutez au moins un véhicule.
                      </p>
                    )}
                    <div className="space-y-2">
                      {selected.vehicles.map((v, idx) => (
                        <div
                          key={idx}
                          className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end bg-white border border-gray-100 rounded-md p-2"
                        >
                          <div>
                            <label className="text-[11px] text-gray-600 block mb-0.5">
                              Gabarit <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={v.vehicleType}
                              onChange={(e) =>
                                updateVehicle(cat.id, idx, { vehicleType: e.target.value })
                              }
                              className={cn(
                                "w-full border rounded-md px-2 py-1.5 text-sm bg-white",
                                !v.vehicleType && "border-red-300"
                              )}
                            >
                              <option value="">— Choisir —</option>
                              {vehicleTypes.map((vt) => (
                                <option key={vt.id} value={vt.code}>
                                  {vt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[11px] text-gray-600 block mb-0.5">
                              Plaque (optionnelle)
                            </label>
                            <input
                              value={v.plate ?? ""}
                              onChange={(e) =>
                                updateVehicle(cat.id, idx, {
                                  plate: e.target.value ? e.target.value.trim() : null,
                                })
                              }
                              placeholder="À saisir à l'arrivée"
                              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                            />
                          </div>
                          {selected.vehicles.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeVehicle(cat.id, idx)}
                              className="text-xs text-red-600 hover:underline pb-1.5"
                              aria-label="Retirer ce véhicule"
                            >
                              Retirer
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {cat.scales && (
                    <div className="rounded-md bg-orange-50 border border-orange-200 p-2 text-xs text-orange-900">
                      <strong>Coordination Scales :</strong>{" "}
                      {cat.scalesNote ||
                        "cette catégorie nécessite la prise de RDV avec Scales."}{" "}
                      Contact : <strong>scales@manutention.fr</strong>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!isValid && (
        <p className="text-red-500 text-sm text-center">
          Sélectionnez au moins une catégorie avec date, créneau et au moins un véhicule
          (gabarit renseigné) pour continuer.
        </p>
      )}
    </div>
  );
}

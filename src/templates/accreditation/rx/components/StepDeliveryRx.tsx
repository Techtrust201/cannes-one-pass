"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useEspaceSlug } from "@/hooks/useEspaceSlug";
import { withEspaceQuery } from "@/lib/url";
import { RX_SPACES, PALAIS_CHOICE, genSlots, formatDateFR, formatSlot } from "../config";
import type { StepProps } from "../../types";
import type { RxFormData } from "../types";

interface VehicleTypeOption {
  id: number;
  code: string;
  label: string;
}

/**
 * Step 3 RX — Gestion des livraisons (montage).
 *
 * - Si l'espace de l'exposant est "PALAIS" (PALAIS_CHOICE), demande d'abord
 *   le choix Intérieur / Extérieur.
 * - Liste les catégories de l'espace ; multi-sélection.
 * - Pour chaque catégorie cochée : date (parmi les jours d'ouverture) +
 *   créneau 1 h (généré dynamiquement depuis la plage du jour) + N véhicules
 *   (gabarit obligatoire, plaque optionnelle).
 */
export function StepDeliveryRx({ data, update, onValidityChange }: StepProps<RxFormData>) {
  const { stepOne, stepTwo } = data;
  const espace = useEspaceSlug();
  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(withEspaceQuery("/api/vehicle-types", espace ?? "rx"))
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => !cancelled && setVehicleTypes(Array.isArray(d) ? d : []))
      .catch(() => !cancelled && setVehicleTypes([]));
    return () => {
      cancelled = true;
    };
  }, [espace]);

  const needsPalaisChoice = stepOne.space === PALAIS_CHOICE || !stepOne.space;
  const currentSpace = useMemo(() => {
    if (needsPalaisChoice) return null;
    return RX_SPACES[stepOne.space] ?? null;
  }, [needsPalaisChoice, stepOne.space]);

  const setPalaisChoice = (choice: "INTERIEUR_PALAIS" | "EXTERIEUR_PALAIS") => {
    // Les catégories diffèrent entre Intérieur et Extérieur Palais : on
    // réinitialise les livraisons déjà saisies pour éviter de conserver des
    // catégories de l'autre espace.
    update({ stepOne: { ...stepOne, space: choice }, stepTwo: { categories: [] } });
  };

  const toggleCategory = (catId: string) => {
    const existing = stepTwo.categories.find((c) => c.categoryId === catId);
    if (existing) {
      update({
        stepTwo: {
          ...stepTwo,
          categories: stepTwo.categories.filter((c) => c.categoryId !== catId),
        },
      });
    } else {
      update({
        stepTwo: {
          ...stepTwo,
          categories: [
            ...stepTwo.categories,
            {
              categoryId: catId,
              livDate: "",
              livTime: "",
              repDate: "",
              repTime: "",
              vehicles: [{ vehicleType: "", plate: null }],
            },
          ],
        },
      });
    }
  };

  const patchCategory = (
    catId: string,
    patch: Partial<{ livDate: string; livTime: string }>
  ) => {
    update({
      stepTwo: {
        ...stepTwo,
        categories: stepTwo.categories.map((c) =>
          c.categoryId === catId ? { ...c, ...patch } : c
        ),
      },
    });
  };

  const addVehicle = (catId: string) => {
    update({
      stepTwo: {
        ...stepTwo,
        categories: stepTwo.categories.map((c) =>
          c.categoryId === catId
            ? { ...c, vehicles: [...c.vehicles, { vehicleType: "", plate: null }] }
            : c
        ),
      },
    });
  };

  const updateVehicle = (
    catId: string,
    idx: number,
    patch: { vehicleType?: string; plate?: string | null; trailerPlate?: string }
  ) => {
    update({
      stepTwo: {
        ...stepTwo,
        categories: stepTwo.categories.map((c) =>
          c.categoryId === catId
            ? {
                ...c,
                vehicles: c.vehicles.map((v, i) => (i === idx ? { ...v, ...patch } : v)),
              }
            : c
        ),
      },
    });
  };

  const removeVehicle = (catId: string, idx: number) => {
    update({
      stepTwo: {
        ...stepTwo,
        categories: stepTwo.categories.map((c) =>
          c.categoryId === catId
            ? { ...c, vehicles: c.vehicles.filter((_, i) => i !== idx) }
            : c
        ),
      },
    });
  };

  const isValid =
    !!currentSpace &&
    stepTwo.categories.length > 0 &&
    stepTwo.categories.every(
      (c) =>
        c.livDate &&
        c.livTime &&
        c.vehicles.length > 0 &&
        c.vehicles.every((v) => v.vehicleType)
    );

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  // Choix Int/Ext Palais
  if (needsPalaisChoice) {
    return (
      <div className="flex flex-col w-full gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            Gestion des livraisons (montage)
          </h2>
          <p className="text-sm text-gray-500">
            Votre stand est dans le Palais des Festivals. Précisez son
            emplacement pour afficher les catégories.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPalaisChoice("INTERIEUR_PALAIS")}
            className="border-2 border-gray-300 hover:border-primary rounded-xl p-4 text-left transition"
          >
            <div className="text-2xl mb-1">🏛️</div>
            <div className="font-semibold text-gray-800">Intérieur Palais</div>
            <div className="text-xs text-gray-500">
              À l&apos;intérieur du Palais des Festivals
            </div>
          </button>
          <button
            type="button"
            onClick={() => setPalaisChoice("EXTERIEUR_PALAIS")}
            className="border-2 border-gray-300 hover:border-primary rounded-xl p-4 text-left transition"
          >
            <div className="text-2xl mb-1">⛺</div>
            <div className="font-semibold text-gray-800">Extérieur Palais</div>
            <div className="text-xs text-gray-500">
              Esplanade extérieure (Macé, etc.)
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full gap-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-1">
          Gestion des livraisons (montage)
        </h2>
        <div className="rounded-md bg-blue-50 border border-blue-200 p-2.5 text-sm text-blue-900 mt-2">
          <strong>📍 Espace :</strong> {currentSpace!.label}
          {currentSpace!.note ? (
            <span className="block text-xs text-blue-700 mt-0.5">{currentSpace!.note}</span>
          ) : null}
        </div>
      </div>

      <p className="text-sm text-gray-700">
        ✅ Cochez chaque catégorie applicable à votre stand, puis renseignez la
        date, le créneau et le(s) véhicule(s) pour chacune.
      </p>

      <div className="space-y-3">
        {currentSpace!.categories.map((cat) => {
          const selected = stepTwo.categories.find((c) => c.categoryId === cat.id);
          const slots = selected?.livDate ? genSlots(cat.liv[selected.livDate] ?? "") : [];
          return (
            <div
              key={cat.id}
              className={cn(
                "border rounded-lg p-3 transition",
                selected ? "border-primary bg-primary/5" : "border-gray-200 bg-white"
              )}
            >
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!selected}
                  onChange={() => toggleCategory(cat.id)}
                  className="mt-1 accent-primary"
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-800">
                    {cat.icon} {cat.name}
                  </div>
                  {cat.scales && (
                    <span className="inline-block text-[11px] text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5 mt-1">
                      ⚠ RDV Scales
                    </span>
                  )}
                </div>
              </label>

              {selected && (
                <div className="mt-3 pl-6 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">
                        Date <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={selected.livDate}
                        onChange={(e) =>
                          patchCategory(cat.id, { livDate: e.target.value, livTime: "" })
                        }
                        className={cn(
                          "w-full border rounded-md px-2 py-1.5 text-sm",
                          !selected.livDate && "border-red-400"
                        )}
                      >
                        <option value="">— Choisir une date —</option>
                        {Object.keys(cat.liv).map((date) => (
                          <option key={date} value={date}>
                            {formatDateFR(date)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">
                        Créneau <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={selected.livTime}
                        disabled={!selected.livDate}
                        onChange={(e) => patchCategory(cat.id, { livTime: e.target.value })}
                        className={cn(
                          "w-full border rounded-md px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-400",
                          selected.livDate && !selected.livTime && "border-red-400"
                        )}
                      >
                        <option value="">
                          {selected.livDate ? "— Choisir un créneau —" : "— Choisir d'abord une date —"}
                        </option>
                        {slots.map((s) => (
                          <option key={s} value={s}>
                            {formatSlot(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-700">
                        Véhicule(s){" "}
                        <span className="font-normal text-gray-400">
                          (gabarit obligatoire · plaque optionnelle)
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => addVehicle(cat.id)}
                        className="text-xs text-primary hover:underline"
                      >
                        + Ajouter un véhicule
                      </button>
                    </div>
                    {selected.vehicles.map((v, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end"
                      >
                        <div>
                          <label className="text-xs text-gray-600 block mb-0.5">
                            Gabarit <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={v.vehicleType}
                            onChange={(e) =>
                              updateVehicle(cat.id, idx, { vehicleType: e.target.value })
                            }
                            className={cn(
                              "w-full border rounded-md px-2 py-1.5 text-sm",
                              !v.vehicleType && "border-red-400"
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
                          <label className="text-xs text-gray-600 block mb-0.5">
                            Plaque (optionnelle)
                          </label>
                          <input
                            value={v.plate ?? ""}
                            onChange={(e) =>
                              updateVehicle(cat.id, idx, {
                                plate: e.target.value
                                  ? e.target.value.toUpperCase()
                                  : null,
                              })
                            }
                            placeholder="AA-123-BB"
                            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm uppercase"
                          />
                        </div>
                        {selected.vehicles.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeVehicle(cat.id, idx)}
                            className="text-xs text-red-600 hover:underline pb-1.5"
                            aria-label="Retirer ce véhicule"
                          >
                            ✕
                          </button>
                        ) : (
                          <span />
                        )}
                      </div>
                    ))}
                  </div>

                  {cat.scales && (
                    <div className="text-xs bg-orange-50 border border-orange-200 rounded-md p-2.5 text-orange-800">
                      <strong>Coordination Scales obligatoire :</strong>{" "}
                      {cat.scalesNote ??
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
        <p className="text-gray-400 text-xs text-center">
          Sélectionnez au moins une catégorie avec sa date, son créneau et un
          véhicule (gabarit).
        </p>
      )}
    </div>
  );
}

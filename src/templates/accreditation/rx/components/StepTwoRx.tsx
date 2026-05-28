"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { RX_SPACES } from "../config";
import type { StepProps } from "../../types";
import type { RxFormData } from "../types";

interface VehicleTypeOption {
  id: number;
  code: string;
  label: string;
  gabarit: string;
}

/**
 * Step 2 RX — Livraison & véhicules :
 * - Si l'espace est PALAIS_CHOICE (auto-déduction ambiguë), demande à
 *   l'exposant de choisir Intérieur ou Extérieur Palais.
 * - Liste les catégories applicables à l'espace, cochables.
 * - Pour chaque catégorie cochée : sélection de la date livraison +
 *   créneau, puis déclaration de N véhicules attendus (gabarit requis,
 *   plaque optionnelle — saisie au scan QR à l'arrivée).
 */
export function StepTwoRx({ data, update, onValidityChange }: StepProps<RxFormData>) {
  const { stepOne, stepTwo } = data;
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

  // L'espace effectif à afficher : si "PALAIS_CHOICE", on attend que
  // l'utilisateur choisisse Int/Ext. Sinon on utilise space directement.
  const currentSpace = useMemo(() => {
    if (!stepOne.space || stepOne.space === "PALAIS_CHOICE") return null;
    return RX_SPACES[stepOne.space] ?? null;
  }, [stepOne.space]);

  const setPalaisChoice = (choice: "INTERIEUR_PALAIS" | "EXTERIEUR_PALAIS") => {
    update({ stepOne: { ...stepOne, space: choice } });
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
      const def = currentSpace?.categories.find((c) => c.id === catId);
      const firstDate = def ? Object.keys(def.liv)[0] ?? "" : "";
      const firstTime = def && firstDate ? def.liv[firstDate] : "";
      update({
        stepTwo: {
          ...stepTwo,
          categories: [
            ...stepTwo.categories,
            {
              categoryId: catId,
              livDate: firstDate,
              livTime: firstTime,
              repDate: "",
              repTime: "",
              vehicles: [],
            },
          ],
        },
      });
    }
  };

  const updateCategory = (
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
            ? {
                ...c,
                vehicles: [...c.vehicles, { vehicleType: "", plate: null }],
              }
            : c
        ),
      },
    });
  };

  const updateVehicle = (
    catId: string,
    vehicleIdx: number,
    patch: { vehicleType?: string; plate?: string | null; trailerPlate?: string }
  ) => {
    update({
      stepTwo: {
        ...stepTwo,
        categories: stepTwo.categories.map((c) =>
          c.categoryId === catId
            ? {
                ...c,
                vehicles: c.vehicles.map((v, i) => (i === vehicleIdx ? { ...v, ...patch } : v)),
              }
            : c
        ),
      },
    });
  };

  const removeVehicle = (catId: string, vehicleIdx: number) => {
    update({
      stepTwo: {
        ...stepTwo,
        categories: stepTwo.categories.map((c) =>
          c.categoryId === catId
            ? { ...c, vehicles: c.vehicles.filter((_, i) => i !== vehicleIdx) }
            : c
        ),
      },
    });
  };

  // Validation : au moins 1 catégorie + chaque catégorie cochée a une date
  // et au moins 1 véhicule avec gabarit renseigné.
  const isValid =
    currentSpace !== null &&
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

  if (!currentSpace || stepOne.space === "PALAIS_CHOICE" || !stepOne.space) {
    return (
      <div className="flex flex-col w-full">
        <h2 className="text-lg font-bold mb-2">Votre stand est dans le Palais des Festivals</h2>
        <p className="text-sm text-gray-600 mb-4">
          Précisez l&apos;emplacement de votre stand pour afficher les catégories de livraison.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPalaisChoice("INTERIEUR_PALAIS")}
            className="border-2 border-gray-300 hover:border-primary rounded-xl p-4 text-left transition"
          >
            <div className="text-2xl mb-1">🏛️</div>
            <div className="font-semibold text-gray-800">Intérieur Palais</div>
            <div className="text-xs text-gray-500">À l&apos;intérieur du Palais des Festivals</div>
          </button>
          <button
            type="button"
            onClick={() => setPalaisChoice("EXTERIEUR_PALAIS")}
            className="border-2 border-gray-300 hover:border-primary rounded-xl p-4 text-left transition"
          >
            <div className="text-2xl mb-1">⛺</div>
            <div className="font-semibold text-gray-800">Extérieur Palais</div>
            <div className="text-xs text-gray-500">Esplanade extérieure (Macé, etc.)</div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full gap-4">
      <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900">
        <strong>📍 Espace :</strong> {currentSpace.label}
      </div>

      <p className="text-sm text-gray-700">
        ✅ Cochez chaque catégorie applicable à votre stand, choisissez le créneau de livraison
        puis déclarez les véhicules attendus.
      </p>

      <div className="space-y-3">
        {currentSpace.categories.map((cat) => {
          const selected = stepTwo.categories.find((c) => c.categoryId === cat.id);
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
                    <div className="text-xs text-orange-700 mt-1">
                      ⚠ Manutention Scales obligatoire.
                      {cat.scalesNote ? ` ${cat.scalesNote}` : ""}
                    </div>
                  )}
                </div>
              </label>

              {selected && (
                <div className="mt-3 pl-6 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">
                        Date de livraison
                      </label>
                      <select
                        value={selected.livDate}
                        onChange={(e) => {
                          const nextDate = e.target.value;
                          updateCategory(cat.id, {
                            livDate: nextDate,
                            livTime: cat.liv[nextDate] ?? "",
                          });
                        }}
                        className="w-full border rounded-md px-2 py-1 text-sm"
                      >
                        {Object.keys(cat.liv).map((date) => (
                          <option key={date} value={date}>
                            {date}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">
                        Plage horaire
                      </label>
                      <div className="px-2 py-1 text-sm bg-gray-50 border rounded-md">
                        {selected.livTime || "—"}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-700">
                        Véhicules attendus (gabarit obligatoire, plaque optionnelle)
                      </span>
                      <button
                        type="button"
                        onClick={() => addVehicle(cat.id)}
                        className="text-xs text-primary hover:underline"
                      >
                        + Ajouter un véhicule
                      </button>
                    </div>
                    {selected.vehicles.length === 0 && (
                      <p className="text-xs text-gray-500 italic">
                        Aucun véhicule déclaré. Cliquez sur « + Ajouter un véhicule ».
                      </p>
                    )}
                    {selected.vehicles.map((v, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end"
                      >
                        <div>
                          <label className="text-xs text-gray-600 block mb-0.5">
                            Gabarit *
                          </label>
                          <select
                            value={v.vehicleType}
                            onChange={(e) =>
                              updateVehicle(cat.id, idx, { vehicleType: e.target.value })
                            }
                            className={cn(
                              "w-full border rounded-md px-2 py-1 text-sm",
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
                                plate: e.target.value ? e.target.value.trim() : null,
                              })
                            }
                            placeholder="Inconnue — à saisir à l'arrivée"
                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeVehicle(cat.id, idx)}
                          className="text-xs text-red-600 hover:underline pb-1"
                          aria-label="Retirer ce véhicule"
                        >
                          Retirer
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!isValid && (
        <p className="text-red-500 text-sm text-center">
          Sélectionnez au moins une catégorie, son créneau de livraison et au moins un véhicule
          avec gabarit.
        </p>
      )}
    </div>
  );
}

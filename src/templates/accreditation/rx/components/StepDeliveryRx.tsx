"use client";

import { useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { handleSanitizedPlateInput } from "@/lib/plate-utils";
import { mapCitySelectToVehicleFields } from "@/lib/city-form-utils";
import CityAutocomplete from "@/components/CityAutocomplete";
import { useVehicleTypes } from "@/hooks/useVehicleTypes";
import { useTranslation } from "@/components/accreditation/TranslationProvider";
import {
  RX_SPACES,
  PALAIS_CHOICE,
  genSlots,
  formatSlot,
  isBateauTerreAllowed,
} from "../config";
import {
  getLocalizedSpace,
  getLocalizedCategory,
  getLocalizedVehicleType,
  formatDateLocalized,
  getSkipT,
  getBateauTerreT,
} from "../i18n";
import type { StepProps } from "../../types";
import type { RxFormData } from "../types";

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
export function StepDeliveryRx({
  data,
  update,
  onValidityChange,
  orgSlug,
}: StepProps<RxFormData>) {
  const { t, lang } = useTranslation();
  const { stepOne, stepTwo } = data;
  const { types: vehicleTypes, loading: typesLoading } = useVehicleTypes(false, orgSlug);

  const needsPalaisChoice = stepOne.space === PALAIS_CHOICE || !stepOne.space;
  const currentSpace = useMemo(() => {
    if (needsPalaisChoice) return null;
    return RX_SPACES[stepOne.space] ?? null;
  }, [needsPalaisChoice, stepOne.space]);

  const skipT = getSkipT(t);

  const setPalaisChoice = (choice: "INTERIEUR_PALAIS" | "EXTERIEUR_PALAIS") => {
    // Les catégories diffèrent entre Intérieur et Extérieur Palais : on
    // réinitialise les livraisons déjà saisies pour éviter de conserver des
    // catégories de l'autre espace.
    update({
      stepOne: { ...stepOne, space: choice },
      stepTwo: { ...stepTwo, categories: [] },
    });
  };

  // Skip montage : « accréditation uniquement pour le démontage ». Coché ici,
  // l'étape Livraison disparaît (cf. getVisibleSteps) et les catégories sont
  // sélectionnées à l'étape Reprise. On vide les catégories pour repartir
  // proprement côté démontage.
  const setSkipMontage = (v: boolean) => {
    update({
      stepTwo: {
        ...stepTwo,
        skipMontage: v,
        categories: v ? [] : stepTwo.categories,
      },
    });
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
              vehicles: [{ vehicleType: "", plate: null, repSameAsDelivery: true, city: "" }],
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
            ? { ...c, vehicles: [...c.vehicles, { vehicleType: "", plate: null, repSameAsDelivery: true, city: "" }] }
            : c
        ),
      },
    });
  };

  const updateVehicle = (
    catId: string,
    idx: number,
    patch: {
      vehicleType?: string;
      plate?: string | null;
      trailerPlate?: string;
      interveningCompany?: string;
      city?: string;
      country?: RxFormData["stepTwo"]["categories"][number]["vehicles"][number]["country"];
      estimatedKms?: number;
    }
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
            {t.rx.delivery.title}
          </h2>
          <p className="text-sm text-gray-500">{t.rx.delivery.palaisIntro}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPalaisChoice("INTERIEUR_PALAIS")}
            className="border-2 border-gray-300 hover:border-primary rounded-xl p-4 text-left transition"
          >
            <div className="font-semibold text-gray-800">
              {t.rx.delivery.interiorPalais}
            </div>
            <div className="text-xs text-gray-500">
              {t.rx.delivery.interiorPalaisDesc}
            </div>
          </button>
          <button
            type="button"
            onClick={() => setPalaisChoice("EXTERIEUR_PALAIS")}
            className="border-2 border-gray-300 hover:border-primary rounded-xl p-4 text-left transition"
          >
            <div className="font-semibold text-gray-800">
              {t.rx.delivery.exteriorPalais}
            </div>
            <div className="text-xs text-gray-500">
              {t.rx.delivery.exteriorPalaisDesc}
            </div>
          </button>
        </div>
      </div>
    );
  }

  const localizedSpace = getLocalizedSpace(currentSpace!, t);
  const bateauTerreT = getBateauTerreT(t);

  // Catégories affichées au montage : uniquement celles ayant des plages de
  // livraison, et « Bateaux à terre » seulement si le secteur l'autorise
  // (Canto POWER / Vieux Port PALAIS ext).
  const visibleCategories = currentSpace!.categories.filter((cat) => {
    if (Object.keys(cat.liv).length === 0) return false;
    if (cat.id === "bateau-terre" && !isBateauTerreAllowed(stepOne.exhibitorSector)) {
      return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col w-full gap-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-1">
          {t.rx.delivery.title}
        </h2>
        <div className="rounded-md bg-blue-50 border border-blue-200 p-2.5 text-sm text-blue-900 mt-2">
          <strong>{t.rx.delivery.spaceLabel}</strong> {localizedSpace.label}
          {localizedSpace.note ? (
            <span className="block text-xs text-blue-700 mt-0.5">{localizedSpace.note}</span>
          ) : null}
        </div>
      </div>

      {/* Skip montage : on ne le propose que si le démontage n'est pas déjà
          sauté (au moins une phase doit rester). */}
      {!stepTwo.skipDemontage && (
        <label className="flex items-start gap-2 text-sm bg-gray-50 border border-gray-200 rounded-lg p-3 cursor-pointer">
          <input
            type="checkbox"
            checked={!!stepTwo.skipMontage}
            onChange={(e) => setSkipMontage(e.target.checked)}
            className="mt-0.5 accent-primary"
          />
          <span className="text-gray-700">{skipT.montageLabel}</span>
        </label>
      )}

      <p className="text-sm text-gray-700">{t.rx.delivery.instructions}</p>

      <div className="space-y-3">
        {visibleCategories.map((cat) => {
          const selected = stepTwo.categories.find((c) => c.categoryId === cat.id);
          const slots = selected?.livDate ? genSlots(cat.liv[selected.livDate] ?? "") : [];
          const localizedCat = getLocalizedCategory(cat, t);
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
                    {localizedCat.name}
                  </div>
                </div>
              </label>

              {selected && (
                <div className="mt-3 pl-6 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">
                        {t.rx.delivery.date} <span className="text-red-500">*</span>
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
                        <option value="">{t.rx.delivery.chooseDate}</option>
                        {Object.keys(cat.liv).map((date) => (
                          <option key={date} value={date}>
                            {formatDateLocalized(date, lang)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">
                        {t.rx.delivery.slot} <span className="text-red-500">*</span>
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
                          {selected.livDate ? t.rx.delivery.chooseSlot : t.rx.delivery.chooseDateFirst}
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
                        {t.rx.delivery.vehicles}{" "}
                        <span className="font-normal text-gray-400">
                          {t.rx.delivery.vehiclesHint}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => addVehicle(cat.id)}
                        disabled={typesLoading || vehicleTypes.length === 0}
                        className="text-xs text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                      >
                        {t.rx.delivery.addVehicle}
                      </button>
                    </div>
                    {typesLoading && (
                      <p className="text-xs text-gray-500">{t.rx.delivery.loadingTypes}</p>
                    )}
                    {!typesLoading && vehicleTypes.length === 0 && (
                      <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-md p-2">
                        {t.rx.delivery.noTypes}
                      </p>
                    )}
                    {selected.vehicles.map((v, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end"
                      >
                        <div className="sm:col-span-3">
                          <label className="text-xs text-gray-600 block mb-0.5">
                            {t.rx.delivery.interveningCompany}
                          </label>
                          <input
                            value={v.interveningCompany ?? ""}
                            onChange={(e) =>
                              updateVehicle(cat.id, idx, {
                                interveningCompany: e.target.value,
                              })
                            }
                            placeholder={t.rx.delivery.interveningPlaceholder}
                            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 block mb-0.5">
                            {t.rx.delivery.vehicleType} <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={v.vehicleType}
                            onChange={(e) =>
                              updateVehicle(cat.id, idx, { vehicleType: e.target.value })
                            }
                            disabled={typesLoading || vehicleTypes.length === 0}
                            className={cn(
                              "w-full border rounded-md px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-400",
                              !v.vehicleType && "border-red-400"
                            )}
                          >
                            <option value="">{t.rx.delivery.choose}</option>
                            {vehicleTypes.map((vt) => (
                              <option key={vt.id} value={vt.code}>
                                {getLocalizedVehicleType(
                                  vt.code,
                                  t,
                                  vt.gabarit,
                                  vt.label
                                )}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 block mb-0.5">
                            {t.rx.delivery.plateOptional}
                          </label>
                          <input
                            value={v.plate ?? ""}
                            onChange={(e) =>
                              handleSanitizedPlateInput(e, (sanitized) =>
                                updateVehicle(cat.id, idx, {
                                  plate: sanitized || null,
                                })
                              )
                            }
                            placeholder="AA123BB"
                            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm uppercase"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="text-xs text-gray-600 block mb-0.5">
                            {t.departureCity}
                          </label>
                          <CityAutocomplete
                            value={v.city ?? ""}
                            onChange={(city) => updateVehicle(cat.id, idx, { city })}
                            onCitySelect={(city) =>
                              updateVehicle(cat.id, idx, mapCitySelectToVehicleFields(city))
                            }
                            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm shadow-sm focus:ring-primary focus:border-primary"
                          />
                        </div>
                        {selected.vehicles.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeVehicle(cat.id, idx)}
                            className="text-xs text-red-600 hover:underline pb-1.5"
                            aria-label={t.rx.delivery.removeVehicle}
                          >
                            ✕
                          </button>
                        ) : (
                          <span />
                        )}
                      </div>
                    ))}
                  </div>

                  {cat.id === "bateau-terre" && (
                    <div className="text-xs bg-orange-50 border border-orange-200 rounded-md p-2.5 text-orange-800 space-y-1">
                      <p>{bateauTerreT.contactScales}</p>
                      <p>{bateauTerreT.noConvoy}</p>
                      <p className="italic">{bateauTerreT.autoUnload}</p>
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
          {t.rx.delivery.validationHint}
        </p>
      )}
    </div>
  );
}

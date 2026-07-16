"use client";

import { useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { formInputCompactClass } from "@/lib/form-styles";
import PhoneInput from "@/components/ui/PhoneInput";
import { handleSanitizedPlateInput } from "@/lib/plate-utils";
import { mapCitySelectToVehicleFields } from "@/lib/city-form-utils";
import CityAutocomplete from "@/components/CityAutocomplete";
import { useVehicleTypes } from "@/hooks/useVehicleTypes";
import { useTranslation } from "@/components/accreditation/TranslationProvider";
import {
  RX_SPACES,
  genSlots,
  formatSlot,
  isBateauTerreAllowed,
  resolveEffectiveRxSpace,
  resolveEffectiveRxSector,
} from "../config";
import { applyPlanningOverrides, categoryHasBlockingPlanningError } from "../planning-bridge";
import { useRxPlanningOverrides } from "../use-planning-overrides";
import {
  getLocalizedSpace,
  getLocalizedCategory,
  getLocalizedVehicleType,
  formatDateLocalized,
  getSkipT,
  getBateauTerreT,
  getPlanningErrorT,
} from "../i18n";
import { RxSlotBadgeGroup, RxSlotSelect, RxVehicleProcessInstructions, computeRxSlotParts, type RxSlotEntry } from "./RxSlotBadge";
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

  // Phase 6C-A (F1) — Espace effectif : priorité au référentiel réel de
  // l'emplacement (`logisticSpace`/`sectorCode`) sur le secteur legacy figé
  // de l'exposant, avec repli legacy interdit en STRICT (cf. D1/D4,
  // `resolveEffectiveRxSpace`). `stepOne.space` ne porte plus que le choix
  // manuel Intérieur/Extérieur Palais lorsque la dérivation legacy est
  // ambiguë et qu'aucun emplacement référentiel n'est résolu.
  const effectiveSpace = useMemo(
    () =>
      resolveEffectiveRxSpace({
        logisticSpace: stepOne.logisticSpace,
        sectorCode: stepOne.sectorCode,
        exhibitorSector: stepOne.exhibitorSector,
        manualPalaisChoice: stepOne.space,
        planningMode: stepOne.logisticsPlanningMode,
      }),
    [
      stepOne.logisticSpace,
      stepOne.sectorCode,
      stepOne.exhibitorSector,
      stepOne.space,
      stepOne.logisticsPlanningMode,
    ]
  );
  const effectiveSector = useMemo(
    () =>
      resolveEffectiveRxSector({
        portCode: stepOne.portCode,
        sectorCode: stepOne.sectorCode,
        exhibitorSector: stepOne.exhibitorSector,
      }).sector,
    [stepOne.portCode, stepOne.sectorCode, stepOne.exhibitorSector]
  );
  const needsPalaisChoice = effectiveSpace.requiresUserChoice;
  const currentSpaceRaw = useMemo(() => {
    if (needsPalaisChoice || !effectiveSpace.space) return null;
    return RX_SPACES[effectiveSpace.space] ?? null;
  }, [needsPalaisChoice, effectiveSpace.space]);

  // Phase 6 — Fusion avec le planning DB (uniquement si un emplacement
  // référentiel a été résolu). Sans effet en mode DISABLED (défaut sur tous
  // les événements existants) : `/api/planning` renvoie alors `source: "NONE"`
  // et `applyPlanningOverrides` conserve la donnée statique legacy intacte.
  const planningLocation = useMemo(
    () =>
      stepOne.exhibitorId && stepOne.exhibitorLocationId
        ? { exhibitorId: stepOne.exhibitorId, exhibitorLocationId: stepOne.exhibitorLocationId }
        : null,
    [stepOne.exhibitorId, stepOne.exhibitorLocationId]
  );
  const planningMode = stepOne.logisticsPlanningMode ?? "DISABLED";
  const {
    overrides: montageOverrides,
    loading: planningLoading,
  } = useRxPlanningOverrides({
    orgSlug,
    eventSlug: stepOne.event,
    location: planningLocation,
    phase: "MONTAGE",
    categoryIds: currentSpaceRaw?.categories.map((c) => c.id) ?? [],
    mode: planningMode,
  });
  const currentSpace = useMemo(
    () => applyPlanningOverrides(currentSpaceRaw, montageOverrides, "liv"),
    [currentSpaceRaw, montageOverrides]
  );

  const skipT = getSkipT(t);
  const planningErrorT = getPlanningErrorT(t);

  // Phase 6C-A (F6) — STRICT uniquement : si une catégorie déjà sélectionnée
  // devient en erreur (règle absente confirmée par le serveur, ou échec
  // HTTP/réseau), sa date/son créneau précédemment choisis ne sont plus
  // fiables : on les vide plutôt que de laisser une valeur invalide traîner
  // jusqu'à la soumission.
  useEffect(() => {
    if (planningMode !== "STRICT") return;
    const needsClear = stepTwo.categories.some(
      (c) =>
        (c.livDate || c.livTime) && categoryHasBlockingPlanningError(montageOverrides, c.categoryId)
    );
    if (!needsClear) return;
    update({
      stepTwo: {
        ...stepTwo,
        categories: stepTwo.categories.map((c) =>
          categoryHasBlockingPlanningError(montageOverrides, c.categoryId)
            ? { ...c, livDate: "", livTime: "" }
            : c
        ),
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montageOverrides, planningMode]);

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
      phoneCode?: string;
      phoneNumber?: string;
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

  // STRICT : la validation est désactivée pendant le chargement du planning
  // DB, et bloquée si une catégorie sélectionnée n'est pas résolue (F6).
  const strictBlocking =
    planningMode === "STRICT" &&
    (planningLoading ||
      stepTwo.categories.some((c) => categoryHasBlockingPlanningError(montageOverrides, c.categoryId)));

  const isValid =
    !strictBlocking &&
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

  // Catégories affichées au montage : celles ayant des plages de livraison,
  // OU en erreur de résolution planning (F4/F6 — ne jamais faire disparaître
  // silencieusement une catégorie bloquée, afficher un message explicite à
  // la place), et « Bateaux à terre » seulement si le secteur l'autorise
  // (Canto POWER / Vieux Port PALAIS ext).
  const visibleCategories = currentSpace!.categories.filter((cat) => {
    const blocked = categoryHasBlockingPlanningError(montageOverrides, cat.id);
    if (Object.keys(cat.liv).length === 0 && !blocked) return false;
    if (cat.id === "bateau-terre" && !isBateauTerreAllowed(effectiveSector)) {
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
          const blocked = categoryHasBlockingPlanningError(montageOverrides, cat.id);
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

              {selected && blocked && (
                <div className="mt-3 pl-6">
                  <p className="text-xs bg-red-50 border border-red-200 rounded-md p-2.5 text-red-800">
                    {planningErrorT.unavailable}
                  </p>
                </div>
              )}

              {selected && !blocked && (
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
                        className={formInputCompactClass(!selected.livDate)}
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
                      <RxSlotSelect
                        value={selected.livTime}
                        disabled={!selected.livDate}
                        onChange={(value) => patchCategory(cat.id, { livTime: value })}
                        className={formInputCompactClass(
                          Boolean(selected.livDate && !selected.livTime)
                        )}
                        placeholder={selected.livDate ? t.rx.delivery.chooseSlot : t.rx.delivery.chooseDateFirst}
                        slots={slots}
                        formatSlot={formatSlot}
                        orgSlug={orgSlug}
                        eventSlug={stepOne.event}
                        date={selected.livDate}
                        phase="MONTAGE"
                        exhibitorLocationId={stepOne.exhibitorLocationId}
                        entries={selected.vehicles
                          .map((v) => computeRxSlotParts(v.vehicleType ?? "", effectiveSector, vehicleTypes))
                          .filter((e): e is RxSlotEntry => e !== null)}
                      />
                      {selected.livTime && (
                        <RxSlotBadgeGroup
                          orgSlug={orgSlug}
                          eventSlug={stepOne.event}
                          date={selected.livDate}
                          slot={selected.livTime}
                          phase="MONTAGE"
                          exhibitorLocationId={stepOne.exhibitorLocationId}
                          entries={selected.vehicles
                            .map((v) =>
                              computeRxSlotParts(
                                v.vehicleType ?? "",
                                effectiveSector,
                                vehicleTypes
                              )
                            )
                            .filter((e): e is RxSlotEntry => e !== null)}
                        />
                      )}
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
                            className={formInputCompactClass(false)}
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
                            className={formInputCompactClass(!v.vehicleType)}
                          >
                            <option value="">{t.rx.delivery.choose}</option>
                            {vehicleTypes.map((vt) => (
                              <option key={vt.id} value={vt.code}>
                                {getLocalizedVehicleType(
                                  vt.code,
                                  lang,
                                  vt.gabarit,
                                  vt.label,
                                  vt.displayLabels
                                )}
                              </option>
                            ))}
                          </select>
                          <RxVehicleProcessInstructions
                            family={computeRxSlotParts(v.vehicleType ?? "", effectiveSector, vehicleTypes)?.vehicleFamily ?? null}
                          />
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
                            className={formInputCompactClass(false, "uppercase")}
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="text-xs text-gray-600 block mb-0.5">
                            {t.rx.delivery.driverPhone}
                          </label>
                          <PhoneInput
                            value={`${v.phoneCode ?? stepOne.contact.phoneCode}${v.phoneNumber ?? ""}`}
                            onChange={({ dialCode, nationalNumber }) =>
                              updateVehicle(cat.id, idx, {
                                phoneCode: `+${dialCode}`,
                                phoneNumber: nationalNumber,
                              })
                            }
                            placeholder={t.rx.contact.phonePlaceholder}
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
                            className={formInputCompactClass(false)}
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

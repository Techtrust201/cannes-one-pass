"use client";

import { useEffect } from "react";
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
  findCategory,
  genSlots,
  formatSlot,
  isBateauTerreAllowed,
} from "../config";
import {
  getLocalizedCategory,
  getLocalizedVehicleType,
  formatDateLocalized,
  getSkipT,
} from "../i18n";
import { suggestZone } from "@/lib/rx-zone-rules";
import {
  resolveVehicleFamilyFromConfig,
  resolveVehicleFamilyFromText,
} from "@/lib/vehicle-family";
import { RxSlotBadge } from "./RxSlotBadge";
import type { StepProps } from "../../types";
import type { RxFormData, RxCategorySelection } from "../types";

type RepVehiclePatch = Partial<{
  repSameAsDelivery: boolean;
  repVehicleType: string;
  repPlate: string | null;
  repPhoneCode: string;
  repPhoneNumber: string;
  repInterveningCompany: string;
  repCity: string;
  repCountry: RxFormData["stepTwo"]["categories"][number]["vehicles"][number]["repCountry"];
  repEstimatedKms: number;
}>;

/**
 * Step 4 RX — Gestion des reprises (démontage).
 *
 * Deux modes :
 * - **Normal** (montage rempli) : les catégories cochées au montage sont
 *   reprises automatiquement (verrouillées). Pour chacune, date + créneau +
 *   véhicule de reprise.
 * - **Skip montage** (« accréditation uniquement pour le démontage ») : les
 *   catégories sont **sélectionnées ici**, avec date/créneau et véhicule
 *   (gabarit obligatoire, plaque optionnelle).
 */
export function StepPickupRx({
  data,
  update,
  onValidityChange,
  orgSlug,
  organizationId,
}: StepProps<RxFormData>) {
  const { t, lang } = useTranslation();
  const { stepOne, stepTwo } = data;
  const { types: vehicleTypes, loading: typesLoading } = useVehicleTypes(false, orgSlug);
  const skipT = getSkipT(t);

  const skipMontage = !!stepTwo.skipMontage;
  const currentSpace = RX_SPACES[stepOne.space] ?? null;

  // ── Mutations communes ──────────────────────────────────────────────
  const patchReturn = (catId: string, patch: { repDate?: string; repTime?: string }) => {
    update({
      stepTwo: {
        ...stepTwo,
        categories: stepTwo.categories.map((c) =>
          c.categoryId === catId ? { ...c, ...patch } : c
        ),
      },
    });
  };

  const patchRepVehicle = (
    catId: string,
    vehicleIdx: number,
    patch: RepVehiclePatch
  ) => {
    update({
      stepTwo: {
        ...stepTwo,
        categories: stepTwo.categories.map((c) =>
          c.categoryId === catId
            ? {
                ...c,
                vehicles: c.vehicles.map((v, i) =>
                  i === vehicleIdx ? { ...v, ...patch } : v
                ),
              }
            : c
        ),
      },
    });
  };

  // ── Mutations spécifiques au mode skip montage (sélection ici) ───────
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

  // ── Réactivation du montage / skip démontage ────────────────────────
  const reAddMontage = () => {
    update({ stepTwo: { ...stepTwo, skipMontage: false } });
  };
  const setSkipDemontage = (v: boolean) => {
    update({ stepTwo: { ...stepTwo, skipDemontage: v } });
  };

  // ── Reprise « même véhicule que la livraison » (mode normal) ─────────
  const copyDeliveryToRep = (
    cat: RxCategorySelection,
    vehicleIdx: number
  ): RepVehiclePatch => {
    const v = cat.vehicles[vehicleIdx];
    return {
      repSameAsDelivery: true,
      repVehicleType: v.vehicleType,
      repPlate: v.plate ?? null,
      // Reprise « même véhicule » : on reprend le chauffeur de la livraison
      // (téléphone saisi sur le véhicule), avec repli sur le contact.
      repPhoneCode: v.phoneCode?.trim() ? v.phoneCode : stepOne.contact.phoneCode,
      repPhoneNumber: v.phoneNumber?.trim()
        ? v.phoneNumber
        : stepOne.contact.phoneNumber,
    };
  };

  const toggleSameVehicle = (catId: string, vehicleIdx: number, same: boolean) => {
    const cat = stepTwo.categories.find((c) => c.categoryId === catId);
    if (!cat) return;
    if (same) {
      patchRepVehicle(catId, vehicleIdx, copyDeliveryToRep(cat, vehicleIdx));
    } else {
      patchRepVehicle(catId, vehicleIdx, {
        repSameAsDelivery: false,
        repVehicleType: cat.vehicles[vehicleIdx].repVehicleType ?? "",
        repPlate: cat.vehicles[vehicleIdx].repPlate ?? null,
        repPhoneCode:
          cat.vehicles[vehicleIdx].repPhoneCode ?? stepOne.contact.phoneCode,
        repPhoneNumber:
          cat.vehicles[vehicleIdx].repPhoneNumber ?? stepOne.contact.phoneNumber,
      });
    }
  };

  // ── Validation ──────────────────────────────────────────────────────
  const repVehicleValid = (cat: RxCategorySelection) =>
    cat.vehicles.every((v) => {
      const same = v.repSameAsDelivery !== false;
      if (same) return true;
      return Boolean(
        v.repVehicleType && v.repPhoneCode?.trim() && v.repPhoneNumber?.trim()
      );
    });

  const isValid = skipMontage
    ? // Mode sélection : ≥1 catégorie, date + créneau + véhicule (gabarit).
      stepTwo.categories.length > 0 &&
      stepTwo.categories.every(
        (c) =>
          c.repDate &&
          c.repTime &&
          c.vehicles.length > 0 &&
          c.vehicles.every((v) => v.vehicleType)
      )
    : // Mode normal : catégories héritées du montage, reprise renseignée.
      stepTwo.categories.length > 0 &&
      stepTwo.categories.every(
        (c) => c.repDate && c.repTime && repVehicleValid(c)
      );

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  // Bannière de réactivation du montage (mode skip montage).
  const montageBanner = skipMontage ? (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
      <span>{skipT.addMontageBanner}</span>
      <button
        type="button"
        onClick={reAddMontage}
        className="text-amber-800 font-semibold underline hover:no-underline"
      >
        + {skipT.addMontageCta}
      </button>
    </div>
  ) : null;

  // ── Rendu : mode skip montage (sélection des catégories ici) ─────────
  if (skipMontage) {
    return (
      <div className="flex flex-col w-full gap-4">
        {montageBanner}
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            {t.rx.pickup.title}
          </h2>
          <p className="text-sm text-gray-500">{skipT.selectCategoriesIntro}</p>
        </div>

        {!currentSpace && (
          <p className="text-sm text-gray-500 italic">{t.rx.pickup.emptyHint}</p>
        )}

        <div className="space-y-3">
          {(currentSpace?.categories ?? [])
            .filter((cat) => {
              if (Object.keys(cat.rep).length === 0) return false;
              if (
                cat.id === "bateau-terre" &&
                !isBateauTerreAllowed(stepOne.exhibitorSector)
              ) {
                return false;
              }
              return true;
            })
            .map((cat) => {
            const selected = stepTwo.categories.find((c) => c.categoryId === cat.id);
            const slots = selected?.repDate ? genSlots(cat.rep[selected.repDate] ?? "") : [];
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
                  <span className="font-semibold text-gray-800">{localizedCat.name}</span>
                </label>

                {selected && (
                  <div className="mt-3 pl-6 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-700 block mb-1">
                          {t.rx.pickup.pickupDate} <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={selected.repDate}
                          onChange={(e) =>
                            patchReturn(cat.id, { repDate: e.target.value, repTime: "" })
                          }
                          className={formInputCompactClass(!selected.repDate)}
                        >
                          <option value="">{t.rx.pickup.chooseDate}</option>
                          {Object.keys(cat.rep).map((date) => (
                            <option key={date} value={date}>
                              {formatDateLocalized(date, lang)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-700 block mb-1">
                          {t.rx.pickup.slot} <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={selected.repTime}
                          disabled={!selected.repDate}
                          onChange={(e) => patchReturn(cat.id, { repTime: e.target.value })}
                          className={formInputCompactClass(
                            Boolean(selected.repDate && !selected.repTime)
                          )}
                        >
                          <option value="">
                            {selected.repDate ? t.rx.pickup.chooseSlot : t.rx.pickup.chooseDateFirst}
                          </option>
                          {slots.map((s) => (
                            <option key={s} value={s}>
                              {formatSlot(s)}
                            </option>
                          ))}
                        </select>
                        {(() => {
                          const firstVType = selected.vehicles[0]?.vehicleType ?? "";
                          if (!selected.repTime || !firstVType) return null;
                          const [st, et] = selected.repTime.split("-");
                          const matched = vehicleTypes.find((vt) => vt.code === firstVType || vt.code === firstVType.toUpperCase());
                          const vf = resolveVehicleFamilyFromConfig(matched) ?? resolveVehicleFamilyFromText(firstVType);
                          const palmBeachCodes = new Set(vehicleTypes.filter((vt) => vt.rxPalmBeachAtCanto).map((vt) => vt.code));
                          const zone = suggestZone(firstVType, stepOne.exhibitorSector, palmBeachCodes);
                          if (!zone || !vf) return null;
                          return (
                            <RxSlotBadge params={{
                              organizationId,
                              eventId: stepOne.eventId || undefined,
                              zone,
                              date: selected.repDate,
                              startTime: st,
                              endTime: et,
                              vehicleFamily: vf,
                              phase: "DEMONTAGE",
                            }} />
                          );
                        })()}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-700">
                          {t.rx.pickup.pickupVehicles}{" "}
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
                                updateVehicle(cat.id, idx, { interveningCompany: e.target.value })
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
                          </div>
                          <div>
                            <label className="text-xs text-gray-600 block mb-0.5">
                              {t.rx.delivery.plateOptional}
                            </label>
                            <input
                              value={v.plate ?? ""}
                              onChange={(e) =>
                                handleSanitizedPlateInput(e, (sanitized) =>
                                  updateVehicle(cat.id, idx, { plate: sanitized || null })
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
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!isValid && (
          <p className="text-gray-400 text-xs text-center">{t.rx.pickup.validationHint}</p>
        )}
      </div>
    );
  }

  // ── Rendu : mode normal (catégories héritées du montage, verrouillées) ─
  if (stepTwo.categories.length === 0) {
    return (
      <div className="flex flex-col w-full gap-3">
        <h2 className="text-base font-semibold text-gray-800">{t.rx.pickup.title}</h2>
        <p className="text-sm text-gray-500 italic">{t.rx.pickup.emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full gap-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-1">
          {t.rx.pickup.title}
        </h2>
        <p className="text-sm text-gray-500">⏪ {t.rx.pickup.intro}</p>
      </div>

      {/* Skip démontage : « Je ne souhaite pas d'accréditation pour le
          démontage ». Coché, l'étape disparaît et on passe à la manutention. */}
      <label className="flex items-start gap-2 text-sm bg-gray-50 border border-gray-200 rounded-lg p-3 cursor-pointer">
        <input
          type="checkbox"
          checked={!!stepTwo.skipDemontage}
          onChange={(e) => setSkipDemontage(e.target.checked)}
          className="mt-0.5 accent-primary"
        />
        <span className="text-gray-700">{skipT.demontageLabel}</span>
      </label>

      <div className="space-y-3">
        {stepTwo.categories.map((cat) => {
          const def = findCategory(stepOne.space, cat.categoryId);
          if (!def) return null;
          const localizedDef = getLocalizedCategory(def, t);
          const slots = cat.repDate ? genSlots(def.rep[cat.repDate] ?? "") : [];
          return (
            <div key={cat.categoryId} className="border rounded-lg p-3 bg-white">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked
                  disabled
                  className="accent-primary opacity-70"
                  aria-label={`${localizedDef.name} ${t.rx.pickup.lockedAria}`}
                />
                <span className="text-sm font-semibold text-gray-800">
                  {localizedDef.name}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    {t.rx.pickup.pickupDate} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={cat.repDate}
                    onChange={(e) =>
                      patchReturn(cat.categoryId, {
                        repDate: e.target.value,
                        repTime: "",
                      })
                    }
                    className={formInputCompactClass(!cat.repDate)}
                  >
                    <option value="">{t.rx.pickup.chooseDate}</option>
                    {Object.keys(def.rep).map((date) => (
                      <option key={date} value={date}>
                        {formatDateLocalized(date, lang)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    {t.rx.pickup.slot} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={cat.repTime}
                    disabled={!cat.repDate}
                    onChange={(e) =>
                      patchReturn(cat.categoryId, { repTime: e.target.value })
                    }
                    className={formInputCompactClass(
                      Boolean(cat.repDate && !cat.repTime)
                    )}
                  >
                    <option value="">
                      {cat.repDate ? t.rx.pickup.chooseSlot : t.rx.pickup.chooseDateFirst}
                    </option>
                    {slots.map((s) => (
                      <option key={s} value={s}>
                        {formatSlot(s)}
                      </option>
                    ))}
                  </select>
                  {(() => {
                    const firstVType = cat.vehicles[0]?.vehicleType ?? "";
                    if (!cat.repTime || !firstVType) return null;
                    const [st, et] = cat.repTime.split("-");
                    const matched = vehicleTypes.find((vt) => vt.code === firstVType || vt.code === firstVType.toUpperCase());
                    const vf = resolveVehicleFamilyFromConfig(matched) ?? resolveVehicleFamilyFromText(firstVType);
                    const palmBeachCodes = new Set(vehicleTypes.filter((vt) => vt.rxPalmBeachAtCanto).map((vt) => vt.code));
                    const zone = suggestZone(firstVType, stepOne.exhibitorSector, palmBeachCodes);
                    if (!zone || !vf) return null;
                    return (
                      <RxSlotBadge params={{
                        organizationId,
                        eventId: stepOne.eventId || undefined,
                        zone,
                        date: cat.repDate,
                        startTime: st,
                        endTime: et,
                        vehicleFamily: vf,
                        phase: "DEMONTAGE",
                      }} />
                    );
                  })()}
                </div>
              </div>

              <div className="space-y-3 border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  {t.rx.pickup.pickupVehicles}
                </p>
                {cat.vehicles.map((v, idx) => {
                  const sameVehicle = v.repSameAsDelivery !== false;
                  const deliveryLabel =
                    v.vehicleType && vehicleTypes.find((vt) => vt.code === v.vehicleType)?.gabarit;
                  return (
                    <div
                      key={idx}
                      className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2"
                    >
                      <p className="text-xs text-gray-600">
                        {t.rx.pickup.deliveryVehicle} {idx + 1}
                        {deliveryLabel ? ` — ${deliveryLabel}` : ""}
                        {v.plate ? ` (${v.plate})` : ""}
                      </p>
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={sameVehicle}
                          onChange={(e) =>
                            toggleSameVehicle(cat.categoryId, idx, e.target.checked)
                          }
                          className="mt-0.5 accent-primary"
                        />
                        <span>{t.rx.pickup.sameVehicle}</span>
                      </label>

                      {!sameVehicle && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          <div>
                            <label className="text-xs text-gray-600 block mb-0.5">
                              {t.rx.pickup.pickupVehicleType} <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={v.repVehicleType ?? ""}
                              onChange={(e) =>
                                patchRepVehicle(cat.categoryId, idx, {
                                  repVehicleType: e.target.value,
                                })
                              }
                              disabled={typesLoading || vehicleTypes.length === 0}
                              className={formInputCompactClass(!v.repVehicleType)}
                            >
                              <option value="">{t.rx.pickup.choose}</option>
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
                          </div>
                          <div>
                            <label className="text-xs text-gray-600 block mb-0.5">
                              {t.rx.pickup.pickupPlateOptional}
                            </label>
                            <input
                              value={v.repPlate ?? ""}
                              onChange={(e) =>
                                handleSanitizedPlateInput(e, (sanitized) =>
                                  patchRepVehicle(cat.categoryId, idx, {
                                    repPlate: sanitized || null,
                                  })
                                )
                              }
                              placeholder="AA123BB"
                              className={formInputCompactClass(false, "uppercase")}
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-xs text-gray-600 block mb-0.5">
                              {t.rx.pickup.driverPhonePickup}{" "}
                              <span className="text-red-500">*</span>
                            </label>
                            <PhoneInput
                              value={`${v.repPhoneCode ?? stepOne.contact.phoneCode}${v.repPhoneNumber ?? stepOne.contact.phoneNumber}`}
                              onChange={({ dialCode, nationalNumber }) =>
                                patchRepVehicle(cat.categoryId, idx, {
                                  repPhoneCode: `+${dialCode}`,
                                  repPhoneNumber: nationalNumber,
                                })
                              }
                              error={!v.repPhoneNumber?.trim()}
                              placeholder={t.rx.contact.phonePlaceholder}
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-xs text-gray-600 block mb-0.5">
                              {t.rx.delivery.interveningCompany}
                            </label>
                            <input
                              value={v.repInterveningCompany ?? ""}
                              onChange={(e) =>
                                patchRepVehicle(cat.categoryId, idx, {
                                  repInterveningCompany: e.target.value,
                                })
                              }
                              placeholder={t.rx.delivery.interveningPlaceholder}
                              className={formInputCompactClass(false)}
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-xs text-gray-600 block mb-0.5">
                              {t.departureCity}
                            </label>
                            <CityAutocomplete
                              value={v.repCity ?? ""}
                              onChange={(city) =>
                                patchRepVehicle(cat.categoryId, idx, { repCity: city })
                              }
                              onCitySelect={(city) => {
                                const fields = mapCitySelectToVehicleFields(city);
                                patchRepVehicle(cat.categoryId, idx, {
                                  repCity: fields.city,
                                  repCountry: fields.country,
                                  repEstimatedKms: fields.estimatedKms,
                                });
                              }}
                              className={formInputCompactClass(false)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {!isValid && (
        <p className="text-gray-400 text-xs text-center">
          {t.rx.pickup.validationHint}
        </p>
      )}
    </div>
  );
}

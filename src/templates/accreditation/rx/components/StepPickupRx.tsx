"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { handleSanitizedPlateInput } from "@/lib/plate-utils";
import { useVehicleTypes } from "@/hooks/useVehicleTypes";
import { useTranslation } from "@/components/accreditation/TranslationProvider";
import { findCategory, genSlots, formatSlot } from "../config";
import { getLocalizedCategory, formatDateLocalized } from "../i18n";
import type { StepProps } from "../../types";
import type { RxFormData, RxCategorySelection } from "../types";

type RepVehiclePatch = Partial<{
  repSameAsDelivery: boolean;
  repVehicleType: string;
  repPlate: string | null;
  repPhoneCode: string;
  repPhoneNumber: string;
}>;

/**
 * Step 4 RX — Gestion des reprises (démontage).
 *
 * Les catégories cochées au montage sont reprises automatiquement
 * (verrouillées : on ne peut ni ajouter ni retirer ici). Pour chacune,
 * l'exposant choisit la date + le créneau 1 h de reprise parmi les jours
 * d'ouverture `rep` de la catégorie, puis précise le véhicule de reprise.
 */
export function StepPickupRx({
  data,
  update,
  onValidityChange,
  orgSlug,
}: StepProps<RxFormData>) {
  const { t, lang } = useTranslation();
  const { stepOne, stepTwo } = data;
  const { types: vehicleTypes, loading: typesLoading } = useVehicleTypes(false, orgSlug);

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

  const copyDeliveryToRep = (
    cat: RxCategorySelection,
    vehicleIdx: number
  ): RepVehiclePatch => {
    const v = cat.vehicles[vehicleIdx];
    return {
      repSameAsDelivery: true,
      repVehicleType: v.vehicleType,
      repPlate: v.plate ?? null,
      repPhoneCode: stepOne.contact.phoneCode,
      repPhoneNumber: stepOne.contact.phoneNumber,
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

  const repVehicleValid = (cat: RxCategorySelection) =>
    cat.vehicles.every((v) => {
      const same = v.repSameAsDelivery !== false;
      if (same) return true;
      return Boolean(
        v.repVehicleType &&
          v.repPhoneCode?.trim() &&
          v.repPhoneNumber?.trim()
      );
    });

  const isValid =
    stepTwo.categories.length > 0 &&
    stepTwo.categories.every(
      (c) => c.repDate && c.repTime && repVehicleValid(c)
    );

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  if (stepTwo.categories.length === 0) {
    return (
      <div className="flex flex-col w-full gap-3">
        <h2 className="text-base font-semibold text-gray-800">
          {t.rx.pickup.title}
        </h2>
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
                  {def.icon} {localizedDef.name}
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
                    className={cn(
                      "w-full border rounded-md px-2 py-1.5 text-sm",
                      !cat.repDate && "border-red-400"
                    )}
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
                    className={cn(
                      "w-full border rounded-md px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-400",
                      cat.repDate && !cat.repTime && "border-red-400"
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
                </div>
              </div>

              <div className="space-y-3 border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  {t.rx.pickup.pickupVehicles}
                </p>
                {cat.vehicles.map((v, idx) => {
                  const sameVehicle = v.repSameAsDelivery !== false;
                  const deliveryLabel =
                    v.vehicleType && vehicleTypes.find((t) => t.code === v.vehicleType)?.label;
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
                              className={cn(
                                "w-full border rounded-md px-2 py-1.5 text-sm disabled:bg-gray-100",
                                !v.repVehicleType && "border-red-400"
                              )}
                            >
                              <option value="">{t.rx.pickup.choose}</option>
                              {vehicleTypes.map((vt) => (
                                <option key={vt.id} value={vt.code}>
                                  {vt.label}
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
                              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm uppercase"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-xs text-gray-600 block mb-0.5">
                              {t.rx.pickup.driverPhonePickup}{" "}
                              <span className="text-red-500">*</span>
                            </label>
                            <div className="flex gap-2">
                              <input
                                value={v.repPhoneCode ?? stepOne.contact.phoneCode}
                                onChange={(e) =>
                                  patchRepVehicle(cat.categoryId, idx, {
                                    repPhoneCode: e.target.value,
                                  })
                                }
                                className="w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                                placeholder="+33"
                              />
                              <input
                                type="tel"
                                value={v.repPhoneNumber ?? stepOne.contact.phoneNumber}
                                onChange={(e) =>
                                  patchRepVehicle(cat.categoryId, idx, {
                                    repPhoneNumber: e.target.value,
                                  })
                                }
                                className={cn(
                                  "flex-1 border rounded-md px-2 py-1.5 text-sm",
                                  !v.repPhoneNumber?.trim() && "border-red-400"
                                )}
                                placeholder="6 XX XX XX XX"
                              />
                            </div>
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

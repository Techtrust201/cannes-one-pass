"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { findCategory, genSlots, formatDateFR, formatSlot } from "../config";
import type { StepProps } from "../../types";
import type { RxFormData } from "../types";

/**
 * Step 4 RX — Gestion des reprises (démontage).
 *
 * Les catégories cochées au montage sont reprises automatiquement
 * (verrouillées : on ne peut ni ajouter ni retirer ici). Pour chacune,
 * l'exposant choisit la date + le créneau 1 h de reprise parmi les jours
 * d'ouverture `rep` de la catégorie.
 */
export function StepPickupRx({ data, update, onValidityChange }: StepProps<RxFormData>) {
  const { stepOne, stepTwo } = data;

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

  const isValid =
    stepTwo.categories.length > 0 &&
    stepTwo.categories.every((c) => c.repDate && c.repTime);

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  if (stepTwo.categories.length === 0) {
    return (
      <div className="flex flex-col w-full gap-3">
        <h2 className="text-base font-semibold text-gray-800">
          Gestion des reprises (démontage)
        </h2>
        <p className="text-sm text-gray-500 italic">
          Configurez d&apos;abord vos livraisons à l&apos;étape précédente.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full gap-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-1">
          Gestion des reprises (démontage)
        </h2>
        <p className="text-sm text-gray-500">
          ⏪ Les catégories sélectionnées au montage sont reprises
          automatiquement. Renseignez la date et le créneau de reprise pour
          chacune.
        </p>
      </div>

      <div className="space-y-3">
        {stepTwo.categories.map((cat) => {
          const def = findCategory(stepOne.space, cat.categoryId);
          if (!def) return null;
          const slots = cat.repDate ? genSlots(def.rep[cat.repDate] ?? "") : [];
          return (
            <div key={cat.categoryId} className="border rounded-lg p-3 bg-white">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked
                  disabled
                  className="accent-primary opacity-70"
                  aria-label={`${def.name} (verrouillé)`}
                />
                <span className="text-sm font-semibold text-gray-800">
                  {def.icon} {def.name}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    Date de reprise <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={cat.repDate}
                    onChange={(e) =>
                      patchReturn(cat.categoryId, { repDate: e.target.value, repTime: "" })
                    }
                    className={cn(
                      "w-full border rounded-md px-2 py-1.5 text-sm",
                      !cat.repDate && "border-red-400"
                    )}
                  >
                    <option value="">— Choisir une date —</option>
                    {Object.keys(def.rep).map((date) => (
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
                    value={cat.repTime}
                    disabled={!cat.repDate}
                    onChange={(e) => patchReturn(cat.categoryId, { repTime: e.target.value })}
                    className={cn(
                      "w-full border rounded-md px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-400",
                      cat.repDate && !cat.repTime && "border-red-400"
                    )}
                  >
                    <option value="">
                      {cat.repDate ? "— Choisir un créneau —" : "— Choisir d'abord une date —"}
                    </option>
                    {slots.map((s) => (
                      <option key={s} value={s}>
                        {formatSlot(s)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!isValid && (
        <p className="text-gray-400 text-xs text-center">
          Renseignez la date et le créneau de reprise pour chaque catégorie.
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  RX_SPACES,
  formatDateFR,
  generateHourlySlots,
} from "../config";
import type { StepProps } from "../../types";
import type { RxFormData, RxPickupCategory } from "../types";

/**
 * Step 4 RX — Gestion des reprises (démontage).
 *
 * Aligné sur la card 4 de la maquette validée :
 * - Les catégories cochées au montage sont **reprises automatiquement**
 *   (lecture seule, pas de toggle)
 * - Pour chaque catégorie : sélection de la date + créneau de reprise
 *   parmi les plages définies dans `RxCategory.rep`
 */
export function StepPickupRx({
  data,
  update,
  onValidityChange,
}: StepProps<RxFormData>) {
  const space = data.exhibitor.space ? RX_SPACES[data.exhibitor.space] : null;
  const deliveryIds = data.delivery.categories.map((c) => c.categoryId);

  // Synchronise l'état pickup avec les catégories cochées au montage :
  // - ajoute les catégories nouvellement cochées (date/slot vides)
  // - retire les catégories décochées
  useEffect(() => {
    const next: RxPickupCategory[] = [];
    for (const id of deliveryIds) {
      const existing = data.pickup.categories.find((c) => c.categoryId === id);
      next.push(existing ?? { categoryId: id, date: "", slot: "" });
    }
    const sameLength = next.length === data.pickup.categories.length;
    const sameOrder =
      sameLength &&
      next.every((c, i) => c.categoryId === data.pickup.categories[i]!.categoryId);
    if (!sameOrder) {
      update({ pickup: { categories: next } } as Partial<RxFormData>);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryIds.join(",")]);

  const patchPickup = (catId: string, patch: Partial<RxPickupCategory>) => {
    update({
      pickup: {
        categories: data.pickup.categories.map((c) =>
          c.categoryId === catId ? { ...c, ...patch } : c
        ),
      },
    } as Partial<RxFormData>);
  };

  const isValid = useMemo(() => {
    if (!space) return false;
    if (data.pickup.categories.length === 0) return false;
    return data.pickup.categories.every((c) => !!c.date && !!c.slot);
  }, [space, data.pickup.categories]);

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  if (!space) {
    return (
      <div className="rounded-md bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
        Configurez d&apos;abord vos livraisons à l&apos;étape précédente.
      </div>
    );
  }

  if (deliveryIds.length === 0) {
    return (
      <div className="rounded-md bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
        Aucune catégorie n&apos;a été cochée au montage. Retournez à l&apos;étape Livraison.
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full gap-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">
          Gestion des reprises (démontage)
        </h2>
        <p className="text-sm text-gray-500">
          Planifiez le départ pour les mêmes catégories que le montage.
        </p>
      </div>

      <p className="text-sm text-gray-700">
        ⏪ Les catégories sélectionnées au montage sont reprises automatiquement.
        Renseignez la date et le créneau de reprise pour chacune.
      </p>

      <div className="space-y-3">
        {data.pickup.categories.map((pc) => {
          const def = space.categories.find((c) => c.id === pc.categoryId);
          if (!def) return null;
          const dates = Object.keys(def.rep);
          const slots = pc.date ? generateHourlySlots(def.rep[pc.date] ?? "") : [];
          return (
            <div
              key={pc.categoryId}
              className="border rounded-lg p-3 bg-primary/5 border-primary"
            >
              <div className="font-semibold text-gray-800 flex items-center gap-2 flex-wrap mb-3">
                <span>
                  {def.icon} {def.name}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    Date de reprise <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={pc.date}
                    onChange={(e) =>
                      patchPickup(pc.categoryId, { date: e.target.value, slot: "" })
                    }
                    className={cn(
                      "w-full border rounded-md px-2 py-2 text-sm bg-white",
                      !pc.date && "border-red-300"
                    )}
                  >
                    <option value="">— Choisir une date —</option>
                    {dates.map((d) => (
                      <option key={d} value={d}>
                        {formatDateFR(d)} ({def.rep[d]})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    Créneau <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={pc.slot}
                    onChange={(e) => patchPickup(pc.categoryId, { slot: e.target.value })}
                    disabled={!pc.date}
                    className={cn(
                      "w-full border rounded-md px-2 py-2 text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400",
                      pc.date && !pc.slot && "border-red-300"
                    )}
                  >
                    <option value="">
                      {pc.date ? "— Choisir un créneau —" : "— Choisir d'abord une date —"}
                    </option>
                    {slots.map((s) => (
                      <option key={s} value={s}>
                        {s.replace("-", " – ")}
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
        <p className="text-red-500 text-sm text-center">
          Renseignez la date et le créneau pour chaque catégorie pour continuer.
        </p>
      )}
    </div>
  );
}

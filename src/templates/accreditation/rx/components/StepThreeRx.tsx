"use client";

import { useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { RX_MANUTENTION_PROVIDERS, RX_SPACES } from "../config";
import type { StepProps } from "../../types";
import type { RxFormData } from "../types";

/**
 * Step 3 RX — Reprise & manutention :
 * - Reprise des catégories cochées au montage : choix date/horaire de
 *   démontage parmi les plages possibles de la catégorie.
 * - Prestataire de manutention principal.
 * - Acquittement Scales (si une catégorie le requiert).
 * - Consentement final.
 */
export function StepThreeRx({ data, update, onValidityChange }: StepProps<RxFormData>) {
  const { stepOne, stepTwo, stepThree } = data;
  const spaceDef = stepOne.space ? RX_SPACES[stepOne.space] : null;

  const updateCategoryReturn = (
    categoryId: string,
    patch: { repDate?: string; repTime?: string }
  ) => {
    update({
      stepTwo: {
        ...stepTwo,
        categories: stepTwo.categories.map((c) =>
          c.categoryId === categoryId ? { ...c, ...patch } : c
        ),
      },
    });
  };

  const scalesRequired = useMemo(() => {
    if (!spaceDef) return false;
    return stepTwo.categories.some((c) => {
      const def = spaceDef.categories.find((d) => d.id === c.categoryId);
      return def?.scales;
    });
  }, [spaceDef, stepTwo.categories]);

  const allReturnsSet = stepTwo.categories.every((c) => c.repDate && c.repTime);
  const scalesOk = !scalesRequired || stepThree.scalesAcknowledged;
  const isValid =
    allReturnsSet &&
    !!stepThree.manutentionProvider &&
    stepThree.consent &&
    scalesOk;

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  return (
    <div className="flex flex-col w-full gap-4">
      <h2 className="text-lg font-bold">Reprise et manutention</h2>

      <div className="space-y-3">
        <p className="text-sm text-gray-700">
          ⏪ Pour chaque catégorie cochée au montage, choisissez la date et l&apos;horaire de reprise.
        </p>
        {stepTwo.categories.length === 0 && (
          <p className="text-sm text-gray-500 italic">
            Aucune catégorie sélectionnée à l&apos;étape précédente.
          </p>
        )}
        {stepTwo.categories.map((cat) => {
          const def = spaceDef?.categories.find((d) => d.id === cat.categoryId);
          if (!def) return null;
          return (
            <div key={cat.categoryId} className="border rounded-lg p-3 bg-white">
              <div className="text-sm font-semibold text-gray-800 mb-2">
                {def.icon} {def.name}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    Date de reprise <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={cat.repDate}
                    onChange={(e) => {
                      const nextDate = e.target.value;
                      updateCategoryReturn(cat.categoryId, {
                        repDate: nextDate,
                        repTime: def.rep[nextDate] ?? "",
                      });
                    }}
                    className={cn(
                      "w-full border rounded-md px-2 py-1 text-sm",
                      !cat.repDate && "border-red-400"
                    )}
                  >
                    <option value="">— Choisir —</option>
                    {Object.keys(def.rep).map((date) => (
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
                    {cat.repTime || "—"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-semibold text-gray-700">
          Prestataire de manutention <span className="text-red-500">*</span>
        </label>
        <select
          value={stepThree.manutentionProvider}
          onChange={(e) =>
            update({ stepThree: { ...stepThree, manutentionProvider: e.target.value } })
          }
          className={cn(
            "w-full border rounded-md px-3 py-2 text-sm",
            !stepThree.manutentionProvider && "border-red-400"
          )}
        >
          <option value="">— Sélectionnez un prestataire —</option>
          {RX_MANUTENTION_PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        {scalesRequired && (
          <p className="text-xs text-orange-700 mt-1">
            ⚠ Scales sera automatiquement assigné pour les catégories cochées le nécessitant.
          </p>
        )}
      </div>

      {scalesRequired && (
        <label className="flex items-start gap-2 text-sm bg-orange-50 border border-orange-200 rounded-md p-3">
          <input
            type="checkbox"
            checked={stepThree.scalesAcknowledged}
            onChange={(e) =>
              update({ stepThree: { ...stepThree, scalesAcknowledged: e.target.checked } })
            }
            className="mt-1 accent-orange-600"
          />
          <span>
            Je prendrai contact avec <strong>Scales</strong> pour planifier la manutention des
            catégories concernées (contact :{" "}
            <a href="mailto:scales@manutention.fr" className="underline">
              scales@manutention.fr
            </a>
            ).
          </span>
        </label>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={stepThree.consent}
          onChange={(e) => update({ stepThree: { ...stepThree, consent: e.target.checked } })}
          className="accent-primary"
        />
        J&apos;autorise le traitement de ces informations dans le cadre de l&apos;accréditation logistique
        de l&apos;événement.
      </label>

      {!isValid && (
        <p className="text-red-500 text-sm text-center">
          Complétez toutes les dates de reprise, choisissez un prestataire et confirmez le
          consentement (ainsi que l&apos;acquittement Scales si nécessaire).
        </p>
      )}
    </div>
  );
}

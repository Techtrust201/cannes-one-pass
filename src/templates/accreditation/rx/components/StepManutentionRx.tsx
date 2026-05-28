"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/components/accreditation/TranslationProvider";
import { RX_MANUTENTION_PROVIDERS, RX_SPACES } from "../config";
import { mapRxPayload } from "../mapPayload";
import { useRxFinalizer } from "../finalizerContext";
import type { StepProps } from "../../types";
import type { RxFormData, RxManutentionProvider } from "../types";

/**
 * Step 5 RX — Prestataire de manutention + validation finale.
 *
 * Aligné sur la card 5 + bouton "Valider l'accréditation" de la maquette :
 * - Notice "Scales auto" si une catégorie cochée nécessite Scales
 * - Select prestataire complémentaire (SVMM / Mathez / Scales / Autonome)
 * - **Bouton de validation final** intégré au step (le wizard ne rend pas
 *   de "Suivant" sur le dernier step)
 * - POST `/api/accreditations` puis overlay de succès avec ID
 */
export function StepManutentionRx({
  data,
  update,
  onValidityChange,
}: StepProps<RxFormData>) {
  const { lang } = useTranslation();
  const { resetAll, setHasSaved } = useRxFinalizer();

  const setProvider = (provider: RxManutentionProvider) => {
    update({ manutention: { provider } } as Partial<RxFormData>);
  };

  // Notice Scales auto : true si au moins une catégorie cochée a scales=true
  const scalesAuto = useMemo(() => {
    const space = data.exhibitor.space ? RX_SPACES[data.exhibitor.space] : null;
    if (!space) return false;
    return data.delivery.categories.some((c) => {
      const def = space.categories.find((cat) => cat.id === c.categoryId);
      return def?.scales === true;
    });
  }, [data.exhibitor.space, data.delivery.categories]);

  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step toujours valide (prestataire optionnel selon maquette).
  useEffect(() => {
    onValidityChange(true);
  }, [onValidityChange]);

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = mapRxPayload(data, lang);
      const res = await fetch("/api/accreditations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error || `Erreur ${res.status} lors de l'enregistrement`
        );
      }
      const created = (await res.json()) as { id?: string };
      setSubmittedId(created.id ?? "—");
      setHasSaved(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setSubmitting(false);
    }
  }

  function handleNew() {
    setSubmittedId(null);
    setSubmitError(null);
    resetAll();
  }

  return (
    <div className="flex flex-col w-full gap-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">
          Prestataire de manutention principal
        </h2>
        <p className="text-sm text-gray-500">
          Société pour la manutention non-Scales.
        </p>
      </div>

      {scalesAuto && (
        <div className="rounded-md bg-orange-50 border border-orange-200 p-3 text-sm text-orange-900">
          ⚠ <strong>Scales sera automatiquement assigné</strong> pour les
          catégories cochées le nécessitant (bateaux à terre, motoristes, etc.).
          Vous pouvez tout de même choisir un prestataire complémentaire pour le
          reste des opérations.
        </div>
      )}

      <div>
        <label
          htmlFor="rx-manut"
          className="text-sm font-semibold text-gray-700 block mb-1"
        >
          Prestataire complémentaire
        </label>
        <select
          id="rx-manut"
          value={data.manutention.provider}
          onChange={(e) => setProvider(e.target.value as RxManutentionProvider)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:ring-primary focus:border-primary"
        >
          <option value="">— Sélectionnez un prestataire —</option>
          {RX_MANUTENTION_PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
        ⚠ Tous les champs marqués <strong>*</strong> aux étapes précédentes
        sont obligatoires. La validation génère une accréditation officielle
        transmise par e-mail.
      </div>

      {submitError && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          <strong>Erreur :</strong> {submitError}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || submittedId !== null}
        className={cn(
          "w-full py-3 px-4 rounded-md text-white font-semibold transition shadow-sm",
          submitting || submittedId !== null
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-[#353c52] hover:bg-[#2a3045]"
        )}
      >
        {submitting
          ? "Enregistrement en cours…"
          : submittedId
            ? "Accréditation enregistrée"
            : "✅ Valider l'accréditation"}
      </button>

      {submittedId && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center">
            <div className="w-16 h-16 mx-auto bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-3xl mb-4">
              ✓
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Accréditation validée !
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Votre demande a bien été enregistrée. Un e-mail de confirmation
              avec votre planning détaillé vous sera envoyé dans les prochaines
              minutes.
            </p>
            <div className="bg-gray-100 rounded-md py-2 px-4 inline-block font-mono text-sm text-gray-800 mb-4">
              {submittedId}
            </div>
            {scalesAuto && (
              <div className="rounded-md bg-orange-50 border border-orange-200 p-3 text-xs text-orange-900 mb-4 text-left">
                <strong>⚠ Rappel Scales :</strong> n&apos;oubliez pas de prendre
                rendez-vous avec Scales pour les catégories nécessitant leur
                intervention. Contact :{" "}
                <strong>scales@manutention.fr</strong>
              </div>
            )}
            <button
              type="button"
              onClick={handleNew}
              className="w-full py-2 px-4 rounded-md bg-[#353c52] text-white text-sm font-semibold hover:bg-[#2a3045] transition"
            >
              Nouvelle demande
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { useTranslation } from "@/components/accreditation/TranslationProvider";
import { PortalOverlay } from "@/components/ui/PortalOverlay";
import { mapRxPayload } from "../mapPayload";
import { RX_MANUTENTION_PROVIDERS, findCategory } from "../config";
import type { StepProps } from "../../types";
import type { RxFormData } from "../types";

/**
 * Step 5 RX — Manutention + validation finale.
 *
 * - Notice Scales auto si au moins une catégorie cochée le nécessite.
 * - Sélection d'un prestataire complémentaire (optionnel).
 * - Consentement.
 * - Bouton "Valider l'accréditation" : POST /api/accreditations + overlay
 *   de succès avec ID d'accréditation (pattern homogène avec le Palais).
 */
export function StepManutentionRx({ data, update, onValidityChange, mode }: StepProps<RxFormData>) {
  const { t, lang } = useTranslation();
  const { stepOne, stepTwo, stepThree } = data;

  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [error, setError] = useState("");

  const scalesRequired = useMemo(
    () =>
      stepTwo.categories.some(
        (c) => findCategory(stepOne.space, c.categoryId)?.scales === true
      ),
    [stepOne.space, stepTwo.categories]
  );

  // L'étape est "valide" (bouton Suivant) dès que le consentement est donné ;
  // mais comme c'est la dernière étape, la validation réelle se fait au submit.
  const isValid = stepThree.consent && (!scalesRequired || stepThree.scalesAcknowledged);

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  async function handleConfirm() {
    if (hasSaved) {
      setShowModal(false);
      return;
    }
    setError("");
    try {
      setLoading(true);
      // Public → NOUVEAU (en attente de validation) ; logisticien → ATTENTE (validé).
      const status = mode === "logisticien" ? "ATTENTE" : "NOUVEAU";
      const payload = mapRxPayload(data, lang, { status, split: true });
      const res = await fetch("/api/accreditations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "save error");
      }
      const created = await res.json().catch(() => null);
      // L'API split renvoie { count, ids } ; fallback au nombre de véhicules.
      const fallbackCount =
        stepTwo.categories.reduce((s, c) => s + c.vehicles.length, 0) || 1;
      setCreatedCount(
        typeof created?.count === "number" ? created.count : fallbackCount
      );
      setHasSaved(true);
      setShowModal(false);
    } catch (err) {
      console.error(err);
      setError(t.saveError ?? "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setLoading(false);
    }
  }

  const totalVehicles = stepTwo.categories.reduce((s, c) => s + c.vehicles.length, 0);

  // Écran de succès
  if (hasSaved) {
    return (
      <div className="flex flex-col items-center justify-center py-8 w-full text-center gap-4">
        <CheckCircle size={56} className="text-green-500" />
        <h2 className="text-2xl font-bold text-gray-900">
          {createdCount > 1
            ? `${createdCount} accréditations enregistrées !`
            : "Accréditation enregistrée !"}
        </h2>
        <p className="text-sm text-gray-600 max-w-md">
          {createdCount > 1
            ? "Une accréditation a été créée par véhicule. "
            : ""}
          {mode === "logisticien"
            ? "Elles sont validées et visibles dans la liste."
            : "Votre demande sera traitée puis validée par l'organisateur. Un e-mail de confirmation vous sera envoyé."}
        </p>
        {scalesRequired && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-sm text-orange-800 max-w-md text-left">
            <strong>⚠ Rappel Scales :</strong> n&apos;oubliez pas de prendre
            rendez-vous avec Scales pour les catégories concernées. Contact :{" "}
            <strong>scales@manutention.fr</strong>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full gap-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-1">
          Prestataire de manutention
        </h2>
        <p className="text-sm text-gray-500">
          Société pour la manutention non-Scales.
        </p>
      </div>

      {scalesRequired && (
        <div className="bg-orange-50 border border-orange-200 rounded-md p-3 text-sm text-orange-800">
          <strong>⚠ Scales sera automatiquement assigné</strong> pour les
          catégories cochées le nécessitant (bateaux à terre, motoristes…). Vous
          pouvez choisir un prestataire complémentaire pour le reste.
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm font-semibold text-gray-700">
          Prestataire complémentaire
        </label>
        <select
          value={stepThree.manutentionProvider}
          onChange={(e) =>
            update({ stepThree: { ...stepThree, manutentionProvider: e.target.value } })
          }
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
        >
          <option value="">— Sélectionnez un prestataire —</option>
          {RX_MANUTENTION_PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
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
            Je prendrai contact avec <strong>Scales</strong> pour planifier la
            manutention des catégories concernées (
            <a href="mailto:scales@manutention.fr" className="underline">
              scales@manutention.fr
            </a>
            ).
          </span>
        </label>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={stepThree.consent}
          onChange={(e) => update({ stepThree: { ...stepThree, consent: e.target.checked } })}
          className="mt-1 accent-primary"
        />
        <span>
          J&apos;autorise le traitement de ces informations dans le cadre de
          l&apos;accréditation logistique de l&apos;événement.
        </span>
      </label>

      {/* Récap compact */}
      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm space-y-1">
        <div>
          <span className="font-semibold">Exposant :</span> {stepOne.exhibitorName}{" "}
          <span className="text-gray-500">({stepOne.exhibitorStand})</span>
        </div>
        <div>
          <span className="font-semibold">Catégories :</span> {stepTwo.categories.length}
          {" · "}
          <span className="font-semibold">Véhicules :</span> {totalVehicles}
        </div>
        <div>
          <span className="font-semibold">Contact :</span> {stepOne.contact.firstName}{" "}
          {stepOne.contact.lastName} · {stepOne.contact.email}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-2 rounded text-sm">
          <AlertTriangle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowModal(true)}
        disabled={!isValid || loading}
        className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-base shadow transition-all duration-150 bg-primary text-white hover:bg-primary-dark disabled:opacity-50"
      >
        {loading ? <Loader2 size={18} className="animate-spin" /> : "✅"}
        Valider l&apos;accréditation
      </button>

      {!isValid && (
        <p className="text-gray-400 text-xs text-center">
          Confirmez le consentement
          {scalesRequired ? " et l'acquittement Scales" : ""} pour valider.
        </p>
      )}

      {showModal && (
        <PortalOverlay>
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] px-4">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full border border-gray-200">
              <h2 className="text-lg font-bold mb-4 text-gray-900 text-center">
                {t.confirmTitle ?? "Confirmer l'envoi"}
              </h2>
              <p className="mb-6 text-gray-700 leading-relaxed text-center text-sm">
                {t.confirmMsg1 ?? "Confirmez-vous l'envoi de cette accréditation ?"}
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <button
                  onClick={() => setShowModal(false)}
                  disabled={loading}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl border border-gray-300 bg-gray-100 text-gray-800 font-semibold hover:bg-gray-200 transition"
                >
                  {t.cancel ?? "Annuler"}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-primary text-white font-semibold shadow hover:bg-primary-dark transition disabled:opacity-60"
                >
                  {loading
                    ? (t.savingProgress ?? "Envoi…")
                    : (t.confirm ?? "Confirmer")}
                </button>
              </div>
            </div>
          </div>
        </PortalOverlay>
      )}
    </div>
  );
}

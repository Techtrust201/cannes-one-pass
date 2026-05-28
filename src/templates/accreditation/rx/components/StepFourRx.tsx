"use client";

import { useState } from "react";
import Image from "next/image";
import { CheckCircle, AlertTriangle, PlusCircle } from "lucide-react";
import { useTranslation } from "@/components/accreditation/TranslationProvider";
import { PortalOverlay } from "@/components/ui/PortalOverlay";
import { mapRxPayload } from "../mapPayload";
import { RX_SPACES } from "../config";
import type { StepProps } from "../../types";
import type { RxFormData } from "../types";

/**
 * Step 4 RX — Récapitulatif et soumission.
 * Reprend le pattern visuel du StepFour Palais (modal de confirmation,
 * indicateur succès, bouton "Nouvelle demande") pour maintenir une UX
 * homogène entre les deux templates.
 */
export function StepFourRx({ data }: StepProps<RxFormData>) {
  const { t, lang } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [infoMsg, setInfoMsg] = useState("");
  const [success, setSuccess] = useState(false);

  const spaceDef = data.stepOne.space ? RX_SPACES[data.stepOne.space] : null;
  const totalVehicles = data.stepTwo.categories.reduce((sum, c) => sum + c.vehicles.length, 0);

  async function handleSave() {
    if (hasSaved) {
      setInfoMsg(t.alreadySavedNotice);
      setShowModal(false);
      return;
    }
    try {
      setLoading(true);
      const payload = mapRxPayload(data, lang);
      const res = await fetch("/api/accreditations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("save error");
      setSuccess(true);
      setHasSaved(true);
      setInfoMsg(t.alreadySavedNotice);
      setTimeout(() => setShowModal(false), 1200);
    } catch (err) {
      console.error(err);
      alert(t.saveError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center py-4 w-full">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-lg px-6 py-6 w-full max-w-xl text-left space-y-4">
        <div className="flex items-center gap-3 mb-2">
          {hasSaved ? (
            <CheckCircle size={32} className="text-green-500" />
          ) : (
            <Image
              src="/accreditation/progressbar/Vector (3).svg"
              alt="Récapitulatif"
              width={32}
              height={32}
              className="w-8 h-8 shrink-0"
            />
          )}
          <h2 className="text-xl font-bold text-gray-800">
            {hasSaved ? t.requestSaved : "Récapitulatif"}
          </h2>
        </div>

        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm space-y-1">
          <div>
            <span className="font-semibold">Exposant :</span> {data.stepOne.exhibitorName}
          </div>
          <div>
            <span className="font-semibold">Stand :</span> {data.stepOne.exhibitorStand}
          </div>
          <div>
            <span className="font-semibold">Espace :</span> {spaceDef?.label ?? "—"}
          </div>
          <div>
            <span className="font-semibold">Catégories :</span>{" "}
            {data.stepTwo.categories.length}
          </div>
          <div>
            <span className="font-semibold">Véhicules attendus :</span> {totalVehicles}
          </div>
          <div>
            <span className="font-semibold">Manutention :</span>{" "}
            {data.stepThree.manutentionProvider}
          </div>
          <div>
            <span className="font-semibold">Contact :</span>{" "}
            {data.stepOne.contact.firstName} {data.stepOne.contact.lastName} ·{" "}
            {data.stepOne.contact.email}
          </div>
        </div>

        {infoMsg && (
          <div className="flex items-center gap-2 bg-orange-50 border-l-4 border-orange-400 text-orange-700 px-4 py-2 rounded text-sm">
            <AlertTriangle size={18} className="shrink-0" />
            <span>{infoMsg}</span>
          </div>
        )}

        <div className="flex flex-col gap-3 mt-2">
          <button
            onClick={() => setShowModal(true)}
            disabled={loading || hasSaved}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-base shadow transition-all duration-150 bg-primary text-white hover:bg-primary-dark disabled:opacity-60 disabled:bg-gray-200 disabled:text-gray-400"
          >
            <PlusCircle size={20} />
            {hasSaved ? t.alreadySaved : loading ? "…" : t.saveRequest}
          </button>
        </div>
      </div>

      {showModal && (
        <PortalOverlay>
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70]">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 border border-gray-200">
              <h2 className="text-lg font-bold mb-4 text-gray-900 text-center">
                {t.confirmTitle}
              </h2>
              <p className="mb-6 text-gray-700 leading-relaxed text-center">
                {t.confirmMsg1}
                <br />
                {t.confirmMsg2}
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-6 mt-4">
                <button
                  onClick={() => setShowModal(false)}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl border border-gray-400 bg-gray-200 text-gray-800 font-semibold hover:bg-gray-300 transition shadow"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleSave}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-primary text-white font-semibold shadow hover:bg-primary-dark transition"
                  disabled={loading || hasSaved || success}
                >
                  {success ? t.savedDone : loading ? t.savingProgress : t.confirm}
                </button>
              </div>
            </div>
          </div>
        </PortalOverlay>
      )}
    </div>
  );
}

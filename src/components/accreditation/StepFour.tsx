"use client";

import { useState } from "react";
import Image from "next/image";
import { CheckCircle, Download, PlusCircle, AlertTriangle } from "lucide-react";
import type { Vehicle } from "@/types";
import DuplicateAlert from "@/components/accreditation/DuplicateAlert";
import { useTranslation } from "@/components/accreditation/TranslationProvider";
import { PortalOverlay } from "@/components/ui/PortalOverlay";
import AccreditationRecap from "@/components/accreditation/AccreditationRecap";

interface Props {
  data: {
    company: string;
    stand: string;
    unloading: string;
    event: string;
    vehicles: Vehicle[];
    message: string;
    consent: boolean;
    /** E-mail du destinataire (obligatoire) — transmis au payload de création. */
    email: string;
  };
  onReset: () => void;
  onClearForm: () => void;
  onHasSavedChange: (hasSaved: boolean) => void;
  /** Navigation vers une étape pour modification depuis le récap. */
  onEditStep?: (step: number) => void;
}

export default function StepFour({
  data,
  onReset,
  onClearForm,
  onHasSavedChange,
  onEditStep,
}: Props) {
  const { t, lang } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showDuplicateCheck, setShowDuplicateCheck] = useState(false);
  const [success, setSuccess] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [infoMsg, setInfoMsg] = useState("");
  // ID de l'accréditation créée : permet de télécharger EXACTEMENT le même PDF
  // structuré (source unique) que celui joint à l'e-mail.
  const [savedId, setSavedId] = useState<string | null>(null);

  async function handleSave() {
    if (hasSaved) {
      setInfoMsg(t.alreadySavedNotice);
      setShowModal(false);
      return;
    }
    try {
      setLoading(true);
      const saveRes = await fetch("/api/accreditations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, language: lang, status: "NOUVEAU" }),
      });
      if (!saveRes.ok) throw new Error("save error");
      const created = await saveRes.json().catch(() => null);
      if (created?.id) setSavedId(String(created.id));
      setSuccess(true);
      setHasSaved(true);
      onHasSavedChange(true);
      setInfoMsg(t.alreadySavedNotice);
      setTimeout(() => {
        setShowModal(false);
        setSuccess(false);
        // Vider les champs mais rester sur step 4
        onClearForm();
      }, 1200);
    } catch (err) {
      console.error(err);
      alert(t.saveError);
    } finally {
      setLoading(false);
    }
  }

  async function downloadPdf() {
    // Source UNIQUE de vérité : on ne télécharge que le PDF structuré par ID,
    // identique à la pièce jointe de l'e-mail. Le bouton n'est rendu qu'après
    // enregistrement, donc `savedId` est toujours présent ici.
    if (!savedId) {
      setInfoMsg(t.pdfError);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch("/api/accreditation/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [savedId], mode: "request", lang }),
      });
      if (!res.ok) throw new Error("pdf error");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "accreditation.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert(t.pdfError);
    } finally {
      setLoading(false);
    }
  }

  function handleSaveClick() {
    if (hasSaved) {
      setInfoMsg(t.alreadySavedNotice);
      return;
    }
    // Lancer la vérification de doublons avant d'afficher la modal de confirmation
    setShowDuplicateCheck(true);
  }

  function handleDuplicateConfirm() {
    setShowDuplicateCheck(false);
    setShowModal(true);
  }

  function handleDuplicateCancel() {
    setShowDuplicateCheck(false);
  }

  async function handleNewRequest() {
    if (!hasSaved) {
      // Si pas encore enregistré, enregistrer d'abord
      try {
        setLoading(true);
        const saveRes = await fetch("/api/accreditations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, language: lang, status: "NOUVEAU" }),
        });
        if (!saveRes.ok) throw new Error("save error");
        setHasSaved(true);
        onHasSavedChange(true);
      } catch (err) {
        console.error(err);
        alert(t.saveError);
        return;
      } finally {
        setLoading(false);
      }
    }
    // Puis réinitialiser et revenir au step 1
    onReset();
  }

  return (
    <div className="flex flex-col items-center py-8">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-lg px-6 py-8 w-full max-w-xl text-left space-y-6">
        {/* Header avec icône de succès ou info */}
        <div className="flex items-center gap-3 mb-2">
          {hasSaved ? (
            <CheckCircle size={32} className="text-green-500" />
          ) : (
            <Image
              src="/accreditation/progressbar/Vector (3).svg"
              alt="PDF"
              width={32}
              height={32}
              className="w-8 h-8 shrink-0"
            />
          )}
          <h2 className="text-xl font-bold text-gray-800">
            {hasSaved ? t.requestSaved : t.recapTitle ?? t.requestCreated}
          </h2>
        </div>

        {/* Message principal */}
        <div
          className={`rounded-lg px-4 py-3 text-base font-medium ${hasSaved ? "bg-green-100 border border-green-400 text-green-900" : "bg-gray-50 border border-gray-200 text-gray-700"}`}
        >
          {hasSaved ? (
            <>
              {t.savedMessage}
              <br />
              {t.savedMessage2}
            </>
          ) : (
            <>
              {t.beforeSaveNotice ??
                "Enregistrez votre demande pour recevoir le récapitulatif par e-mail. L'accréditation devra être validée par un agent à votre arrivée."}
            </>
          )}
        </div>

        {/* Avertissement spam visible (après enregistrement) */}
        {hasSaved && (
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm font-medium">
            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-blue-500" />
            <span>
              {t.spamNotice ??
                "Si vous ne recevez pas l'e-mail dans les prochaines minutes, pensez à vérifier votre dossier spam / courrier indésirable."}
            </span>
          </div>
        )}

        {/* Récapitulatif complet avant validation (avant enregistrement). */}
        {!hasSaved && (
          <AccreditationRecap
            data={data}
            onEditStep={onEditStep}
            statusNotice={
              t.recapStatusPublic ??
              "Demande à valider — elle sera vérifiée par un agent à votre arrivée."
            }
          />
        )}

        {/* Message d'alerte/info */}
        {infoMsg && (
          <div className="flex items-center gap-2 bg-orange-50 border-l-4 border-orange-400 text-orange-700 px-4 py-2 rounded text-sm">
            <AlertTriangle size={18} className="shrink-0" />
            <span>{infoMsg}</span>
          </div>
        )}

        {/* Boutons */}
        <div className="flex flex-col gap-3 mt-4">
          {/* Avant enregistrement : seul « Enregistrer la demande » est proposé.
              Le téléchargement n'apparaît qu'une fois la demande créée. */}
          {!hasSaved && (
            <button
              onClick={handleSaveClick}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-base shadow transition-all duration-150 bg-primary text-white hover:bg-primary-dark disabled:opacity-60"
            >
              <PlusCircle size={20} />
              {loading ? "…" : t.saveRequest}
            </button>
          )}
          {/* Après enregistrement : téléchargement disponible. */}
          {hasSaved && (
            <button
              onClick={downloadPdf}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-base bg-[#3daaa4] text-white shadow hover:bg-[#319b92] transition-all duration-150 disabled:opacity-60"
            >
              <Download size={20} />
              {loading ? t.generatingPdf : t.downloadPdf}
            </button>
          )}
          {/* Nouveau bouton après enregistrement */}
          {hasSaved && (
            <button
              onClick={handleNewRequest}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-base bg-white text-gray-700 border border-gray-300 shadow hover:bg-gray-100 transition-all duration-150 mt-2 disabled:opacity-60"
            >
              <PlusCircle size={20} />
              {t.newRequest}
            </button>
          )}
        </div>
      </div>

      {/* Vérification des doublons */}
      {showDuplicateCheck && (
        <DuplicateAlert
          company={data.company}
          plate={data.vehicles[0]?.plate || ""}
          event={data.event}
          trailerPlate={data.vehicles[0]?.trailerPlate}
          onConfirm={handleDuplicateConfirm}
          onCancel={handleDuplicateCancel}
        />
      )}

      {/* Modal de confirmation */}
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
              <br />
              <span className="font-semibold text-orange-600">
                {t.confirmMsg3}
              </span>
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-6 mt-8">
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
                {success
                  ? t.savedDone
                  : loading
                    ? t.savingProgress
                    : t.confirm}
              </button>
            </div>
          </div>
        </div>
        </PortalOverlay>
      )}
    </div>
  );
}

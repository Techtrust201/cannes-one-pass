"use client";

import { useState } from "react";
import Image from "next/image";
import { CheckCircle, Download, PlusCircle, AlertTriangle } from "lucide-react";
import type { Vehicle } from "@/types";
import DuplicateAlert from "@/components/accreditation/DuplicateAlert";

interface Props {
  data: {
    company: string;
    stand: string;
    unloading: string;
    event: string;
    vehicles: Vehicle[];
    message: string;
    consent: boolean;
  };
  onReset: () => void;
  onClearForm: () => void;
  onHasSavedChange: (hasSaved: boolean) => void;
}

export default function StepFour({
  data,
  onReset,
  onClearForm,
  onHasSavedChange,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showDuplicateCheck, setShowDuplicateCheck] = useState(false);
  const [success, setSuccess] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [infoMsg, setInfoMsg] = useState("");

  async function handleSave() {
    if (hasSaved) {
      setInfoMsg(
        "Vous avez déjà enregistré votre demande. Elle doit être validée par un agent."
      );
      setShowModal(false);
      return;
    }
    try {
      setLoading(true);
      const saveRes = await fetch("/api/accreditations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, status: "NOUVEAU" }),
      });
      if (!saveRes.ok) throw new Error("Erreur enregistrement");
      setSuccess(true);
      setHasSaved(true);
      onHasSavedChange(true);
      setInfoMsg(
        "Votre demande a bien été enregistrée. Elle doit être validée par un agent."
      );
      setTimeout(() => {
        setShowModal(false);
        setSuccess(false);
        // Vider les champs mais rester sur step 4
        onClearForm();
      }, 1200);
    } catch (err) {
      console.error(err);
      alert("Impossible d'enregistrer la demande");
    } finally {
      setLoading(false);
    }
  }

  async function downloadPdf() {
    try {
      setLoading(true);
      const res = await fetch("/api/accreditation/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          status: "NOUVEAU", // ou "ATTENTE" selon le besoin métier
        }),
      });
      if (!res.ok) throw new Error("Erreur génération PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "accreditation.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Impossible de télécharger le PDF");
    } finally {
      setLoading(false);
    }
  }

  function handleSaveClick() {
    if (hasSaved) {
      setInfoMsg(
        "Vous avez déjà enregistré votre demande. Elle doit être validée par un agent."
      );
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
          body: JSON.stringify({ ...data, status: "NOUVEAU" }),
        });
        if (!saveRes.ok) throw new Error("Erreur enregistrement");
        setHasSaved(true);
        onHasSavedChange(true);
      } catch (err) {
        console.error(err);
        alert("Impossible d'enregistrer la demande");
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
            {hasSaved ? "Demande enregistrée" : "Demande créée"}
          </h2>
        </div>

        {/* Message principal */}
        <div
          className={`rounded-lg px-4 py-3 text-base font-medium ${hasSaved ? "bg-green-50 border border-green-200 text-green-800" : "bg-gray-50 border border-gray-200 text-gray-700"}`}
        >
          {hasSaved ? (
            <>
              Votre demande a bien été enregistrée.
              <br />
              Elle doit être validée par un agent avant d&apos;être utilisable.
            </>
          ) : (
            <>
              Vous recevrez un SMS lorsqu&apos;un logisticien aura validé
              l&apos;accréditation.
            </>
          )}
        </div>

        {/* Message d'alerte/info */}
        {infoMsg && (
          <div className="flex items-center gap-2 bg-orange-50 border-l-4 border-orange-400 text-orange-700 px-4 py-2 rounded text-sm">
            <AlertTriangle size={18} className="shrink-0" />
            <span>{infoMsg}</span>
          </div>
        )}

        {/* Boutons */}
        <div className="flex flex-col gap-3 mt-4">
          <button
            onClick={handleSaveClick}
            disabled={loading || hasSaved}
            className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-base shadow transition-all duration-150
              ${hasSaved ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-primary text-white hover:bg-primary-dark"}
              disabled:opacity-60`}
            aria-disabled={hasSaved}
          >
            <PlusCircle size={20} />
            {hasSaved
              ? "Déjà enregistrée"
              : loading
                ? "…"
                : "Enregistrer la demande"}
          </button>
          <button
            onClick={downloadPdf}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-base bg-[#3daaa4] text-white shadow hover:bg-[#319b92] transition-all duration-150 disabled:opacity-60"
          >
            <Download size={20} />
            {loading ? "Génération…" : "Télécharger l'accréditation"}
          </button>
          {/* Nouveau bouton après enregistrement */}
          {hasSaved && (
            <button
              onClick={handleNewRequest}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-base bg-white text-gray-700 border border-gray-300 shadow hover:bg-gray-100 transition-all duration-150 mt-2 disabled:opacity-60"
            >
              <PlusCircle size={20} />
              Nouvelle demande
            </button>
          )}
        </div>
      </div>

      {/* Vérification des doublons */}
      {showDuplicateCheck && (
        <DuplicateAlert
          company={data.company}
          plate={data.vehicles[0]?.plate || ""}
          trailerPlate={data.vehicles[0]?.trailerPlate}
          onConfirm={handleDuplicateConfirm}
          onCancel={handleDuplicateCancel}
        />
      )}

      {/* Modal de confirmation */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 border border-gray-200">
            <h2 className="text-lg font-bold mb-4 text-gray-900 text-center">
              Confirmer l&apos;enregistrement
            </h2>
            <p className="mb-6 text-gray-700 leading-relaxed text-center">
              Cette accréditation sera créée avec le statut <b>NOUVEAU</b>.
              <br />
              Elle devra être validée manuellement par un logisticien avant
              d&apos;être utilisable.
              <br />
              <span className="font-semibold text-orange-600">
                Un e-mail/SMS vous sera envoyé après validation.
              </span>
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-6 mt-8">
              <button
                onClick={() => setShowModal(false)}
                className="w-full sm:w-auto px-6 py-3 rounded-xl border border-gray-400 bg-gray-200 text-gray-800 font-semibold hover:bg-gray-300 transition shadow"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-primary text-white font-semibold shadow hover:bg-primary-dark transition"
                disabled={loading || hasSaved || success}
              >
                {success
                  ? "Enregistré !"
                  : loading
                    ? "Enregistrement…"
                    : "Confirmer l'enregistrement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

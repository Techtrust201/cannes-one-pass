"use client";

import { useState } from "react";
import Image from "next/image";
import {
  CheckCircle,
  Download,
  PlusCircle,
  AlertTriangle,
  Send,
} from "lucide-react";
import type { Vehicle } from "@/types";
import { getAllZones, getZoneLabel, isFinalDestination } from "@/lib/zone-utils";
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

export default function StepFourLog({
  data,
  onReset,
  onClearForm,
  onHasSavedChange,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [selectedZone, setSelectedZone] = useState<string>("");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showDuplicateCheck, setShowDuplicateCheck] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [infoMsg, setInfoMsg] = useState("");
  const [success, setSuccess] = useState(false);

  async function saveAccreditation() {
    if (hasSaved) {
      setInfoMsg("Cette accréditation a déjà été enregistrée.");
      setShowSaveModal(false);
      return;
    }
    try {
      setLoading(true);
      const saveRes = await fetch("/api/accreditations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          status: "ATTENTE",
          currentZone: selectedZone || null,
        }),
      });
      if (!saveRes.ok) throw new Error("Erreur enregistrement");
      setHasSaved(true);
      onHasSavedChange(true);
      setSuccess(true);
      setInfoMsg(
        "Accréditation enregistrée et approuvée. Le PDF a été généré."
      );
      setTimeout(() => {
        setShowSaveModal(false);
        setSuccess(false);
        // Vider les champs mais rester sur step 4
        onClearForm();
      }, 1200);
    } catch (err) {
      console.error(err);
      setInfoMsg("Erreur lors de l'enregistrement.");
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
          status: "ATTENTE", // ou "NOUVEAU" selon le besoin métier
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

  async function sendAccreditation() {
    try {
      if (!email) {
        setInfoMsg("Veuillez saisir un e-mail");
        return;
      }
      setLoading(true);
      const saveRes = await fetch("/api/accreditations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          status: "NOUVEAU",
          currentZone: null, // Le chauffeur n'a pas de zone — l'agent la choisira
        }),
      });
      if (!saveRes.ok) throw new Error("Erreur enregistrement");
      const created = await saveRes.json();
      await fetch(`/api/accreditations/${created.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setInfoMsg("E-mail envoyé au destinataire. PDF généré.");
      setShowSendModal(false);
      // Vider les champs mais rester sur step 4
      setTimeout(() => {
        onClearForm();
      }, 500);
    } catch (err) {
      console.error(err);
      setInfoMsg("Erreur lors de l'envoi de l'e-mail.");
    } finally {
      setLoading(false);
    }
  }

  function handleSaveClick() {
    if (hasSaved) {
      setInfoMsg("Cette accréditation a déjà été enregistrée.");
      return;
    }
    setShowDuplicateCheck(true);
  }

  function handleDuplicateConfirm() {
    setShowDuplicateCheck(false);
    setShowSaveModal(true);
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
          body: JSON.stringify({
            ...data,
            status: "ATTENTE",
            currentZone: selectedZone || null,
          }),
        });
        if (!saveRes.ok) throw new Error("Erreur enregistrement");
        setHasSaved(true);
        onHasSavedChange(true);
      } catch (err) {
        console.error(err);
        setInfoMsg("Erreur lors de l'enregistrement.");
        return;
      } finally {
        setLoading(false);
      }
    }
    // Puis réinitialiser et revenir au step 1
    onReset();
  }

  return (
    <div className="flex flex-col items-center py-4 md:py-8">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-lg px-4 py-6 md:px-6 md:py-8 w-full max-w-xl text-left space-y-6">
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
            {hasSaved ? "Accréditation enregistrée" : "Accréditation créée"}
          </h2>
        </div>

        {/* Message principal */}
        <div
          className={`rounded-lg px-4 py-3 text-base font-medium ${hasSaved ? "bg-green-50 border border-green-200 text-green-800" : "bg-gray-50 border border-gray-200 text-gray-700"}`}
        >
          {hasSaved ? (
            <>
              L&apos;accréditation a bien été enregistrée et approuvée.
              <br />
              Le PDF a été généré automatiquement.
            </>
          ) : (
            <>Un SMS de validation a été envoyé.</>
          )}
        </div>

        {/* Message d'alerte/info */}
        {infoMsg && (
          <div className="flex items-center gap-2 bg-orange-50 border-l-4 border-orange-400 text-orange-700 px-4 py-2 rounded text-sm">
            <AlertTriangle size={18} className="shrink-0" />
            <span>{infoMsg}</span>
          </div>
        )}

        {/* Zone d'attente */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-gray-700" htmlFor="zoneSelect">
            Zone d&apos;attente du véhicule
          </label>
          <select
            id="zoneSelect"
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
            className="h-11 rounded-xl border border-gray-300 px-3 text-sm font-medium focus:ring-2 focus:ring-[#4F587E] focus:border-[#4F587E] transition bg-white"
            disabled={hasSaved}
          >
            <option value="">-- Choisir une zone --</option>
            {getAllZones().map((zone) => (
              <option key={zone} value={zone}>
                {getZoneLabel(zone)}
                {isFinalDestination(zone) ? " (destination finale)" : ""}
              </option>
            ))}
          </select>
          {!selectedZone && !hasSaved && (
            <p className="text-xs text-orange-600 mt-0.5">
              Obligatoire pour enregistrer l&apos;accréditation
            </p>
          )}
        </div>

        {/* Email */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="destEmail">
            E-mail du destinataire
          </label>
          <input
            id="destEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="conducteur@mail.com"
            className="border rounded px-3 py-2 text-sm"
            disabled={hasSaved}
          />
        </div>

        {/* Boutons */}
        <div className="flex flex-col gap-3 mt-4">
          <button
            onClick={() => setShowSendModal(true)}
            disabled={loading || !email || hasSaved}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-base bg-[#3daaa4] text-white shadow hover:bg-[#319b92] transition-all duration-150 disabled:opacity-60"
          >
            <Send size={20} />
            {loading ? "Traitement…" : "Envoyer l'accréditation"}
          </button>
          <button
            onClick={handleSaveClick}
            disabled={loading || hasSaved || !selectedZone}
            className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-base shadow transition-all duration-150
              ${hasSaved ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-primary text-white hover:bg-primary-dark"}
              disabled:opacity-60`}
            aria-disabled={hasSaved || !selectedZone}
          >
            <PlusCircle size={20} />
            {hasSaved
              ? "Déjà enregistrée"
              : loading
                ? "…"
                : "Enregistrer l'accréditation"}
          </button>
          {/* Nouveau bouton après enregistrement */}
          {hasSaved && (
            <button
              onClick={handleNewRequest}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-base bg-white text-gray-700 border border-gray-300 shadow hover:bg-gray-100 transition-all duration-150 mt-2 disabled:opacity-60"
            >
              <PlusCircle size={20} />
              Nouvelle accréditation
            </button>
          )}
          <button
            onClick={downloadPdf}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-base bg-[#3daaa4] text-white shadow hover:bg-[#319b92] transition-all duration-150 disabled:opacity-60"
          >
            <Download size={20} />
            {loading ? "Génération…" : "Télécharger l'accréditation"}
          </button>
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

      {/* Modal de confirmation pour Enregistrer */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-4 md:p-8 max-w-md w-full mx-4 border border-gray-200">
            <h2 className="text-lg font-bold mb-3 md:mb-4 text-gray-900 text-center">
              Confirmer l&apos;enregistrement
            </h2>
            <p className="mb-4 md:mb-6 text-gray-700 leading-relaxed text-center text-sm md:text-base">
              Cette accréditation sera automatiquement approuvée et mise en
              statut <b>Attente</b>.<br />
              <span className="font-semibold text-green-600">
                Aucune validation manuelle requise.
              </span>
              <br />
              Le PDF sera généré et téléchargé automatiquement.
              <br />
              Confirmez-vous l&apos;enregistrement ?
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-6 mt-4 md:mt-8">
              <button
                onClick={() => setShowSaveModal(false)}
                className="w-full sm:w-auto px-6 py-3 rounded-xl border border-gray-400 bg-gray-200 text-gray-800 font-semibold hover:bg-gray-300 transition shadow"
              >
                Annuler
              </button>
              <button
                onClick={saveAccreditation}
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

      {/* Modal de confirmation pour Envoyer */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-4 md:p-8 max-w-md w-full mx-4 border border-gray-200">
            <h2 className="text-lg font-bold mb-3 md:mb-4 text-gray-900 text-center">
              Confirmer l&apos;envoi
            </h2>
            <p className="mb-4 md:mb-6 text-gray-700 leading-relaxed text-center text-sm md:text-base">
              Cette accréditation sera créée avec le statut <b>Nouveau</b> et
              nécessitera une validation manuelle.
              <br />
              <span className="font-semibold text-orange-600">
                Validation manuelle requise par un logisticien.
              </span>
              <br />
              L&apos;e-mail sera envoyé au destinataire et le PDF sera
              téléchargé.
              <br />
              Confirmez-vous l&apos;envoi ?
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-6 mt-4 md:mt-8">
              <button
                onClick={() => setShowSendModal(false)}
                className="w-full sm:w-auto px-6 py-3 rounded-xl border border-gray-400 bg-gray-200 text-gray-800 font-semibold hover:bg-gray-300 transition shadow"
              >
                Annuler
              </button>
              <button
                onClick={sendAccreditation}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#3daaa4] text-white font-semibold shadow hover:bg-[#319b92] transition-all duration-150"
                disabled={loading}
              >
                Confirmer l&apos;envoi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

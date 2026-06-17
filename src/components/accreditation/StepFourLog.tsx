"use client";

import { useState } from "react";
import Image from "next/image";
import {
  CheckCircle,
  Download,
  PlusCircle,
  AlertTriangle,
  Send,
  Mail,
  RefreshCw,
} from "lucide-react";
import type { Vehicle } from "@/types";
import { getZoneLabel } from "@/lib/zone-utils";
import { useZones } from "@/hooks/useZones";
import DuplicateAlert from "@/components/accreditation/DuplicateAlert";
import { PortalOverlay } from "@/components/ui/PortalOverlay";

interface Props {
  data: {
    company: string;
    stand: string;
    unloading: string;
    event: string;
    vehicles: Vehicle[];
    message: string;
    consent: boolean;
    /**
     * E-mail du destinataire — source UNIQUE de vérité, saisi (obligatoire) à
     * l'étape 3. Plus aucun champ e-mail éditable ici (évite la divergence
     * entre deux saisies).
     */
    email: string;
  };
  onReset: () => void;
  onClearForm: () => void;
  onHasSavedChange: (hasSaved: boolean) => void;
}

type EmailOutcome =
  | "sent"
  | "skipped_no_recipient"
  | "skipped_disabled"
  | "failed";

export default function StepFourLog({
  data,
  onReset,
  onHasSavedChange,
}: Props) {
  const { allZoneKeys, isFinalDestination } = useZones();
  const [loading, setLoading] = useState(false);
  const [selectedZone, setSelectedZone] = useState<string>("");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showDuplicateCheck, setShowDuplicateCheck] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [infoMsg, setInfoMsg] = useState("");
  const [success, setSuccess] = useState(false);
  // Suivi de l'e-mail automatique (Lot 2) déclenché côté serveur à la création.
  const [lastAction, setLastAction] = useState<"send" | "save" | null>(null);
  const [emailOutcome, setEmailOutcome] = useState<EmailOutcome | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  // E-mail figé au moment de la création (le formulaire peut être vidé ensuite).
  const [recipientEmail, setRecipientEmail] = useState("");

  const email = (data.email ?? "").trim();
  const emailSent = emailOutcome === "sent";

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
      if (!saveRes.ok) throw new Error(await readError(saveRes));
      const created = await saveRes.json();
      setCreatedId(created?.id ?? null);
      setEmailOutcome((created?.emailOutcome as EmailOutcome) ?? null);
      setRecipientEmail(email);
      setLastAction("save");
      setHasSaved(true);
      onHasSavedChange(true);
      setSuccess(true);
      setInfoMsg("");
      setTimeout(() => {
        setShowSaveModal(false);
        setSuccess(false);
      }, 1200);
    } catch (err) {
      console.error(err);
      setInfoMsg(
        err instanceof Error ? err.message : "Erreur lors de l'enregistrement."
      );
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
      setLoading(true);
      // Création par un agent habilité (espace logisticien) => accréditation
      // déjà validée administrativement : statut ATTENTE (validée, en attente
      // d'arrivée), jamais NOUVEAU. Aucun mouvement d'entrée n'est créé : l'entrée
      // en zone reste déclenchée par un scan terrain. L'e-mail récap + QR part
      // automatiquement côté serveur (Lot 2) vers l'adresse de l'étape 3.
      const saveRes = await fetch("/api/accreditations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          status: "ATTENTE",
          currentZone: null, // Pas de zone à l'envoi — l'agent la choisira au scan
        }),
      });
      if (!saveRes.ok) throw new Error(await readError(saveRes));
      const created = await saveRes.json();
      setCreatedId(created?.id ?? null);
      setEmailOutcome((created?.emailOutcome as EmailOutcome) ?? null);
      setRecipientEmail(email);
      setLastAction("send");
      setHasSaved(true);
      onHasSavedChange(true);
      setShowSendModal(false);
      setInfoMsg("");
    } catch (err) {
      console.error(err);
      setShowSendModal(false);
      setInfoMsg(
        err instanceof Error
          ? err.message
          : "Erreur lors de la création de l'accréditation."
      );
    } finally {
      setLoading(false);
    }
  }

  async function resendEmail() {
    if (!createdId) return;
    try {
      setLoading(true);
      const res = await fetch(
        `/api/accreditations/${createdId}/resend-creation-email`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error(await readError(res));
      const json = await res.json();
      const outcome = (json?.outcome as EmailOutcome) ?? "failed";
      setEmailOutcome(outcome);
      setInfoMsg(
        outcome === "sent"
          ? `E-mail renvoyé à ${recipientEmail || email}.`
          : "L'e-mail n'a pas pu être renvoyé. Vérifiez l'historique."
      );
    } catch (err) {
      console.error(err);
      setInfoMsg("L'e-mail n'a pas pu être renvoyé.");
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
      // Si rien n'a encore été créé, on enregistre d'abord (statut ATTENTE).
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
        if (!saveRes.ok) throw new Error(await readError(saveRes));
        setHasSaved(true);
        onHasSavedChange(true);
      } catch (err) {
        console.error(err);
        setInfoMsg(
          err instanceof Error
            ? err.message
            : "Erreur lors de l'enregistrement."
        );
        return;
      } finally {
        setLoading(false);
      }
    }
    // Puis réinitialiser et revenir au step 1 (onReset vide aussi le formulaire).
    onReset();
  }

  // Résumé e-mail en lecture seule (jamais de champ éditable ici).
  const summaryEmail = hasSaved ? recipientEmail || email : email;

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
            {hasSaved ? "Accréditation créée" : "Récapitulatif"}
          </h2>
        </div>

        {/* Message principal — cohérent avec l'envoi e-mail (plus de SMS). */}
        <div
          className={`rounded-lg px-4 py-3 text-base font-medium ${
            hasSaved
              ? emailSent
                ? "bg-green-100 border border-green-400 text-green-900"
                : "bg-orange-50 border border-orange-300 text-orange-900"
              : "bg-gray-50 border border-gray-200 text-gray-700"
          }`}
        >
          {!hasSaved ? (
            <>
              Vérifiez les informations puis créez l&apos;accréditation.
              L&apos;accréditation sera envoyée par e-mail au destinataire
              indiqué.
            </>
          ) : lastAction === "save" ? (
            emailSent ? (
              <>
                L&apos;accréditation a été enregistrée et approuvée. L&apos;e-mail
                a été transmis au service d&apos;envoi.
              </>
            ) : (
              <>
                L&apos;accréditation a été enregistrée et approuvée, mais
                l&apos;e-mail n&apos;a pas pu être transmis au service
                d&apos;envoi. Vous pouvez réessayer ou vérifier
                l&apos;historique.
              </>
            )
          ) : emailSent ? (
            <>
              L&apos;accréditation a été créée. L&apos;e-mail a été transmis au
              service d&apos;envoi.
            </>
          ) : (
            <>
              L&apos;accréditation a été créée, mais l&apos;e-mail n&apos;a pas
              pu être transmis au service d&apos;envoi. Vous pouvez réessayer ou
              vérifier l&apos;historique.
            </>
          )}
        </div>

        {/* Destinataire en lecture seule (jamais de champ éditable ici). */}
        <div className="flex items-start gap-2 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
          <Mail size={18} className="shrink-0 mt-0.5 text-gray-500" />
          <div className="text-sm">
            <span className="text-gray-500">Destinataire de l&apos;e-mail : </span>
            <span className="font-semibold text-gray-900 break-all">
              {summaryEmail || "—"}
            </span>
          </div>
        </div>

        {/* Avertissement spam visible (après création/envoi). */}
        {hasSaved && (
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm font-medium">
            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-blue-500" />
            <span>
              Si le destinataire ne reçoit pas l&apos;e-mail dans les prochaines
              minutes, pensez à vérifier le dossier spam / courrier indésirable.
            </span>
          </div>
        )}

        {/* Message d'alerte/info */}
        {infoMsg && (
          <div className="flex items-center gap-2 bg-orange-50 border-l-4 border-orange-400 text-orange-700 px-4 py-2 rounded text-sm">
            <AlertTriangle size={18} className="shrink-0" />
            <span>{infoMsg}</span>
          </div>
        )}

        {/* Zone d'attente */}
        <div className="flex flex-col gap-1">
          <label
            className="text-sm font-semibold text-gray-700"
            htmlFor="zoneSelect"
          >
            Zone d&apos;attente du véhicule
          </label>
          <select
            id="zoneSelect"
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
            className="h-11 rounded-xl border border-gray-400 px-3 text-base font-medium focus:ring-2 focus:ring-[#4F587E] focus:border-[#4F587E] transition bg-white"
            disabled={hasSaved}
          >
            <option value="">-- Choisir une zone --</option>
            {allZoneKeys.map((zone) => (
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

        {/* Boutons */}
        <div className="flex flex-col gap-3 mt-4">
          {!hasSaved ? (
            <button
              onClick={() => setShowSendModal(true)}
              disabled={loading || !email}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-base bg-[#3daaa4] text-white shadow hover:bg-[#319b92] transition-all duration-150 disabled:opacity-60"
            >
              <Send size={20} />
              {loading ? "Traitement…" : "Envoyer l'accréditation"}
            </button>
          ) : (
            <button
              onClick={resendEmail}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-base bg-[#3daaa4] text-white shadow hover:bg-[#319b92] transition-all duration-150 disabled:opacity-60"
            >
              <RefreshCw size={20} />
              {loading ? "Envoi…" : "Renvoyer l'accréditation"}
            </button>
          )}
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
          event={data.event}
          trailerPlate={data.vehicles[0]?.trailerPlate}
          onConfirm={handleDuplicateConfirm}
          onCancel={handleDuplicateCancel}
        />
      )}

      {/* Modal de confirmation pour Enregistrer */}
      {showSaveModal && (
        <PortalOverlay>
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70]">
            <div className="bg-white rounded-2xl shadow-2xl p-4 md:p-8 max-w-md w-full mx-4 border border-gray-200">
              <h2 className="text-lg font-bold mb-3 md:mb-4 text-gray-900 text-center">
                Confirmer l&apos;enregistrement
              </h2>
              <p className="mb-4 md:mb-6 text-gray-700 leading-relaxed text-center text-sm md:text-base">
                Cette accréditation sera automatiquement approuvée et créée au
                statut <b>Validée</b> (attendue sur site).<br />
                <span className="font-semibold text-green-600">
                  Aucune validation manuelle requise.
                </span>
                <br />
                L&apos;accréditation sera envoyée par e-mail au destinataire
                indiqué.
                <br />
                <span className="font-semibold text-gray-900">
                  Confirmer l&apos;envoi de l&apos;accréditation à :{" "}
                  <span className="break-all">{email}</span>
                </span>
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
        </PortalOverlay>
      )}

      {/* Modal de confirmation pour Envoyer */}
      {showSendModal && (
        <PortalOverlay>
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70]">
            <div className="bg-white rounded-2xl shadow-2xl p-4 md:p-8 max-w-md w-full mx-4 border border-gray-200">
              <h2 className="text-lg font-bold mb-3 md:mb-4 text-gray-900 text-center">
                Confirmer l&apos;envoi
              </h2>
              <p className="mb-4 md:mb-6 text-gray-700 leading-relaxed text-center text-sm md:text-base">
                Cette accréditation sera créée et <b>validée</b> (créée par un
                agent habilité).
                <br />
                <span className="font-semibold text-green-600">
                  Aucune validation manuelle requise.
                </span>
                <br />
                L&apos;accréditation sera envoyée par e-mail au destinataire
                indiqué.
                <br />
                <span className="font-semibold text-gray-900">
                  Confirmer l&apos;envoi de l&apos;accréditation à :{" "}
                  <span className="break-all">{email}</span>
                </span>
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
        </PortalOverlay>
      )}
    </div>
  );
}

/** Extrait un message d'erreur lisible d'une réponse API (JSON `error` ou texte). */
async function readError(res: Response): Promise<string> {
  try {
    const clone = res.clone();
    const json = await clone.json();
    if (json?.error && typeof json.error === "string") return json.error;
  } catch {
    // pas de JSON exploitable
  }
  try {
    const txt = await res.text();
    if (txt) return txt;
  } catch {
    // ignore
  }
  return "Une erreur est survenue.";
}

"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense, useRef } from "react";
import Image from "next/image";
import StepOne from "@/components/accreditation/StepOne";
import StepTwo from "@/components/accreditation/StepTwo";
import StepThree from "@/components/accreditation/StepThree";
import StepFourLog from "@/components/accreditation/StepFourLog";
import type { Vehicle } from "@/types";
import { useEspaceSlug } from "@/hooks/useEspaceSlug";
import RxNouveauWizard from "./RxNouveauWizard";

type FormData = {
  stepOne: {
    company: string;
    stand: string;
    unloading: string;
    event: string;
  };
  vehicle: Vehicle;
  stepThree: { message: string; consent: boolean; email: string };
};

const STORAGE_KEY = "log_formData";

function getDefaultFormData(): FormData {
  return {
    stepOne: { company: "", stand: "", unloading: "", event: "" },
    vehicle: {
      id: 1,
      plate: "",
      size: "",
      phoneCode: "+33",
      phoneNumber: "",
      date: "",
      time: "",
      city: "",
      unloading: ["rear"],
    },
    stepThree: { message: "", consent: false, email: "" },
  };
}

/**
 * Champs JAMAIS persistés ni restaurés depuis le brouillon localStorage :
 * - l'e-mail destinataire (priorité absolue : éviter qu'un ancien brouillon
 *   réinjecte silencieusement une mauvaise adresse d'envoi) ;
 * - le téléphone du chauffeur (donnée personnelle sensible).
 * On force ces champs à leur valeur par défaut (vide) à l'écriture ET à la
 * restauration, ce qui neutralise aussi les anciens brouillons existants.
 */
function sanitizeFormData(fd: FormData): FormData {
  return {
    stepOne: { ...fd.stepOne },
    vehicle: { ...fd.vehicle, phoneNumber: "" },
    stepThree: { ...fd.stepThree, email: "" },
  };
}

/**
 * Un brouillon ne vaut la peine d'être proposé que s'il contient des données
 * réellement saisies par l'utilisateur. On ignore volontairement `event` :
 * `StepOne` sélectionne un événement par défaut au montage, ce qui ne doit pas,
 * à lui seul, faire considérer un formulaire vierge comme un brouillon (sinon
 * la modale réapparaîtrait après « Ignorer et recommencer »).
 */
function isDraftMeaningful(fd: FormData): boolean {
  const { company, stand, unloading } = fd.stepOne;
  const { plate, size, city, date } = fd.vehicle;
  return Boolean(
    company ||
      stand ||
      unloading ||
      plate ||
      size ||
      city ||
      date ||
      fd.stepThree.message
  );
}

function LogisticienNewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const espace = useEspaceSlug();
  const step = Number(searchParams.get("step") ?? "1");

  const [stepValid, setStepValid] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);

  const [formData, setFormData] = useState<FormData>(getDefaultFormData());
  // Brouillon détecté au montage, en attente de décision utilisateur
  // (Restaurer / Ignorer). Tant qu'il est non null, on ne persiste pas pour
  // ne pas écraser le brouillon, et on affiche le choix explicite.
  const [pendingDraft, setPendingDraft] = useState<FormData | null>(null);
  // Devient true une fois la décision de brouillon prise (ou aucun brouillon /
  // préremplissage par URL). Conditionne la reprise de la persistance.
  const [draftHandled, setDraftHandled] = useState(false);
  // Garantit que l'initialisation (URL vs brouillon) ne s'exécute qu'une fois,
  // jamais à chaque changement de step (`?step=`).
  const initRef = useRef(false);

  const updateForm = (
    section: keyof FormData,
    data: Partial<FormData[keyof FormData]>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...data },
    }));
  };

  // Initialisation unique : préremplissage par URL OU détection d'un brouillon
  // (jamais de restauration automatique silencieuse).
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const company = searchParams.get("company") || "";
    const stand = searchParams.get("stand") || "";
    const unloading = searchParams.get("unloading") || "";
    const event = searchParams.get("event") || "";
    const message = searchParams.get("message") || "";
    const email = searchParams.get("email") || "";
    const city = searchParams.get("city") || "";
    const hasQuery =
      company || stand || unloading || event || message || email || city;

    if (hasQuery) {
      setFormData({
        stepOne: { company, stand, unloading, event },
        vehicle: { ...getDefaultFormData().vehicle, city },
        stepThree: { message, consent: false, email },
      });
      setDraftHandled(true);
      return;
    }

    let saved: FormData | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw) as FormData;
    } catch {
      saved = null;
    }

    if (saved && isDraftMeaningful(saved)) {
      // On NE restaure PAS : on propose un choix explicite à l'utilisateur.
      setPendingDraft(saved);
    } else {
      // Brouillon vide/invalide : on nettoie et on démarre directement.
      if (saved) localStorage.removeItem(STORAGE_KEY);
      setDraftHandled(true);
    }
  }, [searchParams]);

  // Persistance : seulement après décision de brouillon et tant que rien n'a
  // été créé. On retire systématiquement l'e-mail et le téléphone, et on ne
  // stocke que les brouillons non vides.
  useEffect(() => {
    if (!draftHandled || hasSaved) return;
    const safe = sanitizeFormData(formData);
    if (isDraftMeaningful(safe)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [formData, draftHandled, hasSaved]);

  // Après création réussie : purge immédiate du brouillon (un refresh ne doit
  // jamais réafficher l'ancien destinataire ou les anciennes données).
  useEffect(() => {
    if (hasSaved) localStorage.removeItem(STORAGE_KEY);
  }, [hasSaved]);

  function restoreDraft() {
    if (pendingDraft) {
      const base = getDefaultFormData();
      // Restauration des champs non sensibles ; e-mail et téléphone toujours
      // remis à vide, même si le brouillon en contenait (anciens brouillons).
      setFormData({
        stepOne: { ...base.stepOne, ...pendingDraft.stepOne },
        vehicle: { ...base.vehicle, ...pendingDraft.vehicle, phoneNumber: "" },
        stepThree: { ...base.stepThree, ...pendingDraft.stepThree, email: "" },
      });
    }
    setPendingDraft(null);
    setDraftHandled(true);
  }

  function discardDraft() {
    localStorage.removeItem(STORAGE_KEY);
    setFormData(getDefaultFormData());
    setPendingDraft(null);
    setDraftHandled(true);
  }

  useEffect(() => {
    setStepValid(false);
  }, [step]);

  const prevEspace = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevEspace.current === undefined) {
      prevEspace.current = espace;
      return;
    }
    if (prevEspace.current !== espace) {
      prevEspace.current = espace;
      // Au changement d'organisation, on repart d'un état totalement
      // propre : formulaire vide + retour au step 1. Évite de garder
      // des données saisies pour l'org précédente (event, exposant,
      // catégorie…) qui n'auraient plus de sens pour la nouvelle org.
      setFormData(getDefaultFormData());
      setHasSaved(false);
      localStorage.removeItem(STORAGE_KEY);
      const qs = new URLSearchParams({ step: "1" });
      if (espace) qs.set("espace", espace);
      router.replace(`/logisticien/nouveau?${qs.toString()}`);
    }
  }, [espace, router]);

  function gotoStep(n: number) {
    const qs = new URLSearchParams({ step: String(n) });
    if (espace) qs.set("espace", espace);
    router.push(`/logisticien/nouveau?${qs.toString()}`);
  }

  function clearForm() {
    setFormData(getDefaultFormData());
    localStorage.removeItem(STORAGE_KEY);
    setHasSaved(false);
  }

  function resetAll() {
    clearForm();
    gotoStep(1);
  }

  return (
    <div
      className="min-h-screen flex flex-col text-gray-900"
      style={{ background: "linear-gradient(#353c52 0 50%, #ffffff 0 100%)" }}
    >
      {/* Choix explicite face à un brouillon non terminé (pas de restauration
          automatique). L'e-mail destinataire et le téléphone ne sont jamais
          restaurés. */}
      {pendingDraft && !draftHandled && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center border border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-2">
              Brouillon non terminé
            </h2>
            <p className="text-sm text-gray-600 mb-5">
              Un brouillon non terminé existe. Vous pouvez le restaurer ou
              recommencer avec un formulaire vide.
              <br />
              <span className="text-gray-500">
                Pour des raisons de sécurité, l&apos;e-mail du destinataire et le
                téléphone du chauffeur ne sont jamais restaurés et devront être
                ressaisis.
              </span>
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={discardDraft}
                className="w-full sm:w-auto px-5 py-3 rounded-xl border border-gray-300 bg-gray-100 text-gray-800 font-semibold hover:bg-gray-200 transition"
              >
                Ignorer et recommencer
              </button>
              <button
                onClick={restoreDraft}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#353c52] text-white font-semibold shadow hover:bg-[#2a3045] transition"
              >
                Restaurer le brouillon
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="py-4 sm:py-6 px-4 flex flex-col items-center text-white gap-1">
        <h1 className="text-xl sm:text-2xl font-bold">Nouvelle accréditation</h1>
        <p className="text-xs sm:text-sm opacity-80">Espace logisticien</p>
      </header>

      <main className="flex-1 flex flex-col items-center px-3 sm:px-6 lg:px-8 mt-2 sm:mt-4 pb-6">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col lg:flex-row w-full sm:w-11/12 lg:w-3/4 lg:max-h-[65vh]">
          {/* Image */}
          <div
            className={`relative lg:w-[35%] h-80 ${
              step === 2 ? "lg:h-full" : "lg:h-auto"
            } p-6 hidden lg:block`}
          >
            <Image
              src="/accreditation/pict_page1/palais.jpg"
              alt="Palais des Festivals"
              width={400}
              height={300}
              className="object-cover grayscale contrast-125 rounded-lg w-full h-full"
            />
          </div>

          {/* Form side */}
          <div className="flex-1 p-4 sm:p-7 flex flex-col">
            {/* Progress */}
            <div className="flex items-center mb-4 sm:mb-6 w-full max-w-md mx-auto">
              {Array.from({ length: 4 }).map((_, idx) => {
                const active = step === idx + 1;
                const done = step > idx + 1;
                const svgPath = `/accreditation/progressbar/Vector${
                  idx === 0 ? "" : ` (${idx})`
                }.svg`;
                return (
                  <div key={idx} className="flex items-center gap-0.5 flex-1">
                    <div
                      className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg border-2 shrink-0 ${
                        done
                          ? "bg-[#3DAAA4] border-[#3DAAA4]"
                          : active
                            ? "border-primary"
                            : "bg-white border-gray-300"
                      }`}
                    >
                      <Image
                        src={svgPath}
                        alt={`step ${idx + 1}`}
                        width={24}
                        height={24}
                        className="w-4 h-4 sm:w-6 sm:h-6"
                      />
                    </div>
                    {idx < 3 && (
                      <div
                        className={`flex-1 h-1 ${
                          step > idx + 1 ? "bg-[#3DAAA4]" : "bg-gray-300"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {step === 1 && (
                <StepOne
                  data={formData.stepOne}
                  update={(patch) => updateForm("stepOne", patch)}
                  onValidityChange={setStepValid}
                  orgSlug={espace ?? "palais-des-festivals"}
                />
              )}
              {step === 2 && (
                <StepTwo
                  data={formData.vehicle}
                  update={(patch) => updateForm("vehicle", patch)}
                  onValidityChange={setStepValid}
                  orgSlug={espace ?? "palais-des-festivals"}
                />
              )}
              {step === 3 && (
                <StepThree
                  data={formData.stepThree}
                  update={(patch) => updateForm("stepThree", patch)}
                  onValidityChange={setStepValid}
                  mode="logisticien"
                />
              )}
              {step === 4 && (
                <StepFourLog
                  data={{
                    ...formData.stepOne,
                    ...formData.stepThree,
                    vehicles: [formData.vehicle],
                  }}
                  onReset={resetAll}
                  onClearForm={clearForm}
                  onHasSavedChange={setHasSaved}
                />
              )}
            </div>

            {/* Navigation buttons */}
            <div className="flex justify-between mt-4 sm:mt-6 pt-4 border-t border-gray-200 shrink-0 gap-3">
              {step > 1 && !(step === 4 && hasSaved) ? (
                <button
                  onClick={() => gotoStep(step - 1)}
                  className="px-5 py-3 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 active:bg-gray-100 transition min-h-[48px]"
                >
                  Retour
                </button>
              ) : (
                <span />
              )}
              {step < 4 && (
                <button
                  onClick={() => gotoStep(step + 1)}
                  disabled={!stepValid}
                  className="px-6 py-3 rounded-xl bg-[#353c52] text-white text-sm font-medium disabled:opacity-50 hover:bg-[#2a3045] active:bg-[#1f2538] transition min-h-[48px]"
                >
                  Suivant
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Retour dashboard link - inline instead of fixed footer */}
        <div className="mt-4 w-full sm:w-11/12 lg:w-3/4">
          <Link
            href="/logisticien"
            className="inline-flex items-center text-gray-600 hover:text-gray-900 text-sm transition-colors py-2"
          >
            &lt; Retour dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}

/**
 * Aiguillage par espace : RX utilise le wizard multi-tenant partagé avec le
 * formulaire public (5 étapes maquette), les autres organisations conservent
 * le wizard logisticien historique (Palais, inchangé).
 */
function NouveauDispatcher() {
  const espace = useEspaceSlug();
  if (espace === "rx") {
    return <RxNouveauWizard />;
  }
  return <LogisticienNewContent />;
}

export default function LogisticienNew() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-[#353c52] mx-auto"></div>
            <p className="mt-4 text-gray-600">Chargement...</p>
          </div>
        </div>
      }
    >
      <NouveauDispatcher />
    </Suspense>
  );
}

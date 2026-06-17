"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import LangSelector from "@/components/accreditation/LangSelector";
import {
  TranslationProvider,
  useTranslation,
} from "@/components/accreditation/TranslationProvider";
import { LANGUAGES, isValidLang, type LangCode, type T } from "@/lib/translations";
import { safeGetItem, safeSetItem, safeRemoveItem } from "@/lib/safe-storage";
import { PalaisStepFourProvider } from "@/templates/accreditation/palais/stepFourContext";
import { getTemplate } from "@/templates/accreditation/registry";
import { getRxFlowT } from "@/templates/accreditation/rx/i18n";
import { cn } from "@/lib/utils";
import type { Vehicle } from "@/types";
import type {
  AccreditationTemplate,
  StepDef,
  StepProps,
} from "@/templates/accreditation/types";

/**
 * Composant générique : rend la "tram" UI commune (header, image latérale,
 * progress bar, navigation, sélecteur de langue, footer) et injecte les
 * steps du template fourni. Conserve strictement l'apparence de l'ancien
 * `src/app/accreditation/page.tsx` côté Palais — l'UX RX reprend la même
 * tram avec les steps RX-spécifiques.
 *
 * IMPORTANT — sérialisation Server/Client :
 *   Ce composant est marqué `"use client"`. Toutes ses props doivent donc
 *   être sérialisables dans le RSC payload (strings, nombres, objets JSON
 *   simples). Le template lui-même contient des fonctions (`initialData`,
 *   `mapPayload`), un schéma Zod (`schema`) et des `React.ComponentType`
 *   dans `steps[].component` — il N'EST PAS sérialisable. On reçoit donc
 *   uniquement le `formTemplate` (slug string) et on résout le template
 *   complet **côté client** via `getTemplate(formTemplate)`.
 */
interface AccreditationWizardProps {
  /** Slug réel de l'organisation (matche `Organization.slug` en base). */
  orgSlug: string;
  /** Clé du template à utiliser (matche `Organization.formTemplate`). */
  formTemplate: string;
  /** ID interne de l'organisation. */
  organizationId: string;
  /**
   * Préfixe utilisé pour la clé localStorage. Permet de séparer les
   * brouillons Palais et RX (sinon un visiteur multi-org écraserait son
   * autre brouillon).
   */
  storageKey: string;
  /** Contexte d'usage : formulaire public (défaut) ou back-office logisticien. */
  mode?: "public" | "logisticien";
}

function LanguageSelectionStep({ orgSlug }: { orgSlug: string }) {
  const { t, setLang } = useTranslation();
  const router = useRouter();
  function pick(code: LangCode) {
    setLang(code);
    router.push(`/accreditation/${orgSlug}?step=1&lang=${code}`);
  }
  return (
    <div className="flex flex-col items-center py-8 px-4 w-full">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2 text-center">
        {t.chooseLang}
      </h2>
      <p className="text-gray-500 text-sm mb-8 text-center">
        {t.chooseLangSub}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-md">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => pick(l.code)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 hover:border-[#3DAAA4] hover:shadow-md transition-all duration-150 text-left group"
          >
            <span className="text-2xl leading-none">{l.flag}</span>
            <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
              {l.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface WizardContentProps {
  template: AccreditationTemplate<unknown>;
  orgSlug: string;
  organizationId: string;
  storageKey: string;
  mode: "public" | "logisticien";
}

function WizardContent({
  template,
  orgSlug,
  organizationId,
  storageKey,
  mode,
}: WizardContentProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t, lang } = useTranslation();

  const isLogisticien = mode === "logisticien";
  const rxFlowT =
    isLogisticien && orgSlug === "rx" ? getRxFlowT(t, "logisticien") : null;
  const pageTitle = rxFlowT?.pageTitle ?? t.pageTitle;
  const pageSubtitle = rxFlowT?.pageSubtitle ?? t.pageSubtitle;
  const urlLang = searchParams.get("lang");
  const rawStep = searchParams.get("step");

  const hasLang = urlLang && isValidLang(urlLang);
  // En logisticien : pas d'étape de langue (UI back-office en français),
  // on démarre directement à l'étape 1. En public : étape 0 = choix de langue.
  const step = isLogisticien
    ? Number(rawStep ?? "1") || 1
    : hasLang
      ? Number(rawStep ?? "1")
      : 0;

  // Construit l'URL d'une étape selon le contexte (public vs logisticien) :
  // - public      → /accreditation/<orgSlug>?step=n&lang=...
  // - logisticien → /logisticien/nouveau?step=n&espace=<orgSlug>
  const buildStepUrl = useCallback(
    (n: number) =>
      isLogisticien
        ? `/logisticien/nouveau?step=${n}&espace=${encodeURIComponent(orgSlug)}`
        : `/accreditation/${orgSlug}?step=${n}&lang=${lang}`,
    [isLogisticien, orgSlug, lang]
  );

  const [stepValid, setStepValid] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [formData, setFormData] = useState<unknown>(() => template.initialData());

  const updateForm = useCallback((patch: Partial<unknown>) => {
    setFormData((prev: unknown) => ({
      ...(prev as object),
      ...(patch as object),
    }));
  }, []);

  useEffect(() => {
    const saved = safeGetItem(storageKey);
    if (saved) {
      try {
        setFormData(JSON.parse(saved));
      } catch {
        // Brouillon corrompu — on l'ignore et on garde l'initial.
      }
    }
  }, [storageKey]);

  useEffect(() => {
    safeSetItem(storageKey, JSON.stringify(formData));
  }, [formData, storageKey]);

  // NB : on ne réinitialise PLUS `stepValid` au changement d'étape. Chaque
  // step est la source de vérité de sa validité (via son propre
  // `onValidityChange(isValid)` au montage). Le reset provoquait une course
  // (l'effet parent écrasait à `false` la validité signalée par l'enfant) →
  // bouton « Suivant » bloqué tant qu'on ne modifiait pas un champ.

  useEffect(() => {
    // Auto-langue uniquement en public (le logisticien n'a pas d'étape langue).
    if (isLogisticien || hasLang) return;
    const stored = safeGetItem("acc_lang");
    if (stored && isValidLang(stored)) {
      router.replace(`/accreditation/${orgSlug}?step=1&lang=${stored}`);
    }
  }, [isLogisticien, hasLang, router, orgSlug]);

  const gotoStep = useCallback(
    (n: number) => {
      router.push(buildStepUrl(n));
    },
    [router, buildStepUrl]
  );

  // Réinitialise l'affichage des erreurs à chaque changement d'étape : on ne
  // veut pas qu'une étape s'affiche d'emblée « en erreur » avant toute tentative
  // de validation.
  useEffect(() => {
    setShowErrors(false);
  }, [step]);

  // Action du bouton « Suivant » : si l'étape est valide on avance, sinon on
  // révèle les erreurs (le bouton n'est jamais bloqué sans explication).
  const handleNext = useCallback(() => {
    if (stepValid) {
      setShowErrors(false);
      gotoStep(step + 1);
    } else {
      setShowErrors(true);
    }
  }, [stepValid, gotoStep, step]);

  const clearForm = useCallback(() => {
    setFormData(template.initialData());
    safeRemoveItem(storageKey);
    setHasSaved(false);
  }, [storageKey, template]);

  const resetAll = useCallback(() => {
    clearForm();
    gotoStep(1);
  }, [clearForm, gotoStep]);

  // Étapes visibles : pour les templates qui définissent `getVisibleSteps`
  // (ex. RX skip montage/démontage), on filtre dynamiquement. Sinon (Palais),
  // on utilise `steps` tel quel → comportement statique inchangé.
  // L'indexation de la navigation (URL `?step=n`) se fait sur CETTE liste :
  // masquer une étape décale donc naturellement les suivantes.
  const visibleSteps = useMemo<StepDef<unknown>[]>(
    () =>
      template.getVisibleSteps
        ? template.getVisibleSteps(formData)
        : template.steps,
    [template, formData]
  );

  const stepCount = visibleSteps.length;
  const activeStepIdx = step - 1;
  const ActiveStep: StepDef<unknown> | undefined = visibleSteps[activeStepIdx];

  // Garde-fou : si l'étape courante sort de la plage visible (deep-link,
  // brouillon restauré, ou une étape vient de disparaître), on recale sur la
  // dernière étape visible valide. Ne s'applique pas à l'étape 0 (langue).
  useEffect(() => {
    if (step <= 0) return;
    if (step > stepCount) {
      gotoStep(stepCount);
    }
  }, [step, stepCount, gotoStep]);

  const clearDraft = useCallback(() => {
    safeRemoveItem(storageKey);
  }, [storageKey]);

  const stepProps: StepProps<unknown> = {
    data: formData,
    update: (patch) => updateForm(patch),
    onValidityChange: setStepValid,
    showErrors,
    orgSlug,
    organizationId,
    mode,
    onClearDraft: clearDraft,
    onResetForm: resetAll,
  };

  // Préparation du contexte StepFour pour le template Palais (équivalent
  // historique du StepFour aplati de `src/app/accreditation/page.tsx`).
  const palaisStepFourValue =
    template.slug === "palais"
      ? buildPalaisStepFourCtx(formData, resetAll, clearForm, setHasSaved, gotoStep)
      : null;

  // Libellés de la progress bar (aria-label). RX : namespace `t.rx.steps`.
  // Palais : clés i18n partagées (plus de labels FR en dur dans steps.tsx).
  const PALAIS_STEP_KEYS: Record<string, keyof T> = {
    identification: "identification",
    vehicle: "recapVehicle",
    message: "message",
    recap: "stepRecap",
  };

  const stepLabel = (idx: number) => {
    const def = visibleSteps[idx];
    if (!def) return `Step ${idx + 1}`;
    if (template.slug === "rx") {
      const rxLabel = t.rx.steps[def.id as keyof typeof t.rx.steps];
      if (rxLabel) return rxLabel;
    }
    if (template.slug === "palais") {
      const key = PALAIS_STEP_KEYS[def.id];
      if (key && t[key]) return String(t[key]);
    }
    return def.label;
  };

  return (
    <div
      className="min-h-screen flex flex-col text-gray-900"
      style={{ background: "linear-gradient(#353c52 0 50%, #ffffff 0 100%)" }}
    >
      <main
        className={cn(
          "flex-1 flex flex-col justify-evenly items-center px-4 sm:px-6 lg:px-8",
          isLogisticien ? "mb-6 sm:mb-12" : "mb-48"
        )}
      >
        <div className="px-4 flex flex-col items-center text-white gap-1 relative w-full max-w-4xl">
          {!isLogisticien && (
            <div className="absolute right-0 top-0">
              <LangSelector />
            </div>
          )}
          <h1 className="text-4xl font-bold">{pageTitle}</h1>
          <p className="text-lg opacity-80">{pageSubtitle}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg overflow-visible flex flex-col lg:flex-row w-11/12 lg:w-3/4">
          {step > 0 && template.meta.sideImage && (
            <div
              className={`relative lg:w-[35%] h-80 ${
                step === 2 ? "lg:h-full" : "lg:h-auto"
              } p-6 hidden lg:block`}
            >
              <Image
                src={template.meta.sideImage}
                alt={t.sideImageAlt ?? "Illustration"}
                width={1000}
                height={100}
                className="object-cover grayscale contrast-125 rounded-lg w-full h-full"
              />
            </div>
          )}

          <div className="flex-1 p-8 sm:p-7 flex flex-col">
            {step === 0 ? (
              <LanguageSelectionStep orgSlug={orgSlug} />
            ) : (
              <>
                <div
                  className="flex items-center mb-6 w-full max-w-md mx-auto"
                  role="navigation"
                  aria-label="Progression"
                >
                  {Array.from({ length: stepCount }).map((_, idx) => {
                    const active = step === idx + 1;
                    const done = step > idx + 1;
                    const svgPath = `/accreditation/progressbar/Vector${
                      idx === 0 ? "" : ` (${idx})`
                    }.svg`;
                    return (
                      <div key={idx} className="flex items-center gap-0.5 flex-1">
                        <div
                          className={`w-10 h-10 flex items-center justify-center rounded-lg border-2 ${
                            done
                              ? "bg-[#3DAAA4] border-[#3DAAA4]"
                              : active
                                ? "border-primary"
                                : "bg-white border-gray-300"
                          }`}
                          aria-label={stepLabel(idx)}
                        >
                          <Image src={svgPath} alt={`step ${idx + 1}`} width={20} height={20} />
                        </div>
                        {idx < stepCount - 1 && (
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

                <div className="flex-1">
                  {ActiveStep ? (
                    palaisStepFourValue && ActiveStep.id === "recap" ? (
                      <PalaisStepFourProvider value={palaisStepFourValue}>
                        <ActiveStep.component {...stepProps} />
                      </PalaisStepFourProvider>
                    ) : (
                      <ActiveStep.component {...stepProps} />
                    )
                  ) : (
                    <p className="text-center text-gray-500">
                      {t.unknownStep}
                    </p>
                  )}
                </div>

                <div className="flex justify-between mt-6 pt-4 border-t border-gray-200 shrink-0">
                  {step > 1 && !(step === stepCount && hasSaved) ? (
                    <button
                      onClick={() => gotoStep(step - 1)}
                      className="px-4 py-2 border rounded"
                    >
                      {t.back}
                    </button>
                  ) : (
                    <span />
                  )}

                  {step < stepCount && (
                    <button
                      onClick={handleNext}
                      aria-disabled={!stepValid}
                      className={cn(
                        "px-6 py-2 rounded bg-[#353c52] text-white hover:bg-primary-dark transition",
                        !stepValid && "opacity-60"
                      )}
                    >
                      {t.next}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {!isLogisticien && (
        <footer className="fixed bottom-0 left-0 w-full py-3 px-6 bg-[#353c52] flex items-center justify-end shadow-md z-40">
          <Link
            href={`/accreditation/${orgSlug}/contact?lang=${lang}`}
            className="text-white text-sm hover:underline"
          >
            {t.needHelp}
          </Link>
        </footer>
      )}
    </div>
  );
}

/**
 * Adapte le form data Palais en `PalaisStepFourCtx` attendu par le
 * composant `StepFour` historique. Aucun changement de signature côté
 * `StepFour` — toute la translation se fait ici.
 */
function buildPalaisStepFourCtx(
  formData: unknown,
  onReset: () => void,
  onClearForm: () => void,
  onHasSavedChange: (b: boolean) => void,
  onEditStep: (step: number) => void
) {
  // On accepte un cast contrôlé : ce helper n'est appelé que lorsque le
  // template Palais est actif (voir condition ci-dessus).
  const f = formData as {
    stepOne: { company: string; stand: string; unloading: string; event: string };
    vehicle: Vehicle;
    stepThree: { message: string; consent: boolean; email?: string };
  };
  return {
    data: {
      company: f.stepOne.company,
      stand: f.stepOne.stand,
      unloading: f.stepOne.unloading,
      event: f.stepOne.event,
      vehicles: [f.vehicle],
      message: f.stepThree.message,
      consent: f.stepThree.consent,
      email: f.stepThree.email ?? "",
    },
    onReset,
    onClearForm,
    onHasSavedChange,
    onEditStep,
  };
}

export function AccreditationWizard(props: AccreditationWizardProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-[#353c52] mx-auto" />
        </div>
      }
    >
      <WizardInner {...props} />
    </Suspense>
  );
}

function WizardInner({
  orgSlug,
  formTemplate,
  organizationId,
  storageKey,
  mode = "public",
}: AccreditationWizardProps) {
  const searchParams = useSearchParams();
  const urlLang = searchParams.get("lang");

  // Résolution du template côté client : il contient des fonctions et un
  // schéma Zod, donc non-sérialisables via la frontière Server → Client.
  const template = useMemo(
    () => getTemplate(formTemplate) as AccreditationTemplate<unknown>,
    [formTemplate]
  );

  return (
    <TranslationProvider urlLang={urlLang} forcedLang={mode === "logisticien" ? "fr" : undefined}>
      <WizardContent
        template={template}
        orgSlug={orgSlug}
        organizationId={organizationId}
        storageKey={storageKey}
        mode={mode}
      />
    </TranslationProvider>
  );
}

"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense, useRef } from "react";
import Image from "next/image";
import StepOne from "@/components/accreditation/StepOne";
import StepTwo from "@/components/accreditation/StepTwo";
import StepThree from "@/components/accreditation/StepThree";
import StepFourLog from "@/components/accreditation/StepFourLog";
import { AccreditationWizard } from "@/components/accreditation/AccreditationWizard";
import type { Vehicle } from "@/types";
import { useEspaceSlug } from "@/hooks/useEspaceSlug";

interface EspaceOption {
  id: string;
  slug: string;
  name: string;
  color: string;
  logo: string | null;
}

/**
 * `/logisticien/nouveau?espace=<slug>` — Création d'accréditation côté
 * back-office.
 *
 * Dispatch par espace pour utiliser le bon wizard, **sans aucun impact
 * sur le flux Palais existant** :
 *
 * - `espace === "palais-des-festivals"` → wizard Palais legacy (4 steps
 *   personnalisés StepOne/Two/Three/StepFourLog). Code original conservé.
 * - `espace === "rx"`                   → wizard RX partagé avec le public
 *   (5 steps Exposant/Contact/Livraison/Reprise/Manutention).
 */
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
      <LogisticienNewDispatcher />
    </Suspense>
  );
}

function LogisticienNewDispatcher() {
  const espace = useEspaceSlug();

  if (espace === "rx") {
    return <LogisticienNewRx />;
  }

  // Palais (et fallback par défaut) : wizard legacy inchangé.
  return <LogisticienNewPalais />;
}

/* ──────────────────────────────────────────────────────────────────────
 * RX — réutilise le wizard public avec le template RX (5 cards maquette).
 * ────────────────────────────────────────────────────────────────────── */

function LogisticienNewRx() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me/espaces")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: EspaceOption[]) => {
        if (cancelled) return;
        const rx = list.find((o) => o.slug === "rx");
        if (!rx) {
          setError(
            "Vous n'avez pas accès à l'organisation RX. Demandez à un administrateur de vous y rattacher."
          );
          return;
        }
        setOrgId(rx.id);
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de charger les Espaces accessibles.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white border border-red-200 rounded-xl p-6 max-w-md text-center">
          <p className="text-sm text-red-700">{error}</p>
          <Link
            href="/logisticien"
            className="mt-4 inline-block text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Retour au dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#3F4660] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <AccreditationWizard
      orgSlug="rx"
      formTemplate="rx"
      organizationId={orgId}
      storageKey="log_formData:rx"
    />
  );
}

/* ──────────────────────────────────────────────────────────────────────
 * Palais — wizard legacy 4 steps. Aucun changement par rapport à l'existant.
 * ────────────────────────────────────────────────────────────────────── */

type PalaisFormData = {
  stepOne: {
    company: string;
    stand: string;
    unloading: string;
    event: string;
  };
  vehicle: Vehicle;
  stepThree: { message: string; consent: boolean; email: string };
};

function getDefaultPalaisFormData(): PalaisFormData {
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

function LogisticienNewPalais() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const espace = useEspaceSlug();
  const step = Number(searchParams.get("step") ?? "1");

  const [stepValid, setStepValid] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);

  const [formData, setFormData] = useState<PalaisFormData>(getDefaultPalaisFormData());

  const updateForm = (
    section: keyof PalaisFormData,
    data: Partial<PalaisFormData[keyof PalaisFormData]>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...data },
    }));
  };

  useEffect(() => {
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
        vehicle: { ...getDefaultPalaisFormData().vehicle, city },
        stepThree: { message, consent: false, email },
      });
    } else {
      const saved = localStorage.getItem("log_formData");
      if (saved) {
        try {
          setFormData(JSON.parse(saved));
        } catch {
          // Ignore invalid data
        }
      }
    }
  }, [searchParams]);

  useEffect(() => {
    localStorage.setItem("log_formData", JSON.stringify(formData));
  }, [formData]);

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
      setFormData(getDefaultPalaisFormData());
      setHasSaved(false);
      localStorage.removeItem("log_formData");
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
    setFormData(getDefaultPalaisFormData());
    localStorage.removeItem("log_formData");
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
                />
              )}
              {step === 3 && (
                <StepThree
                  data={formData.stepThree}
                  update={(patch) => updateForm("stepThree", patch)}
                  onValidityChange={setStepValid}
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

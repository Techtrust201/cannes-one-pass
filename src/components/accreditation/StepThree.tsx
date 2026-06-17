"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslation } from "@/components/accreditation/TranslationProvider";
import {
  formInputClass,
  formLabelClass,
  formTextareaClass,
} from "@/lib/form-styles";

interface Data {
  message: string;
  consent: boolean;
  email?: string;
}

interface Props {
  data: Data;
  update: (patch: Partial<Data>) => void;
  onValidityChange: (v: boolean) => void;
  /**
   * Contexte d'usage. En logisticien, l'e-mail sert à *envoyer* l'accréditation
   * au destinataire ; en public, à la *recevoir*. Le champ est obligatoire dans
   * les deux cas (source unique de vérité de l'e-mail du flow).
   */
  mode?: "public" | "logisticien";
}

/** Validation e-mail simple : format raisonnable, sans être trop stricte. */
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function StepThree({
  data,
  update,
  onValidityChange,
  mode = "public",
}: Props) {
  const { message, consent } = data;
  const email = data.email ?? "";
  const { t } = useTranslation();
  const [emailTouched, setEmailTouched] = useState(false);

  // L'e-mail est désormais OBLIGATOIRE : indispensable pour l'envoi automatique
  // du récapitulatif + QR code (Resend). On bloque le passage à l'étape suivante
  // tant qu'il est vide ou invalide.
  const emailValid = isValidEmail(email.trim());
  const valid = consent && emailValid;
  useEffect(() => onValidityChange(valid), [valid, onValidityChange]);

  const emailLabel =
    mode === "logisticien"
      ? "E-mail du destinataire"
      : (t.emailRequiredLabel ?? t.emailLabel ?? "E-mail");
  const emailHint =
    mode === "logisticien"
      ? "Obligatoire pour envoyer automatiquement l'accréditation et le QR code par e-mail."
      : (t.emailRequiredHint ??
        "Obligatoire pour recevoir le récapitulatif et le QR code par e-mail.");
  const showEmailError = emailTouched && !emailValid;

  return (
    <div className="flex flex-col w-full">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Image
            src="/accreditation/progressbar/Vector (2).svg"
            alt="Message"
            width={20}
            height={20}
            className="w-5 h-5"
          />
          <h2 className="text-lg font-bold">{t.message}</h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">&bull; {t.optional}</p>

        <label htmlFor="msg" className={`${formLabelClass} mb-1`}>
          {t.yourMessage}
        </label>
        <textarea
          id="msg"
          rows={4}
          value={message}
          onChange={(e) => update({ message: e.target.value })}
          placeholder={t.writeHere}
          className={formTextareaClass(false, "mb-4")}
        />

        <label htmlFor="email" className={`${formLabelClass} mb-1`}>
          {emailLabel} <span className="text-red-500">*</span>
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => update({ email: e.target.value })}
          onBlur={() => setEmailTouched(true)}
          placeholder={t.emailPlaceholder ?? "vous@exemple.com"}
          aria-invalid={showEmailError}
          className={formInputClass(showEmailError)}
        />
        {showEmailError ? (
          <p className="text-xs text-red-500 mt-1 mb-4">
            {t.emailRequiredError ?? "Veuillez saisir un e-mail valide."}
          </p>
        ) : (
          <p className="text-xs text-gray-500 mt-1 mb-4">{emailHint}</p>
        )}

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => update({ consent: e.target.checked })}
            className="accent-primary"
          />
          {t.consent}
        </label>
      </div>
    </div>
  );
}

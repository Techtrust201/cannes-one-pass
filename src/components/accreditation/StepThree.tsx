"use client";
import { useEffect } from "react";
import Image from "next/image";
import { useTranslation } from "@/components/accreditation/TranslationProvider";

interface Data {
  message: string;
  consent: boolean;
  email?: string;
}

interface Props {
  data: Data;
  update: (patch: Partial<Data>) => void;
  onValidityChange: (v: boolean) => void;
}

/** Validation e-mail simple : format raisonnable, sans être trop stricte. */
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function StepThree({ data, update, onValidityChange }: Props) {
  const { message, consent } = data;
  const email = data.email ?? "";
  const { t } = useTranslation();

  // L'e-mail est facultatif : on ne bloque que s'il est rempli et invalide.
  const emailValid = email.trim() === "" || isValidEmail(email.trim());
  const valid = consent && emailValid;
  useEffect(() => onValidityChange(valid), [valid, onValidityChange]);

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

        <label htmlFor="msg" className="text-sm font-medium block mb-1">
          {t.yourMessage}
        </label>
        <textarea
          id="msg"
          rows={4}
          value={message}
          onChange={(e) => update({ message: e.target.value })}
          placeholder={t.writeHere}
          className="w-full border border-[#C6C6C6] rounded-md px-3 py-2 focus:ring-primary focus:border-primary mb-4"
        />

        <label htmlFor="email" className="text-sm font-medium block mb-1">
          {t.emailLabel ?? "E-mail"}{" "}
          <span className="text-gray-500 font-normal">&bull; {t.optional}</span>
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => update({ email: e.target.value })}
          placeholder={t.emailPlaceholder ?? "vous@exemple.com"}
          className={`w-full border rounded-md px-3 py-2 focus:ring-primary focus:border-primary ${
            emailValid ? "border-[#C6C6C6]" : "border-red-400"
          }`}
        />
        <p className="text-xs text-gray-500 mt-1 mb-4">
          {t.emailHint ?? "Pour recevoir votre récapitulatif et votre QR code par e-mail"}
        </p>

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

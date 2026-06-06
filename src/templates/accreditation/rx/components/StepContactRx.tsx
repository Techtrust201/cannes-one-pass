"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/components/accreditation/TranslationProvider";
import type { StepProps } from "../../types";
import type { RxFormData } from "../types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEL_RE = /^[\d\s+\-()]{8,}$/;

/**
 * Step 2 RX — Contact.
 * Coordonnées du responsable logistique du stand. Validation locale au
 * blur (email + téléphone) en plus de la validation de passage d'étape.
 */
export function StepContactRx({ data, update, onValidityChange }: StepProps<RxFormData>) {
  const { t } = useTranslation();
  const contact = data.stepOne.contact;
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const setContact = (patch: Partial<typeof contact>) => {
    update({ stepOne: { ...data.stepOne, contact: { ...contact, ...patch } } });
  };

  const emailOk = EMAIL_RE.test(contact.email);
  const telOk = TEL_RE.test(contact.phoneNumber);
  const isValid =
    contact.firstName.trim().length > 0 &&
    contact.lastName.trim().length > 0 &&
    emailOk &&
    telOk;

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  const markTouched = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  return (
    <div className="flex flex-col w-full gap-6">
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-1">
          {t.rx.contact.title}
        </h2>
        <p className="text-sm text-gray-500">{t.rx.contact.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-semibold text-gray-700">
            {t.rx.contact.lastName} <span className="text-red-500">*</span>
          </label>
          <input
            value={contact.lastName}
            onChange={(e) => setContact({ lastName: e.target.value })}
            onBlur={() => markTouched("lastName")}
            placeholder={t.rx.contact.lastNamePlaceholder}
            autoComplete="family-name"
            className={cn(
              "w-full rounded-md px-3 py-2 shadow-sm focus:ring-primary focus:border-primary text-base sm:text-sm",
              touched.lastName && !contact.lastName.trim()
                ? "border-red-500"
                : "border-gray-300"
            )}
          />
          {touched.lastName && !contact.lastName.trim() && (
            <p className="text-xs text-red-500">{t.rx.contact.required}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-semibold text-gray-700">
            {t.rx.contact.firstName} <span className="text-red-500">*</span>
          </label>
          <input
            value={contact.firstName}
            onChange={(e) => setContact({ firstName: e.target.value })}
            onBlur={() => markTouched("firstName")}
            placeholder={t.rx.contact.firstNamePlaceholder}
            autoComplete="given-name"
            className={cn(
              "w-full rounded-md px-3 py-2 shadow-sm focus:ring-primary focus:border-primary text-base sm:text-sm",
              touched.firstName && !contact.firstName.trim()
                ? "border-red-500"
                : "border-gray-300"
            )}
          />
          {touched.firstName && !contact.firstName.trim() && (
            <p className="text-xs text-red-500">{t.rx.contact.required}</p>
          )}
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-semibold text-gray-700">
            {t.rx.contact.email} <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={contact.email}
            onChange={(e) => setContact({ email: e.target.value })}
            onBlur={() => markTouched("email")}
            placeholder={t.rx.contact.emailPlaceholder}
            autoComplete="email"
            className={cn(
              "w-full rounded-md px-3 py-2 shadow-sm focus:ring-primary focus:border-primary text-base sm:text-sm",
              touched.email && !emailOk ? "border-red-500" : "border-gray-300"
            )}
          />
          {touched.email && !emailOk && (
            <p className="text-xs text-red-500">{t.rx.contact.invalidEmail}</p>
          )}
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-semibold text-gray-700">
            {t.rx.contact.mobilePhone} <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              value={contact.phoneCode}
              onChange={(e) => setContact({ phoneCode: e.target.value })}
              className="w-20 rounded-md px-3 py-2 border border-gray-300 shadow-sm text-base sm:text-sm"
              placeholder="+33"
            />
            <input
              type="tel"
              value={contact.phoneNumber}
              onChange={(e) => setContact({ phoneNumber: e.target.value })}
              onBlur={() => markTouched("tel")}
              placeholder={t.rx.contact.phonePlaceholder}
              autoComplete="tel"
              className={cn(
                "flex-1 rounded-md px-3 py-2 shadow-sm focus:ring-primary focus:border-primary text-base sm:text-sm",
                touched.tel && !telOk ? "border-red-500" : "border-gray-300"
              )}
            />
          </div>
          {touched.tel && !telOk && (
            <p className="text-xs text-red-500">{t.rx.contact.invalidPhone}</p>
          )}
        </div>
      </div>
    </div>
  );
}

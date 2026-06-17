"use client";

import { useEffect } from "react";
import { formInputClass, formLabelClass } from "@/lib/form-styles";
import { useUnloadingProviders } from "@/hooks/useUnloadingProviders";
import { useTranslation } from "@/components/accreditation/TranslationProvider";
import EventCarouselSelector from "@/components/accreditation/EventCarouselSelector";
import {
  FieldError,
  RequiredFieldsSummary,
  RequiredMark,
} from "@/components/accreditation/FormBits";

interface Data {
  company: string;
  stand: string;
  unloading: string;
  event: string;
}

interface Props {
  data: Data;
  update: (patch: Partial<Data>) => void;
  onValidityChange: (v: boolean) => void;
  /**
   * Slug d'organisation utilisé pour scoper le carrousel d'events et la liste
   * de prestataires de déchargement. Par défaut le slug canonique du Palais
   * pour préserver le comportement historique des liens `/accreditation` non
   * scopés.
   */
  orgSlug?: string;
  /** Affiche les erreurs des champs obligatoires (après clic « Suivant »). */
  showErrors?: boolean;
}

export default function StepOne({
  data,
  update,
  onValidityChange,
  orgSlug = "palais-des-festivals",
  showErrors = false,
}: Props) {
  const { company, stand, unloading, event } = data;
  const { providers: unloadingProviders } = useUnloadingProviders(orgSlug);
  const { t } = useTranslation();

  const isValid = !!(company && stand && unloading && event);
  useEffect(() => onValidityChange(isValid), [isValid, onValidityChange]);

  const requiredFieldLabel = t.requiredField!;
  const missingFields: string[] = [];
  if (!company.trim()) missingFields.push(t.decoratorName);
  if (!stand.trim()) missingFields.push(t.standServed);
  if (!unloading) missingFields.push(t.unloadingBy);
  if (!event) missingFields.push(t.selectEvent);

  return (
    <div className="flex flex-col w-full">
      <div className="flex-1 p-0 sm:p-0 flex flex-col justify-between">
        <div>
          <h2 className="text-lg font-bold mb-4">{t.identification}</h2>

          <RequiredFieldsSummary
            show={showErrors}
            title={t.requiredFieldsSummary ?? t.completeAllFields}
            fields={missingFields}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <div className="space-y-1 md:col-span-2 lg:col-span-1">
              <label htmlFor="company" className={formLabelClass}>
                {t.decoratorName}
                <RequiredMark />
              </label>
              <input
                id="company"
                value={company}
                onChange={(e) => update({ company: e.target.value })}
                placeholder={t.decoratorPlaceholder}
                aria-invalid={showErrors && !company.trim()}
                className={formInputClass(showErrors && !company.trim())}
              />
              <FieldError show={showErrors && !company.trim()}>
                {requiredFieldLabel}
              </FieldError>
            </div>
            <div className="space-y-1 md:col-span-2 lg:col-span-1">
              <label htmlFor="stand" className={formLabelClass}>
                {t.standServed}
                <RequiredMark />
              </label>
              <input
                id="stand"
                value={stand}
                onChange={(e) => update({ stand: e.target.value })}
                placeholder={t.standPlaceholder}
                aria-invalid={showErrors && !stand.trim()}
                className={formInputClass(showErrors && !stand.trim())}
              />
              <FieldError show={showErrors && !stand.trim()}>
                {requiredFieldLabel}
              </FieldError>
            </div>
            <div className="space-y-1 md:col-span-2 lg:col-span-1">
              <label htmlFor="unloading" className={formLabelClass}>
                {t.unloadingBy}
                <RequiredMark />
              </label>
              <select
                id="unloading"
                value={unloading}
                onChange={(e) => update({ unloading: e.target.value })}
                aria-invalid={showErrors && !unloading}
                className={formInputClass(showErrors && !unloading)}
              >
                <option value="" disabled>{t.chooseProvider}</option>
                {unloadingProviders.map((p) => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
                <option value="Autonome">{t.manualUnloading}</option>
              </select>
              <FieldError show={showErrors && !unloading}>
                {requiredFieldLabel}
              </FieldError>
            </div>
          </div>

          <div className="space-y-1">
            <EventCarouselSelector
              orgSlug={orgSlug}
              value={event}
              onChange={(slug) => update({ event: slug })}
            />
            <FieldError show={showErrors && !event}>
              {requiredFieldLabel}
            </FieldError>
          </div>
        </div>
      </div>
    </div>
  );
}

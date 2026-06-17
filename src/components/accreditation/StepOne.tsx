"use client";

import { useEffect } from "react";
import { formInputClass, formLabelClass } from "@/lib/form-styles";
import { useUnloadingProviders } from "@/hooks/useUnloadingProviders";
import { useTranslation } from "@/components/accreditation/TranslationProvider";
import EventCarouselSelector from "@/components/accreditation/EventCarouselSelector";

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
}

export default function StepOne({
  data,
  update,
  onValidityChange,
  orgSlug = "palais-des-festivals",
}: Props) {
  const { company, stand, unloading, event } = data;
  const { providers: unloadingProviders } = useUnloadingProviders(orgSlug);
  const { t } = useTranslation();

  const isValid = !!(company && stand && unloading && event);
  useEffect(() => onValidityChange(isValid), [isValid, onValidityChange]);

  return (
    <div className="flex flex-col w-full">
      <div className="flex-1 p-0 sm:p-0 flex flex-col justify-between">
        <div>
          <h2 className="text-lg font-bold mb-4">{t.identification}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <div className="space-y-1 md:col-span-2 lg:col-span-1">
              <label htmlFor="company" className={formLabelClass}>
                {t.decoratorName}
              </label>
              <input
                id="company"
                value={company}
                onChange={(e) => update({ company: e.target.value })}
                placeholder={t.decoratorPlaceholder}
                className={formInputClass(!company.trim())}
              />
            </div>
            <div className="space-y-1 md:col-span-2 lg:col-span-1">
              <label htmlFor="stand" className={formLabelClass}>
                {t.standServed}
              </label>
              <input
                id="stand"
                value={stand}
                onChange={(e) => update({ stand: e.target.value })}
                placeholder={t.standPlaceholder}
                className={formInputClass(!stand.trim())}
              />
            </div>
            <div className="space-y-1 md:col-span-2 lg:col-span-1">
              <label htmlFor="unloading" className={formLabelClass}>
                {t.unloadingBy}
              </label>
              <select
                id="unloading"
                value={unloading}
                onChange={(e) => update({ unloading: e.target.value })}
                className={formInputClass(!unloading)}
              >
                <option value="" disabled>{t.chooseProvider}</option>
                {unloadingProviders.map((p) => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
                <option value="Autonome">{t.manualUnloading}</option>
              </select>
            </div>
          </div>

          <EventCarouselSelector
            orgSlug={orgSlug}
            value={event}
            onChange={(slug) => update({ event: slug })}
          />
        </div>
      </div>
      {!isValid && (
        <p className="text-red-500 text-sm mt-2 text-center">
          {t.completeAllFields}
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
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
              <label htmlFor="company" className="text-sm font-semibold text-gray-700">
                {t.decoratorName}
              </label>
              <input
                id="company"
                value={company}
                onChange={(e) => update({ company: e.target.value })}
                placeholder={t.decoratorPlaceholder}
                className={cn(
                  "w-full rounded-md px-3 py-2 shadow-sm focus:ring-primary focus:border-primary",
                  !company.trim() ? "border-red-500" : "border-gray-300"
                )}
              />
            </div>
            <div className="space-y-1 md:col-span-2 lg:col-span-1">
              <label htmlFor="stand" className="text-sm font-semibold text-gray-700">
                {t.standServed}
              </label>
              <input
                id="stand"
                value={stand}
                onChange={(e) => update({ stand: e.target.value })}
                placeholder={t.standPlaceholder}
                className={cn(
                  "w-full rounded-md px-3 py-2 shadow-sm focus:ring-primary focus:border-primary",
                  !stand.trim() ? "border-red-500" : "border-gray-300"
                )}
              />
            </div>
            <div className="space-y-1 md:col-span-2 lg:col-span-1">
              <label htmlFor="unloading" className="text-sm font-semibold text-gray-700">
                {t.unloadingBy}
              </label>
              <select
                id="unloading"
                value={unloading}
                onChange={(e) => update({ unloading: e.target.value })}
                className={cn(
                  "w-full rounded-md px-3 py-2 shadow-sm bg-white focus:ring-primary focus:border-primary",
                  !unloading ? "border-red-500" : "border-gray-300"
                )}
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

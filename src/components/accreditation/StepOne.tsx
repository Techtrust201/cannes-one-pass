"use client";

import { useEffect, useRef } from "react";
import { formInputClass, formLabelClass } from "@/lib/form-styles";
import { useUnloadingProviders } from "@/hooks/useUnloadingProviders";
import { useTranslation } from "@/components/accreditation/TranslationProvider";
import {
  buildUnloadingOptions,
  getDefaultUnloadingValue,
  getOrgFieldLabel,
} from "@/lib/org-form-config";
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
  /**
   * Présélectionne l'option « Déchargement par » par défaut de l'organisation
   * (ex. « Inconnu » pour le public Palais) afin de ne pas bloquer le chauffeur
   * sur ce champ obligatoire. À n'activer que sur le parcours public.
   */
  preselectDefaultUnloading?: boolean;
}

export default function StepOne({
  data,
  update,
  onValidityChange,
  orgSlug = "palais-des-festivals",
  showErrors = false,
  preselectDefaultUnloading = false,
}: Props) {
  const { company, stand, unloading, event } = data;
  const { providers: unloadingProviders } = useUnloadingProviders(orgSlug);
  const { t, lang } = useTranslation();

  // Libellés scopés par organisation (Palais : « Société », « Stand | Client »).
  const decoratorLabel = getOrgFieldLabel(orgSlug, "decoratorName", lang, t.decoratorName);
  const decoratorPlaceholder = getOrgFieldLabel(
    orgSlug,
    "decoratorPlaceholder",
    lang,
    t.decoratorPlaceholder
  );
  const standLabel = getOrgFieldLabel(orgSlug, "standServed", lang, t.standServed);
  const standPlaceholder = getOrgFieldLabel(orgSlug, "standPlaceholder", lang, t.standPlaceholder);

  // Options « Déchargement par » ordonnées par organisation (codes techniques
  // stables + prestataires en base). Aucun libellé traduit n'est envoyé au backend.
  const unloadingOptions = buildUnloadingOptions(orgSlug, unloadingProviders, lang);

  // Présélection (public uniquement) : évite de bloquer le chauffeur sur un
  // champ obligatoire. One-shot : ne réécrit jamais un choix utilisateur.
  const didPreselect = useRef(false);
  useEffect(() => {
    if (didPreselect.current || !preselectDefaultUnloading) return;
    if (unloading) {
      didPreselect.current = true;
      return;
    }
    const def = getDefaultUnloadingValue(orgSlug);
    if (def) {
      didPreselect.current = true;
      update({ unloading: def });
    }
  }, [preselectDefaultUnloading, orgSlug, unloading, update]);

  const isValid = !!(company && stand && unloading && event);
  useEffect(() => onValidityChange(isValid), [isValid, onValidityChange]);

  const requiredFieldLabel = t.requiredField!;
  const missingFields: string[] = [];
  if (!company.trim()) missingFields.push(decoratorLabel);
  if (!stand.trim()) missingFields.push(standLabel);
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
                {decoratorLabel}
                <RequiredMark />
              </label>
              <input
                id="company"
                value={company}
                onChange={(e) => update({ company: e.target.value })}
                placeholder={decoratorPlaceholder}
                aria-invalid={showErrors && !company.trim()}
                className={formInputClass(showErrors && !company.trim())}
              />
              <FieldError show={showErrors && !company.trim()}>
                {requiredFieldLabel}
              </FieldError>
            </div>
            <div className="space-y-1 md:col-span-2 lg:col-span-1">
              <label htmlFor="stand" className={formLabelClass}>
                {standLabel}
                <RequiredMark />
              </label>
              <input
                id="stand"
                value={stand}
                onChange={(e) => update({ stand: e.target.value })}
                placeholder={standPlaceholder}
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
                {unloadingOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
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

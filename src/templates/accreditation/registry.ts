/**
 * Registry central des templates d'accréditation.
 *
 * Pour ajouter une organisation : créer un dossier
 * `src/templates/accreditation/<slug>/` exportant un `AccreditationTemplate`
 * comme export par défaut, puis ajouter l'entrée correspondante ci-dessous.
 * Le registry est volontairement statique (import direct) pour bénéficier
 * du tree-shaking et du typage Vue 3.
 */

import type { AccreditationTemplate, TemplateSlug } from "./types";
import palaisTemplate from "./palais";
import rxTemplate from "./rx";

const TEMPLATES: Record<string, AccreditationTemplate<any>> = { // eslint-disable-line @typescript-eslint/no-explicit-any
  [palaisTemplate.slug]: palaisTemplate,
  [rxTemplate.slug]: rxTemplate,
};

/**
 * Renvoie le template à utiliser pour un slug d'organisation donné.
 * Fallback sur Palais si le template demandé n'est pas (encore) implémenté
 * — utile pour les futures organisations qui hériteraient du formulaire
 * standard en attendant un template dédié.
 */
export function getTemplate(
  organizationFormTemplate: string | null | undefined
): AccreditationTemplate<unknown> {
  const key = (organizationFormTemplate ?? "palais").toLowerCase();
  return (TEMPLATES[key] ?? TEMPLATES.palais) as AccreditationTemplate<unknown>;
}

/**
 * Vérifie qu'un slug d'organisation possède un template enregistré.
 * Permet à un appelant (page parent) de différencier "org valide mais
 * pas de template" (→ fallback Palais avec warning) de "org introuvable".
 */
export function hasTemplate(slug: TemplateSlug): boolean {
  return Boolean(TEMPLATES[slug.toLowerCase()]);
}

/** Liste des slugs enregistrés (debug/admin). */
export function listTemplates(): TemplateSlug[] {
  return Object.keys(TEMPLATES);
}

import type { AccreditationTemplate } from "../types";
import type { RxFormData } from "./types";
import { getDefaultRxFormData } from "./types";
import { rxPayloadSchema } from "./schema";
import { mapRxPayload } from "./mapPayload";
import { rxSteps } from "./steps";

const rxTemplate: AccreditationTemplate<RxFormData> = {
  slug: "rx",
  steps: rxSteps,
  // Skip montage / démontage : on masque dynamiquement l'étape concernée.
  // L'indexation de la navigation se fait sur cette liste filtrée côté
  // wizard (cf. AccreditationWizard), ce qui décale naturellement les
  // étapes suivantes sans laisser d'index orphelin.
  getVisibleSteps: (form) =>
    rxSteps.filter((s) => {
      if (s.id === "delivery" && form.stepTwo?.skipMontage) return false;
      if (s.id === "pickup" && form.stepTwo?.skipDemontage) return false;
      return true;
    }),
  initialData: getDefaultRxFormData,
  schema: rxPayloadSchema,
  mapPayload: mapRxPayload,
  meta: {
    // L'UI/tram est strictement identique à Palais → on garde la même image
    // latérale pour ne pas dénoter visuellement entre les organisations.
    sideImage: "/accreditation/pict_page1/palais.jpg",
    accentColor: "#3DAAA4",
  },
};

export default rxTemplate;
export type { RxFormData };

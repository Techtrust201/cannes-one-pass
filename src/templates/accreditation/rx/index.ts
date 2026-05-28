import type { AccreditationTemplate } from "../types";
import type { RxFormData } from "./types";
import { getDefaultRxFormData } from "./types";
import { rxPayloadSchema } from "./schema";
import { mapRxPayload } from "./mapPayload";
import { rxSteps } from "./steps";

const rxTemplate: AccreditationTemplate<RxFormData> = {
  slug: "rx",
  steps: rxSteps,
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

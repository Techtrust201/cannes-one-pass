import type { AccreditationTemplate } from "../types";
import type { PalaisFormData } from "./types";
import { getDefaultPalaisFormData } from "./types";
import { palaisPayloadSchema } from "./schema";
import { mapPalaisPayload } from "./mapPayload";
import { palaisSteps } from "./steps";

const palaisTemplate: AccreditationTemplate<PalaisFormData> = {
  slug: "palais",
  steps: palaisSteps,
  initialData: getDefaultPalaisFormData,
  schema: palaisPayloadSchema,
  mapPayload: mapPalaisPayload,
  meta: {
    sideImage: "/accreditation/pict_page1/palais.jpg",
    accentColor: "#3DAAA4",
  },
};

export default palaisTemplate;
export type { PalaisFormData };

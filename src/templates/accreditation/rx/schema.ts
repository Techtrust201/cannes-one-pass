import { z } from "zod";

/**
 * Schéma serveur du payload RX. Différences clés avec Palais :
 * - `vehicles[].plate` est **optionnel** (saisi au scan QR à l'arrivée).
 * - `vehicles[].vehicleType` (gabarit) est **obligatoire**.
 * - `vehicles` peut comporter plusieurs entrées (N livraisons par stand).
 * - `extension` est riche (contact, catégories, créneaux, manutention).
 */
export const rxVehicleSchema = z.object({
  plate: z.string().nullable().optional(),
  // size est optionnel pour RX ; city est optionnelle (bilan carbone, saisie exposant).
  size: z.string().optional().default(""),
  phoneCode: z.string().min(1),
  phoneNumber: z.string().min(1),
  date: z.string().min(1),
  time: z.string().optional(),
  city: z.string().optional().default(""),
  unloading: z.array(z.string()).min(1),
  kms: z.string().optional(),
  vehicleType: z.string().min(1, "Le type de véhicule est obligatoire"),
  country: z.string().optional(),
  estimatedKms: z.number().optional(),
  trailerPlate: z.string().optional(),
  emptyWeight: z.number().optional(),
  maxWeight: z.number().optional(),
  currentWeight: z.number().optional(),
  // Contexte de catégorie embarqué (split 1 accréditation/véhicule).
  categoryId: z.string().optional(),
  repDate: z.string().optional(),
  repTime: z.string().optional(),
  repSameAsDelivery: z.boolean().optional(),
  repVehicleType: z.string().optional(),
  repPlate: z.string().nullable().optional(),
  repPhoneCode: z.string().optional(),
  repPhoneNumber: z.string().optional(),
  interveningCompany: z.string().optional(),
  repInterveningCompany: z.string().optional(),
  repCity: z.string().optional(),
  repCountry: z.string().optional(),
  repEstimatedKms: z.number().optional(),
});

export const rxExtensionSchema = z.object({
  exhibitor: z.object({
    id: z.string(),
    name: z.string(),
    stand: z.string(),
    sector: z.string().optional().default(""),
  }),
  contact: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.email(),
    phoneCode: z.string().min(1),
    phoneNumber: z.string().min(1),
  }),
  space: z.string().min(1),
  // Phase 6 — critères naturels de l'emplacement référentiel choisi (jamais
  // un identifiant interne). Optionnel : absent si aucun emplacement n'a
  // encore été importé pour cet exposant. Le serveur revérifie et résout
  // lui-même l'exhibitorId/exhibitorLocationId réels ; ces champs ne sont
  // jamais utilisés comme source de vérité.
  location: z
    .object({
      code: z.string().nullable().optional(),
      type: z.enum(["TERRE", "FLOT", "STAND"]).nullable().optional(),
    })
    .optional(),
  categories: z
    .array(
      z.object({
        categoryId: z.string(),
        livDate: z.string(),
        livTime: z.string(),
        repDate: z.string(),
        repTime: z.string(),
        vehicles: z
          .array(
            z.object({
              vehicleType: z.string().min(1),
              plate: z.string().nullable().optional(),
              trailerPlate: z.string().optional(),
              notes: z.string().optional(),
              interveningCompany: z.string().optional(),
              // Téléphone chauffeur du véhicule de livraison / montage (optionnel,
              // repli sur le téléphone contact côté mapPayload).
              phoneCode: z.string().optional(),
              phoneNumber: z.string().optional(),
              city: z.string().optional(),
              country: z.string().optional(),
              estimatedKms: z.number().optional(),
              repSameAsDelivery: z.boolean().optional(),
              repVehicleType: z.string().optional(),
              repPlate: z.string().nullable().optional(),
              repPhoneCode: z.string().optional(),
              repPhoneNumber: z.string().optional(),
              repInterveningCompany: z.string().optional(),
              repCity: z.string().optional(),
              repCountry: z.string().optional(),
              repEstimatedKms: z.number().optional(),
            })
          )
          .default([]),
      })
    )
    .min(1, "Au moins une catégorie est requise"),
  scalesAssigned: z.boolean(),
  manutentionProvider: z.string(),
  // Prestataire libre quand l'exposant choisit « Autre » à l'étape 5.
  manutentionProviderOther: z.string().optional(),
  // Skip montage / démontage : au moins une des deux phases doit rester.
  // Les dates liv/rep correspondantes sont alors vides (déjà autorisé :
  // livDate/livTime/repDate/repTime sont des z.string() sans .min()).
  skipMontage: z.boolean().optional(),
  skipDemontage: z.boolean().optional(),
  // Zone de déchargement suggérée (pré-assignation back-office RX).
  suggestedZone: z.string().optional(),
}).superRefine((ext, ctx) => {
  const skipMontage = ext.skipMontage === true;
  const skipDemontage = ext.skipDemontage === true;

  // Au moins une phase (montage OU démontage) doit rester.
  if (skipMontage && skipDemontage) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Au moins le montage ou le démontage doit être conservé.",
      path: ["skipMontage"],
    });
  }

  // Dates conditionnelles : requises sauf si la phase correspondante est sautée.
  ext.categories.forEach((cat, i) => {
    if (!skipMontage && (!cat.livDate || !cat.livTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Date et créneau de livraison requis (montage).",
        path: ["categories", i, "livDate"],
      });
    }
    if (!skipDemontage && (!cat.repDate || !cat.repTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Date et créneau de reprise requis (démontage).",
        path: ["categories", i, "repDate"],
      });
    }
  });

  // « Autre » prestataire → texte libre obligatoire.
  if (
    ext.manutentionProvider === "Autre" &&
    !ext.manutentionProviderOther?.trim()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Veuillez préciser le nom du prestataire.",
      path: ["manutentionProviderOther"],
    });
  }
});

export const rxPayloadSchema = z.object({
  organizationSlug: z.literal("rx"),
  company: z.string().min(1),
  stand: z.string().min(1),
  unloading: z.string().min(1),
  event: z.string().min(1),
  vehicles: z.array(rxVehicleSchema), // 0..N véhicules attendus
  message: z.string().optional(),
  consent: z.boolean(),
  language: z.string().optional(),
  status: z.string().optional(),
  currentZone: z.string().nullable().optional(),
  category: z.string().optional(),
  splitPerVehicle: z.boolean().optional(),
  extension: rxExtensionSchema,
});

export type RxPayload = z.infer<typeof rxPayloadSchema>;

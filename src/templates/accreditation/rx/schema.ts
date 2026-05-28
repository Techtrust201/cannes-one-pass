import { z } from "zod";

/**
 * Schéma serveur du payload RX. Aligné sur la nouvelle shape (5 sections)
 * inspirée de la maquette HTML validée :
 *
 * - `vehicles[].plate`     → **optionnel** (saisi au scan QR à l'arrivée)
 * - `vehicles[].vehicleType` (gabarit) → **obligatoire**
 * - `vehicles[]`           → liste plate (concatène toutes les catégories)
 * - `extension`            → exhibitor + contact + space + delivery + pickup
 */
export const rxVehicleSchema = z.object({
  plate: z.string().nullable().optional(),
  size: z.string().optional().default(""),
  phoneCode: z.string().min(1),
  phoneNumber: z.string().min(1),
  date: z.string().min(1),
  time: z.string().optional(),
  city: z.string().optional().default(""),
  unloading: z.array(z.string()).min(1),
  kms: z.string().optional(),
  vehicleType: z.string().min(1, "Le gabarit est obligatoire"),
  country: z.string().optional(),
  estimatedKms: z.number().optional(),
  trailerPlate: z.string().optional(),
  emptyWeight: z.number().optional(),
  maxWeight: z.number().optional(),
  currentWeight: z.number().optional(),
});

export const rxContactSchema = z.object({
  firstName: z.string().min(1, "Prénom obligatoire"),
  lastName: z.string().min(1, "Nom obligatoire"),
  email: z.email("Adresse e-mail invalide"),
  phoneCode: z.string().min(1),
  phoneNumber: z.string().min(1),
});

export const rxExhibitorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  stand: z.string().min(1),
  sector: z.string().optional().default(""),
  zone: z.string().optional().default(""),
});

export const rxDeliveryCategorySchema = z.object({
  categoryId: z.string().min(1),
  date: z.string().min(1, "Date obligatoire"),
  slot: z.string().min(1, "Créneau obligatoire"),
  vehicles: z
    .array(
      z.object({
        vehicleType: z.string().min(1, "Gabarit obligatoire"),
        plate: z.string().nullable().optional(),
        trailerPlate: z.string().optional(),
      })
    )
    .min(1, "Au moins un véhicule requis par catégorie"),
});

export const rxPickupCategorySchema = z.object({
  categoryId: z.string().min(1),
  date: z.string().min(1, "Date de reprise obligatoire"),
  slot: z.string().min(1, "Créneau de reprise obligatoire"),
});

export const rxExtensionSchema = z.object({
  exhibitor: rxExhibitorSchema,
  contact: rxContactSchema,
  space: z.string().min(1, "Espace logistique non résolu"),
  delivery: z.object({
    categories: rxDeliveryCategorySchema.array().min(1),
  }),
  pickup: z.object({
    categories: rxPickupCategorySchema.array().min(1),
  }),
  scalesAssigned: z.boolean(),
  manutentionProvider: z.string(),
});

export const rxPayloadSchema = z.object({
  organizationSlug: z.literal("rx"),
  company: z.string().min(1),
  stand: z.string().min(1),
  unloading: z.string().min(1),
  event: z.string().min(1),
  vehicles: z.array(rxVehicleSchema).min(1, "Au moins un véhicule attendu"),
  message: z.string().optional(),
  consent: z.boolean(),
  language: z.string().optional(),
  status: z.string().optional(),
  currentZone: z.string().nullable().optional(),
  category: z.string().optional(),
  extension: rxExtensionSchema,
});

export type RxPayload = z.infer<typeof rxPayloadSchema>;

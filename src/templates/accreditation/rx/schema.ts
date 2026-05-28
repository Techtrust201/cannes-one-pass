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
  // size / city sont rendus optionnels pour RX (renseignés à l'arrivée
  // au scan QR — pas obligatoires à la création).
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
  // Contexte de catégorie embarqué (split 1 accréditation/véhicule).
  categoryId: z.string().optional(),
  repDate: z.string().optional(),
  repTime: z.string().optional(),
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
            })
          )
          .default([]),
      })
    )
    .min(1, "Au moins une catégorie est requise"),
  scalesAssigned: z.boolean(),
  manutentionProvider: z.string(),
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

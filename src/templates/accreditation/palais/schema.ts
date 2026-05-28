import { z } from "zod";

/**
 * Schéma serveur du payload Palais. Vérifie la présence des champs racine
 * + 1 véhicule avec **plaque obligatoire** (workflow Palais inchangé,
 * même si la colonne `Vehicle.plate` est désormais nullable en DB pour
 * supporter le workflow RX).
 */
export const palaisPayloadSchema = z.object({
  organizationSlug: z.literal("palais"),
  company: z.string().min(1),
  stand: z.string().min(1),
  unloading: z.string().min(1),
  event: z.string().min(1),
  vehicles: z
    .array(
      z.object({
        plate: z.string().min(1, "La plaque est obligatoire"),
        size: z.string().min(1),
        phoneCode: z.string().min(1),
        phoneNumber: z.string().min(1),
        date: z.string().min(1),
        time: z.string().optional(),
        city: z.string().min(1),
        unloading: z.array(z.string()).min(1),
        kms: z.string().optional(),
        vehicleType: z.string().optional(),
        country: z.string().optional(),
        estimatedKms: z.number().optional(),
        trailerPlate: z.string().optional(),
        emptyWeight: z.number().optional(),
        maxWeight: z.number().optional(),
        currentWeight: z.number().optional(),
      })
    )
    .min(1, "Au moins un véhicule requis"),
  message: z.string().optional(),
  consent: z.boolean(),
  language: z.string().optional(),
  status: z.string().optional(),
  currentZone: z.string().nullable().optional(),
  category: z.string().optional(),
  extension: z.record(z.string(), z.unknown()).optional(),
});

export type PalaisPayload = z.infer<typeof palaisPayloadSchema>;

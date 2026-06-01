import { prisma } from "@/lib/prisma";
import { DEFAULT_ZONES } from "@/lib/zone-defaults";

/**
 * Seed des zones pour une organisation donnée.
 *
 * @param orgId organisation cible. `null` = configuration globale (legacy).
 *   En multi-tenant, on passe l'`organizationId` pour que chaque org dispose
 *   de sa propre copie indépendante des zones par défaut.
 */
export async function seedZones(orgId: string | null = null) {
  const results = [];
  for (const z of DEFAULT_ZONES) {
    const existing = await prisma.zoneConfig.findFirst({
      where: { zone: z.zone, organizationId: orgId },
    });
    if (existing) {
      results.push(
        await prisma.zoneConfig.update({
          where: { id: existing.id },
          data: {
            label: z.label,
            address: z.address,
            latitude: z.latitude,
            longitude: z.longitude,
            isFinalDestination: z.isFinalDestination,
            color: z.color,
          },
        })
      );
    } else {
      results.push(
        await prisma.zoneConfig.create({
          data: { ...z, organizationId: orgId },
        })
      );
    }
  }
  return results;
}

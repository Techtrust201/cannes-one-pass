import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePlanningAdminContext, responseFromError } from "@/lib/planning-admin";
import {
  getRxVehicleProcessInstructions,
  getDefaultRxVehicleProcessFallback,
  type RxVehicleProcessConfigRow,
} from "@/lib/rx-vehicle-process";

const FAMILIES = new Set(["LIGHT", "HEAVY"]);

function serialize(row: RxVehicleProcessConfigRow) {
  return getRxVehicleProcessInstructions(row.vehicleFamily, row);
}

/** Configurations RX par famille ; PUT crée ou remplace la configuration ciblée. */
export async function GET(request: NextRequest) {
  const context = await resolvePlanningAdminContext(request, "FLUX_VEHICULES", "read");
  if (context instanceof Response) return context;
  if (context.espace !== "rx") return Response.json({ error: "Réservé à l’espace RX" }, { status: 400 });
  try {
    const rows = await prisma.rxVehicleProcessConfig.findMany({
      where: { organizationId: context.orgId },
      orderBy: { vehicleFamily: "asc" },
    });
    const byFamily = new Map(rows.map((row) => [row.vehicleFamily, row]));
    return Response.json({
      items: (["LIGHT", "HEAVY"] as const).map((family) =>
        byFamily.has(family)
          ? serialize(byFamily.get(family)!)
          : getDefaultRxVehicleProcessFallback(family)
      ),
    });
  } catch (error) {
    return responseFromError(error, "GET /api/admin/rx-vehicle-process");
  }
}

export async function PUT(request: NextRequest) {
  const context = await resolvePlanningAdminContext(request, "FLUX_VEHICULES", "write");
  if (context instanceof Response) return context;
  if (context.espace !== "rx") return Response.json({ error: "Réservé à l’espace RX" }, { status: 400 });
  try {
    const body = await request.json();
    const vehicleFamily = typeof body.vehicleFamily === "string" ? body.vehicleFamily.trim().toUpperCase() : "";
    if (!FAMILIES.has(vehicleFamily)) {
      return Response.json({ error: "vehicleFamily invalide (LIGHT|HEAVY)" }, { status: 400 });
    }
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const instructions: string[] = Array.isArray(body.instructions)
      ? (body.instructions as unknown[])
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];
    if (!title || instructions.length === 0) {
      return Response.json({ error: "title et au moins une instruction sont requis" }, { status: 400 });
    }
    const maxParkingMinutes =
      body.maxParkingMinutes === null || body.maxParkingMinutes === ""
        ? null
        : Number.isInteger(body.maxParkingMinutes) && body.maxParkingMinutes >= 0
          ? body.maxParkingMinutes
          : undefined;
    if (maxParkingMinutes === undefined) {
      return Response.json({ error: "maxParkingMinutes doit être un entier positif ou null" }, { status: 400 });
    }
    const row = await prisma.rxVehicleProcessConfig.upsert({
      where: { organizationId_vehicleFamily: { organizationId: context.orgId, vehicleFamily: vehicleFamily as "LIGHT" | "HEAVY" } },
      create: {
        organizationId: context.orgId,
        vehicleFamily: vehicleFamily as "LIGHT" | "HEAVY",
        zoneCode: typeof body.zoneCode === "string" ? body.zoneCode.trim() || null : null,
        maxParkingMinutes,
        requiresReceiver: Boolean(body.requiresReceiver),
        requiresHeavyUnloadingDetails: Boolean(body.requiresHeavyUnloadingDetails),
        title,
        instructions,
        isActive: body.isActive !== false,
      },
      update: {
        zoneCode: typeof body.zoneCode === "string" ? body.zoneCode.trim() || null : null,
        maxParkingMinutes,
        requiresReceiver: Boolean(body.requiresReceiver),
        requiresHeavyUnloadingDetails: Boolean(body.requiresHeavyUnloadingDetails),
        title,
        instructions,
        isActive: body.isActive !== false,
      },
    });
    return Response.json(serialize(row));
  } catch (error) {
    return responseFromError(error, "PUT /api/admin/rx-vehicle-process");
  }
}

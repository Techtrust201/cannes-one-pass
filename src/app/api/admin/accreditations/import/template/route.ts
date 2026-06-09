import { NextRequest } from "next/server";
import { requirePermission, resolveEspaceOrgId } from "@/lib/auth-helpers";
import { buildCsvTemplate } from "@/lib/csv-import";
import prisma from "@/lib/prisma";
import { getDefaultVehicleTypesForScope } from "@/lib/vehicle-type-defaults";

function handleAuthError(error: unknown) {
  if (error instanceof Response)
    return new Response(error.body, {
      status: error.status,
      statusText: error.statusText,
    });
  return new Response("Non autorisé", { status: 401 });
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "CREER", "write");
  } catch (err) {
    return handleAuthError(err);
  }

  // Scope du template par espace : le catalogue de gabarits est propre à chaque
  // organisation. Sans espace, repli sur le catalogue par défaut générique.
  const espace = req.nextUrl.searchParams.get("espace")?.trim() || null;
  const orgId = await resolveEspaceOrgId(espace);
  const activeVehicleTypes = orgId
    ? await prisma.vehicleTypeConfig.findMany({
        where: { isActive: true, organizationId: orgId },
        select: { code: true },
      })
    : [];
  const validVehicleSizes = new Set(
    activeVehicleTypes.length > 0
      ? activeVehicleTypes.map((t) => t.code)
      : getDefaultVehicleTypesForScope(espace).map((t) => t.code)
  );

  const csv = buildCsvTemplate(validVehicleSizes);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="template-accreditations.csv"',
      "Cache-Control": "no-store",
    },
  });
}

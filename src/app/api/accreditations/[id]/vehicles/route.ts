import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { assertAccreditationAccess } from "@/lib/rbac";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  let currentUserId: string | undefined;
  try {
    const session = await requirePermission(req, "LISTE", "write");
    currentUserId = session.user.id;
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const params = await props.params;

  try {
    await assertAccreditationAccess(currentUserId!, params.id);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    const data = await req.json();
    // data doit contenir les champs du véhicule
    const created = await prisma.vehicle.create({
      data: {
        ...data,
        unloading: JSON.stringify(data.unloading),
        accreditationId: params.id,
      },
    });
    return Response.json(created, { status: 201 });
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }
}

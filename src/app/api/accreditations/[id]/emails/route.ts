import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { assertAccreditationAccess } from "@/lib/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let currentUserId: string | undefined;
  try {
    const session = await requirePermission(req, "LISTE", "read");
    currentUserId = session.user.id;
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const { id } = await params;

  try {
    await assertAccreditationAccess(currentUserId!, id);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const history = await prisma.accreditationEmailHistory.findMany({
    where: { accreditationId: id },
    orderBy: { sentAt: "desc" },
    select: { email: true, sentAt: true },
  });

  return Response.json(history);
}

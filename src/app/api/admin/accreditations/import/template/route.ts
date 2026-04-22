import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth-helpers";
import { buildCsvTemplate } from "@/lib/csv-import";

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

  const csv = buildCsvTemplate();
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

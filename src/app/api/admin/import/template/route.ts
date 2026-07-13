import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth-helpers";
import {
  buildTemplate,
  templateFileName,
  type TemplateProfile,
  type TemplateKind,
} from "@/lib/imports/templates";

/**
 * GET /api/admin/import/template?profile=referential|planning&kind=empty|example
 *
 * Renvoie un modele CSV reellement telechargeable (Content-Disposition
 * attachment). Protege par la meme permission que l'import du profil.
 */
export async function GET(req: NextRequest) {
  const profileParam = (req.nextUrl.searchParams.get("profile") ?? "").toLowerCase();
  const kindParam = (req.nextUrl.searchParams.get("kind") ?? "empty").toLowerCase();

  if (profileParam !== "referential" && profileParam !== "planning") {
    return Response.json(
      { ok: false, error: "Parametre 'profile' invalide (referential|planning)." },
      { status: 400 }
    );
  }
  const profile = profileParam as TemplateProfile;
  const kind: TemplateKind = kindParam === "example" ? "example" : "empty";

  const feature = profile === "planning" ? "GESTION_DATES" : "GESTION_ESPACES";
  try {
    await requirePermission(req, feature, "read");
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response("Non autorise", { status: 401 });
  }

  const csv = buildTemplate(profile, kind);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${templateFileName(profile, kind)}"`,
    },
  });
}

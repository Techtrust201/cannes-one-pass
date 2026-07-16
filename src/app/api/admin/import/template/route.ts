import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth-helpers";
import {
  buildTemplate,
  templateFileName,
  type TemplateProfile,
  type TemplateKind,
} from "@/lib/imports/templates";

const VALID_PROFILES: TemplateProfile[] = [
  "referential",
  "planning",
  "access-rules",
  "accreditations",
  "zones",
  "vehicle-types",
  "capacities",
];

/** Feature de protection par profil (identique aux routes d'import/CRUD, aucune Feature inventee). */
const FEATURE_BY_PROFILE: Record<TemplateProfile, "GESTION_ESPACES" | "GESTION_DATES" | "CREER" | "GESTION_ZONES" | "FLUX_VEHICULES"> = {
  referential: "GESTION_ESPACES",
  planning: "GESTION_DATES",
  "access-rules": "GESTION_DATES",
  accreditations: "CREER",
  zones: "GESTION_ZONES",
  "vehicle-types": "FLUX_VEHICULES",
  capacities: "FLUX_VEHICULES",
};

/**
 * GET /api/admin/import/template?profile=<profil>&kind=empty|example
 *
 * Profils : referential | planning | accreditations | zones | vehicle-types | capacities.
 * Renvoie un modele CSV reellement telechargeable (Content-Disposition
 * attachment). Protege par la meme permission que l'import du profil.
 */
export async function GET(req: NextRequest) {
  const profileParam = (req.nextUrl.searchParams.get("profile") ?? "").toLowerCase();
  const kindParam = (req.nextUrl.searchParams.get("kind") ?? "empty").toLowerCase();

  if (!VALID_PROFILES.includes(profileParam as TemplateProfile)) {
    return Response.json(
      { ok: false, error: `Parametre 'profile' invalide (${VALID_PROFILES.join("|")}).` },
      { status: 400 }
    );
  }
  const profile = profileParam as TemplateProfile;
  const kind: TemplateKind = kindParam === "example" ? "example" : "empty";

  const feature = FEATURE_BY_PROFILE[profile];
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

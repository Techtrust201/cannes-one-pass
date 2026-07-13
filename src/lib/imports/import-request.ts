/**
 * Extraction + controle d'acces communs aux routes du Centre d'import
 * (Phase 3). Mutualise l'authentification, le scoping multi-tenant et la
 * lecture du fichier pour eviter toute duplication entre les profils.
 *
 * Scoping (anti-IDOR, coherent avec la Phase 0) :
 *  - `requirePermission` verifie l'authentification + la feature demandee ;
 *  - l'organisation cible doit appartenir au perimetre de l'utilisateur ;
 *  - l'evenement doit appartenir a l'organisation cible.
 *
 * Retourne le contexte pret a parser, ou LEVE une `Response` (401/403/400/413)
 * que la route renvoie telle quelle.
 */

import type { NextRequest } from "next/server";
import type { Feature } from "@prisma/client";
import {
  requirePermission,
  getAccessibleOrganizationIds,
  assertEventBelongsToOrg,
} from "@/lib/auth-helpers";
import { checkUploadGuards } from "./csv";

export interface ImportRequestContext {
  userId: string;
  organizationId: string;
  eventId: string;
  fileName: string;
  /** Type MIME declare par le client (indicatif ; l'extension prime). */
  mimeType: string;
  /** Contenu binaire brut (source de verite : CSV texte OU classeur XLSX). */
  fileBuffer: Uint8Array;
  commit: boolean;
  mode: "FUSION" | "REPLACE";
  /** Chemin de parsing : `canonical` (plat) ou `rx` (adaptateur workbook RX). */
  format: "canonical" | "rx";
}

/**
 * Variante pour les profils dont le modele cible n'a PAS de `eventId`
 * (Zones, Types de vehicules — Phase 5) : l'evenement reste optionnel, et
 * n'est valide contre l'organisation QUE s'il est fourni.
 */
export interface ImportRequestContextOptionalEvent
  extends Omit<ImportRequestContext, "eventId"> {
  eventId: string | null;
}

/**
 * Parse et securise une requete d'import multipart.
 * Champs attendus : `file`, `organizationId`, `eventId` (obligatoire par
 * defaut ; facultatif si `options.requireEvent === false`, pour les profils
 * dont le modele cible n'a pas de `eventId` — ex: Zones, Types de vehicules).
 * Query : `commit=true` (defaut dry-run), `mode=FUSION|REPLACE` (defaut FUSION),
 * `format=canonical|rx` (defaut canonical).
 *
 * IMPORTANT (anti-IDOR) : `organizationId`/`eventId` proviennent du contexte
 * serveur (champ selectionne cote client PUIS valide contre le perimetre de
 * l'utilisateur). Aucune organisation/event n'est jamais lu depuis le CONTENU
 * du fichier importe.
 */
export async function parseImportRequest(
  req: NextRequest,
  feature: Feature
): Promise<ImportRequestContext>;
export async function parseImportRequest(
  req: NextRequest,
  feature: Feature,
  options: { requireEvent: false }
): Promise<ImportRequestContextOptionalEvent>;
export async function parseImportRequest(
  req: NextRequest,
  feature: Feature,
  options?: { requireEvent?: boolean }
): Promise<ImportRequestContext | ImportRequestContextOptionalEvent> {
  const requireEvent = options?.requireEvent ?? true;
  const session = await requirePermission(req, feature, "write");
  const userId = session.user.id;

  const form = await req.formData();
  const file = form.get("file");
  const organizationId = String(form.get("organizationId") ?? "").trim();
  const eventIdRaw = String(form.get("eventId") ?? "").trim();

  if (!organizationId) {
    throw new Response("Champ 'organizationId' manquant", { status: 400 });
  }
  if (requireEvent && !eventIdRaw) {
    throw new Response("Champ 'eventId' manquant", { status: 400 });
  }
  if (!(file instanceof File)) {
    throw new Response("Champ 'file' manquant", { status: 400 });
  }

  // Scoping multi-tenant : organisation accessible ?
  const accessibleOrgs = await getAccessibleOrganizationIds(userId);
  if (accessibleOrgs !== "ALL" && !accessibleOrgs.includes(organizationId)) {
    throw new Response("Organisation hors de votre perimetre", { status: 403 });
  }
  // Coherence event <-> organisation (leve une Response 400 si incoherent).
  // Si l'event est facultatif pour ce profil et absent, aucune validation
  // n'est faite (rien a valider) — jamais de resolution silencieuse.
  if (eventIdRaw) {
    await assertEventBelongsToOrg(eventIdRaw, organizationId);
  }

  // Gardes fichier (taille / MIME / vide).
  const guardErrors = checkUploadGuards({ size: file.size, type: file.type, name: file.name });
  if (guardErrors.length > 0) {
    const tooLarge = guardErrors.some((e) => e.code === "FILE_TOO_LARGE");
    throw Response.json(
      { ok: false, errors: guardErrors },
      { status: tooLarge ? 413 : 400 }
    );
  }

  const fileBuffer = new Uint8Array(await file.arrayBuffer());
  const commit = req.nextUrl.searchParams.get("commit") === "true";
  const modeParam = (req.nextUrl.searchParams.get("mode") ?? "FUSION").toUpperCase();
  const mode = modeParam === "REPLACE" ? "REPLACE" : "FUSION";
  const formatParam = (req.nextUrl.searchParams.get("format") ?? "canonical").toLowerCase();
  const format = formatParam === "rx" ? "rx" : "canonical";

  return {
    userId,
    organizationId,
    eventId: requireEvent ? eventIdRaw : eventIdRaw || null,
    fileName: file.name,
    mimeType: file.type,
    fileBuffer,
    commit,
    mode,
    format,
  };
}

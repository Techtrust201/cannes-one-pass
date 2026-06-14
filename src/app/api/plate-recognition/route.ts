import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth-helpers";
import { getPlateServerConfig } from "@/lib/plate-recognition/config";
import { recognizeWithCodeProject } from "@/lib/plate-recognition/providers/codeproject";
import type {
  PlateRecognitionResult,
  PlateRecognitionPublicConfig,
} from "@/lib/plate-recognition/types";

/**
 * Reconnaissance de plaque (OCR/ALPR) — abstraction multi-provider.
 *
 *  - `GET`  : renvoie la config publique (provider + minConfidence) pour que le
 *             frontend sache router l'appel. Aucune clé exposée.
 *  - `POST` : reçoit une image (multipart `image`) et exécute le provider
 *             serveur configuré (codeproject_ai). Pour `tesseract`, la
 *             reconnaissance se fait côté navigateur (l'image n'est pas envoyée).
 *
 * Garanties : non bloquant, jamais d'exception propagée, aucune image stockée,
 * logs limités au provider / confiance / succès / erreurs.
 *
 * Gated par `PLAQUE read` (même périmètre que l'onglet Plaque du scanner).
 */

function handleAuthError(error: unknown): Response {
  if (error instanceof Response) {
    return new Response(error.body, {
      status: error.status,
      statusText: error.statusText,
    });
  }
  return new Response("Non autorisé", { status: 401 });
}

/**
 * Masque une plaque pour les logs (ex: GG542CM → GG***M). En production on ne
 * journalise jamais la plaque complète ; elle n'apparaît en clair qu'en debug
 * local (NODE_ENV !== "production").
 */
function maskPlate(plate: string | null): string | null {
  if (!plate) return plate;
  if (plate.length <= 3) return "***";
  return plate.slice(0, 2) + "*".repeat(plate.length - 3) + plate.slice(-1);
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "PLAQUE", "read");
  } catch (error) {
    return handleAuthError(error);
  }

  const cfg = getPlateServerConfig();
  const publicCfg: PlateRecognitionPublicConfig = {
    provider: cfg.provider,
    minConfidence: cfg.minConfidence,
  };
  return Response.json(publicCfg);
}

export async function POST(req: NextRequest) {
  try {
    await requirePermission(req, "PLAQUE", "read");
  } catch (error) {
    return handleAuthError(error);
  }

  const cfg = getPlateServerConfig();

  if (cfg.provider === "disabled") {
    return Response.json({
      success: false,
      plate: null,
      normalizedPlate: null,
      confidence: null,
      provider: "disabled",
      message: "Reconnaissance automatique désactivée.",
    } satisfies PlateRecognitionResult);
  }

  // Tesseract s'exécute côté navigateur (gratuit, image non transmise).
  if (cfg.provider === "tesseract") {
    return Response.json({
      success: false,
      plate: null,
      normalizedPlate: null,
      confidence: null,
      provider: "tesseract",
      message: "Reconnaissance locale (navigateur).",
    } satisfies PlateRecognitionResult);
  }

  // Provider serveur : codeproject_ai
  let image: Blob | null = null;
  try {
    const form = await req.formData();
    const file = form.get("image");
    if (file instanceof Blob) image = file;
  } catch {
    /* corps invalide */
  }

  if (!image) {
    return Response.json({
      success: false,
      plate: null,
      normalizedPlate: null,
      confidence: null,
      provider: "codeproject_ai",
      message: "Image manquante.",
    } satisfies PlateRecognitionResult);
  }

  const result = await recognizeWithCodeProject(image, cfg);

  // Log minimal (jamais d'image) : provider, succès, confiance, message.
  // La plaque n'est journalisée en clair qu'en debug local, sinon masquée.
  const isDebug = process.env.NODE_ENV !== "production";
  console.log("[plate-recognition]", {
    provider: result.provider,
    success: result.success,
    confidence: result.confidence,
    plate: isDebug ? result.normalizedPlate : maskPlate(result.normalizedPlate),
    message: result.message,
  });

  return Response.json(result);
}

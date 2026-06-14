/**
 * Provider self-hosted optionnel : CodeProject.AI ALPR (gratuit, open-source).
 * Réservé au serveur. Ne lève jamais : en cas d'absence de config, de timeout
 * ou d'erreur, renvoie un résultat `success:false` → fallback manuel immédiat
 * côté UI. N'enregistre aucune image.
 *
 * IMPORTANT — À AJUSTER SELON L'INSTANCE RÉELLE :
 *  - Le chemin `/v1/vision/alpr` et le format de réponse `{ predictions: [...] }`
 *    correspondent au module ALPR standard de CodeProject.AI. Selon la version
 *    installée, le module activé ou un éventuel reverse-proxy, le chemin ou les
 *    champs (`plate`, `label`, `confidence`) peuvent différer.
 *  - C'est le SEUL endroit à modifier pour brancher une autre instance/format ;
 *    le reste de l'abstraction (route, UI, types) reste inchangé.
 *  - La confiance attendue est sur l'échelle 0..1 (comme `PLATE_MIN_CONFIDENCE`).
 */
import type { PlateRecognitionResult } from "../types";
import type { PlateServerConfig } from "../config";
import { scorePlateCandidate } from "../plate-format";

const TIMEOUT_MS = 4000;

function fail(message: string): PlateRecognitionResult {
  return {
    success: false,
    plate: null,
    normalizedPlate: null,
    confidence: null,
    provider: "codeproject_ai",
    message,
  };
}

interface AlprPrediction {
  plate?: string;
  label?: string;
  confidence?: number;
}

/** Reconnaît une plaque via CodeProject.AI ALPR. Image transmise, jamais stockée. */
export async function recognizeWithCodeProject(
  image: Blob,
  config: PlateServerConfig
): Promise<PlateRecognitionResult> {
  if (!config.codeProjectUrl) {
    return fail("Lecteur de plaque non configuré.");
  }

  const endpoint =
    config.codeProjectUrl.replace(/\/+$/, "") + "/v1/vision/alpr";
  const form = new FormData();
  form.append("image", image, "plate.jpg");
  if (config.codeProjectApiKey) {
    // Certaines instances acceptent la clé via le formulaire ; jamais loggée.
    form.append("api_key", config.codeProjectApiKey);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) return fail("Lecteur de plaque indisponible.");

    const data = (await res.json()) as {
      success?: boolean;
      predictions?: AlprPrediction[];
    };
    const preds = Array.isArray(data?.predictions) ? data.predictions : [];
    if (preds.length === 0) return fail("Aucune plaque détectée.");

    // Meilleure prédiction par confiance (CodeProject.AI renvoie 0..1).
    const best = preds.reduce((a, b) =>
      (b.confidence ?? 0) > (a.confidence ?? 0) ? b : a
    );
    const confidence =
      typeof best.confidence === "number" ? best.confidence : 0;
    const { normalized } = scorePlateCandidate(
      String(best.plate ?? best.label ?? "")
    );

    if (!normalized || confidence < config.minConfidence) {
      return {
        success: false,
        plate: best.plate ?? null,
        normalizedPlate: normalized,
        confidence,
        provider: "codeproject_ai",
        message: "Lecture incertaine.",
      };
    }

    return {
      success: true,
      plate: best.plate ?? normalized,
      normalizedPlate: normalized,
      confidence,
      provider: "codeproject_ai",
    };
  } catch {
    return fail("Lecteur de plaque injoignable.");
  } finally {
    clearTimeout(timer);
  }
}

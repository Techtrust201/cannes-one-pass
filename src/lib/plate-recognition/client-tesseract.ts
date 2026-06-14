/**
 * Provider local gratuit : Tesseract.js exécuté DANS LE NAVIGATEUR.
 * Avantages : aucun coût serveur, l'image ne quitte jamais l'appareil (privé).
 *
 * Court terme : prétraitement (niveaux de gris + binarisation + upscale) et
 * validation de format pour améliorer la fiabilité. Tesseract.js est importé en
 * lazy/dynamic import → jamais dans le bundle initial.
 */
import { scorePlateCandidate } from "@/lib/plate-recognition/plate-format";
import type { PlateRecognitionResult } from "@/lib/plate-recognition/types";

const PLATE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Prétraitement simple : upscale x2, niveaux de gris, binarisation par seuil.
 * Améliore nettement l'OCR de petits caractères sans dépendances lourdes.
 */
function preprocess(source: HTMLCanvasElement): HTMLCanvasElement {
  const scale = 2;
  const out = document.createElement("canvas");
  out.width = source.width * scale;
  out.height = source.height * scale;
  const ctx = out.getContext("2d");
  if (!ctx) return source;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, out.width, out.height);

  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const bin = gray > 110 ? 255 : 0; // seuil fixe : suffisant pour une plaque
    d[i] = d[i + 1] = d[i + 2] = bin;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/**
 * Reconnaît une plaque à partir d'un canvas (crop déjà centré sur la plaque).
 * Ne lève jamais : renvoie toujours un résultat normalisé.
 */
export async function recognizePlateClient(
  source: HTMLCanvasElement,
  minConfidence: number
): Promise<PlateRecognitionResult> {
  try {
    const pre = preprocess(source);
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    await worker.setParameters({ tessedit_char_whitelist: PLATE_CHARS });
    const { data } = await worker.recognize(pre);
    await worker.terminate();

    const confidence =
      typeof data.confidence === "number" ? data.confidence / 100 : 0;
    const { normalized, plausible } = scorePlateCandidate(data.text ?? "");

    if (!normalized) {
      return {
        success: false,
        plate: null,
        normalizedPlate: null,
        confidence,
        provider: "tesseract",
        message: "Aucune plaque lisible.",
      };
    }

    // Succès si le format est plausible OU si la confiance dépasse le seuil.
    const success = plausible || confidence >= minConfidence;
    return {
      success,
      plate: normalized,
      normalizedPlate: normalized,
      confidence,
      provider: "tesseract",
      message: success ? undefined : "Lecture incertaine.",
    };
  } catch {
    return {
      success: false,
      plate: null,
      normalizedPlate: null,
      confidence: null,
      provider: "tesseract",
      message: "OCR indisponible.",
    };
  }
}

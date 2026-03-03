import { NextRequest } from "next/server";
import translate from "google-translate-api-x";
import { requirePermission } from "@/lib/auth-helpers";

const SUPPORTED_LANGS = new Set([
  "fr", "en", "pl", "cs", "lt", "de", "tr", "es", "pt", "it", "ru", "auto",
]);

const cache = new Map<string, { text: string; ts: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1h
const MAX_CACHE = 5000;

function cacheKey(text: string, from: string, to: string) {
  return `${from}:${to}:${text}`;
}

function pruneCache() {
  if (cache.size <= MAX_CACHE) return;
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now - v.ts > CACHE_TTL) cache.delete(k);
  }
  if (cache.size > MAX_CACHE) {
    const entries = [...cache.entries()];
    entries.sort((a, b) => a[1].ts - b[1].ts);
    const toDelete = entries.slice(0, entries.length - MAX_CACHE);
    for (const [k] of toDelete) cache.delete(k);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePermission(req, "LISTE", "read");
  } catch {
    return new Response("Non autorisé", { status: 401 });
  }

  try {
    const { text, from = "auto", to = "fr" } = await req.json();

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return Response.json({ error: "text is required" }, { status: 400 });
    }
    if (text.length > 2000) {
      return Response.json({ error: "text too long (max 2000)" }, { status: 400 });
    }
    if (!SUPPORTED_LANGS.has(from) || !SUPPORTED_LANGS.has(to)) {
      return Response.json({ error: "unsupported language" }, { status: 400 });
    }
    if (from === to) {
      return Response.json({ translatedText: text });
    }

    const key = cacheKey(text.trim(), from, to);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return Response.json({ translatedText: cached.text, cached: true });
    }

    const result = await translate(text.trim(), { from, to });
    const translatedText = result.text;

    pruneCache();
    cache.set(key, { text: translatedText, ts: Date.now() });

    return Response.json({
      translatedText,
      detectedLang: result.from?.language?.iso ?? from,
    });
  } catch (err) {
    console.error("[translate] Error:", err);
    return Response.json({ error: "Translation failed" }, { status: 500 });
  }
}

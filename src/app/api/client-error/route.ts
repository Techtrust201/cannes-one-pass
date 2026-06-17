import { NextRequest } from "next/server";

/**
 * Journalisation des exceptions client non catchées du parcours public.
 *
 * Appelée par les ErrorBoundary (`error.tsx` / `global-error.tsx`). Best-effort :
 * ne renvoie jamais d'erreur exploitable côté client et n'impacte pas l'UX.
 * Aucune authentification (le crash peut survenir avant toute session) ; le
 * payload est borné pour éviter tout abus.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      message?: unknown;
      stack?: unknown;
      url?: unknown;
      digest?: unknown;
    };

    const clip = (v: unknown, max: number): string =>
      typeof v === "string" ? v.slice(0, max) : "";

    const entry = {
      level: "client-error",
      timestamp: new Date().toISOString(),
      url: clip(body.url, 500),
      message: clip(body.message, 1000),
      stack: clip(body.stack, 4000),
      digest: clip(body.digest, 200),
      userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? "",
    };

    console.error("[client-error]", JSON.stringify(entry));
  } catch {
    // best-effort : on n'échoue jamais bruyamment.
  }

  // 204 systématique : le client n'a rien à traiter.
  return new Response(null, { status: 204 });
}

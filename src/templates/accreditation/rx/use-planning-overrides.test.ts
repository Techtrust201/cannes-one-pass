import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchOneCategory } from "./use-planning-overrides";
import type { PlanningResolution } from "@/lib/logistics-planning";

/**
 * Phase 6C-A (F3) — Tests ciblés sur `fetchOneCategory`, la seule partie de
 * `useRxPlanningOverrides` qui touche le réseau. Le reste de la décision
 * (DISABLED/TRANSITION/STRICT) est couvert par les tests purs de
 * `buildPlanningOverridesFromOutcomes` (planning-bridge.test.ts) : ce fichier
 * ne fait donc que vérifier la traduction fetch → `CategoryFetchOutcome`.
 *
 * Note : ce projet exécute Vitest avec l'environnement `node` (pas de jsdom /
 * `@testing-library/react`) — le hook lui-même (état/`useEffect`) n'est donc
 * pas exercé ici via un rendu React ; sa logique métier est déléguée à des
 * fonctions pures déjà testées (`buildPlanningOverridesFromOutcomes`).
 */

function dbResolution(): PlanningResolution {
  return {
    source: "DB",
    mode: "STRICT",
    phase: "MONTAGE",
    categoryCode: "PONTON_PRIVATIF",
    scope: "SPACE",
    scopeKey: "SPACE:POWER",
    slots: { "2026-09-20": "07:00-09:00" },
    rule: { scope: "SPACE", scopeKey: "SPACE:POWER", categoryCode: "PONTON_PRIVATIF", dates: ["2026-09-20"] },
    error: null,
  };
}

function notFoundResolution(): PlanningResolution {
  return {
    source: "NONE",
    mode: "STRICT",
    phase: "MONTAGE",
    categoryCode: "PONTON_PRIVATIF",
    scope: null,
    scopeKey: null,
    slots: {},
    rule: null,
    error: { code: "PLANNING_NOT_FOUND", message: "Aucune règle trouvée." },
  };
}

const qs = new URLSearchParams({ orgSlug: "cannes", eventSlug: "yachting-2026" });

describe("fetchOneCategory", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renvoie la résolution DB sans erreur quand le serveur répond 200 avec source=DB", async () => {
    const resolution = dbResolution();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, resolution }) })
    );
    const outcome = await fetchOneCategory("ponton-privatif", "PONTON_PRIVATIF", qs, new AbortController().signal);
    expect(outcome).toEqual({ catId: "ponton-privatif", resolution, fetchError: null });
  });

  it("renvoie fetchError NOT_FOUND (mais conserve la résolution) quand le serveur confirme l'absence de règle", async () => {
    const resolution = notFoundResolution();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, resolution }) })
    );
    const outcome = await fetchOneCategory("ponton-privatif", "PONTON_PRIVATIF", qs, new AbortController().signal);
    expect(outcome).toEqual({
      catId: "ponton-privatif",
      resolution,
      fetchError: { kind: "NOT_FOUND", message: "Aucune règle trouvée." },
    });
  });

  it("renvoie fetchError HTTP quand la réponse HTTP n'est pas ok (jamais confondu avec une absence de règle)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    const outcome = await fetchOneCategory("ponton-privatif", "PONTON_PRIVATIF", qs, new AbortController().signal);
    expect(outcome).toEqual({
      catId: "ponton-privatif",
      resolution: null,
      fetchError: { kind: "HTTP", message: "HTTP 500" },
    });
  });

  it("renvoie fetchError HTTP quand le corps de la réponse est invalide (ok=false ou resolution manquante)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: false }) }));
    const outcome = await fetchOneCategory("ponton-privatif", "PONTON_PRIVATIF", qs, new AbortController().signal);
    expect(outcome).toEqual({
      catId: "ponton-privatif",
      resolution: null,
      fetchError: { kind: "HTTP", message: "Réponse invalide du serveur." },
    });
  });

  it("renvoie fetchError NETWORK quand fetch rejette (erreur réseau)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));
    const outcome = await fetchOneCategory("ponton-privatif", "PONTON_PRIVATIF", qs, new AbortController().signal);
    expect(outcome).toEqual({
      catId: "ponton-privatif",
      resolution: null,
      fetchError: { kind: "NETWORK", message: "Failed to fetch" },
    });
  });

  it("renvoie 'ABORTED' quand la requête est annulée (AbortController) — une ancienne réponse ne doit jamais écraser la sélection courante", async () => {
    const abortError = new Error("The operation was aborted.");
    abortError.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));
    const outcome = await fetchOneCategory("ponton-privatif", "PONTON_PRIVATIF", qs, new AbortController().signal);
    expect(outcome).toBe("ABORTED");
  });
});

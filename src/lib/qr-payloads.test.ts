import { describe, it, expect } from "vitest";
import {
  trackingQrPayload,
  accessQrPayload,
  idQrPayload,
} from "./qr-payloads";
import { parseQrPayload } from "./qr-scan-parse";

const ID = "47d2ee4a-bf94-4b11-9f7c-233e88e9fcd2";
const TOKEN = "ojX6j7HsWkCLZBDD";
const BASES = [
  "https://cannes-one-pass.app",
  "https://cannes-one-pass-r2.vercel.app",
  "http://localhost:3000",
  "https://x.app/", // slash final toléré
];

describe("payloads QR ↔ parser scanner (round-trip)", () => {
  it("QR de suivi (demande publique) est toujours reconnu comme token", () => {
    for (const base of BASES) {
      const payload = trackingQrPayload(base, TOKEN);
      expect(payload).toContain(`/suivi/${TOKEN}`);
      expect(payload).not.toContain("//suivi"); // pas de double slash
      expect(parseQrPayload(payload)).toEqual({ token: TOKEN });
    }
  });

  it("QR officiel (accès) est toujours reconnu comme id, quelle que soit la phase", () => {
    for (const base of BASES) {
      for (const phase of [undefined, "livraison", "reprise"] as const) {
        const payload = accessQrPayload(base, ID, phase);
        expect(parseQrPayload(payload)).toEqual({ id: ID });
      }
    }
  });

  it("QR inline e-mail (JSON id) est toujours reconnu comme id", () => {
    const payload = idQrPayload(ID);
    expect(payload).toBe(`{"id":"${ID}"}`);
    expect(parseQrPayload(payload)).toEqual({ id: ID });
  });

  it("invariant : aucun payload émis ne renvoie null au parser", () => {
    const payloads = [
      trackingQrPayload(BASES[0], TOKEN),
      accessQrPayload(BASES[0], ID),
      accessQrPayload(BASES[0], ID, "livraison"),
      accessQrPayload(BASES[0], ID, "reprise"),
      idQrPayload(ID),
    ];
    for (const p of payloads) {
      expect(parseQrPayload(p)).not.toBeNull();
    }
  });
});

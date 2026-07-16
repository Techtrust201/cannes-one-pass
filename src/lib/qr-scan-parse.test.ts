import { describe, it, expect } from "vitest";
import { parseQrPayload } from "./qr-scan-parse";

const ID = "47d2ee4a-bf94-4b11-9f7c-233e88e9fcd2";
const TOKEN = "ojX6j7HsWkCLZBDD";

describe("parseQrPayload", () => {
  it("reconnaît le JSON { id } (e-mail de création / legacy)", () => {
    expect(parseQrPayload(JSON.stringify({ id: ID }))).toEqual({ id: ID });
    expect(parseQrPayload(`{"id":"${ID}"}`)).toEqual({ id: ID });
  });

  it("reconnaît le JSON { token } / { publicToken } / { reference }", () => {
    expect(parseQrPayload(JSON.stringify({ token: TOKEN }))).toEqual({ token: TOKEN });
    expect(parseQrPayload(JSON.stringify({ publicToken: TOKEN }))).toEqual({ token: TOKEN });
    expect(parseQrPayload(JSON.stringify({ reference: TOKEN }))).toEqual({ token: TOKEN });
  });

  it("reconnaît l'URL officielle /logisticien/{id} (PDF validé) + phase/vehicleId", () => {
    expect(
      parseQrPayload(`https://cannes-one-pass.app/logisticien/${ID}?phase=livraison`)
    ).toEqual({ id: ID, phase: "livraison" });
    expect(
      parseQrPayload(`https://x.app/logisticien/${ID}?phase=reprise&vehicleId=12`)
    ).toEqual({ id: ID, phase: "reprise", vehicleId: 12 });
    expect(parseQrPayload(`https://x.app/logisticien/${ID}`)).toEqual({ id: ID });
  });

  it("reconnaît le JSON { id, vehicleId, phase }", () => {
    expect(
      parseQrPayload(JSON.stringify({ id: ID, vehicleId: 5, phase: "DEMONTAGE" }))
    ).toEqual({ id: ID, vehicleId: 5, phase: "reprise" });
  });

  it("reconnaît l'URL publique /suivi/{token} (PDF demande non validée)", () => {
    expect(parseQrPayload(`https://cannes-one-pass.app/suivi/${TOKEN}`)).toEqual({
      token: TOKEN,
    });
    expect(parseQrPayload(`/suivi/${TOKEN}`)).toEqual({ token: TOKEN });
  });

  it("ne confond pas /logisticien/scanner avec un id", () => {
    expect(parseQrPayload("https://x.app/logisticien/scanner?tab=qr")).toBeNull();
  });

  it("reconnaît une URL avec query ?id= ou ?token=/?ref=", () => {
    expect(parseQrPayload(`https://x.app/p?id=${ID}`)).toEqual({ id: ID });
    expect(parseQrPayload(`https://x.app/p?token=${TOKEN}`)).toEqual({ token: TOKEN });
    expect(parseQrPayload(`https://x.app/p?ref=${TOKEN}`)).toEqual({ token: TOKEN });
  });

  it("reconnaît une valeur brute : UUID -> id, jeton court -> token", () => {
    expect(parseQrPayload(ID)).toEqual({ id: ID });
    expect(parseQrPayload(TOKEN)).toEqual({ token: TOKEN });
    expect(parseQrPayload(`  ${ID}  `)).toEqual({ id: ID });
  });

  it("priorise l'id sur le token dans un JSON contenant les deux", () => {
    expect(parseQrPayload(JSON.stringify({ id: ID, token: TOKEN }))).toEqual({ id: ID });
  });

  it("décode les segments URL encodés", () => {
    expect(parseQrPayload(`https://x.app/suivi/${encodeURIComponent("a/b")}`)).toEqual({
      token: "a/b",
    });
  });

  it("renvoie null pour les entrées vides ou inexploitables", () => {
    expect(parseQrPayload("")).toBeNull();
    expect(parseQrPayload("   ")).toBeNull();
    expect(parseQrPayload(null)).toBeNull();
    expect(parseQrPayload(undefined)).toBeNull();
    expect(parseQrPayload("https://example.com/")).toBeNull();
    expect(parseQrPayload("texte avec espaces")).toBeNull();
  });
});

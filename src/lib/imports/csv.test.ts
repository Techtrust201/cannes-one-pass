import { describe, it, expect } from "vitest";
import {
  checkUploadGuards,
  checkRowCountGuard,
  normalizeHeaderKey,
  detectDelimiter,
  parseCsv,
  resolveHeader,
  parseFlexibleDate,
  parseTime,
  compareTimes,
  splitMultiValues,
  enumerateDates,
  IMPORT_LIMITS,
} from "./csv";

describe("checkUploadGuards", () => {
  it("accepte un CSV de taille raisonnable (aucune erreur)", () => {
    expect(checkUploadGuards({ size: 1024, type: "text/csv", name: "x.csv" })).toEqual([]);
  });

  it("accepte un MIME vide si l'extension est .csv", () => {
    expect(checkUploadGuards({ size: 10, type: "", name: "referentiel.csv" })).toEqual([]);
  });

  it("rejette un fichier vide", () => {
    const errs = checkUploadGuards({ size: 0, type: "text/csv", name: "x.csv" });
    expect(errs.some((e) => e.code === "EMPTY_FILE")).toBe(true);
  });

  it("rejette un fichier trop volumineux", () => {
    const errs = checkUploadGuards({
      size: IMPORT_LIMITS.maxBytes + 1,
      type: "text/csv",
      name: "x.csv",
    });
    expect(errs.some((e) => e.code === "FILE_TOO_LARGE")).toBe(true);
  });

  it("rejette un MIME non supporte sans extension .csv", () => {
    const errs = checkUploadGuards({ size: 10, type: "application/pdf", name: "x.pdf" });
    expect(errs.some((e) => e.code === "UNSUPPORTED_MIME")).toBe(true);
  });
});

describe("checkRowCountGuard", () => {
  it("null sous la limite", () => {
    expect(checkRowCountGuard(10)).toBeNull();
  });
  it("erreur au-dela de la limite", () => {
    expect(checkRowCountGuard(IMPORT_LIMITS.maxRows + 1)?.code).toBe("TOO_MANY_ROWS");
  });
});

describe("normalizeHeaderKey", () => {
  it("trim + majuscules + accents retires + espaces collapses", () => {
    expect(normalizeHeaderKey("  Zone  T-T ")).toBe("ZONE T-T");
    expect(normalizeHeaderKey("Catégorie")).toBe("CATEGORIE");
    expect(normalizeHeaderKey("NUM-FLOT")).toBe("NUM-FLOT");
  });
  it("retire le BOM UTF-8 en tete", () => {
    expect(normalizeHeaderKey("\uFEFFport")).toBe("PORT");
  });
});

describe("detectDelimiter", () => {
  it("virgule par defaut", () => {
    expect(detectDelimiter("a,b,c")).toBe(",");
  });
  it("point-virgule si strictement plus frequent", () => {
    expect(detectDelimiter("a;b;c")).toBe(";");
  });
  it("virgule en cas d'egalite", () => {
    expect(detectDelimiter("a,b;c")).toBe(",");
  });
});

describe("parseCsv", () => {
  it("parse un CSV virgule avec entetes normalisees et valeurs trimmees", () => {
    const csv = "PLAN, PORT ,ZONE T-T\nSunseeker, PORT CANTO , POWER\n";
    const res = parseCsv(csv);
    expect(res.delimiter).toBe(",");
    expect(res.headers).toEqual(["PLAN", "PORT", "ZONE T-T"]);
    expect(res.records).toEqual([{ PLAN: "Sunseeker", PORT: "PORT CANTO", "ZONE T-T": "POWER" }]);
  });

  it("gere le BOM et l'auto-detection point-virgule", () => {
    const csv = "\uFEFFplan;port\nAcme;Vieux Port\n";
    const res = parseCsv(csv);
    expect(res.delimiter).toBe(";");
    expect(res.headers).toEqual(["PLAN", "PORT"]);
    expect(res.records[0]).toEqual({ PLAN: "Acme", PORT: "Vieux Port" });
  });

  it("tolere des lignes avec moins de colonnes que l'entete", () => {
    const csv = "a,b,c\n1,2\n";
    const res = parseCsv(csv);
    expect(res.records[0]).toEqual({ A: "1", B: "2", C: "" });
  });

  it("retourne des structures vides pour un contenu vide", () => {
    const res = parseCsv("");
    expect(res.records).toEqual([]);
    expect(res.headers).toEqual([]);
  });
});

describe("resolveHeader", () => {
  it("retourne le premier alias present", () => {
    const headers = ["PLAN", "PORT", "ZONE T-T"];
    expect(resolveHeader(headers, ["SOCIETE", "PLAN", "NAME"])).toBe("PLAN");
    expect(resolveHeader(headers, ["SECTEUR", "ZONE T-T"])).toBe("ZONE T-T");
  });
  it("null si aucun alias present", () => {
    expect(resolveHeader(["A"], ["B", "C"])).toBeNull();
  });
});

describe("parseFlexibleDate", () => {
  it("accepte ISO YYYY-MM-DD", () => {
    expect(parseFlexibleDate("2026-09-04")).toBe("2026-09-04");
  });
  it("accepte FR DD/MM/YYYY et normalise en ISO", () => {
    expect(parseFlexibleDate("04/09/2026")).toBe("2026-09-04");
    expect(parseFlexibleDate("4/9/2026")).toBe("2026-09-04");
    expect(parseFlexibleDate("04.09.2026")).toBe("2026-09-04");
    expect(parseFlexibleDate("04-09-2026")).toBe("2026-09-04");
  });
  it("rejette une date inexistante", () => {
    expect(parseFlexibleDate("31/02/2026")).toBeNull();
    expect(parseFlexibleDate("2026-02-31")).toBeNull();
  });
  it("rejette un format inconnu ou vide", () => {
    expect(parseFlexibleDate("septembre")).toBeNull();
    expect(parseFlexibleDate("")).toBeNull();
    expect(parseFlexibleDate(null)).toBeNull();
  });
});

describe("parseTime", () => {
  it("normalise en HH:MM", () => {
    expect(parseTime("8:30")).toBe("08:30");
    expect(parseTime("08:30")).toBe("08:30");
    expect(parseTime("8h30")).toBe("08:30");
    expect(parseTime("8h")).toBe("08:00");
    expect(parseTime("08:30:00")).toBe("08:30");
  });
  it("rejette une heure invalide", () => {
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("08:60")).toBeNull();
    expect(parseTime("abc")).toBeNull();
    expect(parseTime("")).toBeNull();
  });
});

describe("compareTimes", () => {
  it("ordonne HH:MM lexicographiquement (equivalent numerique)", () => {
    expect(compareTimes("08:00", "09:00") < 0).toBe(true);
    expect(compareTimes("09:00", "08:30") > 0).toBe(true);
    expect(compareTimes("08:00", "08:00")).toBe(0);
  });
});

describe("splitMultiValues", () => {
  it("split sur / et trim, ignore les vides", () => {
    expect(splitMultiValues("PAN 023 / PAN 024")).toEqual(["PAN 023", "PAN 024"]);
    expect(splitMultiValues(" A // B / ")).toEqual(["A", "B"]);
    expect(splitMultiValues("SEUL")).toEqual(["SEUL"]);
    expect(splitMultiValues("")).toEqual([]);
    expect(splitMultiValues(null)).toEqual([]);
  });
});

describe("enumerateDates", () => {
  it("une date seule renvoie un element", () => {
    expect(enumerateDates("2026-09-04", null)).toEqual(["2026-09-04"]);
    expect(enumerateDates("2026-09-04", "")).toEqual(["2026-09-04"]);
  });
  it("decoupe une plage en jours inclus", () => {
    expect(enumerateDates("2026-09-04", "2026-09-06")).toEqual([
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
  });
  it("null si fin avant debut", () => {
    expect(enumerateDates("2026-09-06", "2026-09-04")).toBeNull();
  });
  it("null si la plage depasse maxDays", () => {
    expect(enumerateDates("2026-01-01", "2026-12-31", 5)).toBeNull();
  });
});

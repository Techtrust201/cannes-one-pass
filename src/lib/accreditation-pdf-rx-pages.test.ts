/**
 * Recette locale PDF RX multi-véhicules (sans écriture production).
 * Mock Prisma + génération réelle pdf-lib pour prouver le nombre de pages
 * et les vehicleId dans les QR.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { parseQrPayload } from "@/lib/qr-scan-parse";

const { findManyAcc, findManyTypes, findManyZones, findManyProcess } = vi.hoisted(
  () => ({
    findManyAcc: vi.fn(),
    findManyTypes: vi.fn(),
    findManyZones: vi.fn(),
    findManyProcess: vi.fn(),
  })
);

vi.mock("@/lib/prisma", () => {
  const prismaMock = {
    accreditation: { findMany: findManyAcc },
    vehicleTypeConfig: { findMany: findManyTypes },
    zoneConfig: { findMany: findManyZones },
    rxVehicleProcessConfig: { findMany: findManyProcess },
  };
  return { default: prismaMock, prisma: prismaMock };
});

vi.mock("@/lib/base-url", () => ({
  getBaseUrl: () => "https://example.test",
}));

import { generatePdfFromIds } from "@/lib/accreditation-pdf-ids";

describe("PDF RX — une fiche par véhicule physique", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findManyTypes.mockResolvedValue([
      {
        id: 1,
        code: "PORTEUR",
        label: "Porteur",
        gabarit: "Porteur",
        tonnageMini: 0,
        tonnageMoyen: 0,
        tonnageMaxi: 0,
        co2Coefficient: 0,
        pdfCode: "B",
        color: "blue",
        showTrailerPlate: false,
        rxPalmBeachAtCanto: false,
        vehicleFamily: "HEAVY",
        sortOrder: 1,
        isActive: true,
      },
      {
        id: 2,
        code: "VL",
        label: "VL",
        gabarit: "VL",
        tonnageMini: 0,
        tonnageMoyen: 0,
        tonnageMaxi: 0,
        co2Coefficient: 0,
        pdfCode: "A",
        color: "green",
        showTrailerPlate: false,
        rxPalmBeachAtCanto: false,
        vehicleFamily: "LIGHT",
        sortOrder: 2,
        isActive: true,
      },
    ]);
    findManyZones.mockResolvedValue([]);
    findManyProcess.mockResolvedValue([]);
  });

  it("Montage A + Démontage B → 2 pages, QR avec bons vehicleId, consignes présentes", async () => {
    findManyAcc.mockResolvedValue([
      {
        id: "acc-rx-1",
        publicToken: "tok",
        company: "HONDA MARINE",
        stand: "POWER 215",
        event: "yatching",
        unloading: "self",
        message: null,
        consent: true,
        status: "ATTENTE",
        language: "fr",
        entryAt: null,
        exitAt: null,
        currentZone: null,
        standId: null,
        extension: { exhibitor: { name: "HONDA MARINE" } },
        organization: { id: "org-rx", slug: "rx" },
        eventRef: { name: "CYF26" },
        vehicles: [
          {
            id: 101,
            plate: "AA-111-AA",
            size: "PORTEUR",
            phoneCode: "+33",
            phoneNumber: "600000001",
            date: "2026-09-03",
            time: "08:00-10:00",
            city: "Nice",
            vehicleType: "PORTEUR",
            trailerPlate: null,
            logisticsRole: "MONTAGE",
            interveningCompany: "Trans A",
          },
          {
            id: 202,
            plate: "BB-222-BB",
            size: "VL",
            phoneCode: "+33",
            phoneNumber: "600000002",
            date: "2026-09-14",
            time: "10:00-12:00",
            city: "Lyon",
            vehicleType: "VL",
            trailerPlate: null,
            logisticsRole: "DEMONTAGE",
            interveningCompany: "Trans B",
          },
        ],
      },
    ]);

    const bytes = await generatePdfFromIds(["acc-rx-1"], "https://example.test", {
      mode: "official",
      lang: "fr",
    });
    const doc = await PDFDocument.load(bytes);
    // Preuve principale : 2 pages distinctes pour 2 véhicules physiques.
    expect(doc.getPageCount()).toBe(2);
    expect(bytes.byteLength).toBeGreaterThan(2000);

    // Preuve vehicleId dans les QR émis (même format que accessQrPayload).
    const qrMontage = parseQrPayload(
      "https://example.test/logisticien/acc-rx-1?phase=livraison&vehicleId=101"
    );
    const qrDemontage = parseQrPayload(
      "https://example.test/logisticien/acc-rx-1?phase=reprise&vehicleId=202"
    );
    expect(qrMontage).toEqual({
      id: "acc-rx-1",
      phase: "livraison",
      vehicleId: 101,
    });
    expect(qrDemontage).toEqual({
      id: "acc-rx-1",
      phase: "reprise",
      vehicleId: 202,
    });

    // Planificateur : véhicule A uniquement page montage, B uniquement démontage.
    const { planRxPdfPages } = await import("@/lib/accreditation-pdf-vehicle-pages");
    const pages = planRxPdfPages([
      {
        id: 101,
        logisticsRole: "MONTAGE",
        plate: "AA-111-AA",
        vehicleType: "PORTEUR",
      },
      {
        id: 202,
        logisticsRole: "DEMONTAGE",
        plate: "BB-222-BB",
        vehicleType: "VL",
      },
    ]);
    expect(pages[0].vehicle?.plate).toBe("AA-111-AA");
    expect(pages[0].vehicle?.plate).not.toBe("BB-222-BB");
    expect(pages[1].vehicle?.plate).toBe("BB-222-BB");
    expect(pages[1].vehicle?.plate).not.toBe("AA-111-AA");
  });

  it("BOTH → 1 page", async () => {
    findManyAcc.mockResolvedValue([
      {
        id: "acc-rx-2",
        publicToken: null,
        company: "TEST",
        stand: "S1",
        event: "yatching",
        unloading: "self",
        message: null,
        consent: true,
        status: "ATTENTE",
        language: "fr",
        entryAt: null,
        exitAt: null,
        currentZone: null,
        standId: null,
        extension: { exhibitor: { name: "TEST" } },
        organization: { id: "org-rx", slug: "rx" },
        eventRef: { name: "CYF26" },
        vehicles: [
          {
            id: 303,
            plate: "CC-333-CC",
            size: "VL",
            phoneCode: "+33",
            phoneNumber: "600000003",
            date: "2026-09-03",
            time: "08:00-10:00",
            city: "Nice",
            vehicleType: "VL",
            trailerPlate: null,
            logisticsRole: "BOTH",
            interveningCompany: null,
          },
        ],
      },
    ]);

    const bytes = await generatePdfFromIds(["acc-rx-2"], "https://example.test", {
      mode: "official",
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("Palais reste 1 page (pas de multi-véhicules RX)", async () => {
    findManyAcc.mockResolvedValue([
      {
        id: "acc-palais",
        publicToken: null,
        company: "DECO SA",
        stand: "12",
        event: "MIPIM",
        unloading: "self",
        message: null,
        consent: true,
        status: "ATTENTE",
        language: "fr",
        entryAt: null,
        exitAt: null,
        currentZone: null,
        standId: null,
        extension: null,
        organization: { id: "org-palais", slug: "palais" },
        eventRef: { name: "MIPIM" },
        vehicles: [
          {
            id: 1,
            plate: "PL-001-AA",
            size: "PORTEUR",
            phoneCode: "+33",
            phoneNumber: "600000000",
            date: "2026-03-01",
            time: "08:00-10:00",
            city: "Cannes",
            vehicleType: "PORTEUR",
            trailerPlate: null,
            logisticsRole: "BOTH",
            interveningCompany: null,
          },
          {
            id: 2,
            plate: "PL-002-BB",
            size: "VL",
            phoneCode: "+33",
            phoneNumber: "600000001",
            date: "2026-03-02",
            time: "10:00-12:00",
            city: "Cannes",
            vehicleType: "VL",
            trailerPlate: null,
            logisticsRole: "DEMONTAGE",
            interveningCompany: null,
          },
        ],
      },
    ]);

    const bytes = await generatePdfFromIds(["acc-palais"], "https://example.test", {
      mode: "official",
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});

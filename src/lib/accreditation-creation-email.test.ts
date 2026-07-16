import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prismaMock = {};
  return { default: prismaMock, prisma: prismaMock };
});

import { buildCreationEmailHtml } from "@/lib/accreditation-creation-email";
import { getRxVehicleProcessInstructions } from "@/lib/rx-vehicle-process";

const acc = {
  company: "HONDA MARINE",
  stand: "POWER 215",
  event: "CYF26",
};

describe("buildCreationEmailHtml — multi-véhicules", () => {
  it("BOTH : un bloc véhicule + consignes", () => {
    const html = buildCreationEmailHtml({
      acc,
      orgSlug: "rx",
      lang: "fr",
      validated: true,
      vehicleIdentity: "AA-111-AA",
      vehicles: [
        {
          vehicle: {
            id: 1,
            plate: "AA-111-AA",
            trailerPlate: null,
            vehicleType: "VL",
            size: "VL",
            phoneCode: "+33",
            phoneNumber: "612345678",
            date: "2026-09-03",
            time: "08:00-10:00",
            city: "Nice",
            logisticsRole: "BOTH",
            interveningCompany: "Trans A",
          },
          gabarit: "VL",
          process: getRxVehicleProcessInstructions("LIGHT"),
          qrCid: "qrvehicle1",
          qrCaption: "Montage & Démontage",
        },
      ],
    });
    expect(html).toContain("AA-111-AA");
    expect(html).toContain("Montage &amp; Démontage");
    expect(html).toContain("cid:qrvehicle1");
    expect(html).toContain("Véhicule léger");
  });

  it("MONTAGE seul", () => {
    const html = buildCreationEmailHtml({
      acc,
      orgSlug: "rx",
      lang: "fr",
      validated: true,
      vehicleIdentity: "AA-111-AA",
      vehicles: [
        {
          vehicle: {
            id: 1,
            plate: "AA-111-AA",
            trailerPlate: null,
            vehicleType: "PORTEUR",
            size: "PORTEUR",
            phoneCode: "+33",
            phoneNumber: "600000001",
            date: "2026-09-03",
            time: "08:00-10:00",
            city: "Nice",
            logisticsRole: "MONTAGE",
          },
          gabarit: "Porteur",
          process: getRxVehicleProcessInstructions("HEAVY"),
          qrCid: "qrvehicle1",
          qrCaption: "Montage",
        },
      ],
    });
    expect(html).toContain("Montage");
    expect(html).not.toContain("Démontage");
    expect(html).toContain("Poids lourd");
  });

  it("DEMONTAGE seul", () => {
    const html = buildCreationEmailHtml({
      acc,
      orgSlug: "rx",
      lang: "fr",
      validated: true,
      vehicleIdentity: "BB-222-BB",
      vehicles: [
        {
          vehicle: {
            id: 2,
            plate: "BB-222-BB",
            trailerPlate: null,
            vehicleType: "VL",
            size: "VL",
            phoneCode: "+33",
            phoneNumber: "600000002",
            date: "2026-09-14",
            time: "10:00-12:00",
            city: "Lyon",
            logisticsRole: "DEMONTAGE",
          },
          gabarit: "VL",
          process: getRxVehicleProcessInstructions("LIGHT"),
          qrCid: "qrvehicle2",
          qrCaption: "Démontage",
        },
      ],
    });
    expect(html).toContain("BB-222-BB");
    expect(html).toContain("Démontage");
    expect(html).toContain("cid:qrvehicle2");
  });

  it("Montage A + Démontage B : deux blocs et deux QR", () => {
    const html = buildCreationEmailHtml({
      acc,
      orgSlug: "rx",
      lang: "fr",
      validated: true,
      vehicleIdentity: "2 véhicules",
      vehicles: [
        {
          vehicle: {
            id: 1,
            plate: "AA-111-AA",
            trailerPlate: null,
            vehicleType: "PORTEUR",
            size: "PORTEUR",
            phoneCode: "+33",
            phoneNumber: "600000001",
            date: "2026-09-03",
            time: "08:00-10:00",
            city: "Nice",
            logisticsRole: "MONTAGE",
          },
          gabarit: "Porteur",
          process: getRxVehicleProcessInstructions("HEAVY"),
          qrCid: "qrvehicle1",
          qrCaption: "Montage",
        },
        {
          vehicle: {
            id: 2,
            plate: "BB-222-BB",
            trailerPlate: "REM-99",
            vehicleType: "VL",
            size: "VL",
            phoneCode: "+33",
            phoneNumber: "600000002",
            date: "2026-09-14",
            time: "10:00-12:00",
            city: "Lyon",
            logisticsRole: "DEMONTAGE",
            interveningCompany: "Trans B",
          },
          gabarit: "VL",
          process: getRxVehicleProcessInstructions("LIGHT"),
          qrCid: "qrvehicle2",
          qrCaption: "Démontage",
        },
      ],
    });
    expect(html).toContain("AA-111-AA");
    expect(html).toContain("BB-222-BB");
    expect(html).toContain("REM-99");
    expect(html).toContain("Trans B");
    expect(html).toContain("cid:qrvehicle1");
    expect(html).toContain("cid:qrvehicle2");
    expect(html).toContain("Poids lourd");
    expect(html).toContain("Véhicule léger");
    // Pas de QR unique générique quand validé multi-véhicules
    expect(html).not.toContain("cid:qraccreditation");
  });

  it("demande NOUVEAU : récap tous véhicules + QR suivi unique", () => {
    const html = buildCreationEmailHtml({
      acc,
      orgSlug: "rx",
      lang: "fr",
      validated: false,
      trackingQr: true,
      vehicleIdentity: "2 véhicules",
      vehicles: [
        {
          vehicle: {
            id: 1,
            plate: null,
            trailerPlate: null,
            vehicleType: "PORTEUR",
            size: "PORTEUR",
            phoneCode: "+33",
            phoneNumber: "600000001",
            date: "2026-09-03",
            time: "08:00-10:00",
            city: "Nice",
            logisticsRole: "MONTAGE",
          },
          gabarit: "Porteur",
          process: getRxVehicleProcessInstructions("HEAVY"),
          qrCid: null,
          qrCaption: "",
        },
        {
          vehicle: {
            id: 2,
            plate: null,
            trailerPlate: null,
            vehicleType: "VL",
            size: "VL",
            phoneCode: "+33",
            phoneNumber: "600000002",
            date: "2026-09-14",
            time: "10:00-12:00",
            city: "Lyon",
            logisticsRole: "DEMONTAGE",
          },
          gabarit: "VL",
          process: getRxVehicleProcessInstructions("LIGHT"),
          qrCid: null,
          qrCaption: "",
        },
      ],
    });
    expect(html).toContain("Porteur");
    expect(html).toContain("VL");
    expect(html).toContain("cid:qraccreditation");
    expect(html).not.toContain("cid:qrvehicle");
  });
});

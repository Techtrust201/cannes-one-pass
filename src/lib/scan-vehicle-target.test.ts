import { describe, expect, it } from "vitest";
import {
  resolveScanTargetVehicle,
  roleMatchesPhase,
} from "@/lib/scan-vehicle-target";

const montage = {
  id: 10,
  logisticsRole: "MONTAGE" as const,
  plate: "AA-111-AA",
};
const demontage = {
  id: 20,
  logisticsRole: "DEMONTAGE" as const,
  plate: "BB-222-BB",
};
const both = { id: 30, logisticsRole: "BOTH" as const, plate: "CC-333-CC" };

describe("roleMatchesPhase", () => {
  it("BOTH accepte les deux phases", () => {
    expect(roleMatchesPhase("BOTH", "livraison")).toBe(true);
    expect(roleMatchesPhase("BOTH", "reprise")).toBe(true);
  });
  it("MONTAGE refuse reprise", () => {
    expect(roleMatchesPhase("MONTAGE", "livraison")).toBe(true);
    expect(roleMatchesPhase("MONTAGE", "reprise")).toBe(false);
  });
  it("DEMONTAGE refuse livraison", () => {
    expect(roleMatchesPhase("DEMONTAGE", "reprise")).toBe(true);
    expect(roleMatchesPhase("DEMONTAGE", "livraison")).toBe(false);
  });
});

describe("resolveScanTargetVehicle", () => {
  it("QR nouveau Montage → véhicule 10", () => {
    const r = resolveScanTargetVehicle([montage, demontage], {
      vehicleId: 10,
      phase: "livraison",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.vehicle.id).toBe(10);
  });

  it("QR nouveau Démontage → véhicule 20", () => {
    const r = resolveScanTargetVehicle([montage, demontage], {
      vehicleId: 20,
      phase: "reprise",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.vehicle.id).toBe(20);
  });

  it("ancien QR sans vehicleId → premier véhicule", () => {
    const r = resolveScanTargetVehicle([montage, demontage], {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.vehicle.id).toBe(10);
  });

  it("vehicleId d'une autre accréditation → erreur", () => {
    const r = resolveScanTargetVehicle([montage, demontage], {
      vehicleId: 999,
      phase: "livraison",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("VEHICLE_WRONG_ACCREDITATION");
  });

  it("phase incompatible → erreur", () => {
    const r = resolveScanTargetVehicle([montage, demontage], {
      vehicleId: 10,
      phase: "reprise",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PHASE_INCOMPATIBLE");
  });

  it("BOTH accepte livraison et reprise", () => {
    expect(
      resolveScanTargetVehicle([both], { vehicleId: 30, phase: "livraison" }).ok
    ).toBe(true);
    expect(
      resolveScanTargetVehicle([both], { vehicleId: 30, phase: "reprise" }).ok
    ).toBe(true);
  });
});

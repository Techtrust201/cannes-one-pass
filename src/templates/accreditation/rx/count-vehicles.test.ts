import { describe, expect, it } from "vitest";
import { countRxLogicalVehicles } from "./count-vehicles";
import type { RxCategorySelection } from "./types";

function cat(vehicles: RxCategorySelection["vehicles"]): RxCategorySelection[] {
  return [
    {
      categoryId: "stand-nu-int",
      livDate: "2026-09-04",
      livTime: "09:00",
      repDate: "2026-09-14",
      repTime: "10:00",
      vehicles,
    },
  ];
}

describe("countRxLogicalVehicles", () => {
  it("1 livraison, reprise identique → 1", () => {
    const n = countRxLogicalVehicles(
      cat([{ vehicleType: "VL", plate: null, repSameAsDelivery: true }])
    );
    expect(n).toBe(1);
  });

  it("1 livraison, reprise différente → 2", () => {
    const n = countRxLogicalVehicles(
      cat([
        {
          vehicleType: "VL",
          plate: "AA111",
          repSameAsDelivery: false,
          repVehicleType: "PORTEUR",
          repPlate: "BB222",
        },
      ])
    );
    expect(n).toBe(2);
  });

  it("2 livraisons, 1 reprise différente → 3", () => {
    const n = countRxLogicalVehicles(
      cat([
        { vehicleType: "VL", plate: null, repSameAsDelivery: true },
        {
          vehicleType: "PORTEUR",
          plate: null,
          repSameAsDelivery: false,
          repVehicleType: "VL",
        },
      ])
    );
    expect(n).toBe(3);
  });

  it("skip démontage : pas de +1 reprise", () => {
    const n = countRxLogicalVehicles(
      cat([
        {
          vehicleType: "VL",
          plate: null,
          repSameAsDelivery: false,
          repVehicleType: "PORTEUR",
        },
      ]),
      true
    );
    expect(n).toBe(1);
  });
});

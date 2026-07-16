"use client";

import { getRxVehicleProcessInstructions } from "@/lib/rx-vehicle-process";
import type { VehicleFamily } from "@prisma/client";

/**
 * Affiche les consignes LIGHT/HEAVY (source unique getRxVehicleProcessInstructions).
 * Utilisé dans le détail back-office RX.
 */
export default function RxVehicleProcessPanel({
  families,
}: {
  families: Array<VehicleFamily | null | undefined>;
}) {
  const unique = Array.from(
    new Set(
      families.filter((f): f is VehicleFamily => f === "LIGHT" || f === "HEAVY")
    )
  );
  if (unique.length === 0) return null;

  return (
    <div className="mb-6 bg-white rounded-xl border border-sky-200 p-4 shadow-sm space-y-3">
      <h3 className="font-semibold text-base text-gray-800">
        Consignes véhicules (LIGHT / HEAVY)
      </h3>
      {unique.map((family) => {
        const process = getRxVehicleProcessInstructions(family);
        return (
          <div
            key={family}
            className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-sm text-sky-950"
          >
            <div className="font-semibold">{process.title}</div>
            <div className="text-xs mt-1 text-sky-800">
              Zone : {process.zoneLabel}
              {process.maxParkingMinutes != null
                ? ` · max ${process.maxParkingMinutes} min`
                : ""}
              {process.requiresReceiver ? " · réceptionnaire requis" : ""}
            </div>
            <ul className="mt-1 list-disc pl-4 text-xs">
              {process.instructions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

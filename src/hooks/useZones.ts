"use client";

import { useState, useEffect } from "react";
import { loadZones, type ZoneConfigData } from "@/lib/zone-utils";

export function useZones() {
  const [zones, setZones] = useState<ZoneConfigData[]>([]);

  useEffect(() => {
    loadZones().then(setZones);
  }, []);

  return {
    zones,
    allZoneKeys: zones.map((z) => z.zone),
    getTransferTargets: (currentZone: string) =>
      zones.filter((z) => z.zone !== currentZone).map((z) => z.zone),
    getLabel: (key: string) =>
      zones.find((z) => z.zone === key)?.label || key.replace(/_/g, " "),
    isFinalDestination: (key: string) =>
      zones.find((z) => z.zone === key)?.isFinalDestination ?? false,
  };
}

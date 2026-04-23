"use client";
import { useEffect, useRef } from "react";
import VehicleForm from "./VehicleForm";
import type { Vehicle } from "@/types";

interface Props {
  data: Vehicle;
  update: (v: Partial<Vehicle>) => void;
  onValidityChange: (v: boolean) => void;
}

export default function StepTwo({ data, update, onValidityChange }: Props) {
  // Initialisation par défaut, si unloading est vide, on force ['rear'] (une seule fois)
  const didInit = useRef(false);
  useEffect(() => {
    if (
      !didInit.current &&
      (!Array.isArray(data.unloading) || data.unloading.length === 0)
    ) {
      update({ unloading: ["rear"] });
      didInit.current = true;
    }
  }, [data, update]);
  useEffect(() => {
    const valid =
      !!data.plate &&
      !!data.size &&
      !!data.phoneNumber &&
      !!data.date &&
      !!data.city &&
      Array.isArray(data.unloading) &&
      data.unloading.length > 0;
    onValidityChange(valid);
  }, [data, onValidityChange]);

  return (
    <div>
      <VehicleForm
        data={data}
        update={(patch) => update({ ...data, ...patch })}
        onValidityChange={onValidityChange}
      />
    </div>
  );
}

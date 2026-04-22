"use client";
import { useEffect, useRef } from "react";
import VehicleForm from "./VehicleForm";
import type { Vehicle } from "@/types";

interface Props {
  data: Vehicle;
  update: (v: Partial<Vehicle>) => void;
  onValidityChange: (v: boolean) => void;
  /** Slug event — utilisé pour filtrer les créneaux proposés (vision Killian) */
  eventSlug?: string;
}

export default function StepTwo({ data, update, onValidityChange, eventSlug }: Props) {
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
    // Vision Killian : plaque + gabarit optionnels, mais date+heure de dépose
    // ET date+heure de récupération obligatoires.
    const valid =
      !!data.phoneNumber &&
      !!data.date &&
      !!data.time &&
      !!data.returnDate &&
      !!data.returnTime &&
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
        eventSlug={eventSlug}
      />
    </div>
  );
}

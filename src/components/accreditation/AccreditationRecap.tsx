"use client";

import { Pencil } from "lucide-react";
import type { Vehicle } from "@/types";
import { useTranslation } from "@/components/accreditation/TranslationProvider";
import { useVehicleTypes } from "@/hooks/useVehicleTypes";
import { useEventOptions } from "@/hooks/useEventOptions";
import { getOrgFieldLabel, resolveUnloadingLabel } from "@/lib/org-form-config";

export interface RecapData {
  company: string;
  stand: string;
  unloading: string;
  event: string;
  vehicles: Vehicle[];
  message: string;
  email: string;
}

interface Props {
  data: RecapData;
  /** Scope des types de véhicule (résolution du libellé gabarit). */
  orgSlug?: string;
  /** Navigation vers une étape pour modification (1-indexée). */
  onEditStep?: (step: number) => void;
  /** Encadré expliquant le statut attendu après envoi. */
  statusNotice: React.ReactNode;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-900 font-medium text-right break-words">
        {value}
      </span>
    </div>
  );
}

function Section({
  title,
  editLabel,
  onEdit,
  children,
}: {
  title: string;
  editLabel: string;
  onEdit?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <Pencil size={13} />
            {editLabel}
          </button>
        )}
      </div>
      <div className="divide-y divide-gray-100">{children}</div>
    </div>
  );
}

export default function AccreditationRecap({
  data,
  orgSlug,
  onEditStep,
  statusNotice,
}: Props) {
  const { t, lang } = useTranslation();
  const { getDisplayLabel } = useVehicleTypes(false, orgSlug);
  const events = useEventOptions();

  const v = data.vehicles[0];
  const notProvided = t.recapNotProvided!;
  const editLabel = t.recapEdit!;

  const decoratorLabel = getOrgFieldLabel(orgSlug, "decoratorName", lang, t.decoratorName);
  const standLabel = getOrgFieldLabel(orgSlug, "standServed", lang, t.standServed);

  const eventLabel =
    events.find((e) => e.value === data.event)?.label || data.event || notProvided;
  const unloadingLabel = resolveUnloadingLabel(data.unloading, lang) || notProvided;
  const vehicleTypeLabel = v
    ? getDisplayLabel(v.size || v.vehicleType || "", lang) || notProvided
    : notProvided;
  const phone = v && v.phoneNumber ? `${v.phoneCode} ${v.phoneNumber}`.trim() : notProvided;
  const schedule = v?.time ? `${v.date} · ${v.time}` : v?.date || notProvided;

  return (
    <div className="space-y-3">
      <Section
        title={t.identification}
        editLabel={editLabel}
        onEdit={onEditStep ? () => onEditStep(1) : undefined}
      >
        <Row label={decoratorLabel} value={data.company || notProvided} />
        <Row label={standLabel} value={data.stand || notProvided} />
        <Row label={t.selectEvent} value={eventLabel} />
        <Row label={t.unloadingBy} value={unloadingLabel} />
      </Section>

      <Section
        title={t.recapVehicle!}
        editLabel={editLabel}
        onEdit={onEditStep ? () => onEditStep(2) : undefined}
      >
        <Row label={t.plate} value={v?.plate || notProvided} />
        <Row label={t.vehicleType} value={vehicleTypeLabel} />
        {v?.trailerPlate ? (
          <Row label={t.trailerPlate} value={v.trailerPlate} />
        ) : null}
        <Row label={t.departureCity} value={v?.city || notProvided} />
        <Row label={t.arrivalDate} value={schedule} />
        <Row label={t.driverPhone} value={phone} />
      </Section>

      <Section
        title={t.recapContact!}
        editLabel={editLabel}
        onEdit={onEditStep ? () => onEditStep(3) : undefined}
      >
        <Row
          label={t.emailRequiredLabel ?? t.emailLabel!}
          value={data.email || notProvided}
        />
        {data.message ? <Row label={t.message} value={data.message} /> : null}
      </Section>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
        <p className="font-semibold text-amber-900">
          {t.recapStatusLabel}
        </p>
        <p className="text-amber-800 mt-0.5">{statusNotice}</p>
      </div>
    </div>
  );
}

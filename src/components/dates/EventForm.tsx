"use client";

import { useState } from "react";
import type { Event } from "@/types";
import { Loader2 } from "lucide-react";

type FormData = Omit<Event, "id" | "createdAt" | "updatedAt" | "isActive">;

const EMPTY_FORM: FormData = {
  name: "",
  slug: "",
  logo: null,
  description: null,
  location: null,
  color: "#3DAAA4",
  startDate: "",
  endDate: "",
  setupStartDate: null,
  setupEndDate: null,
  teardownStartDate: null,
  teardownEndDate: null,
  accessStartTime: null,
  accessEndTime: null,
  notes: null,
  activationDays: 7,
  isArchived: false,
};

const COLORS = [
  "#3DAAA4",
  "#E74C3C",
  "#F39C12",
  "#2ECC71",
  "#3498DB",
  "#9B59B6",
  "#1ABC9C",
  "#E67E22",
  "#34495E",
];

function toInputDate(val: string | null): string {
  if (!val) return "";
  return new Date(val).toISOString().split("T")[0];
}

function fromEvent(event: Event): FormData {
  return {
    ...event,
    startDate: toInputDate(event.startDate),
    endDate: toInputDate(event.endDate),
    setupStartDate: toInputDate(event.setupStartDate),
    setupEndDate: toInputDate(event.setupEndDate),
    teardownStartDate: toInputDate(event.teardownStartDate),
    teardownEndDate: toInputDate(event.teardownEndDate),
  };
}

interface Props {
  event?: Event | null;
  onSave: (data: FormData) => Promise<void>;
  onDelete?: () => Promise<void>;
  saving?: boolean;
  defaultStartDate?: string;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 border-b pb-1">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-[#3DAAA4]/30 focus:border-[#3DAAA4] outline-none transition-colors";

export default function EventForm({ event, onSave, onDelete, saving, defaultStartDate }: Props) {
  const [form, setForm] = useState<FormData>(() => {
    if (event) return fromEvent(event);
    if (defaultStartDate) return { ...EMPTY_FORM, startDate: defaultStartDate };
    return EMPTY_FORM;
  });
  const [error, setError] = useState("");

  const isNew = !event;

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function autoSlug(name: string) {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.name || !form.startDate || !form.endDate) {
      setError("Nom, date de début et date de fin sont requis.");
      return;
    }

    if (new Date(form.endDate) < new Date(form.startDate)) {
      setError("La date de fin doit être après la date de début.");
      return;
    }

    const slug = form.slug || autoSlug(form.name);
    try {
      await onSave({ ...form, slug });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la sauvegarde");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Informations generales */}
      <Section title="Informations">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nom de l'événement" className="sm:col-span-2">
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => {
                set("name", e.target.value);
                if (isNew) set("slug", autoSlug(e.target.value));
              }}
              placeholder="Ex: WAICF 2026"
              required
            />
          </Field>
          <Field label="Slug (identifiant unique)">
            <input
              className={inputClass}
              value={form.slug}
              onChange={(e) => set("slug", e.target.value)}
              placeholder="waicf-2026"
            />
          </Field>
          <Field label="Lieu">
            <input
              className={inputClass}
              value={form.location ?? ""}
              onChange={(e) => set("location", e.target.value || null)}
              placeholder="Palais des Festivals"
            />
          </Field>
          <Field label="Logo (chemin)" className="sm:col-span-2">
            <input
              className={inputClass}
              value={form.logo ?? ""}
              onChange={(e) => set("logo", e.target.value || null)}
              placeholder="/accreditation/pict_page1/waicf.png"
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <textarea
              className={inputClass + " min-h-[60px] resize-y"}
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value || null)}
              rows={2}
              placeholder="Description courte de l'événement..."
            />
          </Field>
          <Field label="Couleur" className="sm:col-span-2">
            <div className="flex items-center gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("color", c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? "border-gray-800 scale-110" : "border-transparent hover:border-gray-300"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={form.color}
                onChange={(e) => set("color", e.target.value)}
                className="w-7 h-7 rounded cursor-pointer border-0 p-0"
              />
            </div>
          </Field>
        </div>
      </Section>

      {/* Dates principales */}
      <Section title="Dates de l'événement">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Début">
            <input
              type="date"
              className={inputClass}
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
              required
            />
          </Field>
          <Field label="Fin">
            <input
              type="date"
              className={inputClass}
              value={form.endDate}
              onChange={(e) => set("endDate", e.target.value)}
              required
            />
          </Field>
        </div>
      </Section>

      {/* Montage / Demontage */}
      <Section title="Montage / Démontage">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Début montage">
            <input
              type="date"
              className={inputClass}
              value={form.setupStartDate ?? ""}
              onChange={(e) => set("setupStartDate", e.target.value || null)}
            />
          </Field>
          <Field label="Fin montage">
            <input
              type="date"
              className={inputClass}
              value={form.setupEndDate ?? ""}
              onChange={(e) => set("setupEndDate", e.target.value || null)}
            />
          </Field>
          <Field label="Début démontage">
            <input
              type="date"
              className={inputClass}
              value={form.teardownStartDate ?? ""}
              onChange={(e) =>
                set("teardownStartDate", e.target.value || null)
              }
            />
          </Field>
          <Field label="Fin démontage">
            <input
              type="date"
              className={inputClass}
              value={form.teardownEndDate ?? ""}
              onChange={(e) => set("teardownEndDate", e.target.value || null)}
            />
          </Field>
        </div>
      </Section>

      {/* Horaires d'acces */}
      <Section title="Horaires d'accès">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Ouverture">
            <input
              type="time"
              className={inputClass}
              value={form.accessStartTime ?? ""}
              onChange={(e) => set("accessStartTime", e.target.value || null)}
            />
          </Field>
          <Field label="Fermeture">
            <input
              type="time"
              className={inputClass}
              value={form.accessEndTime ?? ""}
              onChange={(e) => set("accessEndTime", e.target.value || null)}
            />
          </Field>
        </div>
      </Section>

      {/* Activation */}
      <Section title="Activation automatique">
        <Field label={`Activer J-${form.activationDays} avant le début`}>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={60}
              value={form.activationDays}
              onChange={(e) => set("activationDays", Number(e.target.value))}
              className="flex-1 accent-[#3DAAA4]"
            />
            <span className="text-sm font-semibold text-gray-700 min-w-[50px] text-right">
              J-{form.activationDays}
            </span>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            L&apos;événement apparaîtra dans le formulaire d&apos;accréditation{" "}
            {form.activationDays} jours avant son début.
          </p>
        </Field>
      </Section>

      {/* Notes internes */}
      <Section title="Notes internes">
        <textarea
          className={inputClass + " min-h-[80px] resize-y"}
          value={form.notes ?? ""}
          onChange={(e) => set("notes", e.target.value || null)}
          rows={3}
          placeholder="Notes visibles uniquement par les logisticiens..."
        />
      </Section>

      {/* Actions */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 bg-[#3F4660] text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-[#2C2F3F] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {isNew ? "Créer l'événement" : "Enregistrer"}
        </button>
        {!isNew && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
          >
            Archiver
          </button>
        )}
      </div>
    </form>
  );
}

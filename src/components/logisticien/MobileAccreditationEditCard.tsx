"use client";

import { useState, useTransition, useCallback, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Accreditation, Vehicle } from "@/types";
import {
  ArrowLeft,
  Save,
  PlusCircle,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  History,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ActionButtons from "./ActionButtons";
import AccreditationHistory from "./AccreditationHistory";
import DailyTimeSlotHistory from "./DailyTimeSlotHistory";
import AccreditationChat from "./AccreditationChat";
import VehicleCard from "./VehicleCard";
import VehicleEditDialog from "./VehicleEditDialog";
import { useEventOptions } from "@/hooks/useEventOptions";

const accreditationFormSchema = z.object({
  company: z.string().min(1, "Nom du décorateur requis").max(100, "Trop long"),
  stand: z.string().min(1, "Stand requis").max(50, "Trop long"),
  unloading: z.string().min(1, "Déchargement requis").max(50, "Trop long"),
  event: z.string().min(1, "Événement requis").max(50, "Trop long"),
  message: z.string().max(500, "Message trop long").optional(),
});

type AccreditationFormData = z.infer<typeof accreditationFormSchema>;

// Types pour les toasts
type ToastType = "success" | "error" | "info";
interface ToastData {
  id: string;
  type: ToastType;
  message: string;
}

// Hook personnalisé pour les toasts
function useToasts() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}

// Composant Toast
function ToastComponent({
  toast,
  onRemove,
}: {
  toast: ToastData;
  onRemove: (id: string) => void;
}) {
  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    info: AlertCircle,
  };

  const colors = {
    success: "bg-green-500 text-white",
    error: "bg-red-500 text-white",
    info: "bg-blue-500 text-white",
  };

  const Icon = icons[toast.type];

  return (
    <div
      className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg flex items-center gap-2 ${colors[toast.type]}`}
      role="alert"
      aria-live="polite"
    >
      <Icon size={20} />
      <span>{toast.message}</span>
      <button
        onClick={() => onRemove(toast.id)}
        className="ml-2 hover:opacity-80"
        aria-label="Fermer la notification"
      >
        ×
      </button>
    </div>
  );
}

// Composant de champ réutilisable
interface FormFieldProps {
  label: string;
  name: string;
  error?: string;
  children: React.ReactNode;
  required?: boolean;
}

function FormField({
  label,
  name,
  error,
  children,
  required = false,
}: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-xs font-semibold text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {error && (
        <span className="text-xs text-red-600" role="alert" aria-live="polite">
          {error}
        </span>
      )}
    </div>
  );
}

// Section historique repliable pour mobile
function HistorySection({ accreditationId }: { accreditationId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-[#4F587E] hover:bg-gray-100 transition"
      >
        <span className="flex items-center gap-2">
          <History size={16} />
          Historique des modifications
        </span>
        <ChevronDown
          size={16}
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && (
        <div className="px-2 pb-3">
          <AccreditationHistory accreditationId={accreditationId} className="max-h-[300px] overflow-y-auto" />
        </div>
      )}
    </div>
  );
}

interface Props {
  acc: Accreditation;
}

export default function MobileAccreditationEditCard({ acc }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { toasts, addToast, removeToast } = useToasts();
  const EVENT_OPTIONS = useEventOptions();
  const [actionVersion, setActionVersion] = useState(0);
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [vehicleDialogMode, setVehicleDialogMode] = useState<"edit" | "add">("add");
  const [vehicleDialogTarget, setVehicleDialogTarget] = useState<Vehicle | null>(null);
  const [deletingVehicleId, setDeletingVehicleId] = useState<number | null>(null);

  // Initialisation du formulaire avec react-hook-form (sans status)
  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
    reset,
  } = useForm<AccreditationFormData>({
    resolver: zodResolver(accreditationFormSchema),
    defaultValues: useMemo(
      () => ({
        company: acc.company ?? "",
        stand: acc.stand ?? "",
        unloading: acc.unloading ?? "",
        event: acc.event ?? "",
        message: acc.message ?? "",
      }),
      [acc]
    ),
    mode: "onChange",
  });

  // Soumission du formulaire (sans changer le status)
  const onSubmit = useCallback(
    async (data: AccreditationFormData) => {
      startTransition(async () => {
        try {
          const response = await fetch(`/api/accreditations/${acc.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...data,
              status: acc.status, // on garde le statut actuel
              version: acc.version, // Optimistic locking
            }),
          });

          if (response.status === 409) {
            addToast("error", "Cette accréditation a été modifiée. Rafraîchissez la page.");
            router.refresh();
            return;
          }

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
              errorData.message ||
                `Erreur ${response.status}: ${response.statusText}`
            );
          }

          reset(data);
          addToast("success", "Modifications enregistrées");
          router.refresh();
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Erreur inconnue";
          addToast("error", `Erreur: ${errorMessage}`);
          console.error("Erreur sauvegarde:", error);
        }
      });
    },
    [acc.id, acc.status, acc.version, reset, addToast, router]
  );

  const handleAddVehicle = useCallback(() => {
    setVehicleDialogTarget(null);
    setVehicleDialogMode("add");
    setVehicleDialogOpen(true);
  }, []);

  const handleEditVehicle = useCallback((v: Vehicle) => {
    setVehicleDialogTarget(v);
    setVehicleDialogMode("edit");
    setVehicleDialogOpen(true);
  }, []);

  const handleDeleteVehicle = useCallback((vehicleId: number) => {
    setDeletingVehicleId(vehicleId);
  }, []);

  const confirmDeleteVehicle = useCallback(async () => {
    if (deletingVehicleId === null) return;
    try {
      const res = await fetch(`/api/vehicles/${deletingVehicleId}`, { method: "DELETE" });
      if (res.ok) {
        addToast("success", "Véhicule supprimé");
        router.refresh();
      } else {
        addToast("error", "Erreur suppression");
      }
    } catch {
      addToast("error", "Erreur suppression");
    }
    setDeletingVehicleId(null);
  }, [deletingVehicleId, addToast, router]);

  return (
    <>
      <div className="block sm:hidden w-full max-w-lg mx-auto bg-white rounded-2xl shadow-lg p-4 space-y-4 pb-4">
        {/* Header */}
        <header className="flex items-center gap-3 mb-2">
          <Link
            href="/logisticien"
            className="text-[#4F587E] p-2 -ml-2"
            aria-label="Retour au dashboard"
          >
            <ArrowLeft size={24} />
          </Link>
          <h1 className="text-lg font-bold text-[#4F587E]">
            Éditer l&apos;accréditation
          </h1>
        </header>

        {/* ── WORKFLOW : Statut + Actions ── */}
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
          <ActionButtons acc={acc} onActionComplete={() => setActionVersion((v) => v + 1)} />
        </div>

        {/* Formulaire d'édition des infos */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          {/* Informations générales */}
          <div className="space-y-2">
            {[
              { label: "Nom du décorateur", field: "company" as const },
              { label: "Stand desservi", field: "stand" as const },
              { label: "Déchargement", field: "unloading" as const },
            ].map(({ label, field }) => (
              <FormField
                key={field}
                label={label}
                name={field}
                error={errors[field]?.message}
                required
              >
                <Controller
                  name={field}
                  control={control}
                  render={({ field: { onChange, value } }) => (
                    <input
                      id={field}
                      value={value}
                      onChange={onChange}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm bg-white"
                      aria-describedby={
                        errors[field] ? `${field}-error` : undefined
                      }
                    />
                  )}
                />
              </FormField>
            ))}

            {/* Événement — dropdown dynamique */}
            <FormField
              label="Événement"
              name="event"
              error={errors.event?.message}
              required
            >
              <Controller
                name="event"
                control={control}
                render={({ field: { onChange, value } }) => (
                  <select
                    id="event"
                    value={value}
                    onChange={onChange}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm bg-white appearance-none"
                    aria-describedby={errors.event ? "event-error" : undefined}
                  >
                    <option value="">Choisir un événement</option>
                    {value && !EVENT_OPTIONS.some((o) => o.value === value) && (
                      <option value={value}>{value}</option>
                    )}
                    {EVENT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              />
            </FormField>
          </div>

          {/* Véhicules */}
          <div className="space-y-2">
            <div className="font-semibold text-[#4F587E] mb-1 flex items-center justify-between">
              <span>Véhicules</span>
              <button
                type="button"
                onClick={handleAddVehicle}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-[#4F587E] text-white text-xs font-semibold shadow hover:bg-[#3B4252] transition"
                aria-label="Ajouter un véhicule"
              >
                <PlusCircle size={16} /> Ajouter
              </button>
            </div>

            {acc.vehicles && acc.vehicles.length > 0 ? (
              <div className="flex flex-col gap-3">
                {acc.vehicles.map((vehicle, index) => (
                  <VehicleCard
                    key={vehicle.id}
                    vehicle={vehicle}
                    index={index}
                    onEdit={handleEditVehicle}
                    onDelete={handleDeleteVehicle}
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500 text-center py-4">
                Aucun véhicule ajouté
              </div>
            )}
          </div>

          {/* Message conducteur */}
          <FormField
            label="Message du conducteur"
            name="message"
            error={errors.message?.message}
          >
            <Controller
              name="message"
              control={control}
              render={({ field }) => (
                <textarea
                  {...field}
                  id="message"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm bg-white min-h-[60px]"
                  placeholder="Message optionnel..."
                  aria-describedby={
                    errors.message ? "message-error" : undefined
                  }
                />
              )}
            />
          </FormField>

          {/* Bouton enregistrer les infos */}
          <button
            type="submit"
            disabled={isPending || !isValid}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#4F587E] text-white font-bold text-base shadow hover:bg-[#3B4252] transition mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={20} />
            {isPending ? "Enregistrement..." : "Enregistrer les infos"}
          </button>
        </form>

        {/* ── Créneaux horaires (retour véhicule) ── */}
        <DailyTimeSlotHistory accreditationId={acc.id} refreshKey={actionVersion} className="mt-4 px-1" />

        {/* ── Discussion agents ── */}
        <AccreditationChat
          accreditationId={acc.id}
          compact
          defaultCollapsed={true}
          className="mt-4"
        />

        {/* ── Historique des modifications ── */}
        <HistorySection accreditationId={acc.id} />
      </div>

      {/* Dialog édition/ajout véhicule */}
      <VehicleEditDialog
        open={vehicleDialogOpen}
        onOpenChange={setVehicleDialogOpen}
        vehicle={vehicleDialogTarget}
        accreditationId={acc.id}
        mode={vehicleDialogMode}
        onSuccess={() => {
          router.refresh();
          setActionVersion((v) => v + 1);
        }}
        onToast={addToast}
      />

      {/* Dialog confirmation suppression */}
      {deletingVehicleId !== null && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setDeletingVehicleId(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-gray-900 mb-2">Supprimer ce véhicule ?</h3>
            <p className="text-sm text-gray-500 mb-5">Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeletingVehicleId(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmDeleteVehicle}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white font-semibold text-sm hover:bg-red-600 transition"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      {toasts.map((toast) => (
        <ToastComponent key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </>
  );
}

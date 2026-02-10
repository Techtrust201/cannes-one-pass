"use client";

import { useState, useTransition, useCallback, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Accreditation } from "@/types";
import {
  ArrowLeft,
  Save,
  PlusCircle,
  AlertCircle,
  CheckCircle,
  Pencil,
  Trash2,
  Phone,
  MessageCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getTelLink, getWhatsAppLink } from "@/lib/contact-utils";
import ActionButtons from "./ActionButtons";

// Type pour le formulaire d'édition de véhicule
interface VehicleFormData {
  plate: string;
  size: string;
  phoneCode: string;
  phoneNumber: string;
  date: string;
  time: string;
  city: string;
  unloading: string[];
}

const accreditationFormSchema = z.object({
  company: z.string().min(1, "Entreprise requise").max(100, "Trop long"),
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

interface Props {
  acc: Accreditation;
}

export default function MobileAccreditationEditCard({ acc }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { toasts, addToast, removeToast } = useToasts();
  const [editingVehicle, setEditingVehicle] = useState<number | null>(null);
  const [vehicleFormData, setVehicleFormData] =
    useState<VehicleFormData | null>(null);

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

  // Ajout d'un nouveau véhicule
  const handleAddVehicle = useCallback(() => {
    const params = new URLSearchParams({
      step: "1",
      company: acc.company || "",
      stand: acc.stand || "",
      unloading: acc.unloading || "",
      event: acc.event || "",
      message: acc.message || "",
      email: acc.email || "",
      city: acc.vehicles[0]?.city || "",
    });
    router.push(`/logisticien/nouveau?${params.toString()}`);
  }, [acc, router]);

  // Éditer un véhicule
  const handleEditVehicle = useCallback(
    (vehicleIndex: number) => {
      const vehicle = acc.vehicles[vehicleIndex];
      if (!vehicle) return;
      setEditingVehicle(vehicleIndex);
      setVehicleFormData({
        plate: vehicle.plate || "",
        size: vehicle.size || "",
        phoneCode: vehicle.phoneCode || "+33",
        phoneNumber: vehicle.phoneNumber || "",
        date: vehicle.date || "",
        time: vehicle.time || "",
        city: vehicle.city || "",
        unloading: Array.isArray(vehicle.unloading)
          ? vehicle.unloading
          : vehicle.unloading
            ? [vehicle.unloading]
            : ["lat"],
      });
    },
    [acc]
  );

  // Supprimer un véhicule
  const handleDeleteVehicle = useCallback(
    async (vehicleId: number) => {
      if (!confirm("Supprimer ce véhicule ?")) return;
      try {
        const response = await fetch(`/api/vehicles/${vehicleId}`, {
          method: "DELETE",
        });
        if (response.ok) {
          addToast("success", "Véhicule supprimé");
          router.refresh();
        } else {
          addToast("error", "Erreur suppression");
        }
      } catch (error) {
        addToast("error", "Erreur suppression");
        console.error("Erreur suppression véhicule:", error);
      }
    },
    [addToast, router]
  );

  // Sauvegarder l'édition d'un véhicule
  const handleSaveVehicleEdit = useCallback(async () => {
    if (editingVehicle === null || !vehicleFormData) return;
    const vehicle = acc.vehicles[editingVehicle];
    if (!vehicle) return;
    try {
      const response = await fetch(`/api/vehicles/${vehicle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vehicleFormData),
      });
      if (response.ok) {
        addToast("success", "Véhicule modifié");
        setEditingVehicle(null);
        setVehicleFormData(null);
        router.refresh();
      } else {
        addToast("error", "Erreur modification");
      }
    } catch (error) {
      addToast("error", "Erreur modification");
      console.error("Erreur modification véhicule:", error);
    }
  }, [editingVehicle, vehicleFormData, acc.vehicles, addToast, router]);

  const handleCancelVehicleEdit = useCallback(() => {
    setEditingVehicle(null);
    setVehicleFormData(null);
  }, []);

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
          <ActionButtons acc={acc} />
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
              { label: "Entreprise", field: "company" as const },
              { label: "Stand desservi", field: "stand" as const },
              { label: "Déchargement", field: "unloading" as const },
              { label: "Événement", field: "event" as const },
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

            {acc.vehicles && acc.vehicles.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3 space-y-3">
                {acc.vehicles.map((vehicle, index) => (
                  <div
                    key={vehicle.id}
                    className="bg-white rounded-lg p-3 border"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-sm">
                        Véhicule {index + 1}:{" "}
                        {vehicle.plate || "Plaque non définie"}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditVehicle(index)}
                          className="text-[#4F587E] hover:bg-gray-100 rounded-lg p-2 transition-colors"
                          aria-label="Éditer le véhicule"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteVehicle(vehicle.id)}
                          className="text-red-500 hover:bg-red-50 rounded-lg p-2 transition-colors"
                          aria-label="Supprimer le véhicule"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="text-gray-600 text-xs space-y-1">
                      {vehicle.size && <div>Taille: {vehicle.size}</div>}
                      {vehicle.city && <div>Ville: {vehicle.city}</div>}
                      {vehicle.phoneCode && vehicle.phoneNumber && (
                        <div className="flex items-center gap-2">
                          <span>Téléphone: {vehicle.phoneCode} {vehicle.phoneNumber}</span>
                          <a
                            href={getTelLink(vehicle.phoneCode, vehicle.phoneNumber)}
                            className="p-1 rounded bg-green-100 text-green-700"
                            title="Appeler"
                          >
                            <Phone size={12} />
                          </a>
                          <a
                            href={getWhatsAppLink(vehicle.phoneCode, vehicle.phoneNumber)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded bg-emerald-100 text-emerald-700"
                            title="WhatsApp"
                          >
                            <MessageCircle size={12} />
                          </a>
                        </div>
                      )}
                      {vehicle.date && <div>Date: {vehicle.date}</div>}
                      {vehicle.time && <div>Heure: {vehicle.time}</div>}
                      {vehicle.unloading && (
                        <div>
                          Déchargement:{" "}
                          {Array.isArray(vehicle.unloading)
                            ? vehicle.unloading.includes("lat") &&
                              vehicle.unloading.includes("rear")
                              ? "Latéral + Arrière"
                              : vehicle.unloading.includes("lat")
                                ? "Latéral"
                                : vehicle.unloading.includes("rear")
                                  ? "Arrière"
                                  : "Non défini"
                            : "Non défini"}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {acc.vehicles.length === 0 && (
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

        {/* Modal d'édition de véhicule */}
        {editingVehicle !== null && vehicleFormData && (
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vehicle-edit-title"
          >
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 border border-gray-200 max-h-[90vh] overflow-y-auto">
              <h2
                id="vehicle-edit-title"
                className="text-lg font-bold mb-4 text-gray-900"
              >
                Éditer le véhicule {editingVehicle + 1}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plaque</label>
                  <input
                    type="text"
                    value={vehicleFormData.plate}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, plate: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm"
                    placeholder="XX-123-YY"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Taille</label>
                  <select
                    value={vehicleFormData.size}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, size: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm"
                  >
                    <option value="PORTEUR">Porteur</option>
                    <option value="PORTEUR_ARTICULE">Porteur articulé</option>
                    <option value="SEMI_REMORQUE">Semi-remorque</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Indicatif</label>
                    <input
                      type="text"
                      value={vehicleFormData.phoneCode}
                      onChange={(e) => setVehicleFormData({ ...vehicleFormData, phoneCode: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm"
                      placeholder="+33"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Numéro</label>
                    <input
                      type="text"
                      value={vehicleFormData.phoneNumber}
                      onChange={(e) => setVehicleFormData({ ...vehicleFormData, phoneNumber: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm"
                      placeholder="123456789"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input
                      type="date"
                      value={vehicleFormData.date}
                      onChange={(e) => setVehicleFormData({ ...vehicleFormData, date: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Heure</label>
                    <input
                      type="time"
                      value={vehicleFormData.time}
                      onChange={(e) => setVehicleFormData({ ...vehicleFormData, time: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ville</label>
                  <input
                    type="text"
                    value={vehicleFormData.city}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, city: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm"
                    placeholder="Paris"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Déchargement</label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="edit-lat"
                        checked={vehicleFormData.unloading.includes("lat")}
                        onChange={(e) => {
                          const newUnloading = e.target.checked
                            ? [...vehicleFormData.unloading.filter((v: string) => v !== "lat"), "lat"]
                            : vehicleFormData.unloading.filter((v: string) => v !== "lat");
                          setVehicleFormData({ ...vehicleFormData, unloading: newUnloading });
                        }}
                        className="rounded border-gray-300"
                      />
                      <label htmlFor="edit-lat" className="text-sm">Latéral</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="edit-rear"
                        checked={vehicleFormData.unloading.includes("rear")}
                        onChange={(e) => {
                          const newUnloading = e.target.checked
                            ? [...vehicleFormData.unloading.filter((v: string) => v !== "rear"), "rear"]
                            : vehicleFormData.unloading.filter((v: string) => v !== "rear");
                          setVehicleFormData({ ...vehicleFormData, unloading: newUnloading });
                        }}
                        className="rounded border-gray-300"
                      />
                      <label htmlFor="edit-rear" className="text-sm">Arrière</label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={handleCancelVehicleEdit}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-400 bg-gray-200 text-gray-800 font-semibold hover:bg-gray-300 transition shadow"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSaveVehicleEdit}
                  className="flex-1 px-4 py-3 rounded-xl bg-[#4F587E] text-white font-semibold shadow hover:bg-[#3B4252] transition"
                >
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toasts */}
      {toasts.map((toast) => (
        <ToastComponent key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </>
  );
}

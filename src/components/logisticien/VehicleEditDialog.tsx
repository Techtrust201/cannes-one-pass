"use client";

import { useState, useCallback } from "react";
import type { Vehicle } from "@/types";
import { Loader2 } from "lucide-react";
import VehicleForm from "@/components/accreditation/VehicleForm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface VehicleEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle | null;
  accreditationId: string;
  mode: "edit" | "add";
  onSuccess: () => void;
  onToast?: (type: "success" | "error", message: string) => void;
}

function makeEmptyVehicle(): Vehicle {
  return {
    id: 0,
    plate: "",
    size: "",
    phoneCode: "+33",
    phoneNumber: "",
    date: "",
    time: "",
    city: "",
    unloading: ["rear"],
  };
}

export default function VehicleEditDialog({
  open,
  onOpenChange,
  vehicle,
  accreditationId,
  mode,
  onSuccess,
  onToast,
}: VehicleEditDialogProps) {
  const [formData, setFormData] = useState<Vehicle>(() =>
    vehicle ? { ...vehicle } : makeEmptyVehicle()
  );
  const [saving, setSaving] = useState(false);
  const [, setIsValid] = useState(false);

  const resetForm = useCallback((v: Vehicle | null) => {
    setFormData(v ? { ...v } : makeEmptyVehicle());
    setSaving(false);
  }, []);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (newOpen) {
        resetForm(vehicle);
      }
      onOpenChange(newOpen);
    },
    [onOpenChange, resetForm, vehicle]
  );

  const handleUpdate = useCallback((patch: Partial<Vehicle>) => {
    setFormData((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      if (mode === "edit" && vehicle) {
        const res = await fetch(`/api/vehicles/${vehicle.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (!res.ok) throw new Error("Erreur modification");
        onToast?.("success", "Véhicule modifié");
      } else {
        const res = await fetch(`/api/accreditations/${accreditationId}/vehicles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (!res.ok) throw new Error("Erreur ajout");
        onToast?.("success", "Véhicule ajouté");
      }
      onOpenChange(false);
      onSuccess();
    } catch {
      onToast?.("error", mode === "edit" ? "Erreur modification véhicule" : "Erreur ajout véhicule");
    } finally {
      setSaving(false);
    }
  }, [mode, vehicle, formData, accreditationId, onOpenChange, onSuccess, onToast]);

  const title = mode === "edit" ? "Modifier le véhicule" : "Ajouter un véhicule";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="flex flex-col inset-0 translate-x-0 translate-y-0 max-w-none rounded-none p-0 gap-0 bg-background sm:inset-auto sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-2xl sm:max-h-[90vh] sm:h-auto sm:w-auto sm:rounded-2xl data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%] sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%]"
      >
        <DialogHeader className="shrink-0 px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="w-10 h-1 rounded-full bg-gray-300 mx-auto mb-3 sm:hidden" />
          <DialogTitle className="text-base font-bold text-gray-900">
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            {mode === "edit"
              ? "Modifiez les informations du véhicule ci-dessous."
              : "Remplissez les informations du nouveau véhicule."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <VehicleForm
            data={formData}
            update={handleUpdate}
            onValidityChange={setIsValid}
          />
        </div>

        <div className="shrink-0 flex gap-3 px-5 pb-5 pt-2 border-t border-gray-100" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#4F587E] text-white font-semibold text-sm hover:bg-[#3B4252] transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Enregistrement...
              </>
            ) : (
              "Enregistrer"
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import type { Vehicle } from "@/types";
import type { VehicleType } from "@/types";
import { Pencil, Trash2, Phone, MessageCircle, MapPin, Calendar, Clock, Truck } from "lucide-react";
import { getTelLink, getWhatsAppLink } from "@/lib/contact-utils";
import { getVehicleTypeLabel } from "@/lib/vehicle-utils";
import { formatVehicleDate } from "@/lib/date-utils";

function getUnloadingLabel(unloading: ("lat" | "rear")[]): string {
  if (!Array.isArray(unloading) || unloading.length === 0) return "Non défini";
  const hasLat = unloading.includes("lat");
  const hasRear = unloading.includes("rear");
  if (hasLat && hasRear) return "Latéral + Arrière";
  if (hasLat) return "Latéral";
  if (hasRear) return "Arrière";
  return "Non défini";
}

interface VehicleCardProps {
  vehicle: Vehicle;
  index: number;
  onEdit: (vehicle: Vehicle) => void;
  onDelete: (vehicleId: number) => void;
}

export default function VehicleCard({ vehicle, index, onEdit, onDelete }: VehicleCardProps) {
  const typeLabel = vehicle.size && ["PORTEUR", "PORTEUR_ARTICULE", "SEMI_REMORQUE"].includes(vehicle.size)
    ? getVehicleTypeLabel(vehicle.size as VehicleType)
    : vehicle.size || "Non défini";

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header: plaque + type + actions */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono font-bold text-base text-gray-900 tracking-wider bg-white px-2.5 py-1 rounded-lg border border-gray-200 shadow-sm">
            {vehicle.plate || "—"}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-[#4F587E]/10 text-[#4F587E]">
            <Truck size={12} />
            {typeLabel}
          </span>
          {vehicle.size === "SEMI_REMORQUE" && (
            <span className="text-xs text-gray-500">
              Rem. <span className="font-mono font-medium">{vehicle.trailerPlate || "—"}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            type="button"
            onClick={() => onEdit(vehicle)}
            className="p-2 rounded-lg text-[#4F587E] hover:bg-[#4F587E]/10 transition-colors"
            aria-label={`Éditer le véhicule ${index + 1}`}
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(vehicle.id)}
            className="p-2 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            aria-label={`Supprimer le véhicule ${index + 1}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Body: infos en grille */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 text-sm">
        {/* Téléphone */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Téléphone</span>
          {vehicle.phoneNumber ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-gray-700 text-xs">{vehicle.phoneCode} {vehicle.phoneNumber}</span>
              <a
                href={getTelLink(vehicle.phoneCode, vehicle.phoneNumber)}
                className="p-1 rounded-md bg-green-100 text-green-700 hover:bg-green-200 transition"
                title="Appeler"
              >
                <Phone size={12} />
              </a>
              <a
                href={getWhatsAppLink(vehicle.phoneCode, vehicle.phoneNumber)}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition"
                title="WhatsApp"
              >
                <MessageCircle size={12} />
              </a>
            </div>
          ) : (
            <span className="text-gray-400 italic text-xs">Non renseigné</span>
          )}
        </div>

        {/* Date + Heure */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Date & Heure</span>
          <div className="flex items-center gap-2 text-gray-700 text-xs">
            <span className="inline-flex items-center gap-1">
              <Calendar size={12} className="text-gray-400" />
              {formatVehicleDate(vehicle.date)}
            </span>
            {vehicle.time && (
              <span className="inline-flex items-center gap-1">
                <Clock size={12} className="text-gray-400" />
                {vehicle.time}
              </span>
            )}
          </div>
        </div>

        {/* Ville */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Ville de départ</span>
          <span className="text-gray-700 text-xs inline-flex items-center gap-1">
            <MapPin size={12} className="text-gray-400" />
            {vehicle.city || <span className="text-gray-400 italic">Non renseignée</span>}
          </span>
        </div>

        {/* Déchargement */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Déchargement</span>
          <span className="text-gray-700 text-xs">
            {getUnloadingLabel(vehicle.unloading)}
          </span>
        </div>
      </div>
    </div>
  );
}

export { getUnloadingLabel };

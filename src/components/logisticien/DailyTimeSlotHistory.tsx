"use client";

import { useState, useEffect } from "react";
import { Clock, ChevronDown, ChevronUp, MapPin, LogIn, LogOut, Timer, Loader2 } from "lucide-react";

interface TimeSlotData {
  id: number;
  stepNumber: number;
  zone: string;
  entryAt: string;
  exitAt: string | null;
  duration: number | null;
  vehiclePlate: string;
  vehicleSize: string;
}

interface DayGroup {
  date: string;
  slots: TimeSlotData[];
  totalMinutes: number;
}

const ZONE_LABELS: Record<string, string> = {
  LA_BOCCA: "La Bocca",
  PALAIS_DES_FESTIVALS: "Palais des Festivals",
  PANTIERO: "Pantiero",
  MACE: "Macé",
};

const ZONE_COLORS: Record<string, string> = {
  LA_BOCCA: "bg-orange-100 text-orange-700",
  PALAIS_DES_FESTIVALS: "bg-green-100 text-green-700",
  PANTIERO: "bg-blue-100 text-blue-700",
  MACE: "bg-purple-100 text-purple-700",
};

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

interface Props {
  accreditationId: string;
  className?: string;
}

export default function DailyTimeSlotHistory({ accreditationId, className = "" }: Props) {
  const [days, setDays] = useState<DayGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  useEffect(() => {
    const fetchSlots = async () => {
      try {
        const res = await fetch(`/api/accreditations/${accreditationId}/timeslots`);
        if (res.ok) {
          const data = await res.json();
          setDays(data.days || []);
          // Auto-expand the most recent day
          if (data.days && data.days.length > 0) {
            setExpandedDay(data.days[0].date);
          }
        }
      } catch (err) {
        console.error("Erreur chargement time slots:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSlots();
  }, [accreditationId]);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-gray-400 text-sm py-3 ${className}`}>
        <Loader2 size={14} className="animate-spin" />
        Chargement des créneaux...
      </div>
    );
  }

  if (days.length === 0) {
    return (
      <div className={`text-xs text-gray-400 py-2 ${className}`}>
        Aucun créneau horaire enregistré.
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
        <Timer size={16} className="text-[#4F587E]" />
        Historique des créneaux
      </div>

      {days.map((day) => {
        const isExpanded = expandedDay === day.date;

        return (
          <div key={day.date} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            {/* Day header */}
            <button
              onClick={() => setExpandedDay(isExpanded ? null : day.date)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-gray-400" />
                <span className="text-sm font-medium text-gray-800 capitalize">
                  {formatDate(day.date)}
                </span>
                <span className="text-[10px] px-2 py-0.5 bg-[#4F587E]/10 text-[#4F587E] rounded-full font-semibold">
                  {day.slots.length} étape{day.slots.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {day.totalMinutes > 0 && (
                  <span className="text-xs text-gray-500">
                    Total: <span className="font-semibold">{formatDuration(day.totalMinutes)}</span>
                  </span>
                )}
                {isExpanded ? (
                  <ChevronUp size={14} className="text-gray-400" />
                ) : (
                  <ChevronDown size={14} className="text-gray-400" />
                )}
              </div>
            </button>

            {/* Slots list */}
            {isExpanded && (
              <div className="px-4 pb-3 border-t border-gray-100">
                <div className="relative ml-3 pl-4 border-l-2 border-[#4F587E]/20 space-y-3 py-3">
                  {day.slots.map((slot) => (
                    <div key={slot.id} className="relative">
                      {/* Timeline dot */}
                      <div className="absolute -left-[22px] top-1.5 w-3 h-3 rounded-full bg-[#4F587E] border-2 border-white shadow-sm" />

                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#4F587E] bg-[#4F587E]/10 px-2 py-0.5 rounded-full">
                              Étape {slot.stepNumber}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${ZONE_COLORS[slot.zone] || "bg-gray-100 text-gray-600"}`}>
                              <MapPin size={10} className="inline mr-0.5" />
                              {ZONE_LABELS[slot.zone] || slot.zone}
                            </span>
                          </div>
                          {slot.duration != null && (
                            <span className="text-[10px] text-gray-500 font-medium bg-white px-2 py-0.5 rounded-full border border-gray-200">
                              {formatDuration(slot.duration)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-4 text-xs">
                          <span className="flex items-center gap-1 text-green-700">
                            <LogIn size={10} />
                            {formatTime(slot.entryAt)}
                          </span>
                          {slot.exitAt ? (
                            <span className="flex items-center gap-1 text-red-600">
                              <LogOut size={10} />
                              {formatTime(slot.exitAt)}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-blue-500 animate-pulse">
                              <Clock size={10} />
                              En cours
                            </span>
                          )}
                          <span className="text-gray-400 font-mono">
                            {slot.vehiclePlate}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

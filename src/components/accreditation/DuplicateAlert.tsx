"use client";

import { useState, useEffect, useRef } from "react";
import { AlertTriangle, X, Eye, ChevronDown, ChevronUp } from "lucide-react";

interface DuplicateInfo {
  id: string;
  company: string;
  stand: string;
  event: string;
  status: string;
  createdAt: string;
  currentZone?: string | null;
  vehicles: {
    plate: string;
    size: string;
    trailerPlate?: string | null;
    city: string;
  }[];
}

interface DuplicateAlertProps {
  company: string;
  plate: string;
  trailerPlate?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  ATTENTE: "En attente",
  ENTREE: "Entrée",
  SORTIE: "Sortie",
  NOUVEAU: "Nouveau",
  REFUS: "Refusé",
  ABSENT: "Absent",
};

export default function DuplicateAlert({
  company,
  plate,
  trailerPlate,
  onConfirm,
  onCancel,
}: DuplicateAlertProps) {
  const [duplicates, setDuplicates] = useState<DuplicateInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const checkDuplicates = async () => {
      try {
        const res = await fetch("/api/accreditations/check-duplicate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company, plate, trailerPlate }),
        });
        if (res.ok) {
          const data = await res.json();
          setDuplicates(data.duplicates || []);
        }
      } catch {
        // Silently fail — don't block creation
      } finally {
        setLoading(false);
      }
    };

    checkDuplicates();
  }, [company, plate, trailerPlate]);

  // Auto-confirm si aucun doublon trouvé — via useEffect pour éviter le setState pendant le render
  const autoConfirmed = useRef(false);
  useEffect(() => {
    if (!loading && duplicates.length === 0 && !autoConfirmed.current) {
      autoConfirmed.current = true;
      onConfirm();
    }
  }, [loading, duplicates.length, onConfirm]);

  if (loading) return null;
  if (duplicates.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-amber-50 border-b border-amber-200 rounded-t-2xl px-6 py-4 flex items-start gap-3">
          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={24} />
          <div className="flex-1">
            <h2 className="text-lg font-bold text-amber-900">
              Doublon détecté
            </h2>
            <p className="text-sm text-amber-700 mt-1">
              Une accréditation avec les mêmes informations existe déjà.
              Voulez-vous quand même créer cette accréditation ?
            </p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Duplicates list */}
        <div className="px-6 py-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase">
            Accréditation{duplicates.length > 1 ? "s" : ""} existante{duplicates.length > 1 ? "s" : ""}
          </p>

          {duplicates.map((dup) => (
            <div
              key={dup.id}
              className="border border-gray-200 rounded-xl overflow-hidden"
            >
              <button
                onClick={() => setExpandedId(expandedId === dup.id ? null : dup.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
              >
                <div className="flex items-center gap-3 text-left">
                  <div
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      dup.status === "ENTREE"
                        ? "bg-green-100 text-green-700"
                        : dup.status === "SORTIE"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {STATUS_LABELS[dup.status] || dup.status}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{dup.company}</p>
                    <p className="text-xs text-gray-500">
                      {dup.event} • {new Date(dup.createdAt).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                </div>
                {expandedId === dup.id ? (
                  <ChevronUp size={16} className="text-gray-400" />
                ) : (
                  <ChevronDown size={16} className="text-gray-400" />
                )}
              </button>

              {expandedId === dup.id && (
                <div className="px-4 pb-3 border-t border-gray-100 bg-gray-50/50">
                  <div className="grid grid-cols-2 gap-3 py-3 text-xs">
                    <div>
                      <span className="text-gray-500">Stand</span>
                      <p className="font-semibold text-gray-800">{dup.stand}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Zone</span>
                      <p className="font-semibold text-gray-800">{dup.currentZone || "N/A"}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">Véhicules :</p>
                  {dup.vehicles.map((v, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs bg-white rounded-lg px-3 py-2 mb-1 border border-gray-100"
                    >
                      <span className="font-mono font-bold text-gray-800">{v.plate}</span>
                      <span className="text-gray-400">•</span>
                      <span className="text-gray-600">{v.size}</span>
                      {v.trailerPlate && (
                        <>
                          <span className="text-gray-400">•</span>
                          <span className="text-gray-600">Remorque: {v.trailerPlate}</span>
                        </>
                      )}
                      <span className="text-gray-400">•</span>
                      <span className="text-gray-500">{v.city}</span>
                    </div>
                  ))}
                  <a
                    href={`/logisticien?sel=${dup.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-[#4F587E] font-semibold hover:underline"
                  >
                    <Eye size={12} />
                    Voir cette accréditation
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 transition"
          >
            Créer quand même
          </button>
        </div>
      </div>
    </div>
  );
}

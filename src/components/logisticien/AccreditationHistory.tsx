"use client";

import { useState, useEffect } from "react";
import { Clock, User, Edit, Trash2, Mail, Plus, Minus, Archive } from "lucide-react";
import { getAccreditationHistory } from "@/lib/history";

interface HistoryEntry {
  id: number;
  action:
    | "CREATED"
    | "STATUS_CHANGED"
    | "VEHICLE_ADDED"
    | "VEHICLE_REMOVED"
    | "VEHICLE_UPDATED"
    | "EMAIL_SENT"
    | "INFO_UPDATED"
    | "DELETED"
    | "ZONE_CHANGED"
    | "ZONE_TRANSFER";
  field?: string;
  oldValue?: string;
  newValue?: string;
  createdAt: string;
  userId?: string;
  userName?: string | null;
  userEmail?: string | null;
  description: string;
  isArchived?: boolean;
}

interface AccreditationHistoryProps {
  accreditationId: string;
  className?: string;
}

export default function AccreditationHistory({
  accreditationId,
  className = "",
}: AccreditationHistoryProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);
      try {
        const historyData = await getAccreditationHistory(accreditationId);
        setHistory(historyData);
      } catch (error) {
        console.error("Erreur lors du chargement de l'historique:", error);
        setHistory([]);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [accreditationId]);

  const getActionIcon = (action: HistoryEntry["action"]) => {
    switch (action) {
      case "STATUS_CHANGED":
        return <Edit size={16} className="text-blue-600" />;
      case "VEHICLE_ADDED":
        return <Plus size={16} className="text-green-600" />;
      case "VEHICLE_REMOVED":
        return <Minus size={16} className="text-red-600" />;
      case "VEHICLE_UPDATED":
        return <Edit size={16} className="text-orange-600" />;
      case "EMAIL_SENT":
        return <Mail size={16} className="text-green-600" />;
      case "CREATED":
        return <Plus size={16} className="text-green-600" />;
      case "DELETED":
        return <Trash2 size={16} className="text-red-600" />;
      case "INFO_UPDATED":
        return <Edit size={16} className="text-blue-600" />;
      case "ZONE_CHANGED":
      case "ZONE_TRANSFER":
        return <Edit size={16} className="text-purple-600" />;
      default:
        return <Clock size={16} className="text-gray-600" />;
    }
  };

  const getActionColor = (action: HistoryEntry["action"]) => {
    switch (action) {
      case "STATUS_CHANGED":
        return "border-l-blue-500 bg-blue-50";
      case "VEHICLE_ADDED":
        return "border-l-green-500 bg-green-50";
      case "VEHICLE_REMOVED":
        return "border-l-red-500 bg-red-50";
      case "VEHICLE_UPDATED":
        return "border-l-orange-500 bg-orange-50";
      case "EMAIL_SENT":
        return "border-l-green-500 bg-green-50";
      case "CREATED":
        return "border-l-green-500 bg-green-50";
      case "DELETED":
        return "border-l-red-500 bg-red-50";
      case "INFO_UPDATED":
        return "border-l-blue-500 bg-blue-50";
      case "ZONE_CHANGED":
      case "ZONE_TRANSFER":
        return "border-l-purple-500 bg-purple-50";
      default:
        return "border-l-gray-500 bg-gray-50";
    }
  };

  /** Affiche le nom de l'utilisateur ou "Formulaire" si pas d'utilisateur */
  const getUserDisplay = (entry: HistoryEntry) => {
    if (entry.userName) return entry.userName;
    if (entry.userEmail) return entry.userEmail;
    if (entry.userId === "system") return "Système";
    if (entry.userId) return "Utilisateur";
    return "Formulaire";
  };

  if (loading) {
    return (
      <div
        className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`}
      >
        <div className="flex items-center gap-2 mb-4">
          <Clock size={20} className="text-[#4F587E]" />
          <h3 className="font-semibold text-[#4F587E]">
            Historique des modifications
          </h3>
        </div>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-4 h-4 bg-gray-200 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`}
    >
      <div className="flex items-center gap-2 mb-4">
        <Clock size={20} className="text-[#4F587E]" />
        <h3 className="font-semibold text-[#4F587E]">
          Historique des modifications
        </h3>
      </div>

      {history.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Clock size={48} className="mx-auto mb-2 text-gray-300" />
          <p>Aucune modification enregistrée</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {history.map((entry) => (
            <div
              key={entry.id}
              className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${getActionColor(entry.action)}`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {getActionIcon(entry.action)}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {entry.description}
                </p>

                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-gray-500">
                    {new Date(entry.createdAt).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>

                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <User size={12} />
                    <span>{getUserDisplay(entry)}</span>
                  </div>

                  {entry.isArchived && (
                    <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                      <Archive size={10} />
                      <span>Archivé</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

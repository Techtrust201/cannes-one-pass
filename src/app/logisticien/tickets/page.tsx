"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, MessageSquare } from "lucide-react";

interface TicketRow {
  id: string;
  stand: string;
  email: string;
  phone: string | null;
  message: string;
  status: "OPEN" | "IN_PROGRESS" | "ANSWERED" | "CLOSED";
  createdAt: string;
  organization: { id: string; slug: string; name: string };
  eventRef: { id: string; slug: string; name: string } | null;
  _count: { replies: number };
}

const STATUS_LABEL: Record<TicketRow["status"], string> = {
  OPEN: "Nouveau",
  IN_PROGRESS: "En cours",
  ANSWERED: "Répondu",
  CLOSED: "Fermé",
};
const STATUS_COLOR: Record<TicketRow["status"], string> = {
  OPEN: "bg-orange-100 text-orange-700 border-orange-200",
  IN_PROGRESS: "bg-blue-100 text-blue-700 border-blue-200",
  ANSWERED: "bg-green-100 text-green-700 border-green-200",
  CLOSED: "bg-gray-100 text-gray-600 border-gray-200",
};

export default function TicketsListPage() {
  const searchParams = useSearchParams();
  const espace = searchParams?.get("espace") ?? null;

  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams();
    if (espace) qs.set("espace", espace);
    if (statusFilter) qs.set("status", statusFilter);
    fetch(`/api/tickets?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => !cancelled && setTickets(Array.isArray(data) ? data : []))
      .catch(() => !cancelled && setTickets([]));
    return () => {
      cancelled = true;
    };
  }, [espace, statusFilter]);

  if (tickets === null) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="animate-spin" size={18} /> Chargement…
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 min-w-0">
          <MessageSquare size={20} className="shrink-0" />
          <span className="truncate">Tickets de support</span>
          {espace && (
            <span className="text-xs font-normal text-gray-500 ml-1 shrink-0">— Espace : {espace}</span>
          )}
        </h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-md px-2 py-1 text-sm"
        >
          <option value="">Tous statuts</option>
          <option value="OPEN">Nouveaux</option>
          <option value="IN_PROGRESS">En cours</option>
          <option value="ANSWERED">Répondus</option>
          <option value="CLOSED">Fermés</option>
        </select>
      </div>

      {tickets.length === 0 ? (
        <p className="text-sm text-gray-500">Aucun ticket à afficher.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600 border-b">
              <tr>
                <th className="text-left py-2 px-3">Statut</th>
                <th className="text-left py-2 px-3">Stand</th>
                <th className="text-left py-2 px-3">Demandeur</th>
                <th className="text-left py-2 px-3">Message</th>
                <th className="text-left py-2 px-3">Date</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-2 px-3">
                    <span
                      className={`inline-block text-xs font-semibold border rounded-full px-2 py-0.5 ${STATUS_COLOR[t.status]}`}
                    >
                      {STATUS_LABEL[t.status]}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-medium">{t.stand}</td>
                  <td className="py-2 px-3">
                    <div className="text-gray-800">{t.email}</div>
                    {t.phone && <div className="text-xs text-gray-500">{t.phone}</div>}
                  </td>
                  <td className="py-2 px-3 text-gray-700 max-w-md">
                    <div className="line-clamp-2">{t.message}</div>
                  </td>
                  <td className="py-2 px-3 text-xs text-gray-500">
                    {new Date(t.createdAt).toLocaleString("fr-FR")}
                  </td>
                  <td className="py-2 px-3">
                    <Link
                      href={`/logisticien/tickets/${t.id}${espace ? `?espace=${espace}` : ""}`}
                      className="text-primary text-xs hover:underline"
                    >
                      Ouvrir →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

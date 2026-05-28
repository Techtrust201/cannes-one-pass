"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Mail, MailX, Send } from "lucide-react";

interface Reply {
  id: string;
  body: string;
  sentByEmail: boolean;
  createdAt: string;
  author: { id: string; name: string; email: string };
}

interface TicketDetail {
  id: string;
  stand: string;
  email: string;
  phone: string | null;
  message: string;
  status: "OPEN" | "IN_PROGRESS" | "ANSWERED" | "CLOSED";
  createdAt: string;
  organization: { id: string; slug: string; name: string };
  eventRef: { id: string; slug: string; name: string } | null;
  replies: Reply[];
}

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const espace = searchParams?.get("espace") ?? null;

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    fetch(`/api/tickets/${params.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setTicket(data));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function handleReply() {
    if (!replyBody.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${params.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyBody.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Échec de l'envoi");
        return;
      }
      setReplyBody("");
      reload();
    } catch (err) {
      console.error(err);
      setError("Erreur réseau");
    } finally {
      setSending(false);
    }
  }

  async function setStatus(status: TicketDetail["status"]) {
    await fetch(`/api/tickets/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    reload();
  }

  if (!ticket) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="animate-spin" size={18} /> Chargement…
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <Link
        href={`/logisticien/tickets${espace ? `?espace=${espace}` : ""}`}
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft size={16} /> Tous les tickets
      </Link>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl sm:text-2xl font-bold">Ticket — {ticket.stand}</h1>
        <select
          value={ticket.status}
          onChange={(e) => setStatus(e.target.value as TicketDetail["status"])}
          className="border rounded-md px-2 py-1 text-sm"
        >
          <option value="OPEN">Nouveau</option>
          <option value="IN_PROGRESS">En cours</option>
          <option value="ANSWERED">Répondu</option>
          <option value="CLOSED">Fermé</option>
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="text-xs text-gray-500 mb-2">
          {ticket.email}
          {ticket.phone ? ` · ${ticket.phone}` : ""} ·{" "}
          {new Date(ticket.createdAt).toLocaleString("fr-FR")}
        </div>
        <p className="whitespace-pre-wrap text-sm">{ticket.message}</p>
      </div>

      <h2 className="text-sm font-semibold text-gray-700 mb-2">
        Conversation ({ticket.replies.length})
      </h2>
      <div className="space-y-2 mb-4">
        {ticket.replies.map((r) => (
          <div key={r.id} className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <div className="flex items-center justify-between text-xs text-blue-900 mb-1">
              <span>
                <strong>{r.author.name}</strong> · {new Date(r.createdAt).toLocaleString("fr-FR")}
              </span>
              {r.sentByEmail ? (
                <span className="inline-flex items-center gap-1 text-green-700">
                  <Mail size={12} /> Envoyé par email
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-orange-700">
                  <MailX size={12} /> Email non envoyé
                </span>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm text-gray-800">{r.body}</p>
          </div>
        ))}
        {ticket.replies.length === 0 && (
          <p className="text-sm text-gray-500 italic">Aucune réponse pour le moment.</p>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Répondre</h2>
        <textarea
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          rows={5}
          placeholder="Tapez votre réponse…"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-primary focus:border-primary"
        />
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
            {error}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={handleReply}
            disabled={sending || replyBody.trim().length === 0}
            className="inline-flex items-center gap-2 bg-primary text-white text-sm px-4 py-2 rounded-md disabled:opacity-60"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Envoyer la réponse
          </button>
        </div>
      </div>
    </div>
  );
}

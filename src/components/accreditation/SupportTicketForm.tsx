"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  orgSlug: string;
  orgName: string;
}

/**
 * Formulaire public d'ouverture de ticket. Champs :
 *   - Stand (saisi à la main par l'exposant)
 *   - Email (requis, validé)
 *   - Téléphone (optionnel)
 *   - Message (textarea, requis)
 *
 * Soumet à `POST /api/tickets` avec le `organizationSlug` de l'URL.
 */
export function SupportTicketForm({ orgSlug, orgName }: Props) {
  const [stand, setStand] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid =
    stand.trim().length > 0 &&
    /.+@.+\..+/.test(email) &&
    message.trim().length > 4;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationSlug: orgSlug,
          stand: stand.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          message: message.trim(),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Erreur lors de l'envoi du ticket.");
        return;
      }
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setError("Erreur réseau, réessayez.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center text-center gap-3 py-8">
        <CheckCircle2 size={48} className="text-green-500" />
        <h2 className="text-xl font-bold text-gray-800">Ticket envoyé</h2>
        <p className="text-sm text-gray-600 max-w-md">
          Merci ! L&apos;équipe {orgName} reviendra vers vous à l&apos;adresse <strong>{email}</strong> dès
          que possible.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-gray-600">
        Décrivez votre demande à l&apos;équipe {orgName}. Une réponse vous sera envoyée par email.
      </p>

      <div className="space-y-1">
        <label className="text-sm font-semibold text-gray-700">
          Stand <span className="text-red-500">*</span>
        </label>
        <input
          value={stand}
          onChange={(e) => setStand(e.target.value)}
          placeholder="ex: PALAIS 110"
          className={cn(
            "w-full border rounded-md px-3 py-2 text-sm focus:ring-primary focus:border-primary",
            !stand.trim() ? "border-red-300" : "border-gray-300"
          )}
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-semibold text-gray-700">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@exemple.com"
          className={cn(
            "w-full border rounded-md px-3 py-2 text-sm focus:ring-primary focus:border-primary",
            !/.+@.+\..+/.test(email) ? "border-red-300" : "border-gray-300"
          )}
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-semibold text-gray-700">
          Téléphone <span className="text-gray-400 text-xs font-normal">(optionnel)</span>
        </label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+33 6 12 34 56 78"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-primary focus:border-primary"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-semibold text-gray-700">
          Message <span className="text-red-500">*</span>
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder="Décrivez votre demande…"
          className={cn(
            "w-full border rounded-md px-3 py-2 text-sm focus:ring-primary focus:border-primary",
            message.trim().length < 5 ? "border-red-300" : "border-gray-300"
          )}
        />
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!isValid || loading}
        className="w-full inline-flex items-center justify-center gap-2 bg-primary text-white font-semibold py-3 rounded-xl shadow disabled:opacity-60"
      >
        {loading && <Loader2 size={16} className="animate-spin" />}
        Envoyer le ticket
      </button>
    </form>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  orgSlug: string;
  /** Conservé pour compatibilité d'appel ; le message ticket reste générique. */
  orgName?: string;
}

interface EventOption {
  slug: string;
  name: string;
}

/**
 * Formulaire public d'ouverture de ticket.
 *
 * - Palais (variante par défaut) : Stand, Email, Téléphone (optionnel), Message.
 * - RX (`orgSlug === "rx"`) : Événement (liste), Société, Email, Téléphone,
 *   Objet (type de problème), Identification (plaque / n° demande / stand),
 *   Message — tous obligatoires. Le champ identification permet au logisticien
 *   de retrouver la demande même si l'exposant se trompe d'événement.
 *
 * Le message reste générique (pas focalisé sur un événement précis), car
 * l'URL publique est commune à tous les événements de l'organisation.
 */
const PROBLEM_TYPES = [
  { value: "accreditation", label: "Accréditation" },
  { value: "creneau", label: "Créneau / horaire" },
  { value: "zone", label: "Zone / accès" },
  { value: "autre", label: "Autre" },
];

export function SupportTicketForm({ orgSlug }: Props) {
  const isRx = orgSlug.toLowerCase() === "rx";

  const [stand, setStand] = useState("");
  const [company, setCompany] = useState("");
  const [eventSlug, setEventSlug] = useState("");
  const [problemType, setProblemType] = useState("");
  const [identification, setIdentification] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Charge les événements de l'organisation pour le menu déroulant (RX).
  useEffect(() => {
    if (!isRx) return;
    let cancelled = false;
    fetch(`/api/events?espace=${encodeURIComponent(orgSlug)}&active=true`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return;
        setEvents(
          data
            .map((e: { slug?: string; name?: string }) => ({
              slug: e.slug ?? "",
              name: e.name ?? e.slug ?? "",
            }))
            .filter((e: EventOption) => e.slug)
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isRx, orgSlug]);

  const emailValid = /.+@.+\..+/.test(email);
  const messageValid = message.trim().length > 4;

  const isValid = isRx
    ? eventSlug.trim().length > 0 &&
      company.trim().length > 0 &&
      emailValid &&
      phone.trim().length > 0 &&
      problemType.trim().length > 0 &&
      identification.trim().length > 0 &&
      messageValid
    : stand.trim().length > 0 && emailValid && messageValid;

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
          eventSlug: isRx ? eventSlug.trim() : undefined,
          stand: isRx ? undefined : stand.trim(),
          company: isRx ? company.trim() : undefined,
          problemType: isRx ? problemType : undefined,
          identification: isRx ? identification.trim() : undefined,
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
        <h2 className="text-xl font-bold text-gray-800">Demande prise en compte</h2>
        <p className="text-sm text-gray-600 max-w-md">
          Merci, votre demande a bien été prise en compte. L&apos;équipe logistique
          reviendra vers vous à l&apos;adresse <strong>{email}</strong> dans les
          meilleurs délais.
        </p>
      </div>
    );
  }

  const inputClass = (ok: boolean) =>
    cn(
      "w-full border rounded-md px-3 py-2 text-sm focus:ring-primary focus:border-primary",
      ok ? "border-gray-300" : "border-red-300"
    );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-gray-600">
        Décrivez votre demande à l&apos;équipe logistique. Une réponse vous sera
        envoyée par email.
      </p>

      {isRx ? (
        <>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">
              Événement <span className="text-red-500">*</span>
            </label>
            <select
              value={eventSlug}
              onChange={(e) => setEventSlug(e.target.value)}
              className={inputClass(eventSlug.trim().length > 0)}
            >
              <option value="">— Sélectionnez l&apos;événement —</option>
              {events.map((ev) => (
                <option key={ev.slug} value={ev.slug}>
                  {ev.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">
              Société <span className="text-red-500">*</span>
            </label>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Nom de votre société"
              className={inputClass(company.trim().length > 0)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">
              Objet (type de problème) <span className="text-red-500">*</span>
            </label>
            <select
              value={problemType}
              onChange={(e) => setProblemType(e.target.value)}
              className={inputClass(problemType.trim().length > 0)}
            >
              <option value="">— Sélectionnez —</option>
              {PROBLEM_TYPES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">
              Identification <span className="text-red-500">*</span>
            </label>
            <input
              value={identification}
              onChange={(e) => setIdentification(e.target.value)}
              placeholder="Plaque, n° de demande ou stand"
              className={inputClass(identification.trim().length > 0)}
            />
            <p className="text-[11px] text-gray-400">
              Aide le support à retrouver votre demande (plaque du véhicule,
              identifiant de demande, ou numéro de stand).
            </p>
          </div>
        </>
      ) : (
        <div className="space-y-1">
          <label className="text-sm font-semibold text-gray-700">
            Stand <span className="text-red-500">*</span>
          </label>
          <input
            value={stand}
            onChange={(e) => setStand(e.target.value)}
            placeholder="ex: PALAIS 110"
            className={inputClass(stand.trim().length > 0)}
          />
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm font-semibold text-gray-700">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@exemple.com"
          className={inputClass(emailValid)}
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-semibold text-gray-700">
          Téléphone{" "}
          {isRx ? (
            <span className="text-red-500">*</span>
          ) : (
            <span className="text-gray-400 text-xs font-normal">(optionnel)</span>
          )}
        </label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+33 6 12 34 56 78"
          className={inputClass(!isRx || phone.trim().length > 0)}
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
          className={inputClass(messageValid)}
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
        Envoyer la demande
      </button>
    </form>
  );
}

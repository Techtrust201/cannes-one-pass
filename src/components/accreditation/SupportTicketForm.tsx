"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "./TranslationProvider";

interface Props {
  orgSlug: string;
  /** Conservé pour compatibilité d'appel ; le message ticket reste générique. */
  orgName?: string;
}

interface EventOption {
  slug: string;
  name: string;
}

const PROBLEM_TYPE_VALUES = [
  { value: "accreditation", key: "problemAccreditation" as const },
  { value: "creneau", key: "problemCreneau" as const },
  { value: "zone", key: "problemZone" as const },
  { value: "autre", key: "problemAutre" as const },
];

/**
 * Formulaire public d'ouverture de ticket.
 */
export function SupportTicketForm({ orgSlug }: Props) {
  const { t } = useTranslation();
  const s = t.support;
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
        setError(data.error ?? s.submitError);
        return;
      }
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setError(s.networkError);
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    const successParts = s.successMessage.split("{email}");
    return (
      <div className="flex flex-col items-center text-center gap-3 py-8">
        <CheckCircle2 size={48} className="text-green-500" />
        <h2 className="text-xl font-bold text-gray-800">{s.successTitle}</h2>
        <p className="text-sm text-gray-600 max-w-md">
          {successParts[0]}
          <strong>{email}</strong>
          {successParts[1] ?? ""}
        </p>
      </div>
    );
  }

  const inputClass = (ok: boolean) =>
    cn(
      "w-full border rounded-md px-3 py-2 text-sm focus:ring-primary focus:border-primary",
      ok ? "border-gray-300" : "border-red-300"
    );

  const requiredMark = <span className="text-red-500">*</span>;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-gray-600">{s.intro}</p>

      {isRx ? (
        <>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">
              {s.event} {requiredMark}
            </label>
            <select
              value={eventSlug}
              onChange={(e) => setEventSlug(e.target.value)}
              className={inputClass(eventSlug.trim().length > 0)}
            >
              <option value="">{s.selectEvent}</option>
              {events.map((ev) => (
                <option key={ev.slug} value={ev.slug}>
                  {ev.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">
              {s.company} {requiredMark}
            </label>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder={s.companyPlaceholder}
              className={inputClass(company.trim().length > 0)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">
              {s.problemType} {requiredMark}
            </label>
            <select
              value={problemType}
              onChange={(e) => setProblemType(e.target.value)}
              className={inputClass(problemType.trim().length > 0)}
            >
              <option value="">{s.selectProblem}</option>
              {PROBLEM_TYPE_VALUES.map((p) => (
                <option key={p.value} value={p.value}>
                  {s[p.key]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">
              {s.identification} {requiredMark}
            </label>
            <input
              value={identification}
              onChange={(e) => setIdentification(e.target.value)}
              placeholder={s.identificationPlaceholder}
              className={inputClass(identification.trim().length > 0)}
            />
            <p className="text-[11px] text-gray-400">{s.identificationHint}</p>
          </div>
        </>
      ) : (
        <div className="space-y-1">
          <label className="text-sm font-semibold text-gray-700">
            {s.stand} {requiredMark}
          </label>
          <input
            value={stand}
            onChange={(e) => setStand(e.target.value)}
            placeholder={s.standPlaceholder}
            className={inputClass(stand.trim().length > 0)}
          />
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm font-semibold text-gray-700">
          {s.email} {requiredMark}
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={s.emailPlaceholder}
          className={inputClass(emailValid)}
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-semibold text-gray-700">
          {s.phone}{" "}
          {isRx ? (
            requiredMark
          ) : (
            <span className="text-gray-400 text-xs font-normal">{s.phoneOptional}</span>
          )}
        </label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={s.phonePlaceholder}
          className={inputClass(!isRx || phone.trim().length > 0)}
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-semibold text-gray-700">
          {s.message} {requiredMark}
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder={s.messagePlaceholder}
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
        {s.submit}
      </button>
    </form>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import type { Event } from "@/types";
import EventCalendar from "@/components/dates/EventCalendar";
import EventSheet from "@/components/dates/EventSheet";
import { Plus, RefreshCw } from "lucide-react";

export default function DatesPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [saving, setSaving] = useState(false);
  const [defaultDate, setDefaultDate] = useState<string>("");

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/events");
      if (res.ok) setEvents(await res.json());
    } catch {
      /* silently fail */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  function openCreate(date?: Date) {
    setSelectedEvent(null);
    if (date) setDefaultDate(date.toISOString().split("T")[0]);
    else setDefaultDate("");
    setSheetOpen(true);
  }

  function openEdit(event: Event) {
    setSelectedEvent(event);
    setDefaultDate("");
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setSelectedEvent(null);
    setDefaultDate("");
  }

  async function handleSave(data: Record<string, unknown>): Promise<string | void> {
    setSaving(true);
    try {
      const url = selectedEvent
        ? `/api/events/${selectedEvent.id}`
        : "/api/events";
      const method = selectedEvent ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Erreur lors de la sauvegarde");
      }

      const created = await res.json();
      await fetchEvents();
      closeSheet();
      return created?.id;
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedEvent) return;
    const confirmed = window.confirm(
      `Archiver « ${selectedEvent.name} » ? L'événement ne sera plus visible.`
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      await fetch(`/api/events/${selectedEvent.id}`, { method: "DELETE" });
      await fetchEvents();
      closeSheet();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-4 border-[#3F4660] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">
            Gestion des événements
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {events.length} événement{events.length !== 1 ? "s" : ""} planifié{events.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchEvents}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-500"
            title="Rafraîchir"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => openCreate()}
            className="flex items-center gap-2 bg-[#3F4660] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#2C2F3F] transition-colors"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Nouvel événement</span>
          </button>
        </div>
      </div>

      {/* Calendar */}
      <EventCalendar
        events={events}
        onEventClick={openEdit}
        onCreateAtDate={(d) => openCreate(d)}
      />

      {/* Sheet */}
      <EventSheet
        key={selectedEvent?.id ?? defaultDate ?? "new"}
        open={sheetOpen}
        onClose={closeSheet}
        event={selectedEvent}
        onSave={handleSave}
        onDelete={selectedEvent ? handleDelete : undefined}
        saving={saving}
        defaultStartDate={defaultDate}
      />
    </div>
  );
}

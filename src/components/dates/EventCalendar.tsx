"use client";

import { useState, useMemo } from "react";
import type { Event } from "@/types";
import { cn } from "@/lib/utils";
import EventStatusBadge from "./EventStatusBadge";
import { ChevronLeft, ChevronRight, CalendarDays, LayoutGrid, CalendarRange } from "lucide-react";

type ViewMode = "day" | "month" | "year";

const MONTHS_FULL = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const MONTHS_SHORT = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
const DAYS_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

interface Props {
  events: Event[];
  onEventClick: (event: Event) => void;
  onCreateAtDate?: (date: Date) => void;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dateInRange(date: Date, start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const s = new Date(new Date(start).toDateString());
  const e = new Date(new Date(end).toDateString());
  return d >= s && d <= e;
}

function getPhase(date: Date, event: Event): "setup" | "event" | "teardown" | null {
  if (dateInRange(date, event.setupStartDate, event.setupEndDate)) return "setup";
  if (dateInRange(date, event.startDate, event.endDate)) return "event";
  if (dateInRange(date, event.teardownStartDate, event.teardownEndDate)) return "teardown";
  return null;
}

function isEventOnDate(date: Date, event: Event): boolean {
  return getPhase(date, event) !== null;
}

const phaseLabels = { setup: "Montage", event: "Événement", teardown: "Démontage" };
const phaseColors = {
  setup: "bg-amber-100 text-amber-800 border-amber-300",
  event: "",
  teardown: "bg-violet-100 text-violet-800 border-violet-300",
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateShort(d: Date) {
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// ─── Day View ────────────────────────────────────────────

function DayView({ date, events, onEventClick }: {
  date: Date;
  events: Event[];
  onEventClick: (e: Event) => void;
}) {
  const dayEvents = events.filter((e) => isEventOnDate(date, e));

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-500 capitalize">{fmtDateShort(date)}</p>

      {dayEvents.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <CalendarDays className="mx-auto mb-2 text-gray-300" size={32} />
          <p className="text-sm">Aucun événement ce jour</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {dayEvents.map((event) => {
            const phase = getPhase(date, event)!;
            return (
              <button
                key={event.id}
                onClick={() => onEventClick(event)}
                className="w-full text-left border rounded-xl p-4 hover:shadow-md transition-shadow bg-white group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: event.color }} />
                      <span className="font-semibold text-gray-800 truncate">{event.name}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span className={cn("px-2 py-0.5 rounded-full border text-[11px] font-medium", phaseColors[phase] || "bg-gray-100 text-gray-700 border-gray-200")}
                        style={phase === "event" ? { backgroundColor: event.color + "20", color: event.color, borderColor: event.color + "40" } : {}}>
                        {phaseLabels[phase]}
                      </span>
                      <span>{fmtDate(event.startDate)} → {fmtDate(event.endDate)}</span>
                    </div>
                    {event.location && (
                      <p className="text-xs text-gray-400 mt-1">{event.location}</p>
                    )}
                    {event.accessStartTime && event.accessEndTime && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Accès : {event.accessStartTime} – {event.accessEndTime}
                      </p>
                    )}
                  </div>
                  <EventStatusBadge event={event} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Month View ──────────────────────────────────────────

function MonthView({ year, month, events, selectedDate, onSelectDate, onEventClick }: {
  year: number;
  month: number;
  events: Event[];
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  onEventClick: (e: Event) => void;
}) {
  const today = useMemo(() => new Date(), []);

  const { days, startOffset } = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let offset = firstDay.getDay() - 1;
    if (offset < 0) offset = 6;

    const d: Date[] = [];
    for (let i = 1; i <= lastDay.getDate(); i++) {
      d.push(new Date(year, month, i));
    }
    return { days: d, startOffset: offset };
  }, [year, month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<number, { event: Event; phase: "setup" | "event" | "teardown" }[]>();
    for (const day of days) {
      const items: { event: Event; phase: "setup" | "event" | "teardown" }[] = [];
      for (const ev of events) {
        const phase = getPhase(day, ev);
        if (phase) items.push({ event: ev, phase });
      }
      if (items.length > 0) map.set(day.getDate(), items);
    }
    return map;
  }, [days, events]);

  return (
    <div className="space-y-3">
      {/* Calendar grid */}
      <div className="border rounded-xl bg-white overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b bg-gray-50/80">
          {DAYS_SHORT.map((d) => (
            <div key={d} className="text-center py-2 text-[11px] font-semibold text-gray-500 uppercase">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {Array.from({ length: startOffset }).map((_, i) => (
            <div key={`pad-${i}`} className="border-b border-r border-gray-50 min-h-[80px] sm:min-h-[100px]" />
          ))}

          {days.map((day) => {
            const dayNum = day.getDate();
            const dayEvents = eventsByDay.get(dayNum);
            const isToday = isSameDay(day, today);
            const isSelected = isSameDay(day, selectedDate);

            return (
              <button
                key={dayNum}
                onClick={() => onSelectDate(day)}
                className={cn(
                  "border-b border-r border-gray-50 min-h-[80px] sm:min-h-[100px] p-1.5 text-left transition-colors relative flex flex-col",
                  isSelected ? "bg-blue-50/80 ring-1 ring-inset ring-blue-200" : "hover:bg-gray-50/50",
                )}
              >
                {/* Day number */}
                <span className={cn(
                  "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium mb-1",
                  isToday ? "bg-red-500 text-white" : isSelected ? "bg-blue-500 text-white" : "text-gray-700",
                )}>
                  {dayNum}
                </span>

                {/* Event indicators */}
                <div className="flex-1 space-y-0.5 overflow-hidden">
                  {dayEvents?.slice(0, 3).map(({ event, phase }) => (
                    <div
                      key={event.id}
                      onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                      className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium truncate cursor-pointer hover:opacity-80 transition-opacity"
                      style={{
                        backgroundColor: phase === "event" ? event.color + "25" : phase === "setup" ? "#fbbf2430" : "#a78bfa30",
                        color: phase === "event" ? event.color : phase === "setup" ? "#92400e" : "#6d28d9",
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: phase === "event" ? event.color : phase === "setup" ? "#f59e0b" : "#8b5cf6" }} />
                      <span className="truncate hidden sm:inline">{event.name}</span>
                    </div>
                  ))}
                  {dayEvents && dayEvents.length > 3 && (
                    <span className="text-[10px] text-gray-400 pl-1">+{dayEvents.length - 3}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day detail below calendar */}
      <div className="border rounded-xl bg-white p-4">
        <DayView date={selectedDate} events={events} onEventClick={onEventClick} />
      </div>
    </div>
  );
}

// ─── Year View ───────────────────────────────────────────

function YearView({ year, events, onSelectMonth, onEventClick }: {
  year: number;
  events: Event[];
  onSelectMonth: (month: number) => void;
  onEventClick: (e: Event) => void;
}) {
  const monthData = useMemo(() => {
    return MONTHS_FULL.map((name, idx) => {
      const start = new Date(year, idx, 1);
      const end = new Date(year, idx + 1, 0);
      const monthEvents: Event[] = [];

      for (const ev of events) {
        const evStart = new Date(ev.startDate);
        const evEnd = new Date(ev.endDate);
        const setupStart = ev.setupStartDate ? new Date(ev.setupStartDate) : null;
        const teardownEnd = ev.teardownEndDate ? new Date(ev.teardownEndDate) : null;

        const earliest = setupStart && setupStart < evStart ? setupStart : evStart;
        const latest = teardownEnd && teardownEnd > evEnd ? teardownEnd : evEnd;

        if (earliest <= end && latest >= start) {
          monthEvents.push(ev);
        }
      }

      return { name, short: MONTHS_SHORT[idx], index: idx, events: monthEvents };
    });
  }, [year, events]);

  const today = new Date();
  const currentMonth = today.getFullYear() === year ? today.getMonth() : -1;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {monthData.map((m) => (
        <button
          key={m.index}
          onClick={() => onSelectMonth(m.index)}
          className={cn(
            "border rounded-xl p-4 text-left transition-all hover:shadow-md bg-white group",
            m.index === currentMonth && "ring-2 ring-blue-200",
          )}
        >
          <div className="flex items-center justify-between mb-3">
            <span className={cn(
              "text-sm font-semibold",
              m.index === currentMonth ? "text-blue-600" : "text-gray-800",
            )}>
              {m.name}
            </span>
            {m.events.length > 0 && (
              <span className="bg-gray-100 text-gray-600 text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                {m.events.length}
              </span>
            )}
          </div>

          {m.events.length === 0 ? (
            <p className="text-[11px] text-gray-300">Aucun événement</p>
          ) : (
            <div className="space-y-1.5">
              {m.events.slice(0, 4).map((ev) => (
                <div
                  key={ev.id}
                  onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                  className="flex items-center gap-1.5 cursor-pointer hover:opacity-70"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
                  <span className="text-[11px] text-gray-600 truncate">{ev.name}</span>
                </div>
              ))}
              {m.events.length > 4 && (
                <span className="text-[10px] text-gray-400">+{m.events.length - 4} de plus</span>
              )}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Main Calendar Component ─────────────────────────────

export default function EventCalendar({ events, onEventClick, onCreateAtDate }: Props) {
  const [view, setView] = useState<ViewMode>("month");
  const [selectedDate, setSelectedDate] = useState(new Date());

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();

  function navigate(delta: number) {
    const d = new Date(selectedDate);
    if (view === "day") d.setDate(d.getDate() + delta);
    else if (view === "month") d.setMonth(d.getMonth() + delta);
    else d.setFullYear(d.getFullYear() + delta);
    setSelectedDate(d);
  }

  function goToday() {
    setSelectedDate(new Date());
  }

  function getTitle() {
    if (view === "day") return fmtDateShort(selectedDate);
    if (view === "month") return `${MONTHS_FULL[month]} ${year}`;
    return String(year);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border rounded-xl bg-white p-3">
        {/* View switcher */}
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 self-start">
          {([
            { key: "day" as const, label: "Jour", icon: CalendarDays },
            { key: "month" as const, label: "Mois", icon: LayoutGrid },
            { key: "year" as const, label: "Année", icon: CalendarRange },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                view === key
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700",
              )}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button onClick={goToday}
            className="px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Aujourd&apos;hui
          </button>
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-gray-700 min-w-[140px] text-center capitalize">
              {getTitle()}
            </span>
            <button onClick={() => navigate(1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Views */}
      {view === "day" && (
        <div className="border rounded-xl bg-white p-4">
          <DayView date={selectedDate} events={events} onEventClick={onEventClick} />
          {onCreateAtDate && (
            <button
              onClick={() => onCreateAtDate(selectedDate)}
              className="mt-4 w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors"
            >
              + Créer un événement à cette date
            </button>
          )}
        </div>
      )}

      {view === "month" && (
        <MonthView
          year={year}
          month={month}
          events={events}
          selectedDate={selectedDate}
          onSelectDate={(d) => setSelectedDate(d)}
          onEventClick={onEventClick}
        />
      )}

      {view === "year" && (
        <YearView
          year={year}
          events={events}
          onSelectMonth={(m) => {
            setSelectedDate(new Date(year, m, 1));
            setView("month");
          }}
          onEventClick={onEventClick}
        />
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-400 px-1">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-amber-200 border border-amber-300" />
          Montage
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-[#3DAAA4]" />
          Événement
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-violet-200 border border-violet-300" />
          Démontage
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          Aujourd&apos;hui
        </span>
      </div>
    </div>
  );
}

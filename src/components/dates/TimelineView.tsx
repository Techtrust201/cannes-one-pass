"use client";

import { useMemo, useRef } from "react";
import type { Event } from "@/types";
import EventStatusBadge from "./EventStatusBadge";
import { cn } from "@/lib/utils";

const MONTHS = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Août",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
];

const ROW_HEIGHT = 72;
const HEADER_HEIGHT = 40;
const LEFT_COL_WIDTH = 220;

interface Props {
  events: Event[];
  year: number;
  onYearChange: (y: number) => void;
  onEventClick: (event: Event) => void;
}

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

function daysInYear(y: number): number {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
}

function clampToYear(date: Date, year: number): number {
  if (date.getFullYear() < year) return 0;
  if (date.getFullYear() > year) return daysInYear(year) - 1;
  return dayOfYear(date);
}

interface BarSegment {
  type: "setup" | "event" | "teardown";
  startDay: number;
  endDay: number;
}

function getSegments(event: Event, year: number): BarSegment[] {
  const totalDays = daysInYear(year);
  const segments: BarSegment[] = [];

  if (event.setupStartDate && event.setupEndDate) {
    const s = clampToYear(new Date(event.setupStartDate), year);
    const e = clampToYear(new Date(event.setupEndDate), year);
    if (s < totalDays && e >= 0) segments.push({ type: "setup", startDay: s, endDay: e });
  }

  const s = clampToYear(new Date(event.startDate), year);
  const e = clampToYear(new Date(event.endDate), year);
  if (s < totalDays && e >= 0) segments.push({ type: "event", startDay: s, endDay: e });

  if (event.teardownStartDate && event.teardownEndDate) {
    const s2 = clampToYear(new Date(event.teardownStartDate), year);
    const e2 = clampToYear(new Date(event.teardownEndDate), year);
    if (s2 < totalDays && e2 >= 0) segments.push({ type: "teardown", startDay: s2, endDay: e2 });
  }

  return segments;
}

const segmentStyles: Record<string, string> = {
  setup: "bg-amber-300/70 border-amber-400",
  event: "border-transparent",
  teardown: "bg-violet-300/70 border-violet-400",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

export default function TimelineView({
  events,
  year,
  onYearChange,
  onEventClick,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const totalDays = useMemo(() => daysInYear(year), [year]);

  const monthOffsets = useMemo(() => {
    const offsets: { label: string; startPct: number; widthPct: number }[] = [];
    for (let m = 0; m < 12; m++) {
      const first = new Date(year, m, 1);
      const last = new Date(year, m + 1, 0);
      const startDay = dayOfYear(first);
      const endDay = dayOfYear(last);
      offsets.push({
        label: MONTHS[m],
        startPct: (startDay / totalDays) * 100,
        widthPct: ((endDay - startDay + 1) / totalDays) * 100,
      });
    }
    return offsets;
  }, [year, totalDays]);

  const todayPct = useMemo(() => {
    const now = new Date();
    if (now.getFullYear() !== year) return null;
    return (dayOfYear(now) / totalDays) * 100;
  }, [year, totalDays]);

  return (
    <div className="border rounded-xl bg-white overflow-hidden shadow-sm">
      {/* Year navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50/50">
        <button
          onClick={() => onYearChange(year - 1)}
          className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors text-gray-600"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <span className="text-sm font-semibold text-gray-700">{year}</span>
        <button
          onClick={() => onYearChange(year + 1)}
          className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors text-gray-600"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Timeline area */}
      <div className="overflow-x-auto" ref={scrollRef}>
        <div className="min-w-[900px]">
          {/* Month headers */}
          <div className="flex" style={{ height: HEADER_HEIGHT }}>
            <div
              className="shrink-0 border-r border-b bg-gray-50/80"
              style={{ width: LEFT_COL_WIDTH }}
            />
            <div className="relative flex-1 border-b">
              {monthOffsets.map((m) => (
                <div
                  key={m.label}
                  className="absolute top-0 bottom-0 border-r border-gray-100 flex items-center justify-center text-xs font-medium text-gray-500"
                  style={{ left: `${m.startPct}%`, width: `${m.widthPct}%` }}
                >
                  {m.label}
                </div>
              ))}
            </div>
          </div>

          {/* Event rows */}
          {events.map((event) => {
            const segments = getSegments(event, year);
            return (
              <div
                key={event.id}
                className="flex group hover:bg-gray-50/50 transition-colors cursor-pointer"
                style={{ height: ROW_HEIGHT }}
                onClick={() => onEventClick(event)}
              >
                {/* Left column: event name + status */}
                <div
                  className="shrink-0 border-r border-b px-3 flex flex-col justify-center gap-1"
                  style={{ width: LEFT_COL_WIDTH }}
                >
                  <span className="text-sm font-medium text-gray-800 truncate">
                    {event.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <EventStatusBadge event={event} />
                    <span className="text-[10px] text-gray-400">
                      {formatDate(event.startDate)} → {formatDate(event.endDate)}
                    </span>
                  </div>
                </div>

                {/* Timeline bars */}
                <div className="relative flex-1 border-b">
                  {/* Month grid lines */}
                  {monthOffsets.map((m) => (
                    <div
                      key={m.label}
                      className="absolute top-0 bottom-0 border-r border-gray-50"
                      style={{ left: `${m.startPct}%` }}
                    />
                  ))}

                  {/* Today indicator */}
                  {todayPct !== null && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-red-400 z-10"
                      style={{ left: `${todayPct}%` }}
                    />
                  )}

                  {/* Segments */}
                  {segments.map((seg, i) => {
                    const left = (seg.startDay / totalDays) * 100;
                    const width =
                      ((seg.endDay - seg.startDay + 1) / totalDays) * 100;
                    return (
                      <div
                        key={i}
                        className={cn(
                          "absolute top-1/2 -translate-y-1/2 h-7 rounded-md border transition-all group-hover:h-8",
                          seg.type === "event"
                            ? "opacity-90 group-hover:opacity-100"
                            : segmentStyles[seg.type]
                        )}
                        style={{
                          left: `${left}%`,
                          width: `${Math.max(width, 0.5)}%`,
                          ...(seg.type === "event"
                            ? { backgroundColor: event.color }
                            : {}),
                        }}
                        title={`${seg.type === "setup" ? "Montage" : seg.type === "teardown" ? "Démontage" : event.name}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {events.length === 0 && (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <div className="text-center">
                <svg
                  className="mx-auto mb-3 text-gray-300"
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z" />
                </svg>
                <p className="text-sm font-medium">Aucun événement</p>
                <p className="text-xs mt-1">
                  Créez votre premier événement pour commencer
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      {events.length > 0 && (
        <div className="flex items-center gap-4 px-4 py-2 border-t bg-gray-50/50 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-300/70 border border-amber-400" />
            Montage
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-[#3DAAA4]" />
            Événement
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-violet-300/70 border border-violet-400" />
            Démontage
          </span>
          {todayPct !== null && (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-red-400" />
              Aujourd&apos;hui
            </span>
          )}
        </div>
      )}
    </div>
  );
}

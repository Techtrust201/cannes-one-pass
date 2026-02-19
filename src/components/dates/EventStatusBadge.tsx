"use client";

import type { Event } from "@/types";
import {
  getEventStatus,
  getDaysUntilStart,
  STATUS_CONFIG,
} from "@/lib/events";
import { cn } from "@/lib/utils";

interface Props {
  event: Event;
  className?: string;
}

export default function EventStatusBadge({ event, className }: Props) {
  const status = getEventStatus(event);
  const config = STATUS_CONFIG[status];
  const days = getDaysUntilStart(event);

  const label =
    status === "upcoming" && days > 0
      ? `J-${days}`
      : status === "active" && days > 0
        ? `Actif · J-${days}`
        : config.label;

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
        config.className,
        className
      )}
    >
      {label}
    </span>
  );
}

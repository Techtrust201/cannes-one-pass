"use client";

import { useState, useEffect } from "react";

export interface EventOption {
  value: string;
  label: string;
  id: string;
  logo: string | null;
}

export function useEventOptions() {
  const [options, setOptions] = useState<EventOption[]>([]);

  useEffect(() => {
    fetch("/api/events")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setOptions(
            data.map((e: { id: string; slug: string; name: string; logo: string | null }) => ({
              value: e.slug,
              label: e.name,
              id: e.id,
              logo: e.logo || `/api/events/${e.id}/logo`,
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  return options;
}

"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { Zone } from "@/types";

export interface StreamEvent {
  type: "connected" | "status_change" | "zone_change" | "zone_transfer" | "created" | "update";
  accreditationId?: string;
  data?: {
    action: string;
    field?: string;
    oldValue?: string;
    newValue?: string;
    description?: string;
    zone?: string;
    company?: string;
    status?: string;
  };
  timestamp?: string;
}

interface UseAccreditationStreamOptions {
  zone?: Zone;
  onEvent?: (event: StreamEvent) => void;
  onRefresh?: () => void;
  enabled?: boolean;
}

export function useAccreditationStream({
  zone,
  onEvent,
  onRefresh,
  enabled = true,
}: UseAccreditationStreamOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<StreamEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!enabled) return;

    const url = zone
      ? `/api/accreditations/stream?zone=${zone}`
      : "/api/accreditations/stream";

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data: StreamEvent = JSON.parse(event.data);
        setLastEvent(data);

        if (data.type === "connected") {
          setIsConnected(true);
          return;
        }

        onEvent?.(data);

        // Trigger refresh on meaningful events
        if (["status_change", "zone_change", "zone_transfer", "created"].includes(data.type)) {
          onRefresh?.();
        }
      } catch (error) {
        console.error("Error parsing SSE event:", error);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      eventSource.close();

      // Auto-reconnect after 5 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 5000);
    };
  }, [zone, onEvent, onRefresh, enabled]);

  useEffect(() => {
    connect();

    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return { isConnected, lastEvent };
}

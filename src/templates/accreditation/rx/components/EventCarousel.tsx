"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ImageIcon } from "lucide-react";

/**
 * Carrousel d'events filtré par organisation. Réutilise les composants UI
 * du Palais (pour cohérence visuelle stricte) mais fait son propre fetch
 * `?espace=<orgSlug>` pour cloisonner.
 *
 * Cohabite à l'identique avec le carrousel historique de
 * `src/components/accreditation/StepOne.tsx` (template Palais), sans
 * dupliquer la logique métier de ce dernier.
 */
export interface EventOption {
  id: string;
  key: string;
  label: string;
  logo: string;
}

interface Props {
  orgSlug: string;
  selectedSlug: string;
  onSelect: (slug: string) => void;
}

export function EventCarousel({ orgSlug, selectedSlug, onSelect }: Props) {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const initialized = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/events?active=true&espace=${encodeURIComponent(orgSlug)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) {
          setEvents(
            data.map((e: { id: string; slug: string; name: string; logo: string | null }) => ({
              id: e.id,
              key: e.slug,
              label: e.name,
              logo: e.logo || `/api/events/${e.id}/logo`,
            }))
          );
        } else {
          setEvents([]);
        }
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  const onApi = useCallback((carouselApi: CarouselApi | null) => {
    setApi(carouselApi);
  }, []);

  useEffect(() => {
    if (!api || events.length === 0) return;
    const handler = () => setCurrentIdx(api.selectedScrollSnap());
    api.on("select", handler);
    handler();
    if (!initialized.current && !selectedSlug) {
      const first = events[api.selectedScrollSnap()];
      if (first) onSelect(first.key);
      initialized.current = true;
    }
    return () => {
      api.off("select", handler);
    };
  }, [api, events, selectedSlug, onSelect]);

  useEffect(() => {
    if (!api || !initialized.current) return;
    const idx = events.findIndex((e) => e.key === selectedSlug);
    if (idx >= 0 && idx !== api.selectedScrollSnap()) {
      api.scrollTo(idx);
      setCurrentIdx(idx);
    }
  }, [api, events, selectedSlug]);

  useEffect(() => {
    if (!initialized.current || events.length === 0) return;
    const target = events[currentIdx]?.key;
    if (target && target !== selectedSlug) {
      onSelect(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin h-6 w-6 border-2 border-[#3F4660] border-t-transparent rounded-full" />
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center">
        Aucun événement actif pour cette organisation.
      </p>
    );
  }
  return (
    <div className="w-full max-w-xs sm:max-w-sm md:max-w-md mx-auto">
      <Carousel setApi={onApi} opts={{ loop: true }}>
        <CarouselContent>
          {events.map((ev, idx) => (
            <CarouselItem
              key={ev.key}
              className="pl-0.5 md:basis-1/2 lg:basis-1/2 flex justify-center p-1"
            >
              <Card
                className={cn(
                  "transition-all duration-300 shadow border flex flex-col items-center justify-center cursor-pointer h-24 md:h-32 w-20 md:w-28 bg-white rounded-lg p-1",
                  currentIdx === idx
                    ? "scale-100 border-primary ring-2 ring-primary/30 z-10"
                    : "scale-95 border-gray-200 opacity-80"
                )}
                onClick={() => {
                  setCurrentIdx(idx);
                  api?.scrollTo(idx);
                }}
              >
                <CardContent className="flex flex-col items-center justify-center h-full p-1 w-full">
                  {ev.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ev.logo}
                      alt={ev.label}
                      className="object-contain w-12 h-9 md:w-16 md:h-12 mb-1 rounded drop-shadow"
                    />
                  ) : (
                    <ImageIcon className="w-12 h-9 md:w-16 md:h-12 mb-1 text-gray-300" />
                  )}
                  <span
                    className={cn(
                      "truncate w-full text-xs md:text-sm font-medium text-center overflow-hidden",
                      currentIdx === idx ? "text-primary" : "text-gray-700"
                    )}
                  >
                    {ev.label}
                  </span>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="w-6 h-6 -left-0" />
        <CarouselNext className="w-6 h-6 -right-0" />
      </Carousel>
      <div className="flex justify-center gap-1 mt-2">
        {events.map((_, idx) => (
          <button
            key={idx}
            onClick={() => {
              setCurrentIdx(idx);
              api?.scrollTo(idx);
            }}
            className={cn(
              "w-2 h-2 rounded-full transition-all",
              currentIdx === idx ? "bg-primary scale-110" : "bg-gray-300 hover:bg-gray-400"
            )}
            aria-label={`Aller à l'événement ${events[idx].label}`}
          />
        ))}
      </div>
    </div>
  );
}

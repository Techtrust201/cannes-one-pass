"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { CarouselApi } from "@/components/ui/carousel";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ImageIcon } from "lucide-react";
import { useTranslation } from "@/components/accreditation/TranslationProvider";
import { mapEventOptionFromApi } from "./event-carousel-mapper";
import type { EventOption } from "./event-carousel-mapper";

export type { EventOption };

interface Props {
  /**
   * Slug d'organisation OBLIGATOIRE. Scope strictement le carrousel aux
   * événements de cette organisation : sans lui, aucun fetch n'est émis
   * (isolation multi-tenant — on ne mélange jamais les events Palais/RX).
   */
  orgSlug: string;
  /** Slug de l'événement actuellement sélectionné. */
  value: string;
  /** Notifie le parent d'un changement d'événement (slug). */
  onChange?: (eventSlug: string) => void;
  /**
   * Variante enrichie : notifie le parent avec l'objet EventOption complet
   * (id + slug + label + logo). Utilisé par les templates qui ont besoin de
   * l'id interne de l'événement (ex. RX pour les quotas de capacité).
   */
  onEventSelected?: (event: EventOption) => void;
  /**
   * Notifie le parent du nombre d'événements actifs une fois le chargement
   * terminé (permet par ex. d'afficher un message bloquant si 0 événement).
   */
  onEventsResolved?: (count: number) => void;
}

function useActiveEvents(orgSlug: string): { events: EventOption[]; loading: boolean } {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Isolation stricte : on n'interroge jamais l'API sans `espace`, sinon on
    // récupérerait les événements de toutes les organisations confondues.
    if (!orgSlug) {
      setEvents([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/events?active=true&espace=${encodeURIComponent(orgSlug)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) {
          setEvents(data.map(mapEventOptionFromApi));
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

  return { events, loading };
}

/**
 * Sélecteur d'événement sous forme de carrousel (logos + flèches + points).
 *
 * Composant UI réutilisable entre organisations : l'apparence est identique
 * partout, mais chaque instance reçoit son propre `orgSlug` et ne charge que
 * les événements de cette organisation. Auto-sélectionne le premier événement
 * si aucune valeur n'est fournie.
 */
export default function EventCarouselSelector({
  orgSlug,
  value,
  onChange,
  onEventSelected,
  onEventsResolved,
}: Props) {
  const { events, loading: eventsLoading } = useActiveEvents(orgSlug);
  const { t } = useTranslation();

  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const isUpdatingFromCarousel = useRef(false);
  const hasInitialized = useRef(false);

  const notifyEvent = useCallback((ev: EventOption) => {
    onChange?.(ev.key);
    onEventSelected?.(ev);
  }, [onChange, onEventSelected]);

  const initDefault = useCallback(() => {
    if (!value && events.length > 0) {
      notifyEvent(events[0]);
    }
  }, [value, events, notifyEvent]);

  useEffect(() => {
    if (!eventsLoading) initDefault();
  }, [eventsLoading, initDefault]);

  useEffect(() => {
    if (!eventsLoading) onEventsResolved?.(events.length);
  }, [eventsLoading, events.length, onEventsResolved]);

  useEffect(() => {
    if (!carouselApi || events.length === 0) return;
    const updateIdx = () => setCurrentIdx(carouselApi.selectedScrollSnap());
    carouselApi.on("select", updateIdx);
    updateIdx();

    if (!hasInitialized.current) {
      const initialIdx = carouselApi.selectedScrollSnap();
      const initialEv = events[initialIdx];
      if (initialEv && (!value || initialEv.key !== value)) {
        notifyEvent(initialEv);
      }
      hasInitialized.current = true;
    }

    return () => {
      carouselApi.off("select", updateIdx);
    };
  }, [carouselApi, events]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!carouselApi || !hasInitialized.current || isUpdatingFromCarousel.current) {
      isUpdatingFromCarousel.current = false;
      return;
    }
    const targetEvent = value || events[0]?.key;
    const eventIndex = events.findIndex((ev) => ev.key === targetEvent);
    if (eventIndex !== -1) {
      const currentSnap = carouselApi.selectedScrollSnap();
      if (eventIndex !== currentSnap) {
        carouselApi.scrollTo(eventIndex);
        setCurrentIdx(eventIndex);
      }
    }
  }, [carouselApi, value, events]);

  useEffect(() => {
    if (!hasInitialized.current || events.length === 0) return;
    const newEv = events[currentIdx];
    if (newEv && newEv.key !== value) {
      isUpdatingFromCarousel.current = true;
      notifyEvent(newEv);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx]);

  return (
    <div className="flex flex-col items-center justify-center w-full">
      <p className="text-sm font-medium mb-2 text-center">{t.selectEvent}</p>
      {eventsLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin h-6 w-6 border-2 border-[#3F4660] border-t-transparent rounded-full" />
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">{t.noEvents}</p>
      ) : (
        <div className="w-full max-w-xs sm:max-w-sm md:max-w-md mx-auto">
          <Carousel setApi={setCarouselApi} opts={{ loop: true }}>
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
                      carouselApi?.scrollTo(idx);
                    }}
                  >
                    <CardContent className="flex flex-col items-center justify-center h-full p-1 w-full">
                      {ev.logo ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
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
                  carouselApi?.scrollTo(idx);
                }}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  currentIdx === idx
                    ? "bg-primary scale-110"
                    : "bg-gray-300 hover:bg-gray-400"
                )}
                aria-label={`${t.selectEvent} ${events[idx].label}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

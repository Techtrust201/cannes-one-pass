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

interface Data {
  company: string;
  stand: string;
  unloading: string;
  event: string;
}

interface Props {
  data: Data;
  update: (patch: Partial<Data>) => void;
  onValidityChange: (v: boolean) => void;
}

interface EventOption {
  key: string;
  label: string;
  logo: string;
  id: string;
}

const FALLBACK_EVENTS: EventOption[] = [];

function useActiveEvents(): { events: EventOption[]; loading: boolean } {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/events?active=true")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) {
          setEvents(
            data.map((e: { id: string; slug: string; name: string; logo: string | null }) => ({
              id: e.id,
              key: e.slug,
              label: e.name,
              logo: e.logo || `/api/events/${e.id}/logo`,
            }))
          );
        } else {
          setEvents(FALLBACK_EVENTS);
        }
      })
      .catch(() => {
        if (!cancelled) setEvents(FALLBACK_EVENTS);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { events, loading };
}

export default function StepOne({ data, update, onValidityChange }: Props) {
  const { company, stand, unloading, event } = data;
  const { events, loading: eventsLoading } = useActiveEvents();

  const isValid = !!(company && stand && unloading && event);
  useEffect(() => onValidityChange(isValid), [isValid, onValidityChange]);

  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const isUpdatingFromCarousel = useRef(false);
  const hasInitialized = useRef(false);

  const initDefault = useCallback(() => {
    if (!event && events.length > 0) {
      update({ event: events[0].key });
    }
  }, [event, events, update]);

  useEffect(() => {
    if (!eventsLoading) initDefault();
  }, [eventsLoading, initDefault]);

  useEffect(() => {
    if (!carouselApi || events.length === 0) return;
    const updateIdx = () => setCurrentIdx(carouselApi.selectedScrollSnap());
    carouselApi.on("select", updateIdx);
    updateIdx();

    if (!hasInitialized.current) {
      const initialIdx = carouselApi.selectedScrollSnap();
      const initialEvent = events[initialIdx]?.key;
      if (initialEvent && (!event || initialEvent !== event)) {
        update({ event: initialEvent });
      }
      hasInitialized.current = true;
    }

    return () => { carouselApi.off("select", updateIdx); };
  }, [carouselApi, events]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!carouselApi || !hasInitialized.current || isUpdatingFromCarousel.current) {
      isUpdatingFromCarousel.current = false;
      return;
    }
    const targetEvent = event || events[0]?.key;
    const eventIndex = events.findIndex((ev) => ev.key === targetEvent);
    if (eventIndex !== -1) {
      const currentSnap = carouselApi.selectedScrollSnap();
      if (eventIndex !== currentSnap) {
        carouselApi.scrollTo(eventIndex);
        setCurrentIdx(eventIndex);
      }
    }
  }, [carouselApi, event, events]);

  useEffect(() => {
    if (!hasInitialized.current || events.length === 0) return;
    const newEvent = events[currentIdx]?.key;
    if (newEvent && newEvent !== event) {
      isUpdatingFromCarousel.current = true;
      update({ event: newEvent });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx]);

  return (
    <div className="flex flex-col w-full">
      <div className="flex-1 p-0 sm:p-0 flex flex-col justify-between">
        <div>
          <h2 className="text-lg font-bold mb-4">Identification</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <div className="space-y-1 md:col-span-2 lg:col-span-1">
              <label htmlFor="company" className="text-sm font-semibold text-gray-700">
                Nom du décorateur
              </label>
              <input
                id="company"
                value={company}
                onChange={(e) => update({ company: e.target.value })}
                placeholder="Nom du décorateur"
                className={cn(
                  "w-full rounded-md px-3 py-2 shadow-sm focus:ring-primary focus:border-primary",
                  !company.trim() ? "border-red-500" : "border-gray-300"
                )}
              />
            </div>
            <div className="space-y-1 md:col-span-2 lg:col-span-1">
              <label htmlFor="stand" className="text-sm font-semibold text-gray-700">
                Stand desservi
              </label>
              <input
                id="stand"
                value={stand}
                onChange={(e) => update({ stand: e.target.value })}
                placeholder="Nom du stand"
                className={cn(
                  "w-full rounded-md px-3 py-2 shadow-sm focus:ring-primary focus:border-primary",
                  !stand.trim() ? "border-red-500" : "border-gray-300"
                )}
              />
            </div>
            <div className="space-y-1 md:col-span-2 lg:col-span-1">
              <label htmlFor="unloading" className="text-sm font-semibold text-gray-700">
                Déchargement par
              </label>
              <select
                id="unloading"
                value={unloading}
                onChange={(e) => update({ unloading: e.target.value })}
                className={cn(
                  "w-full rounded-md px-3 py-2 shadow-sm bg-white focus:ring-primary focus:border-primary",
                  !unloading ? "border-red-500" : "border-gray-300"
                )}
              >
                <option value="" disabled>Choisir un prestataire</option>
                <option value="Palais">Palais</option>
                <option value="SVMM">SVMM</option>
                <option value="Autonome">Déchargement manuel</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center w-full">
            <p className="text-sm font-medium mb-2 text-center">
              Sélectionnez un évènement :
            </p>
            {eventsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin h-6 w-6 border-2 border-[#3F4660] border-t-transparent rounded-full" />
              </div>
            ) : events.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">
                Aucun événement disponible pour le moment.
              </p>
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
                      aria-label={`Aller à l'événement ${events[idx].label}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {!isValid && (
        <p className="text-red-500 text-sm mt-2 text-center">
          Complétez tous les champs obligatoires pour continuer.
        </p>
      )}
    </div>
  );
}

"use client";

import type { Event } from "@/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import EventForm from "./EventForm";
import EventStatusBadge from "./EventStatusBadge";

interface Props {
  open: boolean;
  onClose: () => void;
  event?: Event | null;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onDelete?: () => Promise<void>;
  saving?: boolean;
}

export default function EventSheet({
  open,
  onClose,
  event,
  onSave,
  onDelete,
  saving,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto"
      >
        <SheetHeader className="mb-4">
          <div className="flex items-center gap-2">
            <SheetTitle>
              {event ? event.name : "Nouvel événement"}
            </SheetTitle>
            {event && <EventStatusBadge event={event} />}
          </div>
          <SheetDescription>
            {event
              ? "Modifier les informations de l'événement"
              : "Remplissez les informations pour créer un nouvel événement"}
          </SheetDescription>
        </SheetHeader>
        <EventForm
          event={event}
          onSave={onSave}
          onDelete={onDelete}
          saving={saving}
        />
      </SheetContent>
    </Sheet>
  );
}

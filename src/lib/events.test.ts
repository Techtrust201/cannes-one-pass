import { describe, it, expect } from "vitest";
import type { Event } from "@/types";
import {
  getAccreditationActivationDate,
  getAccreditationReferenceDate,
  isEventVisibleForAccreditation,
} from "./events";

function mockEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "evt-1",
    name: "Cannes Lions",
    slug: "cannes-lions",
    logo: null,
    description: null,
    location: null,
    color: "#000",
    startDate: "2026-06-16",
    endDate: "2026-06-20",
    setupStartDate: "2026-06-03",
    setupEndDate: "2026-06-15",
    teardownStartDate: "2026-06-21",
    teardownEndDate: "2026-06-23",
    accessStartTime: null,
    accessEndTime: null,
    notes: null,
    activationDays: 7,
    isActive: true,
    isArchived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function at(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00`);
}

describe("getAccreditationReferenceDate", () => {
  it("utilise setupStartDate quand renseigné", () => {
    const event = mockEvent();
    expect(getAccreditationReferenceDate(event).toISOString().slice(0, 10)).toBe(
      "2026-06-03"
    );
  });

  it("retombe sur startDate si montage absent", () => {
    const event = mockEvent({ setupStartDate: null });
    expect(getAccreditationReferenceDate(event).toISOString().slice(0, 10)).toBe(
      "2026-06-16"
    );
  });
});

describe("isEventVisibleForAccreditation", () => {
  it("visible le 7 juin si montage le 3 juin et activation J-7", () => {
    const event = mockEvent();
    expect(isEventVisibleForAccreditation(event, at("2026-06-07"))).toBe(true);
  });

  it("non visible le 7 juin si montage absent (référence = startDate 16 juin)", () => {
    const event = mockEvent({ setupStartDate: null });
    expect(isEventVisibleForAccreditation(event, at("2026-06-07"))).toBe(false);
  });

  it("non visible le 25 mai (avant fenêtre J-7 du montage)", () => {
    const event = mockEvent();
    expect(isEventVisibleForAccreditation(event, at("2026-05-25"))).toBe(false);
  });

  it("non visible après teardownEndDate", () => {
    const event = mockEvent();
    expect(isEventVisibleForAccreditation(event, at("2026-06-24"))).toBe(false);
  });

  it("non visible si archivé", () => {
    const event = mockEvent({ isArchived: true });
    expect(isEventVisibleForAccreditation(event, at("2026-06-07"))).toBe(false);
  });
});

describe("getAccreditationActivationDate", () => {
  it("calcule J-7 à partir du montage", () => {
    const event = mockEvent();
    expect(getAccreditationActivationDate(event).toISOString().slice(0, 10)).toBe(
      "2026-05-27"
    );
  });
});

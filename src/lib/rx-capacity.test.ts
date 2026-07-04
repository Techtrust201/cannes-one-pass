import { describe, it, expect } from "vitest";
import {
  computeCapacityStats,
  isConsumerStatus,
  isLiberatorStatus,
  RX_CONSUMER_STATUSES,
  RX_LIBERATOR_STATUSES,
} from "./rx-capacity";

describe("RX_CONSUMER_STATUSES", () => {
  it("contient exactement NOUVEAU, ATTENTE, ENTREE", () => {
    expect(RX_CONSUMER_STATUSES).toContain("NOUVEAU");
    expect(RX_CONSUMER_STATUSES).toContain("ATTENTE");
    expect(RX_CONSUMER_STATUSES).toContain("ENTREE");
    expect(RX_CONSUMER_STATUSES).toHaveLength(3);
  });
});

describe("RX_LIBERATOR_STATUSES", () => {
  it("contient exactement SORTIE, REFUS, ABSENT", () => {
    expect(RX_LIBERATOR_STATUSES).toContain("SORTIE");
    expect(RX_LIBERATOR_STATUSES).toContain("REFUS");
    expect(RX_LIBERATOR_STATUSES).toContain("ABSENT");
    expect(RX_LIBERATOR_STATUSES).toHaveLength(3);
  });
});

describe("isConsumerStatus", () => {
  it("retourne true pour les statuts consommateurs", () => {
    expect(isConsumerStatus("NOUVEAU")).toBe(true);
    expect(isConsumerStatus("ATTENTE")).toBe(true);
    expect(isConsumerStatus("ENTREE")).toBe(true);
  });

  it("retourne false pour les statuts libérateurs", () => {
    expect(isConsumerStatus("SORTIE")).toBe(false);
    expect(isConsumerStatus("REFUS")).toBe(false);
    expect(isConsumerStatus("ABSENT")).toBe(false);
  });

  it("retourne false pour une valeur inconnue", () => {
    expect(isConsumerStatus("INCONNU")).toBe(false);
    expect(isConsumerStatus("")).toBe(false);
  });
});

describe("isLiberatorStatus", () => {
  it("retourne true pour les statuts libérateurs", () => {
    expect(isLiberatorStatus("SORTIE")).toBe(true);
    expect(isLiberatorStatus("REFUS")).toBe(true);
    expect(isLiberatorStatus("ABSENT")).toBe(true);
  });

  it("retourne false pour les statuts consommateurs", () => {
    expect(isLiberatorStatus("NOUVEAU")).toBe(false);
    expect(isLiberatorStatus("ATTENTE")).toBe(false);
    expect(isLiberatorStatus("ENTREE")).toBe(false);
  });

  it("retourne false pour une valeur inconnue", () => {
    expect(isLiberatorStatus("INCONNU")).toBe(false);
  });
});

describe("computeCapacityStats", () => {
  it("créneau vide → 0 utilisé, remaining = capacity, isFull = false", () => {
    expect(computeCapacityStats(10, [])).toEqual({
      capacity: 10,
      provisionalUsed: 0,
      confirmedUsed: 0,
      inZoneUsed: 0,
      totalUsed: 0,
      remaining: 10,
      isFull: false,
    });
  });

  it("compte chaque statut consommateur séparément", () => {
    const statuses = ["NOUVEAU", "NOUVEAU", "ATTENTE", "ENTREE", "ENTREE", "ENTREE"];
    const stats = computeCapacityStats(10, statuses);
    expect(stats.provisionalUsed).toBe(2);
    expect(stats.confirmedUsed).toBe(1);
    expect(stats.inZoneUsed).toBe(3);
    expect(stats.totalUsed).toBe(6);
    expect(stats.remaining).toBe(4);
    expect(stats.isFull).toBe(false);
  });

  it("SORTIE, REFUS, ABSENT ne sont pas comptabilisés", () => {
    const stats = computeCapacityStats(5, ["SORTIE", "REFUS", "ABSENT"]);
    expect(stats.provisionalUsed).toBe(0);
    expect(stats.confirmedUsed).toBe(0);
    expect(stats.inZoneUsed).toBe(0);
    expect(stats.totalUsed).toBe(0);
    expect(stats.remaining).toBe(5);
    expect(stats.isFull).toBe(false);
  });

  it("isFull = true quand remaining = 0 (créneau plein)", () => {
    const statuses = Array<string>(5).fill("ATTENTE");
    const stats = computeCapacityStats(5, statuses);
    expect(stats.totalUsed).toBe(5);
    expect(stats.remaining).toBe(0);
    expect(stats.isFull).toBe(true);
  });

  it("remaining peut être négatif (sur-réservation), isFull reste true", () => {
    const statuses = Array<string>(6).fill("ENTREE");
    const stats = computeCapacityStats(5, statuses);
    expect(stats.inZoneUsed).toBe(6);
    expect(stats.remaining).toBe(-1);
    expect(stats.isFull).toBe(true);
  });

  it("mélange consommateurs et libérateurs — seuls les consommateurs comptent", () => {
    const statuses = ["NOUVEAU", "ATTENTE", "SORTIE", "REFUS", "ABSENT", "ENTREE"];
    const stats = computeCapacityStats(10, statuses);
    expect(stats.provisionalUsed).toBe(1);
    expect(stats.confirmedUsed).toBe(1);
    expect(stats.inZoneUsed).toBe(1);
    expect(stats.totalUsed).toBe(3);
    expect(stats.remaining).toBe(7);
    expect(stats.isFull).toBe(false);
  });

  it("capacity = 0 → isFull immédiatement même sans accréditations", () => {
    const stats = computeCapacityStats(0, []);
    expect(stats.remaining).toBe(0);
    expect(stats.isFull).toBe(true);
  });

  it("une seule accréditation ENTREE consomme exactement 1 place", () => {
    const stats = computeCapacityStats(3, ["ENTREE"]);
    expect(stats.inZoneUsed).toBe(1);
    expect(stats.totalUsed).toBe(1);
    expect(stats.remaining).toBe(2);
    expect(stats.capacity).toBe(3);
  });
});

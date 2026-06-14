"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import StatusPill from "./StatusPill";
import type { Accreditation, AccreditationStatus } from "@/types";

interface Props {
  acc: Accreditation;
}

export default function AccreditationDetailCard({ acc }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<AccreditationStatus>(
    acc.status as AccreditationStatus
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    if (status === acc.status) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/accreditations/${acc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Erreur de mise à jour");
      router.refresh();
    } catch {
      alert("Impossible d'enregistrer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-card shadow-card bg-white p-6 text-sm w-full">
      <h2 className="text-lg font-semibold mb-4">Infos accréditations</h2>
      <div className="mb-2">
        <label className="font-semibold mr-1">Statut :</label>
        <select
          className="border rounded px-2 py-1"
          value={status}
          onChange={(e) => setStatus(e.target.value as AccreditationStatus)}
        >
          <option value="NOUVEAU">Nouveau</option>
          <option value="ATTENTE">Validée</option>
          <option value="ENTREE">Entrée</option>
          <option value="SORTIE">Sortie</option>
          <option value="REFUS">Refus</option>
          <option value="ABSENT">Absent</option>
        </select>
        <span className="ml-2">
          <StatusPill status={status} />
        </span>
      </div>
      <p>
        <span className="font-semibold">#ID :</span> {acc.id}
      </p>
      <p>
        <span className="font-semibold">Plaque :</span> {acc.vehicles[0]?.plate}
      </p>
      <p>
        <span className="font-semibold">Entreprise :</span> {acc.company}
      </p>
      <button
        onClick={save}
        disabled={saving}
        className="mt-4 px-4 py-2 rounded bg-primary text-white disabled:opacity-50"
      >
        Enregistrer
      </button>
    </div>
  );
}

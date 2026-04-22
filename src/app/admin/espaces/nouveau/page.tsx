"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Save } from "lucide-react";

const PRESET_COLORS = [
  "#4F587E", "#3DAAA4", "#E07A5F", "#81B29A",
  "#F2CC8F", "#9F86C0", "#E9C46A", "#264653",
];

function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export default function NewEspacePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = slugTouched ? slug : normalizeSlug(name);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Le nom est obligatoire");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: effectiveSlug,
          color,
          description: description.trim() || null,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Erreur lors de la création");
      }
      const created = await res.json();
      router.push(`/admin/espaces/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/espaces"
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Retour"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Nouvel Espace</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1.5">
            Nom de l&apos;Espace *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Palais des Festivals, RX Global..."
            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#4F587E] focus:border-[#4F587E] outline-none text-sm"
            required
            maxLength={120}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1.5">
            Slug (URL)
          </label>
          <div className="flex items-center rounded-xl border border-gray-300 overflow-hidden">
            <span className="px-3 py-2.5 text-xs text-gray-500 bg-gray-50 border-r border-gray-300">
              /espaces/
            </span>
            <input
              type="text"
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(normalizeSlug(e.target.value));
              }}
              placeholder="palais-des-festivals"
              className="flex-1 px-3 py-2.5 text-sm outline-none"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Généré automatiquement à partir du nom. Lettres minuscules, chiffres et tirets.
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1.5">
            Couleur
          </label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-11 h-11 rounded-xl border-2 transition ${
                  color === c ? "border-gray-900 scale-110" : "border-transparent hover:scale-105"
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Couleur ${c}`}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-11 h-11 rounded-xl border border-gray-300 cursor-pointer"
              aria-label="Couleur personnalisée"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1.5">
            Description (optionnel)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="À quoi sert cet Espace ?"
            rows={3}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#4F587E] focus:border-[#4F587E] outline-none text-sm resize-none"
            maxLength={400}
          />
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Link
            href="/admin/espaces"
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition text-center min-h-[44px] flex items-center justify-center"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#4F587E] text-white font-semibold text-sm hover:bg-[#3B4252] transition disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Création...
              </>
            ) : (
              <>
                <Save size={14} /> Créer l&apos;Espace
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

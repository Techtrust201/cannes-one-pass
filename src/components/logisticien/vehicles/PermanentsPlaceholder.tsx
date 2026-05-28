"use client";

import { ShieldCheck, Sparkles } from "lucide-react";

/**
 * Placeholder pour le futur onglet "Accès permanents" — réserve l'espace
 * visuel et explique le rôle de la fonctionnalité en cours de développement.
 *
 * Quand le module sera prêt (Phase 2), ce composant sera remplacé par
 * `PermanentAccreditationsSection` qui gérera la création, la liste, et
 * l'édition des accréditations permanentes.
 */
export default function PermanentsPlaceholder() {
  return (
    <div className="bg-white rounded-2xl border-2 border-dashed border-amber-200 p-10 text-center">
      <div className="mx-auto w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mb-5">
        <ShieldCheck size={32} className="text-amber-500" />
      </div>

      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold uppercase tracking-wider mb-4">
        <Sparkles size={12} />
        Bientôt disponible
      </div>

      <h3 className="text-xl font-bold text-gray-900 mb-2">
        Accès permanents
      </h3>
      <p className="text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
        Gérez les véhicules autorisés sur plusieurs mois — transporteurs
        réguliers, partenaires officiels, prestataires de manutention. Une
        seule accréditation, valide sur plusieurs événements, scannable
        depuis la guérite.
      </p>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto text-left">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-semibold text-gray-700 mb-1">
            Durée flexible
          </p>
          <p className="text-xs text-gray-500">
            3, 6 ou 12 mois selon le partenaire.
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-semibold text-gray-700 mb-1">
            Multi-événements
          </p>
          <p className="text-xs text-gray-500">
            Affectation à plusieurs événements en un clic.
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-semibold text-gray-700 mb-1">
            Bilan carbone inclus
          </p>
          <p className="text-xs text-gray-500">
            Chaque passage compte dans les statistiques.
          </p>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-6">
        Fonctionnalité en cours de développement — disponible prochainement.
      </p>
    </div>
  );
}

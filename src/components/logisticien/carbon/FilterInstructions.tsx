"use client";

import { useState } from "react";
import { Info, X } from "lucide-react";

export default function FilterInstructions() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6 relative">
      <button
        onClick={() => setIsVisible(false)}
        className="absolute top-2 right-2 text-purple-400 hover:text-purple-600"
        title="Masquer les instructions"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-3">
        <Info className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-purple-800">
          <div className="font-semibold mb-2">Instructions de filtrage</div>
          <div className="space-y-2">
            <p>
              <strong>
                Pas possible d&apos;appliquer + de 1 filtre à la fois !
              </strong>
            </p>
            <div className="text-xs space-y-1">
              <p>Si j&apos;active le filtre Km</p>
              <p>puis clique sur le filtre Emissions</p>
              <p>alors je désactive le filtre KM</p>
              <p>et j&apos;active le filtre Emissions</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



"use client";

import { useState, useRef } from "react";
import { Printer, QrCode } from "lucide-react";

interface QrPrintCardProps {
  qrDataUrl: string;
  accreditationUrl: string;
}

const MAX_TEXT_LENGTH = 400;

export default function QrPrintCard({ qrDataUrl, accreditationUrl }: QrPrintCardProps) {
  const [customText, setCustomText] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Zone édition — masquée à l'impression */}
      <div className="print:hidden space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <QrCode size={20} className="text-[#3F4660]" />
            Personnaliser l&apos;affiche
          </h2>

          <label htmlFor="custom-text" className="block text-sm font-medium text-gray-700 mb-2">
            Texte au-dessus du QR code (optionnel)
          </label>
          <textarea
            id="custom-text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value.slice(0, MAX_TEXT_LENGTH))}
            placeholder="Ex : Scannez pour vous enregistrer à la guérite"
            rows={3}
            maxLength={MAX_TEXT_LENGTH}
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:ring-2 focus:ring-[#3F4660]/30 focus:border-[#3F4660] resize-none transition"
          />
          <p className="text-xs text-gray-500 mt-1">
            {customText.length}/{MAX_TEXT_LENGTH} caractères — ce texte apparaîtra au-dessus du QR code à l&apos;impression
          </p>
        </div>

        <button
          onClick={handlePrint}
          className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl bg-[#3F4660] text-white font-semibold text-lg shadow-lg hover:bg-[#2d3447] active:scale-[0.99] transition-all duration-150"
        >
          <Printer size={24} />
          Imprimer l&apos;affiche
        </button>
      </div>

      {/* Zone imprimable — visible à l'écran (aperçu) et à l'impression */}
      <div
        ref={printRef}
        data-print-area
        className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-8 print:border-0 print:shadow-none print:p-0"
      >
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4 print:hidden">
          Aperçu d&apos;impression
        </p>
        <div className="flex flex-col items-center justify-center min-h-[280px] gap-6 print:min-h-0 print:gap-4">
          {/* Texte personnalisé — espace réservé, max 4 lignes à l'impression */}
          {customText.trim() ? (
            <div className="w-full max-w-md text-center print:max-h-[140px] print:overflow-hidden print:mb-2">
              <p className="text-base md:text-lg text-gray-800 whitespace-pre-wrap break-words print:text-lg print:leading-snug">
                {customText.trim()}
              </p>
            </div>
          ) : (
            <div className="print:hidden w-full max-w-md text-center">
              <p className="text-sm text-gray-400 italic">
                Aperçu — ajoutez un texte ci-dessus pour qu&apos;il apparaisse ici
              </p>
            </div>
          )}

          {/* QR code — toujours visible, taille fixe */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            <img
              src={qrDataUrl}
              alt="QR code formulaire accréditation"
              width={280}
              height={280}
              className="w-[200px] h-[200px] md:w-[280px] md:h-[280px] print:w-[220px] print:h-[220px]"
            />
            <p className="text-xs text-gray-500 print:text-sm">
              Scannez pour accéder au formulaire
            </p>
          </div>

          {/* URL en petit — pour vérification */}
          <p className="text-[10px] text-gray-400 truncate max-w-full px-4 print:text-xs">
            {accreditationUrl}
          </p>
        </div>
      </div>

      {/* Styles print : masquer header admin et zone édition */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          header { display: none !important; }
          .print\\:hidden { display: none !important; }
          main { padding: 0 !important; max-width: none !important; }
          [data-print-area] { box-shadow: none !important; }
        }
      `}} />
    </div>
  );
}

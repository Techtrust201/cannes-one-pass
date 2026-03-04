"use client";

import { useState, useRef } from "react";
import { Printer, QrCode } from "lucide-react";

interface QrPrintCardProps {
  qrDataUrl: string;
  accreditationUrl: string;
}

const MAX_TEXT_LENGTH = 400;
const QR_SIZE_MIN = 180;
const QR_SIZE_MAX = 400;
const QR_SIZE_DEFAULT = 280;

export default function QrPrintCard({ qrDataUrl, accreditationUrl }: QrPrintCardProps) {
  const [customText, setCustomText] = useState("");
  const [qrSize, setQrSize] = useState(QR_SIZE_DEFAULT);
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

          <div className="mt-6 pt-6 border-t border-gray-100">
            <label htmlFor="qr-size" className="block text-sm font-medium text-gray-700 mb-2">
              Taille du QR code : {qrSize} px
            </label>
            <input
              id="qr-size"
              type="range"
              min={QR_SIZE_MIN}
              max={QR_SIZE_MAX}
              step={20}
              value={qrSize}
              onChange={(e) => setQrSize(Number(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-200 accent-[#3F4660]"
            />
          </div>
        </div>

        <p className="text-xs text-gray-500 print:hidden">
          Astuce : dans la fenêtre d&apos;impression, décochez « En-têtes et pieds de page » pour masquer l&apos;URL et la date.
        </p>

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

          {/* QR code — taille réglable, jamais masqué par le texte */}
          <div className="flex flex-col items-center gap-2 shrink-0" style={{ minHeight: qrSize }}>
            <img
              src={qrDataUrl}
              alt="QR code formulaire accréditation"
              width={qrSize}
              height={qrSize}
              className="object-contain"
              style={{ width: qrSize, height: qrSize }}
            />
            <p className="text-xs text-gray-500 print:text-sm">
              Scannez pour accéder au formulaire
            </p>
          </div>

          {/* URL — visible à l'écran uniquement, masquée à l'impression */}
          <p className="text-[10px] text-gray-400 truncate max-w-full px-4 print:hidden">
            {accreditationUrl}
          </p>
        </div>
      </div>

      {/* Styles print : masquer header admin, zone édition, et en-têtes/pieds navigateur */}
      <style dangerouslySetInnerHTML={{ __html: `
        @page {
          size: auto;
          margin: 0;
        }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; }
          header { display: none !important; }
          .print\\:hidden { display: none !important; }
          main { padding: 0.5cm !important; max-width: none !important; }
          [data-print-area] { box-shadow: none !important; }
        }
      `}} />
    </div>
  );
}

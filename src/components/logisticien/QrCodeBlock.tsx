"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, QrCode as QrCodeIcon } from "lucide-react";

interface Props {
  /** Chemin relatif (ex: "/logisticien/123") combiné à l'origine courante. */
  path: string;
  /** Titre affiché au-dessus du QR (ex: "QR Véhicule"). */
  label: string;
  /** Légende optionnelle sous le QR. */
  caption?: string;
  /** Nom du fichier au téléchargement (sans extension). */
  fileName?: string;
  className?: string;
}

export default function QrCodeBlock({
  path,
  label,
  caption,
  fileName = "qr-code",
  className,
}: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [url, setUrl] = useState<string>("");

  useEffect(() => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const full = `${origin}${path}`;
    setUrl(full);
    QRCode.toDataURL(full, {
      type: "image/png",
      margin: 2,
      width: 320,
      errorCorrectionLevel: "M",
    })
      .then(setDataUrl)
      .catch(() => setDataUrl(null));
  }, [path]);

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${fileName}.png`;
    a.click();
  };

  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col items-center gap-2 ${className ?? ""}`}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 self-start">
        <QrCodeIcon size={16} className="text-[#4F587E]" />
        {label}
      </div>
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt={label}
          className="w-40 h-40 object-contain"
        />
      ) : (
        <div className="w-40 h-40 flex items-center justify-center text-xs text-gray-400">
          Génération…
        </div>
      )}
      {caption && (
        <p className="text-xs text-gray-500 text-center max-w-[200px]">{caption}</p>
      )}
      <button
        type="button"
        onClick={handleDownload}
        disabled={!dataUrl}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4F587E]/10 text-[#4F587E] text-xs font-semibold hover:bg-[#4F587E]/20 transition disabled:opacity-50"
      >
        <Download size={14} />
        Télécharger
      </button>
      {url && (
        <span className="text-[10px] text-gray-400 break-all text-center max-w-[220px]">
          {url}
        </span>
      )}
    </div>
  );
}

import QRCode from "qrcode";

interface Props {
  id: string;
  size?: number;
  /** Légende sous le QR (optionnelle). */
  caption?: string;
}

/**
 * Affiche le QR code d'une accréditation (server component).
 *
 * Le payload encodé est `{"id":"..."}` — format historique déjà produit par
 * le PDF d'accréditation et reconnu par le scanner ([scanner/qr]), qui le
 * redirige vers la page de vérification `/logisticien/{id}/verify`.
 */
export default async function AccreditationQrBadge({
  id,
  size = 160,
  caption,
}: Props) {
  let dataUrl = "";
  try {
    dataUrl = await QRCode.toDataURL(JSON.stringify({ id }), {
      margin: 1,
      width: size * 2,
      errorCorrectionLevel: "M",
    });
  } catch {
    dataUrl = "";
  }

  if (!dataUrl) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-[10px] text-gray-400"
        style={{ width: size, height: size }}
      >
        QR indisponible
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dataUrl}
        alt="QR code de l'accréditation"
        width={size}
        height={size}
        className="rounded-lg border border-gray-200 bg-white"
      />
      {caption && (
        <span className="text-[10px] font-mono text-gray-400">{caption}</span>
      )}
    </div>
  );
}

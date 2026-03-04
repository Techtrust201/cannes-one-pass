import QRCode from "qrcode";
import { getBaseUrl } from "@/lib/base-url";
import QrPrintCard from "@/components/admin/QrPrintCard";

export default async function AdminQrPage() {
  const baseUrl = getBaseUrl();
  const accreditationUrl = `${baseUrl}/accreditation`;

  const qrDataUrl = await QRCode.toDataURL(accreditationUrl, {
    type: "image/png",
    margin: 2,
    width: 400,
    errorCorrectionLevel: "M",
  });

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 print:hidden">
        <h1 className="text-2xl font-bold text-gray-900">
          QR code pour la guérite
        </h1>
        <p className="text-gray-600 mt-1">
          Personnalisez le texte, imprimez l&apos;affiche et affichez-la à l&apos;entrée pour que les chauffeurs puissent s&apos;enregistrer.
        </p>
      </div>

      <QrPrintCard qrDataUrl={qrDataUrl} accreditationUrl={accreditationUrl} />
    </div>
  );
}

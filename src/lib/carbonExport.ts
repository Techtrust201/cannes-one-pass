import { toPng } from "html-to-image";

export async function exportToPDF(activeTab: string) {
  try {
    // Importer pdf-lib dynamiquement
    const { PDFDocument, rgb } = await import("pdf-lib");

    // Fonction pour capturer un élément DOM en image
    const captureElement = async (element: HTMLElement) => {
      return await toPng(element, {
        quality: 1.0,
        pixelRatio: 2, // Haute résolution
        backgroundColor: "#ffffff",
        style: {
          transform: "scale(1)",
          transformOrigin: "top left",
        },
      });
    };

    // Sélectionner le contenu à exporter selon l'onglet actif
    const contentElement = document.querySelector(
      "[data-export-content]"
    ) as HTMLElement;

    if (!contentElement) {
      throw new Error("Contenu à exporter non trouvé");
    }

    // Capturer l'image
    const imageDataUrl = await captureElement(contentElement);

    // Créer un nouveau document PDF
    const pdfDoc = await PDFDocument.create();

    // Convertir l'image base64 en bytes
    const imageBytes = await fetch(imageDataUrl).then((res) =>
      res.arrayBuffer()
    );

    // Embarquer l'image dans le PDF
    const image = await pdfDoc.embedPng(imageBytes);
    const imageDims = image.scale(0.75); // Réduire légèrement pour les marges

    // Ajouter une page
    const page = pdfDoc.addPage([imageDims.width + 32, imageDims.height + 32]);

    // Ajouter un titre
    const dateStr = new Date().toLocaleDateString("fr-FR");
    page.drawText(`Bilan Carbone - ${activeTab} - ${dateStr}`, {
      x: 16,
      y: page.getHeight() - 20,
      size: 12,
      color: rgb(0, 0, 0),
    });

    // Dessiner l'image sur la page
    page.drawImage(image, {
      x: 16,
      y: 16,
      width: imageDims.width,
      height: imageDims.height,
    });

    // Sérialiser le PDF
    const pdfBytes = await pdfDoc.save();

    // Créer un blob et télécharger
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.download = `bilan-carbone.pdf`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Nettoyer l'URL
    URL.revokeObjectURL(url);

    console.log("Export PDF réussi");
  } catch (error) {
    console.error("Erreur lors de l'export PDF:", error);

    // Fallback vers export PNG en cas d'erreur
    try {
      const { toPng } = await import("html-to-image");
      const contentElement = document.querySelector(
        "[data-export-content]"
      ) as HTMLElement;

      if (contentElement) {
        const imageDataUrl = await toPng(contentElement, {
          quality: 1.0,
          pixelRatio: 2,
          backgroundColor: "#ffffff",
        });

        const link = document.createElement("a");
        link.download = `bilan-carbone.png`;
        link.href = imageDataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log("Export PNG de secours réussi");
      }
    } catch (fallbackError) {
      console.error("Erreur lors de l'export de secours:", fallbackError);
      throw error;
    }
  }
}

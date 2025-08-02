import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Charge une image depuis une URL et la convertit en Data URL (Base64).
 * C'est la méthode la plus fiable pour s'assurer que html2canvas dispose de l'image.
 * @param url - L'URL complète de l'image à charger.
 * @returns Une promesse qui se résout avec la chaîne de caractères Base64 de l'image.
 */
const imageToDataUrl = (url: string): Promise<string> => {
  return fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error(
          `Erreur réseau lors du chargement de l'image: ${response.statusText}`
        );
      }
      return response.blob();
    })
    .then(
      blob =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        })
    );
};

/**
 * Génère un fichier PDF à partir d'un élément HTML.
 * @param fileName - Le nom du fichier PDF à sauvegarder.
 */
export const generateInvoicePDF = async (fileName: string = 'facture') => {
  try {
    const element = document.getElementById('invoice-pdf');
    if (!element) {
      throw new Error('Élément de la facture non trouvé (id="invoice-pdf")');
    }

    // 1. Trouver l'URL relative du logo depuis l'élément original.
    const logoElement = element.querySelector(
      '#invoice-logo'
    ) as HTMLImageElement | null;
    let logoDataUrl = '';
    if (logoElement) {
      const siteUrl = window.location.origin;
      const logoRelativePath = logoElement.getAttribute('src');
      if (logoRelativePath) {
        // 2. Charger l'image et la convertir en Base64 AVANT d'appeler html2canvas.
        logoDataUrl = await imageToDataUrl(`${siteUrl}${logoRelativePath}`);
      }
    }

    // 3. Générer le canvas, en injectant l'image Base64 dans le clone.
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      onclone: clonedDoc => {
        const clonedLogo = clonedDoc.getElementById(
          'invoice-logo'
        ) as HTMLImageElement | null;
        if (clonedLogo && logoDataUrl) {
          clonedLogo.src = logoDataUrl; // Injection des données de l'image
        }
      },
    });

    // 4. Créer et sauvegarder le PDF.
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`${fileName}.pdf`);
    return true;
  } catch (error) {
    console.error('Erreur lors de la génération du PDF:', error);
    throw error;
  }
};

/**
 * Ouvre la boîte de dialogue d'impression du navigateur pour l'élément de la facture.
 */
export const printInvoice = () => {
  const printContents = document.getElementById('invoice-pdf')?.innerHTML;
  if (!printContents) {
    throw new Error('Élément de la facture non trouvé (id="invoice-pdf")');
  }

  const originalContents = document.body.innerHTML;
  const printStyles = `
    <style>
      @media print {
        body * { visibility: hidden; }
        #invoice-pdf, #invoice-pdf * { visibility: visible; }
        #invoice-pdf { position: absolute; left: 0; top: 0; width: 100%; }
      }
    </style>
  `;

  document.body.innerHTML = printStyles + printContents;
  window.print();
  document.body.innerHTML = originalContents;
  window.location.reload();
};

/**
 * Exporte un élément HTML en PDF sur une seule page A4.
 * @param elementId - L'ID de l'élément DOM à exporter.
 * @param fileName - Le nom du fichier PDF de sortie.
 */
export const exportElementAsPDF = async (elementId: string, fileName: string = 'export') => {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Élément non trouvé (id="${elementId}")`);
  }
 
  // Capture de l'élément en canvas avec une haute résolution et un fond noir
  const canvas = await html2canvas(element, { 
    scale: 2, 
    useCORS: true,
    backgroundColor: '#111827', // Fond du thème sombre
    logging: false,
    allowTaint: true,
  });
 
  const imgData = canvas.toDataURL('image/png');
  
  // Création du PDF au format A4 Paysage
  const pdf = new jsPDF('l', 'mm', 'a4'); 
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const canvasAspectRatio = canvasWidth / canvasHeight;

  // Calcul des dimensions de l'image pour qu'elle s'adapte à la page A4
  let imgWidth = pageWidth;
  let imgHeight = imgWidth / canvasAspectRatio;

  // Si l'image est trop haute, on la redimensionne en se basant sur la hauteur
  if (imgHeight > pageHeight) {
    imgHeight = pageHeight;
    imgWidth = imgHeight * canvasAspectRatio;
  }

  // Centrage horizontal de l'image. Alignement en haut pour éviter un décalage vertical.
  const xOffset = (pageWidth - imgWidth) / 2;

  // Ajout de l'image unique, redimensionnée et alignée en haut, sans pagination
  pdf.addImage(imgData, 'PNG', xOffset, 0, imgWidth, imgHeight);

  pdf.save(`${fileName}.pdf`);
  return true;
};  
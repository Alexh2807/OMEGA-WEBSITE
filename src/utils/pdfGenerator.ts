import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Charge une image et la convertit en Data URL (Base64).
 * @param url - L'URL de l'image.
 * @returns Une promesse qui se résout avec la chaîne Base64.
 */
const imageToDataUrl = (url: string): Promise<string> => {
  return fetch(url)
    .then(response => {
      if (!response.ok) throw new Error(`Erreur réseau: ${response.statusText}`);
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
 * Génère un PDF à partir d'un élément HTML pour une facture.
 * @param fileName - Le nom du fichier PDF.
 */
export const generateInvoicePDF = async (fileName: string = 'facture') => {
  try {
    const element = document.getElementById('invoice-pdf');
    if (!element) throw new Error('Élément de la facture non trouvé (id="invoice-pdf")');

    const logoElement = element.querySelector('#invoice-logo') as HTMLImageElement | null;
    let logoDataUrl = '';
    if (logoElement) {
      const siteUrl = window.location.origin;
      const logoRelativePath = logoElement.getAttribute('src');
      if (logoRelativePath) {
        logoDataUrl = await imageToDataUrl(`${siteUrl}${logoRelativePath}`);
      }
    }

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      onclone: clonedDoc => {
        const clonedLogo = clonedDoc.getElementById('invoice-logo') as HTMLImageElement | null;
        if (clonedLogo && logoDataUrl) {
          clonedLogo.src = logoDataUrl;
        }
      },
    });

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
 * Exporte un élément HTML en PDF, optimisé pour le planning.
 * @param elementId - L'ID de l'élément DOM à exporter.
 * @param fileName - Le nom du fichier de sortie.
 */
export const exportElementAsPDF = async (elementId: string, fileName: string = 'export') => {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Élément non trouvé (id="${elementId}")`);
  }
 
  // Forcer le recalcul du style et de la mise en page
  window.dispatchEvent(new Event('resize'));
  await new Promise(resolve => setTimeout(resolve, 500)); // Attendre que le DOM se stabilise

  const canvas = await html2canvas(element, { 
    scale: 3, // Augmentation de la résolution pour une meilleure qualité
    useCORS: true,
    backgroundColor: '#000000', // Fond noir pour correspondre au thème
    logging: false,
    allowTaint: true,
    // Ignorer les éléments qui posent problème lors de la capture
    ignoreElements: (el) => el.classList.contains('fc-scroller'),
  });
 
  const imgData = canvas.toDataURL('image/png', 0.95); // Utiliser une compression légère
  
  const pdf = new jsPDF('l', 'mm', 'a4'); // 'l' pour paysage (landscape)
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const canvasAspectRatio = canvasWidth / canvasHeight;

  // Calcul pour que l'image s'adapte parfaitement à la page en conservant son ratio
  let imgWidth = pageWidth - 20; // Ajouter des marges de 10mm de chaque côté
  let imgHeight = imgWidth / canvasAspectRatio;

  if (imgHeight > pageHeight - 20) {
    imgHeight = pageHeight - 20; // Marges de 10mm en haut et en bas
    imgWidth = imgHeight * canvasAspectRatio;
  }

  const xOffset = (pageWidth - imgWidth) / 2;
  const yOffset = (pageHeight - imgHeight) / 2;

  pdf.addImage(imgData, 'PNG', xOffset, yOffset, imgWidth, imgHeight);
  pdf.save(`${fileName}.pdf`);
  return true;
};
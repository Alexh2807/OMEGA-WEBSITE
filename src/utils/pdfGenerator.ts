import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Exporte un élément HTML en PDF, en utilisant une technique de clonage pour garantir un rendu stable.
 * @param elementId L'ID de l'élément DOM à exporter.
 * @param fileName Le nom du fichier PDF de sortie.
 */
export const exportElementAsPDF = async (elementId: string, fileName: string = 'export') => {
  const sourceElement = document.getElementById(elementId);
  if (!sourceElement) {
    throw new Error(`Élément à exporter non trouvé (id="${elementId}")`);
  }

  // 1. Cloner l'élément pour travailler sur une copie propre
  const clonedElement = sourceElement.cloneNode(true) as HTMLElement;

  // 2. Appliquer des styles optimisés pour la capture PDF sur le clone
  clonedElement.style.position = 'absolute';
  clonedElement.style.left = '-9999px'; // Placer la copie hors de l'écran
  clonedElement.style.top = '0px';
  clonedElement.style.width = '1280px'; // Forcer une largeur fixe pour la cohérence
  clonedElement.style.height = 'auto';
  clonedElement.style.backgroundColor = '#000000'; // S'assurer que le fond est noir
  
  // Ajouter des styles globaux pour que les enfants s'affichent correctement
  const style = document.createElement('style');
  style.innerHTML = `
    #${elementId}-clone * {
      color: #fff !important; /* Forcer la couleur du texte */
      -webkit-print-color-adjust: exact !important; /* Forcer l'impression des couleurs */
      color-adjust: exact !important;
    }
    #${elementId}-clone .fc-event {
      background-color: transparent !important; /* Simplifier le fond des événements */
    }
  `;
  clonedElement.id = `${elementId}-clone`; // Donner un ID unique au clone
  clonedElement.appendChild(style);
  
  document.body.appendChild(clonedElement);

  // Attendre que le clone soit rendu par le navigateur
  await new Promise(resolve => setTimeout(resolve, 300));

  try {
    const canvas = await html2canvas(clonedElement, { 
      scale: 2, // Une bonne résolution sans être excessive
      useCORS: true,
      backgroundColor: '#000000',
    });
 
    const imgData = canvas.toDataURL('image/png', 1.0);
    
    const pdf = new jsPDF('l', 'mm', 'a4'); // 'l' pour paysage (landscape)
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pageMargin = 10;
    
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    const aspectRatio = imgWidth / imgHeight;

    let pdfImgWidth = pageWidth - (pageMargin * 2);
    let pdfImgHeight = pdfImgWidth / aspectRatio;

    if (pdfImgHeight > pageHeight - (pageMargin * 2)) {
      pdfImgHeight = pageHeight - (pageMargin * 2);
      pdfImgWidth = pdfImgHeight * aspectRatio;
    }

    const x = (pageWidth - pdfImgWidth) / 2;
    const y = (pageHeight - pdfImgHeight) / 2;

    pdf.addImage(imgData, 'PNG', x, y, pdfImgWidth, pdfImgHeight);
    pdf.save(`${fileName}.pdf`);
  } finally {
    // 3. Toujours supprimer l'élément cloné après la capture
    document.body.removeChild(clonedElement);
  }

  return true;
};


// Le reste du fichier (generateInvoicePDF, etc.) peut rester tel quel.
// Je le laisse ici pour que le fichier soit complet.

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

    const canvas = await html2canvas(element, { scale: 2, useCORS: true, onclone: clonedDoc => { const clonedLogo = clonedDoc.getElementById('invoice-logo') as HTMLImageElement | null; if (clonedLogo && logoDataUrl) { clonedLogo.src = logoDataUrl; } }, });

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
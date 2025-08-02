import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Exporte un élément HTML en PDF, en utilisant une technique de clonage et de stylisation pour un rendu fiable.
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
  clonedElement.id = `${elementId}-clone-for-pdf`; // ID unique pour le clone

  // 2. Appliquer des styles optimisés pour la capture PDF sur le clone
  clonedElement.style.position = 'absolute';
  clonedElement.style.left = '-9999px'; // Placer la copie hors de l'écran pour éviter un flash
  clonedElement.style.top = '0px';
  clonedElement.style.width = '1280px'; // Forcer une largeur fixe pour la cohérence
  clonedElement.style.height = 'auto';
  clonedElement.style.backgroundColor = '#000000'; // S'assurer que le fond est noir
  
  // Ajouter une feuille de style DANS le clone pour surcharger les styles complexes
  const style = document.createElement('style');
  style.innerHTML = `
    /* Forcer la couleur du texte et l'impression des couleurs */
    #${clonedElement.id} * {
      color: #fff !important;
      -webkit-print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    /* Simplifier drastiquement le style des événements pour corriger l'alignement */
    #${clonedElement.id} .fc-event-main {
      display: block !important; /* Remplacer flexbox par un bloc simple */
      padding: 2px 4px;
    }
    #${clonedElement.id} .fc-event-main-frame {
      display: block !important;
    }
    #${clonedElement.id} .fc-event-title-container {
      display: block !important;
    }
    #${clonedElement.id} .fc-event-title {
        white-space: normal !important; /* Permettre au texte de passer à la ligne */
    }
  `;
  clonedElement.appendChild(style);
  
  document.body.appendChild(clonedElement);

  // Attendre que le navigateur applique les styles au clone
  await new Promise(resolve => setTimeout(resolve, 300));

  try {
    const canvas = await html2canvas(clonedElement, { 
      scale: 2,
      useCORS: true,
      backgroundColor: '#000000',
      logging: false, // Désactiver les logs pour la propreté
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


// Le reste du fichier (generateInvoicePDF, etc.) reste inchangé pour ne pas impacter les autres fonctionnalités.
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
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
  const container = document.getElementById(elementId);
  if (!container) {
    throw new Error(`Élément non trouvé (id="${elementId}")`);
  }

  // Si c'est le planning, viser le calendrier interne pour éviter les paddings/outils superposés
  const target: HTMLElement = (container.querySelector('.fc') as HTMLElement) || container;

  // S'assurer que les polices web sont chargées avant la capture pour éviter les décalages
  if ((document as any).fonts && typeof (document as any).fonts.ready?.then === 'function') {
    try { await (document as any).fonts.ready; } catch {}
  }

  // Mémoriser les dimensions réelles pour un rendu 1:1
  const { scrollWidth, scrollHeight } = target;

  const canvas = await html2canvas(target, {
    // Echelle basée sur le devicePixelRatio pour des textes plus nets
    scale: Math.min(3, Math.max(2, window.devicePixelRatio || 1)),
    useCORS: true,
    backgroundColor: getComputedStyle(document.body).backgroundColor || '#111827',
    width: scrollWidth,
    height: scrollHeight,
    scrollX: 0,
    scrollY: -window.scrollY,
    logging: false,
    allowTaint: true,
    onclone: clonedDoc => {
      const clonedContainer = clonedDoc.getElementById(elementId) as HTMLElement | null;
      const clonedCalendar = (clonedContainer?.querySelector('.fc') as HTMLElement) || clonedContainer;
      if (clonedCalendar) {
        // Normalisation du style pour la capture
        const style = clonedCalendar.style as CSSStyleDeclaration & { [key: string]: any };
        style.transform = 'none';
        style.boxShadow = 'none';
        style.backdropFilter = 'none';
        (style as any)['-webkit-backdrop-filter'] = 'none';
        style.filter = 'none';
        style.letterSpacing = 'normal';
        style.textRendering = 'geometricPrecision';
        // Forcer la largeur naturelle pour limiter les reflows
        style.width = `${scrollWidth}px`;

        // Éviter les scrollbars internes qui peuvent tronquer ou décaler
        const scrollers = clonedCalendar.querySelectorAll('.fc-scroller');
        scrollers.forEach((el: Element) => {
          const s = (el as HTMLElement).style;
          s.overflow = 'visible';
          s.maxHeight = 'none';
          s.height = 'auto';
        });
      }
      // Désactiver les animations/transitions susceptibles de déplacer le contenu
      const all = clonedDoc.querySelectorAll('*');
      all.forEach(el => {
        const s = (el as HTMLElement).style;
        s.animation = 'none';
        s.transition = 'none';
      });
    },
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

  if (imgHeight > pageHeight) {
    imgHeight = pageHeight;
    imgWidth = imgHeight * canvasAspectRatio;
  }

  // Marges fines pour éviter que la bordure touche les bords
  const margin = 5; // mm
  imgWidth = Math.max(0, imgWidth - margin * 2);
  imgHeight = Math.max(0, imgHeight - margin * 2);
  const xOffset = (pageWidth - imgWidth) / 2;
  const yOffset = (pageHeight - imgHeight) / 2;

  pdf.addImage(imgData, 'PNG', xOffset, yOffset, imgWidth, imgHeight);
  pdf.save(`${fileName}.pdf`);
  return true;
}; 
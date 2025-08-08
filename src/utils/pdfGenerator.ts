import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Charge une image depuis une URL et la convertit en Data URL (Base64).
 */
const imageToDataUrl = (url: string): Promise<string> => {
  return fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Erreur réseau lors du chargement de l'image: ${response.statusText}`);
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
 * Génère un fichier PDF à partir d'un élément HTML (facture).
 */
export const generateInvoicePDF = async (fileName: string = 'facture') => {
  try {
    const element = document.getElementById('invoice-pdf');
    if (!element) {
      throw new Error('Élément de la facture non trouvé (id="invoice-pdf")');
    }

    // 1) Précharge du logo en base64 pour éviter pertes CORS
    const logoElement = element.querySelector('#invoice-logo') as HTMLImageElement | null;
    let logoDataUrl = '';
    if (logoElement) {
      const siteUrl = window.location.origin;
      const logoRelativePath = logoElement.getAttribute('src');
      if (logoRelativePath) {
        logoDataUrl = await imageToDataUrl(`${siteUrl}${logoRelativePath}`);
      }
    }

    // 2) Capture
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

    // 3) PDF multi-pages
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
 * Impression navigateur d'une facture.
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
 * Exporte un élément HTML en PDF sur une seule page A4 (paysage).
 * Correction définitive pour FullCalendar : colonnes & scrollers figés.
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
    try {
      await (document as any).fonts.ready;
    } catch {}
  }

  // ——— MESURES SUR LE VRAI CALENDRIER ———
  const { scrollWidth, scrollHeight } = target;

  // a) Largeurs des colonnes (colgroup)
  const colEls = target.querySelectorAll<HTMLTableColElement>('.fc-scrollgrid-sync-table col');
  const colWidths: number[] = [];
  colEls.forEach(col => {
    const w =
      (col.style.width && col.style.width.endsWith('px'))
        ? parseFloat(col.style.width)
        : (col.getBoundingClientRect().width || 0);
    colWidths.push(Math.max(0, Math.round(w)));
  });

  // b) Dimensions des scrollers (pour conserver la place de la scrollbar)
  const scrollerDims: Array<{ idx: number; width: number; height: number }> = [];
  const scrollers = target.querySelectorAll<HTMLElement>('.fc-scroller');
  scrollers.forEach((el, idx) => {
    const r = el.getBoundingClientRect();
    scrollerDims.push({ idx, width: Math.round(r.width), height: Math.round(r.height) });
  });

  // ——— CAPTURE AVEC INJECTION DANS LE CLONE ———
  const canvas = await html2canvas(target, {
    scale: Math.min(3, Math.max(2, window.devicePixelRatio || 1)),
    useCORS: true,
    backgroundColor: getComputedStyle(document.body).backgroundColor || '#111827',
    width: scrollWidth,
    height: scrollHeight,
    scrollX: 0,
    scrollY: -window.scrollY,
    logging: false,
    allowTaint: true,
    windowWidth: Math.max(scrollWidth, document.documentElement.clientWidth),
    windowHeight: Math.max(scrollHeight, document.documentElement.clientHeight),
    onclone: clonedDoc => {
      const clonedContainer = clonedDoc.getElementById(elementId) as HTMLElement | null;
      const clonedCalendar = (clonedContainer?.querySelector('.fc') as HTMLElement) || clonedContainer;
      if (!clonedCalendar) return;

      // Neutraliser styles instables
      const style = clonedCalendar.style as CSSStyleDeclaration & { [key: string]: any };
      style.transform = 'none';
      style.boxShadow = 'none';
      style.backdropFilter = 'none';
      (style as any)['-webkit-backdrop-filter'] = 'none';
      style.filter = 'none';
      style.letterSpacing = 'normal';
      style.textRendering = 'geometricPrecision';
      style.width = `${scrollWidth}px`;

      // Couper anim/transition pour éviter reflows
      clonedDoc.querySelectorAll<HTMLElement>('*').forEach(s => {
        s.style.animation = 'none';
        s.style.transition = 'none';
      });

      // (A) Verrouiller les largeurs des colonnes sur TOUTES les sync-tables
      const clonedCols = clonedCalendar.querySelectorAll<HTMLTableColElement>('.fc-scrollgrid-sync-table col');
      clonedCols.forEach((col, i) => {
        const w = colWidths[i] ?? null;
        if (w && w > 0) {
          col.style.width = `${w}px`;
          col.setAttribute('width', `${w}`);
        }
      });

      // S’assurer d’un layout fixe
      clonedCalendar
        .querySelectorAll<HTMLElement>('.fc-scrollgrid, .fc-scrollgrid-sync-table, .fc-col-header, .fc-daygrid-body')
        .forEach(el => {
          el.style.tableLayout = 'fixed';
        });

      // (B) Figer les scrollers pour conserver la place de la scrollbar
      const clonedScrollers = clonedCalendar.querySelectorAll<HTMLElement>('.fc-scroller');
      clonedScrollers.forEach((el, idx) => {
        const dims = scrollerDims[idx];
        if (dims) {
          el.style.overflow = 'hidden';
          el.style.width = `${dims.width}px`;
          el.style.maxWidth = `${dims.width}px`;
          el.style.height = `${dims.height}px`;
          el.style.maxHeight = `${dims.height}px`;
        }
      });

      // Box-sizing pour stabilité des hauteurs internes
      clonedCalendar
        .querySelectorAll<HTMLElement>('.fc-daygrid-day, .fc-daygrid-day-frame, .fc-daygrid-day-events')
        .forEach(el => {
          el.style.boxSizing = 'border-box';
        });
    },
  });

  // ——— ASSEMBLAGE PDF A4 paysage ———
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('l', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const canvasAspectRatio = canvasWidth / canvasHeight;

  let imgWidth = pageWidth;
  let imgHeight = imgWidth / canvasAspectRatio;

  if (imgHeight > pageHeight) {
    imgHeight = pageHeight;
    imgWidth = imgHeight * canvasAspectRatio;
  }

  // Marges fines pour ne pas coller aux bords
  const margin = 5; // mm
  imgWidth = Math.max(0, imgWidth - margin * 2);
  imgHeight = Math.max(0, imgHeight - margin * 2);
  const xOffset = (pageWidth - imgWidth) / 2;
  const yOffset = (pageHeight - imgHeight) / 2;

  pdf.addImage(imgData, 'PNG', xOffset, yOffset, imgWidth, imgHeight);
  pdf.save(`${fileName}.pdf`);
  return true;
};

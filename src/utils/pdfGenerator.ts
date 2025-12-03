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
 * Crée une version simplifiée du calendrier pour un export PDF parfait
 */
const createSimplifiedCalendarForExport = (originalCalendar: HTMLElement): HTMLElement => {
  // Extraire les données du calendrier original
  const title = originalCalendar.querySelector('.fc-toolbar-title')?.textContent || 'Planning';
  const headerCells = Array.from(originalCalendar.querySelectorAll<HTMLTableCellElement>('.fc-col-header-cell'));
  const dayCells = Array.from(originalCalendar.querySelectorAll<HTMLElement>('.fc-daygrid-day'));
  const events = Array.from(originalCalendar.querySelectorAll<HTMLElement>('.fc-daygrid-event'));

  // Créer un conteneur pour le calendrier simplifié
  const container = document.createElement('div');
  container.style.cssText = `
    position: absolute;
    top: -9999px;
    left: -9999px;
    background: #111827;
    padding: 20px;
    border-radius: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #E5E7EB;
    width: 1200px;
    box-sizing: border-box;
  `;

  // Créer l'en-tête
  const header = document.createElement('div');
  header.style.cssText = `
    text-align: center;
    margin-bottom: 20px;
    font-size: 24px;
    font-weight: 700;
    color: #FFFFFF;
  `;
  header.textContent = title;
  container.appendChild(header);

  // Créer la table du calendrier avec une structure plus robuste
  const table = document.createElement('table');
  table.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    background: rgba(17, 24, 39, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.1);
  `;

  // Créer l'en-tête des jours
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  
  // Largeur égale pour chaque jour (7 jours)
  const dayWidth = 100 / 7;
  
  headerCells.forEach((cell, index) => {
    const th = document.createElement('th');
    th.style.cssText = `
      width: ${dayWidth}%;
      padding: 12px 8px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #9CA3AF;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 12px;
      text-align: center;
      letter-spacing: 0.05em;
    `;
    th.textContent = cell.textContent?.trim() || '';
    headerRow.appendChild(th);
  });
  
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Créer le corps du calendrier
  const tbody = document.createElement('tbody');
  
  // Organiser les jours par semaine en s'assurant que toutes les semaines ont 7 jours
  const organizedWeeks: HTMLElement[][] = [];
  let currentWeek: HTMLElement[] = [];
  
  dayCells.forEach((dayCell, index) => {
    currentWeek.push(dayCell);
    
    // Si on a 7 jours, créer une semaine
    if (currentWeek.length === 7) {
      organizedWeeks.push([...currentWeek]);
      currentWeek = [];
    }
  });
  
  // Ajouter la dernière semaine si elle contient des jours
  if (currentWeek.length > 0) {
    // Compléter avec des cellules vides si nécessaire
    while (currentWeek.length < 7) {
      const emptyCell = document.createElement('div');
      emptyCell.className = 'fc-daygrid-day empty-day';
      currentWeek.push(emptyCell);
    }
    organizedWeeks.push(currentWeek);
  }

  // Créer les lignes pour chaque semaine
  organizedWeeks.forEach(week => {
    const row = document.createElement('tr');
    
    week.forEach(dayCell => {
      const td = document.createElement('td');
      const isEmpty = dayCell.classList.contains('empty-day');
      
      td.style.cssText = `
        width: ${dayWidth}%;
        height: 120px;
        padding: 8px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        vertical-align: top;
        position: relative;
        background: ${!isEmpty && dayCell.classList.contains('fc-day-today') ? 'rgba(59, 130, 246, 0.15)' : 'transparent'};
      `;

      if (!isEmpty) {
        // Ajouter le numéro du jour
        const dayNumber = dayCell.querySelector('.fc-daygrid-day-number');
        if (dayNumber) {
          const dayNumDiv = document.createElement('div');
          dayNumDiv.style.cssText = `
            font-size: 14px;
            font-weight: 500;
            color: #9CA3AF;
            margin-bottom: 4px;
          `;
          dayNumDiv.textContent = dayNumber.textContent?.trim() || '';
          td.appendChild(dayNumDiv);
        }

        // Ajouter les événements de ce jour
        const dayEvents = events.filter(event => {
          const eventDay = event.closest('.fc-daygrid-day');
          return eventDay === dayCell;
        });

        // Limiter le nombre d'événements affichés pour éviter les débordements
        const maxEvents = 3;
        dayEvents.slice(0, maxEvents).forEach(event => {
          const eventDiv = document.createElement('div');
          const eventTitle = event.querySelector('.fc-event-title')?.textContent || event.textContent?.trim() || '';
          const eventColor = getComputedStyle(event).backgroundColor || '#3B82F6';
          
          eventDiv.style.cssText = `
            background: ${eventColor};
            color: white;
            padding: 2px 6px;
            margin: 2px 0;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          `;
          eventDiv.textContent = eventTitle;
          td.appendChild(eventDiv);
        });

        // Ajouter un indicateur s'il y a plus d'événements
        if (dayEvents.length > maxEvents) {
          const moreDiv = document.createElement('div');
          moreDiv.style.cssText = `
            color: #9CA3AF;
            font-size: 10px;
            font-style: italic;
            margin-top: 2px;
          `;
          moreDiv.textContent = `+${dayEvents.length - maxEvents} autre${dayEvents.length - maxEvents > 1 ? 's' : ''}`;
          td.appendChild(moreDiv);
        }
      }

      row.appendChild(td);
    });
    
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  container.appendChild(table);

  return container;
};

/**
 * Exporte un élément HTML en PDF sur une seule page A4 (paysage).
 * Solution radicale pour les décalages FullCalendar : reconstruction complète du calendrier.
 */
export const exportElementAsPDF = async (elementId: string, fileName: string = 'export') => {
  const container = document.getElementById(elementId);
  if (!container) {
    throw new Error(`Élément non trouvé (id="${elementId}")`);
  }

  // Si c'est le planning, viser le calendrier interne pour éviter les paddings/outils superposés
  const target: HTMLElement = (container.querySelector('.fc') as HTMLElement) || container;

  // Attendre que tous les éléments soient chargés et rendus
  await new Promise(resolve => setTimeout(resolve, 800));

  // S'assurer que les polices web sont chargées avant la capture pour éviter les décalages
  if ((document as any).fonts && typeof (document as any).fonts.ready?.then === 'function') {
    try {
      await (document as any).fonts.ready;
    } catch {}
  }

  // Créer une version simplifiée du calendrier pour l'export
  const simplifiedCalendar = createSimplifiedCalendarForExport(target);
  document.body.appendChild(simplifiedCalendar);

  // Attendre que le nouveau calendrier soit rendu et que les styles soient appliqués
  await new Promise(resolve => setTimeout(resolve, 500));

  // Forcer un reflow pour s'assurer que tout est correctement positionné
  simplifiedCalendar.style.display = 'none';
  simplifiedCalendar.offsetHeight; // Trigger reflow
  simplifiedCalendar.style.display = 'block';
  await new Promise(resolve => setTimeout(resolve, 200));

  // ——— CAPTURE DU CALENDRIER SIMPLIFIÉ ———
  const canvas = await html2canvas(simplifiedCalendar, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#111827',
    logging: false,
    allowTaint: true,
    windowWidth: simplifiedCalendar.scrollWidth,
    windowHeight: simplifiedCalendar.scrollHeight,
    onclone: (clonedDoc) => {
      // S'assurer que les styles sont bien appliqués dans le document cloné
      const clonedCalendar = clonedDoc.querySelector('[style*="position: absolute"]') as HTMLElement;
      if (clonedCalendar) {
        clonedCalendar.style.position = 'absolute';
        clonedCalendar.style.top = '0';
        clonedCalendar.style.left = '0';
      }
    }
  });

  // Nettoyer le calendrier temporaire
  document.body.removeChild(simplifiedCalendar);

  // ——— ASSEMBLAGE PDF A4 paysage ———
  const imgData = canvas.toDataURL('image/png', 1.0); // Qualité maximale
  const pdf = new jsPDF('l', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const canvasAspectRatio = canvasWidth / canvasHeight;

  // Calculer les dimensions optimales pour préserver l'alignement
  let imgWidth = pageWidth;
  let imgHeight = imgWidth / canvasAspectRatio;

  if (imgHeight > pageHeight) {
    imgHeight = pageHeight;
    imgWidth = imgHeight * canvasAspectRatio;
  }

  // Marges équilibrées pour un rendu professionnel
  const margin = 10; // mm
  imgWidth = Math.max(0, imgWidth - margin * 2);
  imgHeight = Math.max(0, imgHeight - margin * 2);
  const xOffset = (pageWidth - imgWidth) / 2;
  const yOffset = (pageHeight - imgHeight) / 2 + 5; // Légèrement décalé vers le bas pour la date

  // Ajouter un fond léger pour améliorer le contraste
  pdf.setFillColor(17, 24, 39); // Fond gris foncé correspondant au thème
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');

  // Ajouter l'image avec une qualité optimale
  pdf.addImage(imgData, 'PNG', xOffset, yOffset, imgWidth, imgHeight, undefined, 'FAST');
  
  // Ajouter un en-tête avec la date d'export
  pdf.setFontSize(10);
  pdf.setTextColor(156, 163, 175); // Couleur grise pour le texte secondaire
  const exportDate = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  pdf.text(`Planning exporté le ${exportDate}`, margin, pageHeight - margin);

  pdf.save(`${fileName}.pdf`);
  return true;
};

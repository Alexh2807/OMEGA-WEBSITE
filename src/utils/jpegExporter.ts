import html2canvas from 'html2canvas';

/**
 * Exporte un élément HTML en image JPEG de haute qualité
 * Solution simple et directe sans décalage - ce que vous voyez est ce que vous obtenez
 */
export const exportElementAsJPEG = async (
  elementId: string,
  fileName: string = 'export',
  options: {
    quality?: number;
    scale?: number;
    backgroundColor?: string;
  } = {}
): Promise<boolean> => {
  try {
    const {
      quality = 0.95, // Qualité JPEG (0-1)
      scale = 3, // Échelle pour une meilleure résolution
      backgroundColor = '#111827' // Fond par défaut
    } = options;

    // 1. Trouver l'élément à capturer
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`Élément non trouvé avec l'id: ${elementId}`);
    }

    // 2. Attendre que tout soit bien chargé (polices, images, etc.)
    await document.fonts?.ready;
    await new Promise(resolve => setTimeout(resolve, 300));

    // 3. Capturer l'élément EXACTEMENT comme il apparaît à l'écran
    const canvas = await html2canvas(element, {
      scale: scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: backgroundColor,
      logging: false,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
      // Capture parfaite sans décalage
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
    });

    // 4. Convertir en JPEG avec la qualité spécifiée
    const dataUrl = canvas.toDataURL('image/jpeg', quality);

    // 5. Déclencher le téléchargement
    const link = document.createElement('a');
    link.download = `${fileName}.jpg`;
    link.href = dataUrl;
    link.click();

    return true;
  } catch (error) {
    console.error('Erreur lors de l\'export JPEG:', error);
    throw error;
  }
};

/**
 * Exporte un élément HTML en image PNG de haute qualité (pour transparence)
 */
export const exportElementAsPNG = async (
  elementId: string,
  fileName: string = 'export',
  options: {
    scale?: number;
    backgroundColor?: string | null;
  } = {}
): Promise<boolean> => {
  try {
    const {
      scale = 3,
      backgroundColor = null // null pour fond transparent
    } = options;

    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`Élément non trouvé avec l'id: ${elementId}`);
    }

    await document.fonts?.ready;
    await new Promise(resolve => setTimeout(resolve, 300));

    const canvas = await html2canvas(element, {
      scale: scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: backgroundColor,
      logging: false,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
    });

    const dataUrl = canvas.toDataURL('image/png');

    const link = document.createElement('a');
    link.download = `${fileName}.png`;
    link.href = dataUrl;
    link.click();

    return true;
  } catch (error) {
    console.error('Erreur lors de l\'export PNG:', error);
    throw error;
  }
};

/**
 * Export spécialisé pour les calendriers FullCalendar
 * Capture le calendrier avec toutes ses décorations
 */
export const exportCalendarAsImage = async (
  calendarContainerId: string,
  fileName: string = 'planning',
  format: 'jpeg' | 'png' = 'jpeg'
): Promise<boolean> => {
  try {
    const container = document.getElementById(calendarContainerId);
    if (!container) {
      throw new Error(`Conteneur de calendrier non trouvé: ${calendarContainerId}`);
    }

    // Trouver le calendrier FullCalendar
    const calendarElement = container.querySelector('.fc') as HTMLElement;
    const targetElement = calendarElement || container;

    // Attendre que le calendrier soit complètement rendu
    await document.fonts?.ready;
    await new Promise(resolve => setTimeout(resolve, 500));

    // Capturer avec une haute résolution pour une qualité professionnelle
    const canvas = await html2canvas(targetElement, {
      scale: 3, // Haute résolution
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#111827', // Fond sombre du thème
      logging: false,
      windowWidth: targetElement.scrollWidth,
      windowHeight: targetElement.scrollHeight,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      // Options supplémentaires pour capturer les éléments positionnés
      foreignObjectRendering: false,
      imageTimeout: 15000,
    });

    // Ajouter un filigrane avec la date d'export
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const now = new Date();
      const dateStr = now.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      // Fond semi-transparent pour le texte
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(10, canvas.height - 40, 350, 30);

      // Texte de la date
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(`Exporté le ${dateStr}`, 20, canvas.height - 18);
    }

    // Convertir et télécharger
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const quality = format === 'jpeg' ? 0.95 : undefined;
    const dataUrl = canvas.toDataURL(mimeType, quality);

    const link = document.createElement('a');
    link.download = `${fileName}.${format === 'jpeg' ? 'jpg' : 'png'}`;
    link.href = dataUrl;
    link.click();

    return true;
  } catch (error) {
    console.error('Erreur lors de l\'export du calendrier:', error);
    throw error;
  }
};

/**
 * Prévisualisation de l'export avant téléchargement
 * Ouvre l'image dans un nouvel onglet
 */
export const previewExport = async (
  elementId: string,
  format: 'jpeg' | 'png' = 'jpeg'
): Promise<void> => {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`Élément non trouvé: ${elementId}`);
    }

    await document.fonts?.ready;
    await new Promise(resolve => setTimeout(resolve, 300));

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#111827',
      logging: false,
    });

    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const quality = format === 'jpeg' ? 0.95 : undefined;
    const dataUrl = canvas.toDataURL(mimeType, quality);

    // Ouvrir dans un nouvel onglet
    const newWindow = window.open();
    if (newWindow) {
      newWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Prévisualisation - ${format.toUpperCase()}</title>
            <style>
              body {
                margin: 0;
                padding: 20px;
                background: #1a1a1a;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
              }
              img {
                max-width: 100%;
                height: auto;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);
              }
            </style>
          </head>
          <body>
            <img src="${dataUrl}" alt="Prévisualisation" />
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('Erreur lors de la prévisualisation:', error);
    throw error;
  }
};

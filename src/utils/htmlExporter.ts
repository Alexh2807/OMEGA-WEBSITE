/**
 * Export HTML Direct - Copie exacte du calendrier
 * Solution définitive contre les décalages : export le HTML + CSS tel quel
 */

/**
 * Récupère tous les styles CSS utilisés par un élément et ses enfants
 */
const getAllStyles = (): string => {
  let styles = '';

  // 1. Récupérer tous les stylesheets
  Array.from(document.styleSheets).forEach(sheet => {
    try {
      if (sheet.cssRules) {
        Array.from(sheet.cssRules).forEach(rule => {
          styles += rule.cssText + '\n';
        });
      }
    } catch (e) {
      // Ignorer les erreurs CORS pour les feuilles de style externes
      console.warn('Cannot access stylesheet:', e);
    }
  });

  return styles;
};

/**
 * Récupère tous les styles inline d'un élément
 */
const getInlineStyles = (element: HTMLElement): string => {
  const computedStyle = window.getComputedStyle(element);
  let styles = '';

  // Propriétés importantes pour le layout
  const importantProps = [
    'display', 'position', 'top', 'left', 'right', 'bottom',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border', 'border-width', 'border-style', 'border-color', 'border-radius',
    'background', 'background-color', 'background-image', 'background-size',
    'color', 'font-family', 'font-size', 'font-weight', 'line-height',
    'text-align', 'vertical-align', 'white-space', 'overflow',
    'flex', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items',
    'grid', 'grid-template-columns', 'grid-template-rows', 'gap',
    'transform', 'opacity', 'z-index', 'box-shadow', 'text-shadow'
  ];

  importantProps.forEach(prop => {
    const value = computedStyle.getPropertyValue(prop);
    if (value && value !== 'none' && value !== 'normal' && value !== 'auto') {
      styles += `${prop}: ${value}; `;
    }
  });

  return styles;
};

/**
 * Clone un élément avec tous ses styles calculés
 */
const cloneElementWithStyles = (element: HTMLElement): HTMLElement => {
  const clone = element.cloneNode(true) as HTMLElement;

  // Appliquer les styles calculés à l'élément cloné
  const originalStyle = getInlineStyles(element);
  if (originalStyle) {
    clone.setAttribute('style', (clone.getAttribute('style') || '') + originalStyle);
  }

  // Appliquer récursivement aux enfants
  const originalChildren = Array.from(element.children) as HTMLElement[];
  const clonedChildren = Array.from(clone.children) as HTMLElement[];

  originalChildren.forEach((child, index) => {
    if (clonedChildren[index]) {
      const childStyle = getInlineStyles(child);
      if (childStyle) {
        clonedChildren[index].setAttribute('style',
          (clonedChildren[index].getAttribute('style') || '') + childStyle
        );
      }
    }
  });

  return clone;
};

/**
 * Exporte un élément HTML en fichier HTML autonome
 * Capture TOUT : HTML + CSS + styles calculés
 */
export const exportElementAsHTML = async (
  elementId: string,
  fileName: string = 'export',
  options: {
    title?: string;
    includeDate?: boolean;
    fullPage?: boolean;
  } = {}
): Promise<boolean> => {
  try {
    const {
      title = 'Planning Export',
      includeDate = true,
      fullPage = true
    } = options;

    // 1. Trouver l'élément à exporter
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`Élément non trouvé: ${elementId}`);
    }

    // 2. Récupérer TOUS les styles CSS
    const allStyles = getAllStyles();

    // 3. Cloner l'élément avec styles calculés
    const clonedElement = fullPage ?
      cloneElementWithStyles(element as HTMLElement) :
      element.cloneNode(true) as HTMLElement;

    // 4. Obtenir le HTML complet
    const elementHTML = clonedElement.outerHTML;

    // 5. Créer la date d'export si demandé
    const exportDate = includeDate ? new Date().toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) : '';

    // 6. Construire le document HTML complet
    const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    /* Reset et base */
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 20px;
      background: #0a0a0a;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #e5e7eb;
    }

    /* Styles importés de l'application */
    ${allStyles}

    /* Styles de l'en-tête d'export */
    .export-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px 30px;
      border-radius: 12px;
      margin-bottom: 30px;
      box-shadow: 0 10px 40px rgba(102, 126, 234, 0.3);
    }

    .export-header h1 {
      margin: 0 0 10px 0;
      font-size: 28px;
      font-weight: 700;
    }

    .export-header p {
      margin: 0;
      opacity: 0.9;
      font-size: 14px;
    }

    /* Container principal */
    .export-container {
      max-width: 100%;
      margin: 0 auto;
    }

    /* Boutons d'actions */
    .export-actions {
      position: fixed;
      top: 20px;
      right: 20px;
      display: flex;
      gap: 10px;
      z-index: 9999;
    }

    .export-btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      transition: all 0.3s ease;
    }

    .export-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
    }

    .export-btn:active {
      transform: translateY(0);
    }

    /* Footer */
    .export-footer {
      margin-top: 40px;
      padding: 20px;
      text-align: center;
      color: #9ca3af;
      font-size: 14px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    /* Responsive */
    @media print {
      .export-actions,
      .export-btn {
        display: none !important;
      }

      body {
        background: white;
      }

      .export-header {
        background: #667eea;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="export-actions">
    <button class="export-btn" onclick="window.print()">
      🖨️ Imprimer
    </button>
    <button class="export-btn" onclick="saveAsImage()">
      📸 Sauver comme Image
    </button>
  </div>

  <div class="export-container">
    <div class="export-header">
      <h1>${title}</h1>
      ${includeDate ? `<p>📅 Exporté le ${exportDate}</p>` : ''}
    </div>

    ${elementHTML}

    <div class="export-footer">
      <p>Document généré automatiquement | Omega Website Planning System</p>
      <p style="margin-top: 5px; font-size: 12px; opacity: 0.7;">
        Pour la meilleure qualité d'impression, utilisez Chrome ou Edge
      </p>
    </div>
  </div>

  <script>
    // Fonction pour sauvegarder comme image (optionnel)
    async function saveAsImage() {
      // Masquer les boutons temporairement
      const actions = document.querySelector('.export-actions');
      if (actions) actions.style.display = 'none';

      try {
        // Utiliser html2canvas si disponible
        if (typeof html2canvas !== 'undefined') {
          const canvas = await html2canvas(document.body, {
            scale: 2,
            backgroundColor: '#0a0a0a',
            logging: false
          });

          const link = document.createElement('a');
          link.download = '${fileName}.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
        } else {
          alert('Fonction non disponible. Veuillez utiliser l\\'impression navigateur (Ctrl+P).');
        }
      } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur lors de la génération de l\\'image. Utilisez l\\'impression navigateur.');
      } finally {
        if (actions) actions.style.display = 'flex';
      }
    }

    // Informations de débogage
    console.log('Document HTML exporté avec succès');
    console.log('Date d\\'export:', '${exportDate}');
    console.log('Titre:', '${title}');

    // Message de bienvenue
    console.log('%c✅ Planning chargé avec succès!', 'color: #10b981; font-size: 16px; font-weight: bold;');
    console.log('%cUtilisez les boutons en haut à droite pour imprimer ou sauvegarder', 'color: #667eea;');
  </script>
</body>
</html>`;

    // 7. Créer un Blob et télécharger
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}.html`;
    link.click();
    URL.revokeObjectURL(url);

    return true;
  } catch (error) {
    console.error('Erreur lors de l\'export HTML:', error);
    throw error;
  }
};

/**
 * Export spécialisé pour les calendriers FullCalendar
 * Format A4 Portrait - Calendrier complet redimensionné pour impression
 */
export const exportCalendarAsHTML = async (
  calendarContainerId: string,
  fileName: string = 'planning'
): Promise<boolean> => {
  try {
    const container = document.getElementById(calendarContainerId);
    if (!container) {
      throw new Error(`Conteneur non trouvé: ${calendarContainerId}`);
    }

    // Trouver le calendrier FullCalendar
    const calendar = container.querySelector('.fc') as HTMLElement;
    const targetElement = calendar || container;

    // Extraire le titre du calendrier
    const titleElement = targetElement.querySelector('.fc-toolbar-title');
    const calendarTitle = titleElement ? titleElement.textContent || 'Planning' : 'Planning';

    // Récupérer TOUS les styles CSS
    const allStyles = getAllStyles();

    // Cloner le calendrier avec son contenu
    const clonedCalendar = targetElement.cloneNode(true) as HTMLElement;
    const elementHTML = clonedCalendar.outerHTML;

    // Date d'export
    const exportDate = new Date().toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Construire le document HTML optimisé pour impression A4 Portrait
    const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Planning - ${calendarTitle}</title>
  <style>
    /* Reset et base */
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* Styles importés de l'application */
    ${allStyles}

    /* Configuration écran (affichage web) */
    body {
      margin: 0;
      padding: 10px;
      background: #000000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: white;
    }

    .print-container {
      max-width: 1200px;
      margin: 0 auto;
      background: #111827;
      padding: 20px;
      border-radius: 8px;
    }

    .print-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      text-align: center;
    }

    .print-header h1 {
      margin: 0 0 5px 0;
      font-size: 24px;
      font-weight: 700;
    }

    .print-header p {
      margin: 0;
      font-size: 14px;
      opacity: 0.9;
    }

    .print-button {
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      z-index: 9999;
      transition: all 0.3s ease;
    }

    .print-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
    }

    .print-instruction {
      text-align: center;
      margin-top: 20px;
      padding: 15px;
      background: rgba(102, 126, 234, 0.1);
      border-radius: 8px;
      color: #9ca3af;
      font-size: 14px;
    }

    .print-instruction strong {
      color: #667eea;
      display: block;
      margin-bottom: 5px;
      font-size: 16px;
    }

    /* Configuration impression A4 Portrait */
    @media print {
      /* Configuration de la page */
      @page {
        size: A4 portrait;
        margin: 0.5cm;
      }

      /* Reset pour l'impression */
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }

      /* Fond noir pour l'impression */
      html, body {
        background: #000000 !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        height: 100% !important;
      }

      /* Container principal */
      .print-container {
        background: #111827 !important;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0.3cm !important;
        border-radius: 0 !important;
        width: 100% !important;
        height: 100% !important;
        display: flex !important;
        flex-direction: column !important;
      }

      /* Header réduit */
      .print-header {
        background: #667eea !important;
        padding: 0.2cm 0.3cm !important;
        margin-bottom: 0.2cm !important;
        border-radius: 0.2cm !important;
        flex-shrink: 0 !important;
      }

      .print-header h1 {
        font-size: 14pt !important;
        margin: 0 !important;
      }

      .print-header p {
        font-size: 8pt !important;
        margin: 0 !important;
      }

      /* Masquer les éléments non-imprimables */
      .print-button,
      .print-instruction {
        display: none !important;
      }

      /* Calendrier redimensionné pour tenir sur A4 */
      .fc {
        width: 100% !important;
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
        background: #111827 !important;
        flex: 1 !important;
        display: flex !important;
        flex-direction: column !important;
      }

      .fc-view-harness {
        flex: 1 !important;
        overflow: visible !important;
        height: auto !important;
      }

      .fc-view {
        overflow: visible !important;
        height: auto !important;
      }

      .fc-daygrid-body {
        overflow: visible !important;
        height: auto !important;
      }

      .fc-scroller {
        overflow: visible !important;
        height: auto !important;
      }

      .fc-scrollgrid {
        border-color: rgba(255, 255, 255, 0.1) !important;
      }

      /* Toolbar réduit */
      .fc-toolbar {
        padding: 0.1cm 0 !important;
        margin-bottom: 0.2cm !important;
      }

      .fc-toolbar-title {
        font-size: 12pt !important;
        color: white !important;
      }

      /* Masquer les boutons de navigation */
      .fc-toolbar-chunk button,
      .fc-button {
        display: none !important;
      }

      /* Header des jours */
      .fc-col-header {
        background: #1F2937 !important;
      }

      .fc-col-header-cell {
        color: white !important;
        font-size: 7pt !important;
        padding: 0.1cm !important;
        border-color: rgba(255, 255, 255, 0.1) !important;
      }

      /* Cellules des jours */
      .fc-daygrid-day {
        border-color: rgba(255, 255, 255, 0.1) !important;
      }

      .fc-daygrid-day-frame {
        background: #111827 !important;
        min-height: 0 !important;
        padding: 1px !important;
      }

      .fc-daygrid-day-top {
        flex-direction: row !important;
        padding: 1px !important;
      }

      .fc-daygrid-day-number {
        font-size: 6pt !important;
        color: white !important;
        padding: 1px 2px !important;
      }

      /* Événements */
      .fc-daygrid-event {
        font-size: 5pt !important;
        margin: 1px 0 !important;
        padding: 0 2px !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        page-break-inside: avoid !important;
      }

      .fc-event-title {
        font-size: 5pt !important;
      }

      /* Jour aujourd'hui */
      .fc-day-today {
        background: rgba(59, 130, 246, 0.1) !important;
      }

      /* Alignement textes */
      td, th {
        vertical-align: top !important;
        text-align: left !important;
      }

      /* Footer avec date */
      .print-container::after {
        content: "Exporté le ${exportDate}";
        display: block;
        text-align: right;
        font-size: 6pt;
        color: #9CA3AF;
        margin-top: 0.2cm;
        padding-top: 0.1cm;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }
    }
  </style>
</head>
<body>
  <button class="print-button" onclick="window.print()">
    🖨️ Imprimer / Enregistrer en PDF
  </button>

  <div class="print-container">
    <div class="print-header">
      <h1>📅 Planning - ${calendarTitle}</h1>
      <p>Exporté le ${exportDate}</p>
    </div>

    ${elementHTML}

    <div class="print-instruction">
      <strong>📋 Instructions pour imprimer :</strong>
      <p>Cliquez sur le bouton "Imprimer" ci-dessus, puis :</p>
      <p>1. Choisissez "Enregistrer en PDF" ou votre imprimante</p>
      <p>2. Vérifiez que l'orientation est "Portrait"</p>
      <p>3. Activez "Graphiques d'arrière-plan" dans les options</p>
      <p>4. Le calendrier complet tiendra sur 1 feuille A4 !</p>
    </div>
  </div>

  <script>
    console.log('%c✅ Planning chargé avec succès!', 'color: #10b981; font-size: 16px; font-weight: bold;');
    console.log('%cCliquez sur le bouton "Imprimer" pour créer votre PDF', 'color: #667eea;');
    console.log('%cFormat : A4 Portrait | Calendrier complet sur 1 page', 'color: #9ca3af;');
  </script>
</body>
</html>`;

    // Créer un Blob et télécharger
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}.html`;
    link.click();
    URL.revokeObjectURL(url);

    return true;
  } catch (error) {
    console.error('Erreur lors de l\'export du calendrier:', error);
    throw error;
  }
};

/**
 * Prévisualisation de l'export HTML dans un nouvel onglet
 */
export const previewHTMLExport = async (elementId: string): Promise<void> => {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`Élément non trouvé: ${elementId}`);
    }

    const allStyles = getAllStyles();
    const elementHTML = element.outerHTML;

    const previewHTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prévisualisation</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      background: #0a0a0a;
    }
    ${allStyles}
  </style>
</head>
<body>
  ${elementHTML}
</body>
</html>`;

    const blob = new Blob([previewHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');

    // Nettoyer l'URL après un délai
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    console.error('Erreur lors de la prévisualisation:', error);
    throw error;
  }
};

/**
 * Export hybride HTML → JPEG
 * Utilise le HTML parfait comme base, puis convertit en JPEG sans décalage
 */
export const exportHTMLAsJPEG = async (
  elementId: string,
  fileName: string = 'export',
  options: {
    quality?: number;
    scale?: number;
  } = {}
): Promise<boolean> => {
  try {
    const {
      quality = 0.95,
      scale = 3
    } = options;

    // 1. Trouver l'élément (le HTML parfait)
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`Élément non trouvé: ${elementId}`);
    }

    // 2. Attendre que tout soit chargé
    await document.fonts?.ready;
    await new Promise(resolve => setTimeout(resolve, 500));

    // 3. Créer une copie normalisée pour la capture (corrige les décalages)
    const normalizedContainer = document.createElement('div');
    normalizedContainer.style.cssText = `
      position: fixed;
      top: -10000px;
      left: 0;
      width: ${element.offsetWidth}px;
      background: #111827;
      padding: 0;
      margin: 0;
      z-index: 99999;
    `;

    // Cloner l'élément
    const clonedElement = element.cloneNode(true) as HTMLElement;

    // Normaliser TOUS les styles pour éviter les décalages
    const normalizeElement = (el: HTMLElement) => {
      // Récupérer les styles calculés de l'original
      const originalEl = element.querySelector(`#${el.id}`) ||
                         element.querySelector(`.${el.className}`) ||
                         element;

      if (originalEl && originalEl instanceof HTMLElement) {
        const computed = window.getComputedStyle(originalEl);

        // Forcer les positions et dimensions exactes
        el.style.position = computed.position === 'absolute' || computed.position === 'fixed'
          ? 'relative'
          : computed.position;
        el.style.margin = '0';
        el.style.padding = computed.padding;
        el.style.top = '0';
        el.style.left = '0';
        el.style.transform = 'none';

        // Conserver les autres styles importants
        el.style.backgroundColor = computed.backgroundColor;
        el.style.color = computed.color;
        el.style.fontSize = computed.fontSize;
        el.style.fontFamily = computed.fontFamily;
        el.style.fontWeight = computed.fontWeight;
        el.style.lineHeight = computed.lineHeight;
        el.style.textAlign = computed.textAlign;
        el.style.verticalAlign = 'top'; // Forcer alignement en haut
        el.style.display = computed.display;
        el.style.width = computed.width;
        el.style.height = computed.height;
      }

      // Normaliser récursivement les enfants
      Array.from(el.children).forEach(child => {
        if (child instanceof HTMLElement) {
          normalizeElement(child);
        }
      });
    };

    normalizeElement(clonedElement);
    normalizedContainer.appendChild(clonedElement);
    document.body.appendChild(normalizedContainer);

    // Attendre le rendu
    await new Promise(resolve => setTimeout(resolve, 300));

    // 4. Importer html2canvas dynamiquement
    const html2canvas = (await import('html2canvas')).default;

    // 5. Capturer la version normalisée
    const canvas = await html2canvas(clonedElement, {
      scale: scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#111827',
      logging: false,
      // Capture précise sans scroll
      windowWidth: clonedElement.offsetWidth,
      windowHeight: clonedElement.offsetHeight,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      foreignObjectRendering: false,
      imageTimeout: 15000,
      // Corrections supplémentaires dans le clone
      onclone: (clonedDoc) => {
        // Forcer tous les éléments en position relative
        const allElements = clonedDoc.querySelectorAll('*');
        allElements.forEach((el) => {
          if (el instanceof HTMLElement) {
            if (el.style.position === 'absolute' || el.style.position === 'fixed') {
              el.style.position = 'relative';
            }
            el.style.top = '0';
            el.style.left = '0';
            el.style.transform = 'none';
            el.style.verticalAlign = 'top';
          }
        });
      }
    });

    // 6. Nettoyer l'élément temporaire
    document.body.removeChild(normalizedContainer);

    // 7. Ajouter un filigrane avec la date
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
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(15, canvas.height - 50, 380, 35);

      // Texte de la date
      ctx.fillStyle = '#9CA3AF';
      ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(`📅 Exporté le ${dateStr}`, 25, canvas.height - 23);
    }

    // 8. Convertir en JPEG avec la qualité spécifiée
    const dataUrl = canvas.toDataURL('image/jpeg', quality);

    // 9. Télécharger
    const link = document.createElement('a');
    link.download = `${fileName}.jpg`;
    link.href = dataUrl;
    link.click();

    return true;
  } catch (error) {
    console.error('Erreur lors de l\'export HTML→JPEG:', error);
    throw error;
  }
};

/**
 * Export hybride HTML → PNG (avec transparence)
 */
export const exportHTMLAsPNG = async (
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
      backgroundColor = null
    } = options;

    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`Élément non trouvé: ${elementId}`);
    }

    await document.fonts?.ready;
    await new Promise(resolve => setTimeout(resolve, 500));

    const html2canvas = (await import('html2canvas')).default;

    const canvas = await html2canvas(element as HTMLElement, {
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
      foreignObjectRendering: false,
      imageTimeout: 15000
    });

    // Ajouter filigrane
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

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(15, canvas.height - 50, 380, 35);

      ctx.fillStyle = '#9CA3AF';
      ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(`📅 Exporté le ${dateStr}`, 25, canvas.height - 23);
    }

    const dataUrl = canvas.toDataURL('image/png');

    const link = document.createElement('a');
    link.download = `${fileName}.png`;
    link.href = dataUrl;
    link.click();

    return true;
  } catch (error) {
    console.error('Erreur lors de l\'export HTML→PNG:', error);
    throw error;
  }
};

/**
 * Export calendrier en JPEG via HTML (pas de décalage)
 * Méthode hybride : HTML parfait → Capture → JPEG
 * FIX: Désactive le scroll du calendrier avant capture
 */
export const exportCalendarAsJPEG = async (
  calendarContainerId: string,
  fileName: string = 'planning'
): Promise<boolean> => {
  try {
    const container = document.getElementById(calendarContainerId);
    if (!container) {
      throw new Error(`Conteneur non trouvé: ${calendarContainerId}`);
    }

    // Trouver le calendrier FullCalendar
    const calendar = container.querySelector('.fc') as HTMLElement;
    const targetElement = calendar || container;

    // SAUVEGARDER les styles originaux pour restauration
    const originalStyles = {
      overflow: targetElement.style.overflow,
      overflowX: targetElement.style.overflowX,
      overflowY: targetElement.style.overflowY,
      height: targetElement.style.height,
      maxHeight: targetElement.style.maxHeight,
    };

    // DÉSACTIVER LE SCROLL - C'est la clé !
    targetElement.style.overflow = 'visible';
    targetElement.style.overflowX = 'visible';
    targetElement.style.overflowY = 'visible';
    targetElement.style.height = 'auto';
    targetElement.style.maxHeight = 'none';

    // Désactiver aussi le scroll sur tous les conteneurs internes
    const scrollableElements = targetElement.querySelectorAll('.fc-scroller, .fc-daygrid-body, [style*="overflow"]');
    const originalScrollStyles: Array<{ element: HTMLElement; overflow: string; height: string; maxHeight: string }> = [];

    scrollableElements.forEach((el) => {
      if (el instanceof HTMLElement) {
        originalScrollStyles.push({
          element: el,
          overflow: el.style.overflow,
          height: el.style.height,
          maxHeight: el.style.maxHeight
        });

        el.style.overflow = 'visible';
        el.style.height = 'auto';
        el.style.maxHeight = 'none';
      }
    });

    // Attendre que le calendrier se réajuste
    await new Promise(resolve => setTimeout(resolve, 800));

    // Attendre que tout soit chargé
    await document.fonts?.ready;

    // Importer html2canvas
    const html2canvas = (await import('html2canvas')).default;

    // Capturer DIRECTEMENT - maintenant sans scroll !
    const canvas = await html2canvas(targetElement, {
      scale: 3,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#111827',
      logging: false, // Désactiver logs
      // Utiliser scrollHeight au lieu de offsetHeight pour capturer TOUT
      width: targetElement.scrollWidth,
      height: targetElement.scrollHeight,
      // Position exacte
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      // Options de rendu
      foreignObjectRendering: false,
      imageTimeout: 15000,
      // Callback de clonage
      onclone: (clonedDoc, clonedElement) => {
        // Forcer tout en visible dans le clone aussi
        clonedElement.style.overflow = 'visible';
        clonedElement.style.position = 'relative';
        clonedElement.style.top = '0';
        clonedElement.style.left = '0';
        clonedElement.style.margin = '0';

        // Parcourir TOUS les éléments
        const allEls = clonedElement.querySelectorAll('*');
        allEls.forEach((el) => {
          if (el instanceof HTMLElement) {
            // Forcer overflow visible partout
            if (el.classList.contains('fc-scroller') ||
                el.classList.contains('fc-daygrid-body') ||
                el.style.overflow !== '') {
              el.style.overflow = 'visible';
              el.style.height = 'auto';
              el.style.maxHeight = 'none';
            }

            // Forcer vertical-align pour textes
            if (el.tagName === 'TD' || el.tagName === 'TH') {
              el.style.verticalAlign = 'top';
            }

            // Reset positions problématiques
            if (el.style.position === 'fixed' || el.style.position === 'sticky') {
              el.style.position = 'absolute';
            }
          }
        });
      }
    });

    // RESTAURER les styles originaux
    targetElement.style.overflow = originalStyles.overflow;
    targetElement.style.overflowX = originalStyles.overflowX;
    targetElement.style.overflowY = originalStyles.overflowY;
    targetElement.style.height = originalStyles.height;
    targetElement.style.maxHeight = originalStyles.maxHeight;

    originalScrollStyles.forEach(({ element, overflow, height, maxHeight }) => {
      element.style.overflow = overflow;
      element.style.height = height;
      element.style.maxHeight = maxHeight;
    });

    // Ajouter le filigrane
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

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(15, canvas.height - 50, 380, 35);

      ctx.fillStyle = '#9CA3AF';
      ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(`📅 Exporté le ${dateStr}`, 25, canvas.height - 23);
    }

    // Convertir et télécharger
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

    const link = document.createElement('a');
    link.download = `${fileName}.jpg`;
    link.href = dataUrl;
    link.click();

    return true;
  } catch (error) {
    console.error('Erreur lors de l\'export calendrier→JPEG:', error);
    throw error;
  }
};

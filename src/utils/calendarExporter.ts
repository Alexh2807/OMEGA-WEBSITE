/**
 * Export Planning en Format Calendrier - Optimisé pour impression A4 Portrait
 * Affiche un calendrier mensuel avec les événements dans chaque case de jour
 */

export const exportCalendarAsGrid = async (
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

    // Extraire le titre du calendrier (mois/année)
    const titleElement = targetElement.querySelector('.fc-toolbar-title');
    const calendarTitle = titleElement ? titleElement.textContent || 'Planning' : 'Planning';

    // Extraire tous les événements du calendrier
    const events: Array<{
      title: string;
      date: string;
      color: string;
      eventType?: string;
    }> = [];

    // Récupérer les événements depuis le DOM
    const eventElements = targetElement.querySelectorAll('.fc-daygrid-event');
    const seenEvents = new Set<string>();

    eventElements.forEach((eventEl) => {
      const eventContent = eventEl.querySelector('.fc-event-main, .fc-event-main-frame');

      // Extraire UNIQUEMENT le nom du lieu (location) depuis le <b> tag
      const locationNameEl = eventContent?.querySelector('b');
      const locationName = locationNameEl?.textContent?.trim() || '';

      // Extraire le type d'événement
      let eventType = '';
      const spans = eventContent?.querySelectorAll('span');
      if (spans && spans.length > 0) {
        for (const span of Array.from(spans)) {
          const text = span.textContent?.trim() || '';
          if (text && !text.includes('€') && !text.includes('Aucun') && text !== locationName) {
            eventType = text;
            break;
          }
        }
      }

      // Récupérer la date
      const dateAttr = eventEl.getAttribute('data-date') ||
                      eventEl.closest('.fc-daygrid-day')?.getAttribute('data-date') ||
                      '';

      // Récupérer la couleur
      const bgColor = (eventEl as HTMLElement).style.backgroundColor || '#3B82F6';

      const eventKey = `${dateAttr}-${locationName}`;

      if (dateAttr && locationName && !seenEvents.has(eventKey)) {
        seenEvents.add(eventKey);
        events.push({
          title: locationName,
          date: dateAttr,
          color: bgColor,
          eventType: eventType || undefined
        });
      }
    });

    // Grouper les événements par date
    const eventsByDate = events.reduce((acc, event) => {
      if (!acc[event.date]) {
        acc[event.date] = [];
      }
      acc[event.date].push(event);
      return acc;
    }, {} as Record<string, typeof events>);

    // Déterminer le mois et l'année à partir du titre ou du premier événement
    let currentMonth: Date;
    if (events.length > 0) {
      currentMonth = new Date(events[0].date + 'T12:00:00');
    } else {
      currentMonth = new Date();
    }

    // Générer la grille du calendrier pour le mois
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    // Premier jour du mois
    const firstDay = new Date(year, month, 1);
    // Dernier jour du mois
    const lastDay = new Date(year, month + 1, 0);

    // Jour de la semaine du premier jour (0 = dimanche, 1 = lundi, etc.)
    const firstDayOfWeek = firstDay.getDay();
    // Ajuster pour que lundi soit 0
    const startDayOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    // Nombre de jours dans le mois
    const daysInMonth = lastDay.getDate();

    // Générer le HTML de la grille du calendrier
    const daysOfWeek = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

    let calendarHTML = '<div class="calendar-grid">';

    // En-têtes des jours de la semaine
    calendarHTML += '<div class="calendar-header">';
    daysOfWeek.forEach(day => {
      calendarHTML += `<div class="day-name">${day}</div>`;
    });
    calendarHTML += '</div>';

    // Grille des jours
    calendarHTML += '<div class="calendar-days">';

    // Cases vides avant le premier jour
    for (let i = 0; i < startDayOffset; i++) {
      calendarHTML += '<div class="calendar-day empty"></div>';
    }

    // Cases pour chaque jour du mois
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayEvents = eventsByDate[dateStr] || [];

      calendarHTML += '<div class="calendar-day">';
      calendarHTML += `<div class="day-number">${day}</div>`;

      if (dayEvents.length > 0) {
        calendarHTML += '<div class="day-events">';
        dayEvents.forEach(event => {
          const displayText = event.eventType
            ? `<strong>${event.title}</strong> - ${event.eventType}`
            : `<strong>${event.title}</strong>`;

          calendarHTML += `
            <div class="event-item" style="border-left: 3px solid ${event.color};">
              <div class="event-text">${displayText}</div>
            </div>
          `;
        });
        calendarHTML += '</div>';
      }

      calendarHTML += '</div>';
    }

    calendarHTML += '</div></div>';

    // Date d'export
    const exportDate = new Date().toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Construire le document HTML optimisé pour impression A4 Portrait - FORMAT CALENDRIER
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

    /* Configuration écran (affichage web) */
    body {
      margin: 0;
      padding: 20px;
      background: #000000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: white;
    }

    .print-container {
      max-width: 1200px;
      margin: 0 auto;
      background: #111827;
      padding: 30px;
      border-radius: 8px;
    }

    .print-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      text-align: center;
    }

    .print-header h1 {
      margin: 0 0 10px 0;
      font-size: 28px;
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

    /* Grille du calendrier */
    .calendar-grid {
      background: #0F172A;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #1E293B;
    }

    .calendar-header {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      background: #1F2937;
      border-bottom: 2px solid #667eea;
    }

    .day-name {
      padding: 12px;
      text-align: center;
      font-weight: 600;
      font-size: 14px;
      color: #E5E7EB;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .calendar-days {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 1px;
      background: #1E293B;
    }

    .calendar-day {
      background: #0F172A;
      min-height: 100px;
      padding: 8px;
      position: relative;
    }

    .calendar-day.empty {
      background: #000000;
      opacity: 0.3;
    }

    .day-number {
      font-size: 16px;
      font-weight: 600;
      color: #9CA3AF;
      margin-bottom: 6px;
    }

    .day-events {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .event-item {
      background: #1E293B;
      padding: 6px 8px;
      border-radius: 4px;
      font-size: 11px;
      line-height: 1.3;
      transition: background 0.2s;
    }

    .event-item:hover {
      background: #334155;
    }

    .event-text {
      color: white;
    }

    .event-text strong {
      font-weight: 600;
      color: #E5E7EB;
    }

    .print-instruction {
      text-align: center;
      margin-top: 30px;
      padding: 20px;
      background: rgba(102, 126, 234, 0.1);
      border-radius: 8px;
      color: #9ca3af;
      font-size: 13px;
      line-height: 1.6;
    }

    .print-instruction strong {
      color: #667eea;
      display: block;
      margin-bottom: 10px;
      font-size: 15px;
    }

    /* Configuration impression A4 Portrait */
    @media print {
      /* Configuration de la page */
      @page {
        size: A4 portrait;
        margin: 0.8cm;
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
      }

      /* Container principal */
      .print-container {
        background: #111827 !important;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0.4cm !important;
        border-radius: 0 !important;
      }

      /* Header compact */
      .print-header {
        background: #667eea !important;
        padding: 0.3cm !important;
        margin-bottom: 0.3cm !important;
        border-radius: 0.2cm !important;
      }

      .print-header h1 {
        font-size: 14pt !important;
        margin-bottom: 0.1cm !important;
      }

      .print-header p {
        font-size: 8pt !important;
      }

      /* Masquer les éléments non-imprimables */
      .print-button,
      .print-instruction {
        display: none !important;
      }

      /* Calendrier optimisé pour A4 */
      .calendar-grid {
        background: #0F172A !important;
        border: 1px solid #1E293B !important;
      }

      .calendar-header {
        background: #1F2937 !important;
      }

      .day-name {
        padding: 0.15cm !important;
        font-size: 8pt !important;
      }

      .calendar-days {
        gap: 1px !important;
        background: #1E293B !important;
      }

      .calendar-day {
        background: #0F172A !important;
        min-height: 2.2cm !important;
        padding: 0.15cm !important;
        page-break-inside: avoid !important;
      }

      .calendar-day.empty {
        background: #000000 !important;
      }

      .day-number {
        font-size: 9pt !important;
        margin-bottom: 0.1cm !important;
      }

      .day-events {
        gap: 0.08cm !important;
      }

      .event-item {
        background: #1E293B !important;
        padding: 0.08cm 0.12cm !important;
        border-radius: 0.1cm !important;
        font-size: 7pt !important;
        line-height: 1.2 !important;
      }

      .event-text {
        color: white !important;
      }

      .event-text strong {
        font-weight: 600 !important;
      }

      /* Footer automatique */
      .print-container::after {
        content: "Exporté le ${exportDate}";
        display: block;
        text-align: right;
        font-size: 7pt;
        color: #9CA3AF;
        margin-top: 0.2cm;
        padding-top: 0.15cm;
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

    ${calendarHTML}

    <div class="print-instruction">
      <strong>📋 Comment imprimer ce planning</strong>
      <p>1. Cliquez sur le bouton "Imprimer" ci-dessus</p>
      <p>2. Choisissez "Enregistrer en PDF" ou votre imprimante</p>
      <p>3. Vérifiez l'orientation: Portrait (A4)</p>
      <p>4. Activez "Graphiques d'arrière-plan"</p>
      <p>5. Le calendrier tiendra sur 1 feuille A4!</p>
    </div>
  </div>

  <script>
    console.log('%c✅ Planning en calendrier chargé!', 'color: #10b981; font-size: 16px; font-weight: bold;');
    console.log('%cFormat: Calendrier mensuel optimisé pour A4 Portrait', 'color: #667eea;');
    console.log('%cCliquez sur "Imprimer" pour créer votre PDF', 'color: #9ca3af;');
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
    console.error('Erreur lors de l\'export du planning en calendrier:', error);
    throw error;
  }
};

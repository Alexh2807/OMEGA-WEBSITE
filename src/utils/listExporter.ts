/**
 * Export Planning en Vue Liste - Optimisé pour impression A4 Portrait
 * Basé sur les recommandations FullCalendar pour l'impression
 */

export const exportCalendarAsList = async (
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

    // Extraire tous les événements du calendrier
    const events: Array<{
      title: string;
      date: string;
      color: string;
      provider?: string;
      eventType?: string;
    }> = [];

    // Récupérer les événements depuis le DOM
    const eventElements = targetElement.querySelectorAll('.fc-daygrid-event');
    const seenEvents = new Set<string>(); // Pour éviter les doublons

    eventElements.forEach((eventEl) => {
      // Récupérer le contenu de l'événement - FullCalendar structure
      const eventContent = eventEl.querySelector('.fc-event-main, .fc-event-main-frame');

      // Extraire UNIQUEMENT le nom du lieu (location) depuis le <b> tag
      const locationNameEl = eventContent?.querySelector('b');
      const locationName = locationNameEl?.textContent?.trim() || '';

      // Extraire le type d'événement depuis la structure DOM
      // Le type est affiché avec l'icône Tag - trouver le span qui suit l'icône
      let eventType = '';

      // Chercher tous les spans dans l'événement
      const spans = eventContent?.querySelectorAll('span');
      if (spans && spans.length > 0) {
        // Le premier span après le nom contient généralement le type d'événement
        // On cherche un span qui n'est pas vide et qui contient du texte
        for (const span of Array.from(spans)) {
          const text = span.textContent?.trim() || '';
          // Ignorer les spans vides, les prix (contiennent €), et les prestataires
          if (text && !text.includes('€') && !text.includes('Aucun') && text !== locationName) {
            eventType = text;
            break; // Prendre le premier trouvé qui correspond aux critères
          }
        }
      }

      // Récupérer la date depuis l'attribut ou le parent
      const dateAttr = eventEl.getAttribute('data-date') ||
                      eventEl.closest('.fc-daygrid-day')?.getAttribute('data-date') ||
                      '';

      // Récupérer la couleur de fond
      const bgColor = (eventEl as HTMLElement).style.backgroundColor || '#3B82F6';

      // Créer une clé unique pour éviter les doublons
      const eventKey = `${dateAttr}-${locationName}`;

      if (dateAttr && locationName && !seenEvents.has(eventKey)) {
        seenEvents.add(eventKey);
        events.push({
          title: locationName,
          date: dateAttr,
          color: bgColor,
          provider: undefined, // On ne stocke plus les prestataires
          eventType: eventType || undefined
        });
      }
    });

    // Trier les événements par date
    events.sort((a, b) => a.date.localeCompare(b.date));

    // Grouper les événements par date
    const eventsByDate = events.reduce((acc, event) => {
      if (!acc[event.date]) {
        acc[event.date] = [];
      }
      acc[event.date].push(event);
      return acc;
    }, {} as Record<string, typeof events>);

    // Date d'export
    const exportDate = new Date().toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Formater une date pour l'affichage
    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr + 'T12:00:00');
      return date.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    };

    // Générer le HTML de la liste des événements
    const eventsListHTML = Object.entries(eventsByDate).length > 0
      ? Object.entries(eventsByDate).map(([date, dayEvents]) => {
          const formattedDate = formatDate(date);
          const eventsHTML = dayEvents.map(event => {
            // Construire le texte d'affichage : NOM DU LIEU - TYPE D'ÉVÉNEMENT
            let displayText = '';
            if (event.eventType) {
              // Format: "Nom du Lieu - Type d'événement"
              displayText = `<strong>${event.title}</strong> - ${event.eventType}`;
            } else {
              // Juste le nom du lieu si pas de type
              displayText = `<strong>${event.title}</strong>`;
            }

            return `
              <div class="event-item">
                <div class="event-dot" style="background-color: ${event.color};"></div>
                <div class="event-title">${displayText}</div>
              </div>
            `;
          }).join('');

          return `
            <div class="date-section">
              <div class="date-header">${formattedDate}</div>
              <div class="events-list">
                ${eventsHTML}
              </div>
            </div>
          `;
        }).join('')
      : '<div class="empty-message">Aucun événement à afficher</div>';

    // Construire le document HTML optimisé pour impression A4 Portrait - VUE LISTE
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
      max-width: 900px;
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

    /* Vue Liste des événements */
    .date-section {
      margin-bottom: 20px;
      page-break-inside: avoid;
    }

    .date-header {
      background: #1F2937;
      color: white;
      padding: 10px 15px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 10px;
      text-transform: capitalize;
      border-left: 4px solid #667eea;
    }

    .events-list {
      background: #0F172A;
      border-radius: 6px;
      padding: 8px;
    }

    .event-item {
      display: flex;
      align-items: center;
      padding: 8px 10px;
      margin-bottom: 6px;
      background: #1E293B;
      border-radius: 4px;
      transition: background 0.2s;
    }

    .event-item:last-child {
      margin-bottom: 0;
    }

    .event-item:hover {
      background: #334155;
    }

    .event-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 10px;
      flex-shrink: 0;
    }

    .event-title {
      color: white;
      font-size: 13px;
      font-weight: 400;
      line-height: 1.4;
    }

    .event-title strong {
      font-weight: 600;
      color: #E5E7EB;
    }

    .empty-message {
      text-align: center;
      padding: 40px 20px;
      color: #9ca3af;
      font-size: 16px;
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
        margin: 1cm;
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
        padding: 0.5cm !important;
        border-radius: 0 !important;
      }

      /* Header compact */
      .print-header {
        background: #667eea !important;
        padding: 0.3cm !important;
        margin-bottom: 0.4cm !important;
        border-radius: 0.2cm !important;
      }

      .print-header h1 {
        font-size: 16pt !important;
        margin-bottom: 0.1cm !important;
      }

      .print-header p {
        font-size: 9pt !important;
      }

      /* Masquer les éléments non-imprimables */
      .print-button,
      .print-instruction {
        display: none !important;
      }

      /* Sections de dates compactes */
      .date-section {
        margin-bottom: 0.3cm !important;
        page-break-inside: avoid !important;
      }

      .date-header {
        background: #1F2937 !important;
        font-size: 10pt !important;
        padding: 0.15cm 0.2cm !important;
        margin-bottom: 0.15cm !important;
      }

      .events-list {
        background: #0F172A !important;
        padding: 0.1cm !important;
      }

      .event-item {
        background: #1E293B !important;
        padding: 0.15cm !important;
        margin-bottom: 0.1cm !important;
      }

      .event-dot {
        width: 8px !important;
        height: 8px !important;
        margin-right: 0.2cm !important;
      }

      .event-title {
        font-size: 9pt !important;
        line-height: 1.3 !important;
      }

      .event-title strong {
        font-weight: 600 !important;
      }

      /* Footer automatique */
      .print-container::after {
        content: "Exporté le ${exportDate}";
        display: block;
        text-align: right;
        font-size: 7pt;
        color: #9CA3AF;
        margin-top: 0.3cm;
        padding-top: 0.2cm;
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

    ${eventsListHTML}

    <div class="print-instruction">
      <strong>📋 Comment imprimer ce planning</strong>
      <p>1. Cliquez sur le bouton "Imprimer" ci-dessus</p>
      <p>2. Choisissez "Enregistrer en PDF" ou votre imprimante</p>
      <p>3. Vérifiez l'orientation: Portrait (A4)</p>
      <p>4. Activez "Graphiques d'arrière-plan"</p>
      <p>5. Le planning tiendra sur 1 feuille A4!</p>
    </div>
  </div>

  <script>
    console.log('%c✅ Planning en liste chargé!', 'color: #10b981; font-size: 16px; font-weight: bold;');
    console.log('%cFormat: Vue Liste optimisée pour A4 Portrait', 'color: #667eea;');
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
    console.error('Erreur lors de l\'export du planning en liste:', error);
    throw error;
  }
};

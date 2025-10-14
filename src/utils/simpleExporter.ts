/**
 * Export Planning - Version Optimisée A4 Portrait
 *
 * Fonctionnalités:
 * - Impression native A4 portrait
 * - Calendrier complet sans scroll
 * - Fond correspondant au site (noir/gris)
 */

/**
 * Impression native A4 PORTRAIT - Calendrier complet sans scroll
 * Fond noir comme le site web
 */
export const printCalendar = async (
  calendarContainerId: string
): Promise<boolean> => {
  try {
    const container = document.getElementById(calendarContainerId);
    if (!container) {
      throw new Error(`Conteneur non trouvé: ${calendarContainerId}`);
    }

    // Trouver le calendrier FullCalendar
    const calendar = container.querySelector('.fc') as HTMLElement;
    if (!calendar) {
      throw new Error('Calendrier FullCalendar non trouvé');
    }

    // Créer des styles CSS spécifiques pour l'impression A4 Portrait
    const printStyles = document.createElement('style');
    printStyles.id = 'calendar-print-styles';
    printStyles.textContent = `
      @media print {
        /* Configuration de la page A4 Portrait */
        @page {
          size: A4 portrait;
          margin: 0.5cm;
        }

        /* Masquer tout sauf le calendrier */
        body * {
          visibility: hidden;
          overflow: hidden !important;
        }

        /* Rendre visible uniquement le calendrier */
        #${calendarContainerId},
        #${calendarContainerId} * {
          visibility: visible;
        }

        /* Positionner le calendrier pour l'impression */
        #${calendarContainerId} {
          position: fixed !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          height: 100vh !important;
          margin: 0 !important;
          padding: 0.3cm !important;
          overflow: hidden !important;
        }

        /* Fond noir comme le site web */
        html, body {
          background: #000000 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }

        /* Calendrier complet sans scroll - tenir sur une page */
        .fc {
          width: 100% !important;
          height: 100% !important;
          max-width: 100% !important;
          max-height: 100% !important;
          overflow: hidden !important;
          background: #111827 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }

        .fc-view-harness {
          height: 100% !important;
          overflow: hidden !important;
        }

        .fc-view {
          height: 100% !important;
          overflow: hidden !important;
        }

        /* Réduire la taille des cellules pour tout faire tenir */
        .fc-daygrid-body {
          height: 100% !important;
        }

        .fc-scrollgrid {
          height: 100% !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
        }

        .fc-scrollgrid-section > * {
          overflow: hidden !important;
        }

        /* Réduire la taille du header pour gagner de la place */
        .fc-toolbar {
          padding: 0.2cm 0 !important;
          margin-bottom: 0.3cm !important;
        }

        .fc-toolbar-title {
          font-size: 16pt !important;
          color: white !important;
        }

        /* Masquer les boutons de navigation */
        .fc-toolbar-chunk button {
          display: none !important;
        }

        /* Garder uniquement le titre */
        .fc-toolbar-chunk:has(.fc-toolbar-title) {
          display: block !important;
        }

        /* Forcer les textes à bien s'aligner */
        .fc td,
        .fc th {
          vertical-align: top !important;
          text-align: left !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
        }

        /* Header des jours */
        .fc-col-header {
          background: #1F2937 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .fc-col-header-cell {
          color: white !important;
          font-size: 9pt !important;
          padding: 0.15cm !important;
        }

        /* Numéros des jours */
        .fc-daygrid-day-number {
          font-size: 8pt !important;
          color: white !important;
          padding: 0.1cm !important;
        }

        /* Événements */
        .fc-daygrid-event {
          font-size: 7pt !important;
          margin-bottom: 1px !important;
          padding: 1px 2px !important;
          page-break-inside: avoid !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }

        .fc-daygrid-event-harness {
          margin-top: 1px !important;
        }

        /* Garder toutes les couleurs */
        .fc-daygrid-day-frame {
          background: #111827 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .fc-daygrid-day.fc-day-today {
          background: rgba(59, 130, 246, 0.1) !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        /* Empêcher tout scroll */
        * {
          overflow: visible !important;
        }

        .fc-scroller {
          overflow: hidden !important;
        }

        /* Optimiser l'espace des cellules */
        .fc-daygrid-day-top {
          flex-direction: row !important;
        }

        /* Footer avec date d'export */
        #${calendarContainerId}::after {
          content: "Exporté le " attr(data-export-date);
          position: fixed;
          bottom: 0.3cm;
          right: 0.5cm;
          font-size: 8pt;
          color: #9CA3AF;
        }
      }
    `;

    // Ajouter les styles au document
    document.head.appendChild(printStyles);

    // Ajouter la date d'export
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    container.setAttribute('data-export-date', dateStr);

    // Attendre que les styles soient appliqués
    await new Promise(resolve => setTimeout(resolve, 100));

    // Ouvrir la boîte de dialogue d'impression
    window.print();

    // Nettoyer après l'impression
    setTimeout(() => {
      const stylesToRemove = document.getElementById('calendar-print-styles');
      if (stylesToRemove) {
        stylesToRemove.remove();
      }
      container.removeAttribute('data-export-date');
    }, 1000);

    return true;
  } catch (error) {
    console.error('Erreur lors de l\'impression:', error);
    throw error;
  }
};

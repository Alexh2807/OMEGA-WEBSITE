import React, { useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import { Calendar, MapPin, Tag, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface EventType {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
  color: string;
  event_type?: EventType;
}

interface EventItem {
  id: string;
  event_date: string;
  location: Location | null;
}

/**
 * Composant d'affichage public du planning événementiel
 * Affiche les événements à venir pour les utilisateurs
 */
export const PublicPlanningCalendar: React.FC = () => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEvents();

    // Abonnement en temps réel aux changements d'événements
    const subscription = supabase
      .channel('public_planning_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'planning_events' }, () => {
        loadEvents();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      // Charger les événements à partir d'aujourd'hui
      const today = new Date().toISOString().split('T')[0];

      const { data, error: fetchError } = await supabase
        .from('planning_events')
        .select('*, location:planning_locations(*, event_type:planning_event_types(*))')
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .limit(100);

      if (fetchError) throw fetchError;

      setEvents((data as EventItem[]) || []);
    } catch (err) {
      console.error('Erreur lors du chargement des événements:', err);
      setError('Impossible de charger les événements');
    } finally {
      setLoading(false);
    }
  };

  // Transformer les événements pour FullCalendar
  const calendarEvents = events.map(e => ({
    id: e.id,
    title: e.location?.event_type?.name || 'Événement',
    start: e.event_date,
    backgroundColor: e.location?.color || '#3B82F6',
    borderColor: e.location?.color || '#3B82F6',
    extendedProps: {
      locationName: e.location?.name || 'Lieu non défini',
      eventType: e.location?.event_type?.name || 'Type non défini',
    },
  }));

  // Calculer les statistiques
  const stats = {
    total: events.length,
    thisMonth: events.filter(e => {
      const eventDate = new Date(e.event_date);
      const now = new Date();
      return eventDate.getMonth() === now.getMonth() && eventDate.getFullYear() === now.getFullYear();
    }).length,
    nextMonth: events.filter(e => {
      const eventDate = new Date(e.event_date);
      const now = new Date();
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return eventDate.getMonth() === nextMonth.getMonth() && eventDate.getFullYear() === nextMonth.getFullYear();
    }).length,
  };

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
        <div className="flex items-center justify-center h-64">
          <div className="text-white text-xl flex items-center gap-3">
            <Loader2 className="animate-spin" size={24} />
            Chargement du planning...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
        <div className="text-center">
          <Calendar className="text-red-400 mx-auto mb-4" size={48} />
          <h3 className="text-xl font-bold text-white mb-2">Erreur de chargement</h3>
          <p className="text-gray-400 mb-4">{error}</p>
          <button
            onClick={loadEvents}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
      {/* En-tête */}
      <div className="mb-6">
        <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
          <Calendar className="text-blue-400" size={28} />
          Dates des Événements à Venir
        </h3>
        <p className="text-gray-400">
          Découvrez nos prochaines dates et réservez dès maintenant
        </p>
      </div>

      {/* Statistiques rapides */}
      {events.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-900/20 p-4 rounded-lg border border-blue-500/30">
            <div className="text-blue-300 text-sm mb-1">Total à venir</div>
            <div className="text-3xl font-bold text-white">{stats.total}</div>
          </div>
          <div className="bg-green-900/20 p-4 rounded-lg border border-green-500/30">
            <div className="text-green-300 text-sm mb-1">Ce mois-ci</div>
            <div className="text-3xl font-bold text-white">{stats.thisMonth}</div>
          </div>
          <div className="bg-purple-900/20 p-4 rounded-lg border border-purple-500/30">
            <div className="text-purple-300 text-sm mb-1">Mois prochain</div>
            <div className="text-3xl font-bold text-white">{stats.nextMonth}</div>
          </div>
        </div>
      )}

      {/* Calendrier */}
      {events.length > 0 ? (
        <div className="public-calendar-container">
          <style>{`
            .public-calendar-container {
              --fc-bg-color: rgba(17, 24, 39, 0.4);
              --fc-border-color: rgba(255, 255, 255, 0.1);
              --fc-text-color: #E5E7EB;
              --fc-text-secondary-color: #9CA3AF;
              --fc-button-bg-color: rgba(59, 130, 246, 0.2);
              --fc-button-hover-bg-color: rgba(59, 130, 246, 0.3);
              --fc-button-active-bg-color: rgba(59, 130, 246, 0.4);
              --fc-today-bg-color: rgba(59, 130, 246, 0.15);
            }

            .public-calendar-container .fc {
              background: var(--fc-bg-color);
              backdrop-filter: blur(8px);
              border: 1px solid var(--fc-border-color);
              border-radius: 1rem;
              padding: 1.5rem;
              color: var(--fc-text-color);
            }

            .public-calendar-container .fc .fc-toolbar-title {
              color: #FFFFFF;
              font-weight: 700;
              font-size: 1.5rem;
            }

            .public-calendar-container .fc .fc-button {
              background: var(--fc-button-bg-color);
              border: 1px solid var(--fc-border-color);
              color: var(--fc-text-color);
              transition: all 0.3s ease;
              text-transform: capitalize;
              font-weight: 500;
              border-radius: 0.5rem;
            }

            .public-calendar-container .fc .fc-button:hover {
              background: var(--fc-button-hover-bg-color);
            }

            .public-calendar-container .fc .fc-button-primary:not(:disabled).fc-button-active {
              background: var(--fc-button-active-bg-color);
            }

            .public-calendar-container .fc .fc-daygrid-day {
              border-color: var(--fc-border-color);
            }

            .public-calendar-container .fc .fc-day-today {
              background-color: var(--fc-today-bg-color) !important;
            }

            .public-calendar-container .fc .fc-daygrid-day-number {
              color: var(--fc-text-secondary-color);
              padding: 0.5em;
            }

            .public-calendar-container .fc .fc-col-header-cell {
              background: rgba(255, 255, 255, 0.05);
              color: var(--fc-text-secondary-color);
              border-color: var(--fc-border-color);
              font-weight: 600;
              text-transform: uppercase;
              font-size: 0.75rem;
            }

            .public-calendar-container .fc .fc-daygrid-event {
              border-radius: 6px;
              padding: 3px 6px;
              margin: 1px;
              font-size: 0.75rem;
              font-weight: 500;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
              cursor: pointer;
              border: 1px solid rgba(255, 255, 255, 0.1);
            }

            .public-calendar-container .fc .fc-daygrid-event:hover {
              transform: scale(1.02);
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
              z-index: 10;
            }
          `}</style>

          <FullCalendar
            plugins={[dayGridPlugin]}
            initialView="dayGridMonth"
            locale="fr"
            weekends={true}
            events={calendarEvents}
            height="auto"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: '',
            }}
            buttonText={{
              today: "Aujourd'hui",
            }}
            eventContent={(info) => (
              <div className="p-1 overflow-hidden text-white text-xs">
                <div className="flex items-center gap-1 mb-1">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: info.event.backgroundColor }}
                  />
                  <b className="truncate text-xs">{info.event.title}</b>
                </div>
                <div className="flex items-center gap-1 text-xs opacity-90 pl-3">
                  <MapPin size={8} />
                  <span className="truncate">{info.event.extendedProps.locationName}</span>
                </div>
              </div>
            )}
          />
        </div>
      ) : (
        <div className="text-center py-12">
          <Calendar className="text-gray-400 mx-auto mb-4" size={48} />
          <h4 className="text-white font-semibold mb-2">Aucun événement à venir</h4>
          <p className="text-gray-400">
            Revenez bientôt pour découvrir nos prochaines dates !
          </p>
        </div>
      )}

      {/* Légende */}
      {events.length > 0 && (
        <div className="mt-6 pt-6 border-t border-white/10">
          <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
            <Tag size={16} className="text-gray-400" />
            Types d'événements
          </h4>
          <div className="flex flex-wrap gap-3">
            {Array.from(new Set(events.map(e => e.location?.event_type?.name).filter(Boolean))).map(
              (type, idx) => {
                const event = events.find(e => e.location?.event_type?.name === type);
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-lg border border-white/10"
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: event?.location?.color || '#3B82F6' }}
                    />
                    <span className="text-gray-300 text-sm">{type}</span>
                  </div>
                );
              }
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PublicPlanningCalendar;

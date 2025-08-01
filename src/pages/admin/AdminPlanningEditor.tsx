import React, { useEffect, useState, useCallback, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import {
  Calendar as CalendarIcon,
  Plus,
  Download,
  Edit3,
  Trash2,
  Users,
  MapPin,
  Filter,
  Search,
  Save,
  User,
  Palette,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { exportElementAsPDF } from '../../utils/pdfGenerator';
import toast from 'react-hot-toast';

// --- Interfaces de types ---
interface Provider {
  id: string;
  name: string;
  created_at: string;
}

interface Location {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

interface EventItem {
  id: string;
  event_date: string;
  provider_ids: string[];
  location_id: string;
  location: Location | null;
  created_at: string;
}

// --- Le Composant Principal ---
const AdminPlanningEditor: React.FC = () => {
  // États principaux
  const [events, setEvents] = useState<EventItem[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  // Navigation et filtres
  const [activeTab, setActiveTab] = useState<'calendar' | 'providers' | 'locations'>('calendar');
  const [selectedProvider, setSelectedProvider] = useState('all');
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewRange, setViewRange] = useState<{ start: Date; end: Date } | null>(null);

  // Modals et formulaires
  const [showEventModal, setShowEventModal] = useState(false);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [selectionInfo, setSelectionInfo] = useState<{ start: Date; end: Date } | null>(null);

  // Formulaires
  const [eventForm, setEventForm] = useState({ location_id: '', provider_ids: [] as string[] });
  const [providerForm, setProviderForm] = useState({ name: '' });
  const [locationForm, setLocationForm] = useState({ name: '', color: '#3B82F6' });

  // --- Chargement des données (corrigé) ---
  const loadProviders = async () => {
    const { data, error } = await supabase.from('planning_providers').select('*').order('name');
    if (error) {
      console.error('Erreur chargement prestataires:', error);
      toast.error('Erreur lors du chargement des prestataires');
    } else {
      setProviders(data || []);
    }
  };

  const loadLocations = async () => {
    const { data, error } = await supabase.from('planning_locations').select('*').order('name');
    if (error) {
      console.error('Erreur chargement lieux:', error);
      toast.error('Erreur lors du chargement des lieux');
    } else {
      setLocations(data || []);
    }
  };

  const loadBaseData = async () => {
    setLoading(true);
    try {
      await Promise.all([loadProviders(), loadLocations()]);
    } catch (error) {
      console.error('Erreur chargement données de base:', error);
      toast.error('Erreur lors du chargement des prestataires ou lieux');
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = useCallback(async (start: Date, end: Date) => {
    const { data, error } = await supabase
      .from('planning_events')
      .select('*, location:planning_locations(*)')
      .gte('event_date', start.toISOString().slice(0, 10))
      .lte('event_date', end.toISOString().slice(0, 10));

    if (error) {
      console.error('Erreur chargement événements:', error);
      toast.error('Erreur lors du chargement des événements');
    } else {
      setEvents(data || []);
    }
  }, []);

  useEffect(() => {
    loadBaseData();
  }, []);

  useEffect(() => {
    if (viewRange) {
      loadEvents(viewRange.start, viewRange.end);
    }
  }, [viewRange, loadEvents]);

  // --- Gestion des prestataires et lieux (inchangée) ---
  const handleProviderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerForm.name.trim()) return;
    const action = editingProvider
      ? supabase.from('planning_providers').update({ name: providerForm.name }).eq('id', editingProvider.id)
      : supabase.from('planning_providers').insert({ name: providerForm.name });

    const { error } = await action;
    if (error) {
      toast.error("Erreur lors de la sauvegarde du prestataire.");
    } else {
      toast.success(`Prestataire ${editingProvider ? 'mis à jour' : 'ajouté'}.`);
      resetProviderForm();
      loadProviders();
    }
  };
  
  const deleteProvider = async (id: string) => {
    if (!confirm('Supprimer ce prestataire ?')) return;
    const { error } = await supabase.from('planning_providers').delete().eq('id', id);
    if (error) toast.error("Erreur suppression."); else { toast.success('Prestataire supprimé.'); loadProviders(); }
  };

  const handleLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationForm.name.trim()) return;
    const { name, color } = locationForm;
    const action = editingLocation
      ? supabase.from('planning_locations').update({ name, color }).eq('id', editingLocation.id)
      : supabase.from('planning_locations').insert({ name, color });

    const { error } = await action;
    if (error) {
      toast.error("Erreur lors de la sauvegarde du lieu.");
    } else {
      toast.success(`Lieu ${editingLocation ? 'mis à jour' : 'ajouté'}.`);
      resetLocationForm();
      loadLocations();
    }
  };

  const deleteLocation = async (id: string) => {
    if (!confirm('Supprimer ce lieu ?')) return;
    const { error } = await supabase.from('planning_locations').delete().eq('id', id);
    if (error) toast.error("Erreur suppression."); else { toast.success('Lieu supprimé.'); loadLocations(); }
  };
  
  // --- GESTION DES EVENEMENTS ---
  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm.location_id || eventForm.provider_ids.length === 0) {
      toast.error('Veuillez sélectionner un lieu et au moins un prestataire.');
      return;
    }

    try {
      if (editingEvent) {
        const { error } = await supabase
          .from('planning_events')
          .update({
            location_id: eventForm.location_id,
            provider_ids: eventForm.provider_ids,
          })
          .eq('id', editingEvent.id);
        if (error) throw error;
        toast.success('Événement mis à jour !');
      } else if (selectionInfo) {
        let eventsToInsert = [];
        let currentDate = new Date(selectionInfo.start);
        while (currentDate < selectionInfo.end) {
          eventsToInsert.push({
            event_date: currentDate.toISOString().slice(0, 10),
            location_id: eventForm.location_id,
            provider_ids: eventForm.provider_ids,
          });
          currentDate.setDate(currentDate.getDate() + 1);
        }
        const { error } = await supabase.from('planning_events').insert(eventsToInsert);
        if (error) throw error;
        toast.success(`${eventsToInsert.length} événement(s) créé(s) !`);
      }
      resetEventForm();
      if(viewRange) loadEvents(viewRange.start, viewRange.end);
    } catch (error) {
      console.error('Erreur sauvegarde événement:', error);
      toast.error('Erreur lors de la sauvegarde de l’événement.');
    }
  };

  const deleteEvent = async (id: string) => {
    if (!confirm('Supprimer cet événement ?')) return;
    
    try {
      const { error } = await supabase.from('planning_events').delete().eq('id', id);
      if (error) throw error;
      toast.success('Événement supprimé');
      resetEventForm();
      if(viewRange) loadEvents(viewRange.start, viewRange.end);
    } catch (error) {
      console.error('Erreur suppression événement:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  // --- Fonctions utilitaires et modales ---
  const resetProviderForm = () => { setProviderForm({ name: '' }); setEditingProvider(null); setShowProviderModal(false); };
  const resetLocationForm = () => { setLocationForm({ name: '', color: '#3B82F6' }); setEditingLocation(null); setShowLocationModal(false); };
  const resetEventForm = () => { setEventForm({ location_id: '', provider_ids: [] }); setEditingEvent(null); setShowEventModal(false); setSelectionInfo(null); };

  const startEditProvider = (provider: Provider) => { setProviderForm({ name: provider.name }); setEditingProvider(provider); setShowProviderModal(true); };
  const startEditLocation = (location: Location) => { setLocationForm({ name: location.name, color: location.color }); setEditingLocation(location); setShowLocationModal(true); };

  // --- GESTIONNAIRES FULLCALENDAR ---
  const handleDatesSet = (arg: any) => { setViewRange({ start: arg.start, end: arg.end }); };

  const handleSelect = (selectInfo: any) => {
    setEditingEvent(null);
    setEventForm({ location_id: locations[0]?.id || '', provider_ids: [] });
    setSelectionInfo({ start: selectInfo.start, end: selectInfo.end });
    setShowEventModal(true);
  };

  const handleEventClick = (clickInfo: any) => {
    const clickedEvent = events.find(e => e.id === clickInfo.event.id);
    if (!clickedEvent) return;
    
    setEditingEvent(clickedEvent);
    setEventForm({ location_id: clickedEvent.location_id, provider_ids: clickedEvent.provider_ids });
    setShowEventModal(true);
  };

  const handleEventDrop = async (dropInfo: any) => {
    const { event } = dropInfo;
    const newDate = event.start.toISOString().slice(0, 10);
    
    try {
      const { error } = await supabase.from('planning_events').update({ event_date: newDate }).eq('id', event.id);
      if (error) throw error;
      toast.success('Événement déplacé !');
      setEvents(prevEvents => prevEvents.map(e => e.id === event.id ? { ...e, event_date: newDate } : e));
    } catch (error) {
      console.error('Erreur déplacement événement:', error);
      toast.error('Erreur lors du déplacement');
      dropInfo.revert();
    }
  };

  // --- Formatage pour FullCalendar ---
  const filteredEventsForCalendar = useMemo(() => {
    return events
      .filter(event => {
        const matchesProvider = selectedProvider === 'all' || event.provider_ids.includes(selectedProvider);
        const matchesLocation = selectedLocation === 'all' || event.location_id === selectedLocation;
        const providerNames = event.provider_ids.map(id => providers.find(p => p.id === id)?.name || '').join(' ');
        const matchesSearch = !searchTerm ||
          event.location?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          providerNames.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesProvider && matchesLocation && matchesSearch;
      })
      .map(event => ({
        id: event.id,
        title: event.location?.name || 'Lieu non défini',
        start: event.event_date,
        allDay: true,
        backgroundColor: event.location?.color || '#374151',
        borderColor: event.location?.color || '#374151',
        extendedProps: {
          providers: event.provider_ids.map(id => providers.find(p => p.id === id)?.name || '').join(', '),
        },
      }));
  }, [events, selectedProvider, selectedLocation, searchTerm, providers]);

  // --- Rendu JSX ---
  if (loading) return <div className="flex items-center justify-center h-64 text-white text-xl">Chargement du planning...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <CalendarIcon className="text-blue-400" size={32} />
            Planning Événementiel
          </h1>
          <p className="text-gray-400">
            Faites glisser les événements pour les déplacer, ou sélectionnez une période pour en créer de nouveaux.
          </p>
        </div>
        <div>
          <button onClick={() => exportElementAsPDF('planning-export', 'planning')} className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 flex items-center gap-2">
            <Download size={16} /> Export PDF
          </button>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-4 border-b border-white/20">
        {[
          { id: 'calendar', label: 'Planning', icon: CalendarIcon },
          { id: 'providers', label: 'Prestataires', icon: Users },
          { id: 'locations', label: 'Lieux', icon: MapPin },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-6 py-3 font-semibold transition-colors ${activeTab === tab.id ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}>
            <tab.icon size={20} /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'calendar' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input type="text" placeholder="Rechercher lieu ou prestataire..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"/>
              </div>
              <div className="flex items-center gap-2">
                <Users className="text-gray-400" size={20} />
                <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)} className="dark-select w-full">
                  <option value="all">Tous les prestataires</option>
                  {providers.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="text-gray-400" size={20} />
                <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)} className="dark-select w-full">
                  <option value="all">Tous les lieux</option>
                  {locations.map(l => (<option key={l.id} value={l.id}>{l.name}</option>))}
                </select>
              </div>
            </div>
          </div>

          <div id="planning-export" className="calendar-container-dark">
             {/* NOUVEAU BLOC DE STYLE POUR FULLCALENDAR */}
             <style>{`
              .calendar-container-dark {
                --fc-bg-color: rgba(17, 24, 39, 0.5);
                --fc-border-color: rgba(255, 255, 255, 0.1);
                --fc-text-color: #E5E7EB;
                --fc-text-secondary-color: #9CA3AF;
                --fc-button-bg-color: rgba(255, 255, 255, 0.05);
                --fc-button-hover-bg-color: rgba(59, 130, 246, 0.3);
                --fc-button-active-bg-color: rgba(59, 130, 246, 0.4);
                --fc-today-bg-color: rgba(59, 130, 246, 0.15);
                --fc-event-bg-color: #2563EB;
                --fc-event-border-color: #1D4ED8;
                --fc-event-text-color: #FFFFFF;
                --fc-select-bg-color: rgba(59, 130, 246, 0.25);
              }

              .calendar-container-dark .fc {
                background: var(--fc-bg-color);
                backdrop-filter: blur(10px);
                border: 1px solid var(--fc-border-color);
                border-radius: 1rem;
                padding: 1.5rem;
                color: var(--fc-text-color);
              }

              .fc .fc-toolbar-title {
                color: #FFFFFF;
                font-weight: 700;
              }

              .fc .fc-button {
                background: var(--fc-button-bg-color);
                border: 1px solid var(--fc-border-color);
                color: var(--fc-text-color);
                transition: background-color 0.3s;
                text-transform: capitalize;
              }
              .fc .fc-button:hover {
                background: var(--fc-button-hover-bg-color);
              }
              .fc .fc-button-primary:not(:disabled).fc-button-active, 
              .fc .fc-button-primary:not(:disabled):active {
                background: var(--fc-button-active-bg-color);
                border-color: var(--fc-button-active-bg-color);
              }

              .fc .fc-daygrid-day {
                border-color: var(--fc-border-color);
                transition: background-color 0.3s;
              }
              .fc .fc-day-today {
                background-color: var(--fc-today-bg-color) !important;
              }
              
              .fc .fc-daygrid-day-number {
                color: var(--fc-text-secondary-color);
                padding: 0.5em;
              }

              .fc .fc-col-header-cell {
                background: rgba(255, 255, 255, 0.05);
                color: var(--fc-text-secondary-color);
                border-color: var(--fc-border-color);
              }
              
              .fc .fc-daygrid-event {
                border-radius: 4px;
                padding: 2px 4px;
                margin-top: 2px;
                font-size: 0.7rem;
                font-weight: 500;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
              }

              .fc .fc-daygrid-day.fc-day-future .fc-daygrid-day-number {
                color: var(--fc-text-color);
              }

              .fc-h-event .fc-event-main {
                padding: 2px 4px;
              }
             `}</style>

            <FullCalendar
              key={providers.length + locations.length}
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              locale="fr"
              weekends={true}
              events={filteredEventsForCalendar}
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth',
              }}
              buttonText={{ today: "Aujourd'hui", month: 'Mois' }}
              editable={true}
              selectable={true}
              selectMirror={true}
              dayMaxEvents={true}
              datesSet={handleDatesSet}
              select={handleSelect}
              eventClick={handleEventClick}
              eventDrop={handleEventDrop}
              eventContent={(eventInfo) => (
                <div className="p-1 overflow-hidden text-white text-[11px] h-full cursor-pointer">
                  <b className="truncate block">{eventInfo.event.title}</b>
                  <p className="truncate italic opacity-80">{eventInfo.event.extendedProps.providers}</p>
                </div>
              )}
            />
          </div>
        </div>
      )}
      
      {/* ... autres onglets et modales ... */}

    </div>
  );
};

export default AdminPlanningEditor;
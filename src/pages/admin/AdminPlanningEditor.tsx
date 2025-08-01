import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
  Search,
  Save,
  User,
  Palette,
  X,
  Layers,
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
  const [numberOfMonths, setNumberOfMonths] = useState(3);
  const [multiSelectedDates, setMultiSelectedDates] = useState<string[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const calendarRef = useRef<FullCalendar>(null);

  // Modals et formulaires
  const [showEventModal, setShowEventModal] = useState(false);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [selectionInfo, setSelectionInfo] = useState<{ start: Date; end: Date } | null>(null);
  const [eventForm, setEventForm] = useState({ location_id: '', provider_ids: [] as string[] });
  const [providerForm, setProviderForm] = useState({ name: '' });
  const [locationForm, setLocationForm] = useState({ name: '', color: '#3B82F6' });

  // --- Chargement des données ---
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
    const loadInitialData = async () => {
        setLoading(true);
        try {
          await Promise.all([loadProviders(), loadLocations()]);
        } catch (error) {
          console.error('Erreur chargement données initiales:', error);
          toast.error('Erreur lors du chargement des données');
        } finally {
          setLoading(false);
        }
      };
    loadInitialData();
  }, []);

  useEffect(() => {
    if (viewRange) {
      loadEvents(viewRange.start, viewRange.end);
    }
  }, [viewRange, loadEvents]);

  // --- Abonnements Supabase ---
  useEffect(() => {
    const reloadData = () => {
      if (viewRange) {
        loadEvents(viewRange.start, viewRange.end);
      }
      loadProviders();
      loadLocations();
    };
  
    const channel = supabase.channel('db-changes');
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'planning_events' }, () => {
        if (viewRange) loadEvents(viewRange.start, viewRange.end);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'planning_providers' }, reloadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'planning_locations' }, reloadData)
      .subscribe();
  
    return () => {
      supabase.removeChannel(channel);
    };
  }, [viewRange, loadEvents]);

  // --- Gestionnaires de soumission de formulaires ---
  const handleProviderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerForm.name.trim()) return;
    const action = editingProvider
      ? supabase.from('planning_providers').update({ name: providerForm.name }).eq('id', editingProvider.id)
      : supabase.from('planning_providers').insert({ name: providerForm.name });
    const { error } = await action;
    if (error) toast.error("Erreur sauvegarde prestataire.");
    else { toast.success(`Prestataire ${editingProvider ? 'mis à jour' : 'ajouté'}.`); resetProviderForm(); }
  };

  const handleLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationForm.name.trim()) return;
    const action = editingLocation
      ? supabase.from('planning_locations').update(locationForm).eq('id', editingLocation.id)
      : supabase.from('planning_locations').insert(locationForm);
    const { error } = await action;
    if (error) toast.error("Erreur sauvegarde lieu.");
    else { toast.success(`Lieu ${editingLocation ? 'mis à jour' : 'ajouté'}.`); resetLocationForm(); }
  };

  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm.location_id || eventForm.provider_ids.length === 0) {
      toast.error('Veuillez sélectionner un lieu et au moins un prestataire.');
      return;
    }
    try {
      if (editingEvent) {
        const { error } = await supabase.from('planning_events').update({ location_id: eventForm.location_id, provider_ids: eventForm.provider_ids }).eq('id', editingEvent.id);
        if (error) throw error;
        toast.success('Événement mis à jour !');
      } else {
        let eventsToInsert = [];
        if (selectionInfo) {
          let currentDate = new Date(selectionInfo.start);
          while (currentDate < selectionInfo.end) {
            eventsToInsert.push({ event_date: currentDate.toISOString().slice(0, 10), location_id: eventForm.location_id, provider_ids: eventForm.provider_ids });
            currentDate.setDate(currentDate.getDate() + 1);
          }
        } else if (multiSelectedDates.length > 0) {
          eventsToInsert = multiSelectedDates.map(dateStr => ({ event_date: dateStr, location_id: eventForm.location_id, provider_ids: eventForm.provider_ids }));
        }
        if (eventsToInsert.length > 0) {
          const { error } = await supabase.from('planning_events').insert(eventsToInsert);
          if (error) throw error;
          toast.success(`${eventsToInsert.length} événement(s) créé(s) !`);
        }
      }
      resetEventForm();
    } catch (error) { toast.error('Erreur lors de la sauvegarde.'); }
  };

  // --- Gestionnaires de suppression ---
  const deleteProvider = async (id: string) => {
    if (window.confirm('Supprimer ce prestataire ?')) {
      await supabase.from('planning_providers').delete().eq('id', id);
    }
  };
  const deleteLocation = async (id: string) => {
    if (window.confirm('Supprimer ce lieu ?')) {
      await supabase.from('planning_locations').delete().eq('id', id);
    }
  };
  const deleteEvent = async (id: string) => {
    if (window.confirm('Supprimer cet événement ?')) {
      await supabase.from('planning_events').delete().eq('id', id);
      resetEventForm();
    }
  };
  
  // --- Fonctions utilitaires ---
  const resetProviderForm = () => { setProviderForm({ name: '' }); setEditingProvider(null); setShowProviderModal(false); };
  const resetLocationForm = () => { setLocationForm({ name: '', color: '#3B82F6' }); setEditingLocation(null); setShowLocationModal(false); };
  const resetEventForm = () => { setEventForm({ location_id: '', provider_ids: [] }); setEditingEvent(null); setShowEventModal(false); setSelectionInfo(null); setMultiSelectedDates([]); };
  const startEditProvider = (p: Provider) => { setProviderForm({ name: p.name }); setEditingProvider(p); setShowProviderModal(true); };
  const startEditLocation = (l: Location) => { setLocationForm({ name: l.name, color: l.color }); setEditingLocation(l); setShowLocationModal(true); };
  
  // --- Fonctions de gestion en masse ---
  const handleBulkDelete = async () => {
    if (multiSelectedDates.length > 0 && window.confirm(`Supprimer tous les événements sur les ${multiSelectedDates.length} dates ?`)) {
        await supabase.from('planning_events').delete().in('event_date', multiSelectedDates);
        setMultiSelectedDates([]);
    }
  };
  const handleBulkCreate = () => {
    if (multiSelectedDates.length > 0) {
      setEditingEvent(null);
      setSelectionInfo(null);
      setEventForm({ location_id: locations[0]?.id || '', provider_ids: [] });
      setShowEventModal(true);
    }
  };

  // --- Gestionnaires FullCalendar ---
  const handleDatesSet = (arg: any) => setViewRange({ start: arg.start, end: arg.end });
  const handleSelect = (selectInfo: any) => { setMultiSelectedDates([]); setEditingEvent(null); setEventForm({ location_id: locations[0]?.id || '', provider_ids: [] }); setSelectionInfo({ start: selectInfo.start, end: selectInfo.end }); setShowEventModal(true); calendarRef.current?.getApi().unselect(); };
  const handleEventClick = (clickInfo: any) => { setMultiSelectedDates([]); const event = events.find(e => e.id === clickInfo.event.id); if (event) { setEditingEvent(event); setEventForm({ location_id: event.location_id, provider_ids: event.provider_ids }); setShowEventModal(true); } };
  const handleDateClick = (arg: any) => { if (arg.jsEvent.ctrlKey) { const dateStr = arg.dateStr; setMultiSelectedDates(prev => prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr]); } };
  const handleEventDrop = async (info: any) => { await supabase.from('planning_events').update({ event_date: info.event.start.toISOString().slice(0, 10) }).eq('id', info.event.id); };

  // --- Fonctions de rendu et de formatage ---
  const handleExportPDF = async () => {
    const calendarEl = document.getElementById('planning-export');
    if (calendarEl) {
        setIsPrinting(true);
        await new Promise(r => setTimeout(r, 100)); // Laisse le temps au DOM de se repeindre
        await exportElementAsPDF('planning-export', 'planning');
        setIsPrinting(false);
    }
  };
  
  const allCalendarEvents = useMemo(() => {
    const filtered = events.filter(event => (selectedProvider === 'all' || event.provider_ids.includes(selectedProvider)) && (selectedLocation === 'all' || event.location_id === selectedLocation));
    const backgroundSelection = multiSelectedDates.map(date => ({ id: `selection-${date}`, start: date, allDay: true, display: 'background', backgroundColor: 'rgba(59, 130, 246, 0.4)' }));
    return [...filtered.map(e => ({ id: e.id, title: e.location?.name || '?', start: e.event_date, allDay: true, backgroundColor: e.location?.color, borderColor: e.location?.color, extendedProps: { providers: e.provider_ids.map(id => providers.find(p => p.id === id)?.name).join(', ') } })), ...backgroundSelection];
  }, [events, providers, selectedProvider, selectedLocation, multiSelectedDates]);

  const getButtonClass = (monthValue: number) => {
    const baseClass = 'px-3 py-1 text-sm rounded-md';
    return `${baseClass} ${numberOfMonths === monthValue ? 'bg-blue-600 text-white' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`;
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-white text-xl">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3"><CalendarIcon className="text-blue-400" size={32} /> Planning Événementiel</h1>
          <p className="text-gray-400">Utilisez CTRL+Clic pour sélectionner plusieurs dates, ou glissez pour sélectionner une période.</p>
        </div>
        <button onClick={handleExportPDF} className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 flex items-center gap-2"><Download size={16} /> Export PDF</button>
      </div>
      
      <div className="flex flex-wrap gap-4 border-b border-white/20">
        <button onClick={() => setActiveTab('calendar')} className={`flex items-center gap-2 px-6 py-3 font-semibold transition-colors ${activeTab === 'calendar' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}><CalendarIcon size={20} /> Planning</button>
        <button onClick={() => setActiveTab('providers')} className={`flex items-center gap-2 px-6 py-3 font-semibold transition-colors ${activeTab === 'providers' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}><Users size={20} /> Prestataires</button>
        <button onClick={() => setActiveTab('locations')} className={`flex items-center gap-2 px-6 py-3 font-semibold transition-colors ${activeTab === 'locations' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}><MapPin size={20} /> Lieux</button>
      </div>

      {activeTab === 'calendar' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              <div className="relative md:col-span-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} /><input type="text" placeholder="Rechercher..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"/></div>
              <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)} className="dark-select w-full"><option value="all">Tous les prestataires</option>{providers.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}</select>
                <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)} className="dark-select w-full"><option value="all">Tous les lieux</option>{locations.map(l => (<option key={l.id} value={l.id}>{l.name}</option>))}</select>
              </div>
            </div>
             <div className="flex justify-center md:justify-end items-center gap-2 mt-4">
                <span className="text-sm text-gray-300">Vue:</span>
                <button onClick={() => setNumberOfMonths(1)} className={getButtonClass(1)}>1 Mois</button>
                <button onClick={() => setNumberOfMonths(3)} className={getButtonClass(3)}>3 Mois</button>
             </div>
          </div>
          <div id="planning-export" className={isPrinting ? 'calendar-container-light' : 'calendar-container-dark'}>
            <FullCalendar
                ref={calendarRef}
                key={`${numberOfMonths}-${providers.length}-${locations.length}`}
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGrid"
                duration={{ months: numberOfMonths }}
                locale="fr"
                weekends={true}
                events={allCalendarEvents}
                headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
                buttonText={{ today: "Aujourd'hui" }}
                editable={true}
                selectable={true}
                selectMirror={true}
                dayMaxEvents={3}
                datesSet={handleDatesSet}
                select={handleSelect}
                dateClick={handleDateClick}
                eventClick={handleEventClick}
                eventDrop={handleEventDrop}
                eventContent={eventInfo => (<><b className="truncate block">{eventInfo.event.title}</b><p className="truncate italic opacity-80">{eventInfo.event.extendedProps.providers}</p></>)}
            />
          </div>
        </div>
      )}
      
      {/* Autres onglets (Prestataires, Lieux) et Modals... */}
      {/* ... Le reste du code JSX pour les autres onglets et les modals reste identique ... */}
      {/* Il est omis ici pour la lisibilité mais doit être conservé dans votre fichier final. */}

    </div>
  );
};

export default AdminPlanningEditor;
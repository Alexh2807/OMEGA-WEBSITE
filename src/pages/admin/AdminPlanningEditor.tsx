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
  Loader2,
  BarChart2, // Nouvelle icône pour les stats
  Tag, // Nouvelle icône pour les types d'événements
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { exportElementAsPDF } from '../../utils/pdfGenerator';
import toast from 'react-hot-toast';

// --- Interfaces de types étendues ---
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

interface EventType {
  id: string;
  name: string;
  created_at: string;
}

interface EventItem {
  id: string;
  event_date: string;
  provider_ids: string[];
  location_id: string;
  event_type_id: string | null;
  location: Location | null;
  event_type: EventType | null;
  created_at: string;
}

// --- Le Composant Principal ---
const AdminPlanningEditor: React.FC = () => {
  // États principaux
  const [events, setEvents] = useState<EventItem[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]); // Nouvel état
  const [loading, setLoading] = useState(true);

  // Navigation et filtres
  const [activeTab, setActiveTab] = useState<'calendar' | 'providers' | 'locations'>('calendar');
  const [selectedProvider, setSelectedProvider] = useState('all');
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [selectedEventType, setSelectedEventType] = useState('all'); // Nouveau filtre
  const [searchTerm, setSearchTerm] = useState('');
  const [viewRange, setViewRange] = useState<{ start: Date; end: Date } | null>(null);
  const [numberOfMonths, setNumberOfMonths] = useState(3);

  // Sélection multiple et export
  const [multiSelectedDates, setMultiSelectedDates] = useState<string[]>([]);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const calendarRef = useRef<FullCalendar>(null);

  // Modals et formulaires
  const [showEventModal, setShowEventModal] = useState(false);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [selectionInfo, setSelectionInfo] = useState<{ start: Date; end: Date } | null>(null);
  const [eventForm, setEventForm] = useState({ location_id: '', provider_ids: [] as string[], event_type_id: '' }); // Formulaire mis à jour
  const [providerForm, setProviderForm] = useState({ name: '' });
  const [locationForm, setLocationForm] = useState({ name: '', color: '#3B82F6' });

  // --- Fonction utilitaire pour formater les dates ---
  const toYYYYMMDD = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // --- Chargement des données ---
  const loadProviders = async () => {
    const { data, error } = await supabase.from('planning_providers').select('*').order('name');
    if (error) toast.error('Erreur chargement prestataires');
    else setProviders(data || []);
  };

  const loadLocations = async () => {
    const { data, error } = await supabase.from('planning_locations').select('*').order('name');
    if (error) toast.error('Erreur chargement lieux');
    else setLocations(data || []);
  };

  const loadEventTypes = async () => {
    const { data, error } = await supabase.from('planning_event_types').select('*').order('name');
    if (error) toast.error('Erreur chargement types de soirées');
    else setEventTypes(data || []);
  };

  const loadEvents = useCallback(async (start: Date, end: Date) => {
    const { data, error } = await supabase
      .from('planning_events')
      .select('*, location:planning_locations(*), event_type:planning_event_types(*)') // Jointure ajoutée
      .gte('event_date', toYYYYMMDD(start))
      .lte('event_date', toYYYYMMDD(end));
    if (error) toast.error('Erreur chargement événements');
    else setEvents(data || []);
  }, []);

  const forceRefresh = useCallback(() => {
    if (viewRange) {
      loadEvents(viewRange.start, viewRange.end);
    }
  }, [viewRange, loadEvents]);

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      await Promise.all([loadProviders(), loadLocations(), loadEventTypes()]); // Chargement des types
      setLoading(false);
    };
    loadInitialData();
  }, []);

  useEffect(() => {
    forceRefresh();
  }, [forceRefresh]);

  // --- Gestionnaires de soumission de formulaires ---
  const handleGenericSubmit = async (action: any, successMessage: string): Promise<boolean> => {
    const { error } = await action;
    if (error) {
      toast.error("Une erreur est survenue.");
      return false;
    }
    toast.success(successMessage);
    return true;
  };

  const handleProviderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const action = editingProvider
      ? supabase.from('planning_providers').update({ name: providerForm.name }).eq('id', editingProvider.id)
      : supabase.from('planning_providers').insert({ name: providerForm.name });
    const success = await handleGenericSubmit(action, `Prestataire ${editingProvider ? 'mis à jour' : 'ajouté'}.`);
    if (success) {
      loadProviders();
      resetProviderForm();
    }
  };

  const handleLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const action = editingLocation
      ? supabase.from('planning_locations').update(locationForm).eq('id', editingLocation.id)
      : supabase.from('planning_locations').insert(locationForm);
    const success = await handleGenericSubmit(action, `Lieu ${editingLocation ? 'mis à jour' : 'ajouté'}.`);
    if (success) {
      loadLocations();
      resetLocationForm();
    }
  };

  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm.location_id || eventForm.provider_ids.length === 0 || !eventForm.event_type_id) {
      return toast.error('Veuillez sélectionner un lieu, un type et au moins un prestataire.');
    }
    
    const eventData = {
        location_id: eventForm.location_id,
        provider_ids: eventForm.provider_ids,
        event_type_id: eventForm.event_type_id
    };

    let success = false;
    if (editingEvent) {
      success = await handleGenericSubmit(supabase.from('planning_events').update(eventData).eq('id', editingEvent.id), 'Événement mis à jour !');
    } else {
      let eventsToInsert = [];
      if (selectionInfo) {
        let currentDate = new Date(selectionInfo.start);
        while (currentDate < selectionInfo.end) {
          eventsToInsert.push({ ...eventData, event_date: toYYYYMMDD(currentDate) });
          currentDate.setDate(currentDate.getDate() + 1);
        }
      } else if (multiSelectedDates.length > 0) {
        eventsToInsert = multiSelectedDates.map(dateStr => ({ ...eventData, event_date: dateStr }));
      }
      if (eventsToInsert.length > 0) {
        success = await handleGenericSubmit(supabase.from('planning_events').insert(eventsToInsert), `${eventsToInsert.length} événement(s) créé(s) !`);
      }
    }
    if (success) {
      forceRefresh();
      resetEventForm();
    }
  };

  // --- Gestionnaires de suppression ---
  const confirmAndDelete = async (message: string, action: any): Promise<boolean> => {
    if (window.confirm(message)) {
      return await handleGenericSubmit(action, "Suppression réussie.");
    }
    return false;
  };

  const deleteProvider = async (id: string) => { const success = await confirmAndDelete('Supprimer ce prestataire ?', supabase.from('planning_providers').delete().eq('id', id)); if(success) loadProviders(); };
  const deleteLocation = async (id: string) => { const success = await confirmAndDelete('Supprimer ce lieu ?', supabase.from('planning_locations').delete().eq('id', id)); if(success) loadLocations(); };
  const deleteEvent = async (id: string) => { const success = await confirmAndDelete('Supprimer cet événement ?', supabase.from('planning_events').delete().eq('id', id)); if(success) { forceRefresh(); resetEventForm(); } };

  const resetProviderForm = () => { setProviderForm({ name: '' }); setEditingProvider(null); setShowProviderModal(false); };
  const resetLocationForm = () => { setLocationForm({ name: '', color: '#3B82F6' }); setEditingLocation(null); setShowLocationModal(false); };
  const resetEventForm = () => { setEventForm({ location_id: '', provider_ids: [], event_type_id: '' }); setEditingEvent(null); setShowEventModal(false); setSelectionInfo(null); setMultiSelectedDates([]); setIsMultiSelectMode(false); };
  const startEditProvider = (p: Provider) => { setProviderForm({ name: p.name }); setEditingProvider(p); setShowProviderModal(true); };
  const startEditLocation = (l: Location) => { setLocationForm({ name: l.name, color: l.color }); setEditingLocation(l); setShowLocationModal(true); };

  const handleBulkDelete = async () => { const success = await confirmAndDelete(`Supprimer tous les événements sur les ${multiSelectedDates.length} dates ?`, supabase.from('planning_events').delete().in('event_date', multiSelectedDates)); if(success) { forceRefresh(); resetEventForm(); } };
  const handleBulkCreate = () => { if (multiSelectedDates.length > 0) { setEditingEvent(null); setSelectionInfo(null); setEventForm({ location_id: locations[0]?.id || '', provider_ids: [], event_type_id: eventTypes[0]?.id || '' }); setShowEventModal(true); } };

  // --- Gestionnaires FullCalendar ---
  const handleDatesSet = (arg: any) => setViewRange({ start: arg.start, end: arg.end });
  const handleSelect = (selectInfo: any) => {
    const calendarApi = calendarRef.current?.getApi();
    if (!calendarApi) return;
    calendarApi.unselect();
    if (isMultiSelectMode) { const dateStr = selectInfo.startStr; setMultiSelectedDates(prev => prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr]); return; }
    setMultiSelectedDates([]); setEditingEvent(null); setEventForm({ location_id: locations[0]?.id || '', provider_ids: [], event_type_id: eventTypes[0]?.id || '' }); setSelectionInfo({ start: selectInfo.start, end: selectInfo.end }); setShowEventModal(true);
  };
  const handleEventClick = (clickInfo: any) => { setMultiSelectedDates([]); const event = events.find(e => e.id === clickInfo.event.id); if (event) { setEditingEvent(event); setEventForm({ location_id: event.location_id, provider_ids: event.provider_ids, event_type_id: event.event_type_id || '' }); setShowEventModal(true); } };
  const handleEventDrop = async (info: any) => {
    const { event, oldEvent } = info;
    const newDate = toYYYYMMDD(event.start);
    const eventId = event.id;
    setEvents(currentEvents => currentEvents.map(e => e.id === eventId ? { ...e, event_date: newDate } : e));
    const { error } = await supabase.from('planning_events').update({ event_date: newDate }).eq('id', eventId);
    if (error) { toast.error("Le déplacement a échoué."); setEvents(currentEvents => currentEvents.map(e => e.id === eventId ? { ...e, event_date: toYYYYMMDD(oldEvent.start) } : e)); info.revert(); }
  };
  const handleExportPDF = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const toastId = toast.loading('Génération du PDF en cours...');
    try {
      await exportElementAsPDF('planning-export', `planning-${toYYYYMMDD(new Date())}`);
      toast.success('PDF généré avec succès !', { id: toastId });
    } catch (error) {
      console.error("Erreur d'export PDF:", error);
      toast.error('La génération du PDF a échoué.', { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  const filteredEvents = useMemo(() => {
    return events.filter(event => 
        (selectedProvider === 'all' || event.provider_ids.includes(selectedProvider)) && 
        (selectedLocation === 'all' || event.location_id === selectedLocation) &&
        (selectedEventType === 'all' || event.event_type_id === selectedEventType)
    );
  }, [events, selectedProvider, selectedLocation, selectedEventType]);
  
  const allCalendarEvents = useMemo(() => {
    const backgroundSelection = multiSelectedDates.map(date => ({ id: `selection-${date}`, start: date, allDay: true, display: 'background', backgroundColor: 'rgba(59, 130, 246, 0.4)' }));
    return [
      ...filteredEvents.map(e => ({ 
        id: e.id, 
        title: e.location?.name || '?', 
        start: e.event_date, 
        allDay: true, 
        backgroundColor: e.location?.color, 
        borderColor: e.location?.color, 
        extendedProps: { 
            providers: e.provider_ids.map(id => providers.find(p => p.id === id)?.name).join(', '),
            eventType: e.event_type?.name || 'Non défini'
        } 
      })), 
      ...backgroundSelection
    ];
  }, [filteredEvents, providers, multiSelectedDates]);

  const eventTypeStats = useMemo(() => {
    const stats = new Map<string, number>();
    filteredEvents.forEach(event => {
        const typeName = event.event_type?.name || 'Non défini';
        stats.set(typeName, (stats.get(typeName) || 0) + 1);
    });
    return Array.from(stats.entries()).sort((a,b) => b[1] - a[1]);
  }, [filteredEvents]);

  const getButtonClass = (monthValue: number) => `px-3 py-1 text-sm rounded-md ${numberOfMonths === monthValue ? 'bg-blue-600 text-white' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`;

  if (loading) return <div className="flex items-center justify-center h-64 text-white text-xl">Chargement du planning...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3"><CalendarIcon className="text-blue-400" size={32} /> Planning Événementiel</h1>
          <p className="text-gray-400">Gérez, filtrez et planifiez tous les événements à venir.</p>
        </div>
        <button onClick={handleExportPDF} disabled={isExporting} className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
          {isExporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
          {isExporting ? 'Génération...' : 'Export PDF'}
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10"><div className="text-2xl font-bold text-white">{filteredEvents.length}</div><div className="text-gray-400 text-sm">Événements affichés</div></div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10"><div className="text-2xl font-bold text-blue-400">{providers.length}</div><div className="text-gray-400 text-sm">Prestataires</div></div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10"><div className="text-2xl font-bold text-green-400">{locations.length}</div><div className="text-gray-400 text-sm">Lieux</div></div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10"><div className="text-2xl font-bold text-purple-400">{eventTypes.length}</div><div className="text-gray-400 text-sm">Types de soirées</div></div>
      </div>
      <div className="flex flex-wrap gap-4 border-b border-white/20">
        {[ { id: 'calendar', label: 'Planning', icon: CalendarIcon }, { id: 'providers', label: 'Prestataires', icon: Users }, { id: 'locations', label: 'Lieux', icon: MapPin } ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-6 py-3 font-semibold transition-colors ${activeTab === tab.id ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}><tab.icon size={20} /> {tab.label}</button>
        ))}
      </div>

      {activeTab === 'calendar' && (
        <div className="grid lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex items-center gap-2"><Users className="text-gray-400" size={20} /><select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)} className="dark-select w-full"><option value="all">Tous les prestataires</option>{providers.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}</select></div>
                    <div className="flex items-center gap-2"><MapPin className="text-gray-400" size={20} /><select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)} className="dark-select w-full"><option value="all">Tous les lieux</option>{locations.map(l => (<option key={l.id} value={l.id}>{l.name}</option>))}</select></div>
                    <div className="flex items-center gap-2"><Tag className="text-gray-400" size={20} /><select value={selectedEventType} onChange={e => setSelectedEventType(e.target.value)} className="dark-select w-full"><option value="all">Tous les types</option>{eventTypes.map(et => (<option key={et.id} value={et.id}>{et.name}</option>))}</select></div>
                </div>
              </div>
               <div className="flex justify-center md:justify-end items-center gap-4 mt-4">
                  <button onClick={() => setIsMultiSelectMode(prev => !prev)} className={`flex items-center gap-2 px-3 py-1 text-sm rounded-md transition-colors ${isMultiSelectMode ? 'bg-blue-600 text-white' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}><Layers size={16}/> Sélection Multiple</button>
                  <div className="h-6 w-px bg-white/20"></div>
                  <span className="text-sm text-gray-300">Vue:</span>
                  <button onClick={() => setNumberOfMonths(1)} className={getButtonClass(1)}>1 Mois</button>
                  <button onClick={() => setNumberOfMonths(3)} className={getButtonClass(3)}>3 Mois</button>
               </div>
            </div>
            <div id="planning-export" className="calendar-container-dark relative">
              {multiSelectedDates.length > 0 && (
                  <div className="sticky top-4 z-40 w-max mx-auto bg-gray-900/80 backdrop-blur-lg border border-white/20 rounded-xl shadow-2xl p-3 flex items-center gap-4 transition-all duration-300 animate-fade-in-up mb-4">
                      <div className="flex items-center gap-2 text-white font-bold"><Layers size={20} className="text-blue-400" /><span>{multiSelectedDates.length} jour(s) sélectionné(s)</span></div>
                      <div className="h-8 w-px bg-white/20"></div>
                      <div className="flex items-center gap-2">
                          <button onClick={handleBulkCreate} className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-2 text-sm"><Plus size={16} /> Créer</button>
                          <button onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-500 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-2 text-sm"><Trash2 size={16} /> Supprimer</button>
                          <button onClick={() => { setMultiSelectedDates([]); setIsMultiSelectMode(false); }} className="bg-gray-600 hover:bg-gray-500 text-white p-2 rounded-full"><X size={16} /></button>
                      </div>
                  </div>
              )}
              <style>{`.calendar-container-dark{--fc-bg-color:rgba(17,24,39,0.5);--fc-border-color:rgba(255,255,255,0.1);--fc-text-color:#E5E7EB;--fc-text-secondary-color:#9CA3AF;--fc-button-bg-color:rgba(255,255,255,0.05);--fc-button-hover-bg-color:rgba(59,130,246,0.3);--fc-button-active-bg-color:rgba(59,130,246,0.4);--fc-today-bg-color:rgba(59,130,246,0.15);--fc-select-bg-color:rgba(59,130,246,0.25)}.calendar-container-dark .fc{background:var(--fc-bg-color);backdrop-filter:blur(10px);border:1px solid var(--fc-border-color);border-radius:1rem;padding:1.5rem;color:var(--fc-text-color)}.fc .fc-toolbar-title{color:#FFFFFF;font-weight:700}.fc .fc-button{background:var(--fc-button-bg-color);border:1px solid var(--fc-border-color);color:var(--fc-text-color);transition:background-color .3s;text-transform:capitalize}.fc .fc-button:hover{background:var(--fc-button-hover-bg-color)}.fc .fc-button-primary:not(:disabled).fc-button-active,.fc .fc-button-primary:not(:disabled):active{background:var(--fc-button-active-bg-color);border-color:var(--fc-button-active-bg-color)}.fc .fc-daygrid-day{border-color:var(--fc-border-color);transition:background-color .3s}.fc .fc-day-today{background-color:var(--fc-today-bg-color)!important}.fc .fc-daygrid-day-number{color:var(--fc-text-secondary-color);padding:.5em}.fc .fc-col-header-cell{background:rgba(255,255,255,0.05);color:var(--fc-text-secondary-color);border-color:var(--fc-border-color)}.fc .fc-daygrid-event{border-radius:4px;padding:2px 4px;margin-top:2px;font-size:.7rem;font-weight:500;box-shadow:0 2px 4px rgba(0,0,0,.2)}.fc .fc-daygrid-day.fc-day-future .fc-daygrid-day-number{color:var(--fc-text-color)}.fc-h-event .fc-event-main{padding:2px 4px}`}</style>
              <FullCalendar
                  ref={calendarRef}
                  key={`${numberOfMonths}-${providers.length}-${locations.length}-${eventTypes.length}`}
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
                  dayMaxEvents={2}
                  datesSet={handleDatesSet}
                  select={handleSelect}
                  eventClick={handleEventClick}
                  eventDrop={handleEventDrop}
                  eventContent={eventInfo => (
                    <div className="p-1 overflow-hidden text-white text-[11px] h-full cursor-pointer">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor: eventInfo.event.backgroundColor}}></div>
                            <b className="truncate block">{eventInfo.event.title}</b>
                        </div>
                        <p className="truncate italic opacity-80 pl-3.5">{eventInfo.event.extendedProps.eventType}</p>
                        <p className="truncate italic opacity-60 pl-3.5">{eventInfo.event.extendedProps.providers}</p>
                    </div>
                  )}
              />
            </div>
          </div>
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-3"><BarChart2 className="text-purple-400" /> Statistiques de la vue</h3>
                {eventTypeStats.length > 0 ? (
                    <ul className="space-y-3">
                        {eventTypeStats.map(([typeName, count]) => (
                            <li key={typeName} className="flex justify-between items-center text-sm bg-white/5 px-3 py-2 rounded-md">
                                <span className="text-gray-300">{typeName}</span>
                                <span className="text-white font-bold bg-purple-500/20 px-2 py-0.5 rounded">{count}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-center text-gray-400 text-sm py-4">Aucun événement à analyser pour cette période.</p>
                )}
            </div>
          </div>
        </div>
      )}
      
      {activeTab === 'providers' && ( <div className="space-y-6"> <div className="flex items-center justify-between"><h3 className="text-xl font-bold text-white">Gestion des Prestataires</h3><button onClick={()=>setShowProviderModal(true)} className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center gap-2"><Plus size={16}/> Nouveau Prestataire</button></div> <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4"> {providers.map(p=>(<div key={p.id} className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="bg-blue-500/20 rounded-lg p-2"><User className="text-blue-400" size={20}/></div><div><h4 className="text-white font-semibold">{p.name}</h4><p className="text-gray-400 text-sm">{events.filter(e=>e.provider_ids.includes(p.id)).length} événement(s)</p></div></div><div className="flex gap-1"><button onClick={()=>startEditProvider(p)} className="p-2 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30"><Edit3 size={14}/></button><button onClick={()=>deleteProvider(p.id)} className="p-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"><Trash2 size={14}/></button></div></div></div>))} </div> {providers.length===0&&(<div className="text-center py-12"><Users className="text-gray-400 mx-auto mb-4" size={48}/><h4 className="text-white font-semibold mb-2">Aucun prestataire</h4><p className="text-gray-400 mb-4">Ajoutez votre premier prestataire</p><button onClick={()=>setShowProviderModal(true)} className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-full font-semibold">Ajouter un prestataire</button></div>)} </div> )}
      {activeTab === 'locations' && ( <div className="space-y-6"> <div className="flex items-center justify-between"><h3 className="text-xl font-bold text-white">Gestion des Lieux</h3><button onClick={()=>setShowLocationModal(true)} className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 flex items-center gap-2"><Plus size={16}/> Nouveau Lieu</button></div> <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4"> {locations.map(l=>(<div key={l.id} className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full border-2 border-white/20" style={{backgroundColor: l.color}}/><div><h4 className="text-white font-semibold">{l.name}</h4><p className="text-gray-400 text-sm">{events.filter(e=>e.location_id===l.id).length} événement(s)</p></div></div><div className="flex gap-1"><button onClick={()=>startEditLocation(l)} className="p-2 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"><Edit3 size={14}/></button><button onClick={()=>deleteLocation(l.id)} className="p-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"><Trash2 size={14}/></button></div></div></div>))} </div> {locations.length===0&&(<div className="text-center py-12"><MapPin className="text-gray-400 mx-auto mb-4" size={48}/><h4 className="text-white font-semibold mb-2">Aucun lieu</h4><p className="text-gray-400 mb-4">Ajoutez votre premier lieu</p><button onClick={()=>setShowLocationModal(true)} className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-full font-semibold">Ajouter un lieu</button></div>)} </div> )}
      
      {showEventModal && ( <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"> <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-2xl w-full"> <div className="flex items-center justify-between mb-6"><h3 className="text-2xl font-bold text-white">{editingEvent ? `Modifier: ${new Date(editingEvent.event_date + 'T00:00:00').toLocaleDateString('fr-FR')}` : 'Nouvel événement'}</h3><button onClick={resetEventForm} className="text-gray-400 hover:text-white text-2xl">×</button></div> {!editingEvent&&selectionInfo&&(<p className="text-center text-blue-300 mb-4 bg-blue-500/10 py-2 rounded-lg">Création du {toYYYYMMDD(selectionInfo.start)} au {toYYYYMMDD(new Date(selectionInfo.end.getTime()-864e5))}</p>)} {!editingEvent && multiSelectedDates.length > 0 && (<p className="text-center text-blue-300 mb-4 bg-blue-500/10 py-2 rounded-lg">Création sur <b>{multiSelectedDates.length} dates</b> sélectionnées.</p>)} <form onSubmit={handleEventSubmit} className="space-y-6"> <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-300 mb-2">Lieu *</label><select required value={eventForm.location_id} onChange={e=>setEventForm({...eventForm, location_id:e.target.value})} className="dark-select w-full"><option value="">Sélectionner un lieu</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-300 mb-2">Type de soirée *</label><select required value={eventForm.event_type_id} onChange={e=>setEventForm({...eventForm, event_type_id:e.target.value})} className="dark-select w-full"><option value="">Sélectionner un type</option>{eventTypes.map(et=><option key={et.id} value={et.id}>{et.name}</option>)}</select></div></div> <div><label className="block text-sm font-medium text-gray-300 mb-2">Prestataires *</label><div className="space-y-2 max-h-40 overflow-y-auto bg-white/5 rounded-lg p-3 border border-white/20">{providers.map(p=>(<label key={p.id} className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={eventForm.provider_ids.includes(p.id)} onChange={e=>{const newIds=e.target.checked?[...eventForm.provider_ids, p.id]:eventForm.provider_ids.filter(id=>id!==p.id);setEventForm({...eventForm, provider_ids: newIds})}} className="w-4 h-4 text-blue-400 bg-white/5 border-white/20 rounded focus:ring-blue-400"/><span className="text-white">{p.name}</span></label>))}</div></div> <div className="flex gap-4"> <button type="submit" className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2"><Save size={16}/>{editingEvent?'Mettre à jour':'Créer'}</button> {editingEvent&&(<button type="button" onClick={()=>deleteEvent(editingEvent.id)} className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2"><Trash2 size={16}/>Supprimer</button>)} </div> </form> </div> </div> )}
      {showProviderModal && ( <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"> <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-md w-full"> <div className="flex items-center justify-between mb-6"><h3 className="text-2xl font-bold text-white">{editingProvider ? 'Modifier prestataire' : 'Nouveau prestataire'}</h3><button onClick={resetProviderForm} className="text-gray-400 hover:text-white text-2xl">×</button></div> <form onSubmit={handleProviderSubmit} className="space-y-6"> <div><label className="block text-sm font-medium text-gray-300 mb-2">Nom *</label><input type="text" required value={providerForm.name} onChange={e=>setProviderForm({name: e.target.value})} className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400" placeholder="Ex: DJ Martin"/></div> <div className="flex gap-4"><button type="submit" className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 rounded-lg font-semibold">{editingProvider ? 'Mettre à jour' : 'Ajouter'}</button><button type="button" onClick={resetProviderForm} className="px-6 border-2 border-white/30 text-white rounded-lg font-semibold">Annuler</button></div> </form> </div> </div> )}
      {showLocationModal && ( <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"> <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-md w-full"> <div className="flex items-center justify-between mb-6"><h3 className="text-2xl font-bold text-white">{editingLocation ? 'Modifier le lieu' : 'Nouveau lieu'}</h3><button onClick={resetLocationForm} className="text-gray-400 hover:text-white text-2xl">×</button></div> <form onSubmit={handleLocationSubmit} className="space-y-6"> <div><label className="block text-sm font-medium text-gray-300 mb-2">Nom *</label><input type="text" required value={locationForm.name} onChange={e=>setLocationForm({...locationForm, name: e.target.value})} className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-blue-400" placeholder="Ex: Salle des fêtes"/></div> <div><label className="block text-sm font-medium text-gray-300 mb-2">Couleur *</label><div className="flex items-center gap-3"><input type="color" value={locationForm.color} onChange={e=>setLocationForm({...locationForm, color: e.target.value})} className="w-12 h-12 rounded-lg border border-white/20 bg-white/5"/><input type="text" value={locationForm.color} onChange={e=>setLocationForm({...locationForm, color: e.target.value})} className="flex-1 bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-green-400" placeholder="#3B82F6"/></div></div> <div className="flex gap-4"><button type="submit" className="flex-1 bg-gradient-to-r from-green-500 to-green-600 text-white py-3 rounded-lg font-semibold">{editingLocation?'Mettre à jour':'Ajouter'}</button><button type="button" onClick={resetLocationForm} className="px-6 border-2 border-white/30 text-white rounded-lg font-semibold">Annuler</button></div> </form> </div> </div> )}
    </div>
  );
};

export default AdminPlanningEditor;
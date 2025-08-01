import React, { useEffect, useState, useCallback, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import multiMonthPlugin from '@fullcalendar/multimonth';
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';
import html2canvas from 'html2canvas';
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
  XCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

// --- Interfaces de types ---
interface Provider { id: string; name: string; created_at: string; }
interface Location { id: string; name: string; color: string; created_at: string; }
interface EventItem { id: string; event_date: string; provider_ids: string[]; location_id: string; location: Location | null; created_at: string; }

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
  const [multiSelectedDates, setMultiSelectedDates] = useState<string[]>([]);

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

  // --- Chargement des données ---
  const loadProviders = useCallback(async () => {
    const { data, error } = await supabase.from('planning_providers').select('*').order('name');
    if (error) { toast.error('Erreur chargement prestataires.'); console.error(error); } 
    else { setProviders(data || []); }
  }, []);

  const loadLocations = useCallback(async () => {
    const { data, error } = await supabase.from('planning_locations').select('*').order('name');
    if (error) { toast.error('Erreur chargement lieux.'); console.error(error); } 
    else { setLocations(data || []); }
  }, []);

  const loadEvents = useCallback(async (start: Date, end: Date) => {
    const { data, error } = await supabase.from('planning_events').select('*, location:planning_locations(*)').gte('event_date', start.toISOString().slice(0, 10)).lte('event_date', end.toISOString().slice(0, 10));
    if (error) { toast.error('Erreur chargement événements.'); console.error(error); } 
    else { setEvents(data || []); }
  }, []);

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      await Promise.all([loadProviders(), loadLocations()]);
      setLoading(false);
    };
    loadInitialData();
  }, [loadProviders, loadLocations]);

  useEffect(() => {
    if (viewRange && !loading) { loadEvents(viewRange.start, viewRange.end); }
  }, [viewRange, loadEvents, loading]);

  // Mise à jour en temps réel
  useEffect(() => {
    const reloadVisibleEvents = () => { if (viewRange) loadEvents(viewRange.start, viewRange.end); };
    const channels = [
      supabase.channel('planning_events_updates').on('postgres_changes', { event: '*', schema: 'public', table: 'planning_events' }, reloadVisibleEvents),
      supabase.channel('planning_locations_updates').on('postgres_changes', { event: '*', schema: 'public', table: 'planning_locations' }, () => { loadLocations(); reloadVisibleEvents(); }),
      supabase.channel('planning_providers_updates').on('postgres_changes', { event: '*', schema: 'public', table: 'planning_providers' }, () => { loadProviders(); reloadVisibleEvents(); })
    ];
    channels.forEach(c => c.subscribe());
    return () => { channels.forEach(c => supabase.removeChannel(c)); };
  }, [viewRange, loadEvents, loadLocations, loadProviders]);
  
  // --- Gestion des Prestataires ---
  const handleProviderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerForm.name.trim()) return;
    const action = editingProvider
      ? supabase.from('planning_providers').update({ name: providerForm.name }).eq('id', editingProvider.id)
      : supabase.from('planning_providers').insert({ name: providerForm.name });
    const { error } = await action;
    if (error) { toast.error("Erreur de sauvegarde."); }
    else { toast.success(`Prestataire ${editingProvider ? 'mis à jour' : 'ajouté'}.`); resetProviderForm(); }
  };
  
  const deleteProvider = async (id: string) => {
    if (!confirm('Supprimer ce prestataire ?')) return;
    const { error } = await supabase.from('planning_providers').delete().eq('id', id);
    if (error) toast.error("Erreur de suppression.");
    else toast.success('Prestataire supprimé.');
  };

  // --- Gestion des Lieux ---
  const handleLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationForm.name.trim()) return;
    const { name, color } = locationForm;
    const action = editingLocation
      ? supabase.from('planning_locations').update({ name, color }).eq('id', editingLocation.id)
      : supabase.from('planning_locations').insert({ name, color });
    const { error } = await action;
    if (error) { toast.error("Erreur de sauvegarde."); }
    else { toast.success(`Lieu ${editingLocation ? 'mis à jour' : 'ajouté'}.`); resetLocationForm(); }
  };

  const deleteLocation = async (id: string) => {
    if (!confirm('Supprimer ce lieu ?')) return;
    const { error } = await supabase.from('planning_locations').delete().eq('id', id);
    if (error) toast.error("Erreur de suppression.");
    else toast.success('Lieu supprimé.');
  };
  
  // --- Gestion des Evénements ---
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
        const datesToCreate = selectionInfo ? getDatesInRange(selectionInfo.start, selectionInfo.end) : multiSelectedDates;
        if (datesToCreate.length === 0) { toast.error("Aucune date sélectionnée."); return; }
        const eventsToInsert = datesToCreate.map(dateStr => ({ event_date: dateStr, location_id: eventForm.location_id, provider_ids: eventForm.provider_ids }));
        const { error } = await supabase.from('planning_events').insert(eventsToInsert);
        if (error) throw error;
        toast.success(`${eventsToInsert.length} événement(s) créé(s) !`);
      }
      resetEventForm();
    } catch (error) { toast.error('Erreur lors de la sauvegarde.'); }
  };

  const deleteEvent = async (id: string) => {
    if (!confirm('Supprimer cet événement ?')) return;
    try {
      const { error } = await supabase.from('planning_events').delete().eq('id', id);
      if (error) throw error;
      toast.success('Événement supprimé');
      resetEventForm();
    } catch (error) { toast.error('Erreur de suppression.'); }
  };

  // --- Fonctions utilitaires et modales ---
  const resetProviderForm = () => { setProviderForm({ name: '' }); setEditingProvider(null); setShowProviderModal(false); };
  const resetLocationForm = () => { setLocationForm({ name: '', color: '#3B82F6' }); setEditingLocation(null); setShowLocationModal(false); };
  const resetEventForm = () => { setEventForm({ location_id: '', provider_ids: [] }); setEditingEvent(null); setShowEventModal(false); setSelectionInfo(null); setMultiSelectedDates([]); };
  const startEditProvider = (provider: Provider) => { setProviderForm({ name: provider.name }); setEditingProvider(provider); setShowProviderModal(true); };
  const startEditLocation = (location: Location) => { setLocationForm({ name: location.name, color: location.color }); setEditingLocation(location); setShowLocationModal(true); };
  const getDatesInRange = (start: Date, end: Date): string[] => { const dates = []; let current = new Date(start); while (current < end) { dates.push(current.toISOString().slice(0, 10)); current.setDate(current.getDate() + 1); } return dates; };

  // --- Actions Multi-Sélection ---
  const handleBulkCreate = () => {
    if (multiSelectedDates.length === 0) return;
    setEditingEvent(null);
    setSelectionInfo(null);
    setEventForm({ location_id: locations[0]?.id || '', provider_ids: [] });
    setShowEventModal(true);
  };

  const handleBulkDelete = async () => {
    if (multiSelectedDates.length === 0) return;
    if (!confirm(`Voulez-vous vraiment supprimer tous les événements des ${multiSelectedDates.length} jours sélectionnés ?`)) return;
    
    const eventsToDelete = events.filter(e => multiSelectedDates.includes(e.event_date));
    if (eventsToDelete.length === 0) {
      toast.success("Aucun événement à supprimer sur ces dates.");
      setMultiSelectedDates([]);
      return;
    }
    const { error } = await supabase.from('planning_events').delete().in('id', eventsToDelete.map(e => e.id));
    if (error) toast.error("Erreur lors de la suppression en masse.");
    else toast.success(`${eventsToDelete.length} événement(s) supprimé(s).`);
    setMultiSelectedDates([]);
  };

  // --- GESTIONNAIRES FULLCALENDAR ---
  const handleDatesSet = (arg: any) => { setViewRange({ start: arg.start, end: arg.end }); };
  const handleDateClick = (arg: DateClickArg) => { if (arg.jsEvent.ctrlKey) { setMultiSelectedDates(prev => prev.includes(arg.dateStr) ? prev.filter(d => d !== arg.dateStr) : [...prev, arg.dateStr]); } };
  const handleSelect = (selectInfo: any) => { setEditingEvent(null); setEventForm({ location_id: locations[0]?.id || '', provider_ids: [] }); setSelectionInfo({ start: selectInfo.start, end: selectInfo.end }); setMultiSelectedDates([]); setShowEventModal(true); };
  const handleEventClick = (clickInfo: any) => { if (clickInfo.jsEvent.ctrlKey) return; const clickedEvent = events.find(e => e.id === clickInfo.event.id); if (!clickedEvent) return; setEditingEvent(clickedEvent); setEventForm({ location_id: clickedEvent.location_id, provider_ids: clickedEvent.provider_ids }); setShowEventModal(true); };
  const handleEventDrop = async (dropInfo: any) => { const newDate = dropInfo.event.start.toISOString().slice(0, 10); try { const { error } = await supabase.from('planning_events').update({ event_date: newDate }).eq('id', dropInfo.event.id); if (error) throw error; toast.success('Événement déplacé !'); } catch (error) { toast.error('Erreur déplacement.'); dropInfo.revert(); } };

  // --- Formatage et Rendu ---
  const filteredEventsForCalendar = useMemo(() => {
    return events.filter(event => (selectedProvider === 'all' || event.provider_ids.includes(selectedProvider)) && (selectedLocation === 'all' || event.location_id === selectedLocation) && (!searchTerm || event.location?.name.toLowerCase().includes(searchTerm.toLowerCase()) || event.provider_ids.map(id => providers.find(p => p.id === id)?.name || '').join(' ').toLowerCase().includes(searchTerm.toLowerCase())))
    .map(event => ({ id: event.id, title: event.location?.name || '?', start: event.event_date, allDay: true, backgroundColor: event.location?.color || '#374151', borderColor: event.location?.color || '#374151', extendedProps: { providers: event.provider_ids.map(id => providers.find(p => p.id === id)?.name || '').join(', ') } }));
  }, [events, selectedProvider, selectedLocation, searchTerm, providers]);

  const exportPlanningPDF = async () => {
    const element = document.getElementById('planning-export');
    if (!element) return toast.error("Erreur: L'élément du planning est introuvable.");
    element.classList.add('light-theme-for-print');
    try {
      const canvas = await html2canvas(element, { scale: 1.5, useCORS: true });
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `planning-${new Date().toISOString().slice(0, 10)}.png`;
      link.click();
      toast.success("Planning exporté avec succès !");
    } catch (err) { toast.error("L'exportation a échoué."); console.error(err); } 
    finally { element.classList.remove('light-theme-for-print'); }
  };

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="text-white text-xl">Chargement du planning...</div></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3"><CalendarIcon className="text-blue-400" size={32}/> Planning Événementiel</h1><p className="text-gray-400">Gérez vos prestations, prestataires et lieux.</p></div>
        <div><button onClick={exportPlanningPDF} className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 flex items-center gap-2"><Download size={16}/> Export PDF</button></div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10"><div className="text-2xl font-bold text-white">{filteredEventsForCalendar.length}</div><div className="text-gray-400 text-sm">Événements Visibles</div></div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10"><div className="text-2xl font-bold text-blue-400">{providers.length}</div><div className="text-gray-400 text-sm">Prestataires</div></div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10"><div className="text-2xl font-bold text-green-400">{locations.length}</div><div className="text-gray-400 text-sm">Lieux</div></div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10"><div className="text-2xl font-bold text-yellow-400">{events.filter(e => new Date(e.event_date) >= new Date()).length}</div><div className="text-gray-400 text-sm">À venir</div></div>
      </div>

      <div className="flex flex-wrap gap-4 border-b border-white/20">
        {[ { id: 'calendar', label: 'Planning', icon: CalendarIcon }, { id: 'providers', label: 'Prestataires', icon: Users }, { id: 'locations', label: 'Lieux', icon: MapPin }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-6 py-3 font-semibold transition-colors ${activeTab === tab.id ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}><tab.icon size={20}/> {tab.label}</button>
        ))}
      </div>

      {activeTab === 'calendar' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10"><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20}/><input type="text" placeholder="Rechercher..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"/></div><div className="flex items-center gap-2"><Users className="text-gray-400" size={20}/><select value={selectedProvider} onChange={e=>setSelectedProvider(e.target.value)} className="dark-select w-full"><option value="all">Tous les prestataires</option>{providers.map(p=>(<option key={p.id} value={p.id}>{p.name}</option>))}</select></div><div className="flex items-center gap-2"><MapPin className="text-gray-400" size={20}/><select value={selectedLocation} onChange={e=>setSelectedLocation(e.target.value)} className="dark-select w-full"><option value="all">Tous les lieux</option>{locations.map(l=>(<option key={l.id} value={l.id}>{l.name}</option>))}</select></div></div></div>
          <div id="planning-export" className="calendar-container-dark"><style>{`.calendar-container-dark{--fc-bg-color:rgba(17,24,39,0.5);--fc-border-color:rgba(255,255,255,0.1);--fc-text-color:#E5E7EB;--fc-text-secondary-color:#9CA3AF;--fc-button-bg-color:rgba(255,255,255,0.05);--fc-button-hover-bg-color:rgba(59,130,246,0.3);--fc-button-active-bg-color:rgba(59,130,246,0.4);--fc-today-bg-color:rgba(59,130,246,0.15);--fc-select-bg-color:rgba(59,130,246,0.25)}.calendar-container-dark .fc{background:var(--fc-bg-color);backdrop-filter:blur(10px);border:1px solid var(--fc-border-color);border-radius:1rem;padding:1.5rem;color:var(--fc-text-color)}.fc .fc-toolbar-title{color:#FFFFFF;font-weight:700}.fc .fc-button{background:var(--fc-button-bg-color);border:1px solid var(--fc-border-color);color:var(--fc-text-color);transition:background-color .3s;text-transform:capitalize}.fc .fc-button:hover{background:var(--fc-button-hover-bg-color)}.fc .fc-button-primary:not(:disabled).fc-button-active,.fc .fc-button-primary:not(:disabled):active{background:var(--fc-button-active-bg-color);border-color:var(--fc-button-active-bg-color)}.fc .fc-daygrid-day{border-color:var(--fc-border-color);transition:background-color .3s}.fc .fc-day-today{background-color:var(--fc-today-bg-color)!important}.fc .fc-daygrid-day-number{color:var(--fc-text-secondary-color);padding:.5em}.fc .fc-col-header-cell{background:rgba(255,255,255,0.05);color:var(--fc-text-secondary-color);border-color:var(--fc-border-color)}.fc .fc-daygrid-event{border-radius:4px;padding:2px 4px;margin-top:2px;font-size:.7rem;font-weight:500;box-shadow:0 2px 4px rgba(0,0,0,.2)}.fc .fc-daygrid-day.fc-day-future .fc-daygrid-day-number{color:var(--fc-text-color)}.fc-h-event .fc-event-main{padding:2px 4px}.day-multiselected{background-color:rgba(96,165,250,0.3)!important;box-shadow:inset 0 0 0 2px #60A5FA}.light-theme-for-print{background-color:#FFFFFF!important;--fc-bg-color:#FFFFFF;--fc-text-color:#000000;--fc-text-secondary-color:#6B7280;--fc-border-color:#E5E7EB;--fc-today-bg-color:#f0f8ff;backdrop-filter:none!important;}.light-theme-for-print .fc-event-main{color:#FFFFFF!important;}.light-theme-for-print b,.light-theme-for-print p{color:#FFFFFF!important;}.light-theme-for-print .fc-toolbar-title{color:#000000!important}`}</style>
            <FullCalendar key={providers.length+locations.length} plugins={[dayGridPlugin,multiMonthPlugin,interactionPlugin]} initialView="multiMonthThree" views={{multiMonthThree:{type:'multiMonth',duration:{months:3}}}} locale="fr" weekends={true} events={filteredEventsForCalendar} headerToolbar={{left:'prev,next today',center:'title',right:'multiMonthThree,dayGridMonth'}} buttonText={{today:"Aujourd'hui",month:'1 Mois',multiMonthThree:'3 Mois'}} editable={true} selectable={true} selectMirror={true} dayMaxEvents={true} datesSet={handleDatesSet} dateClick={handleDateClick} select={handleSelect} eventClick={handleEventClick} eventDrop={handleEventDrop} dayCellClassNames={({date})=>multiSelectedDates.includes(date.toISOString().slice(0,10))?['day-multiselected']:[]} eventContent={eventInfo=>(<div className="p-1 overflow-hidden text-white text-[11px] h-full cursor-pointer"><b className="truncate block">{eventInfo.event.title}</b><p className="truncate italic opacity-80">{eventInfo.event.extendedProps.providers}</p></div>)}/>
          </div>
        </div>
      )}
      
      {activeTab === 'providers' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between"><h3 className="text-xl font-bold text-white">Gestion des Prestataires</h3><button onClick={()=>setShowProviderModal(true)} className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center gap-2"><Plus size={16}/> Nouveau</button></div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">{providers.map(p=>(<div key={p.id} className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="bg-blue-500/20 rounded-lg p-2"><User className="text-blue-400" size={20}/></div><div><h4 className="text-white font-semibold">{p.name}</h4><p className="text-gray-400 text-sm">{events.filter(e=>e.provider_ids.includes(p.id)).length} événement(s)</p></div></div><div className="flex gap-1"><button onClick={()=>startEditProvider(p)} className="p-2 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30"><Edit3 size={14}/></button><button onClick={()=>deleteProvider(p.id)} className="p-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"><Trash2 size={14}/></button></div></div></div>))}</div>
          {providers.length===0&&(<div className="text-center py-12"><Users className="text-gray-400 mx-auto mb-4" size={48}/><h4 className="text-white font-semibold mb-2">Aucun prestataire</h4><button onClick={()=>setShowProviderModal(true)} className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-full font-semibold">Ajouter un prestataire</button></div>)}
        </div>
      )}

      {activeTab === 'locations' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between"><h3 className="text-xl font-bold text-white">Gestion des Lieux</h3><button onClick={()=>setShowLocationModal(true)} className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 flex items-center gap-2"><Plus size={16}/> Nouveau</button></div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">{locations.map(l=>(<div key={l.id} className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full border-2 border-white/20" style={{backgroundColor:l.color}}/><div><h4 className="text-white font-semibold">{l.name}</h4><p className="text-gray-400 text-sm">{events.filter(e=>e.location_id===l.id).length} événement(s)</p></div></div><div className="flex gap-1"><button onClick={()=>startEditLocation(l)} className="p-2 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"><Edit3 size={14}/></button><button onClick={()=>deleteLocation(l.id)} className="p-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"><Trash2 size={14}/></button></div></div></div>))}</div>
          {locations.length===0&&(<div className="text-center py-12"><MapPin className="text-gray-400 mx-auto mb-4" size={48}/><h4 className="text-white font-semibold mb-2">Aucun lieu</h4><button onClick={()=>setShowLocationModal(true)} className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-full font-semibold">Ajouter un lieu</button></div>)}
        </div>
      )}

      {showEventModal && <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"><div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-2xl w-full"><div className="flex items-center justify-between mb-6"><h3 className="text-2xl font-bold text-white">{editingEvent?`Modifier: ${new Date(editingEvent.event_date+'T00:00:00').toLocaleDateString('fr-FR')}`:'Nouvel événement'}</h3><button onClick={resetEventForm} className="text-gray-400 hover:text-white text-2xl">×</button></div>{!editingEvent&&selectionInfo&&(<p className="text-center text-blue-300 mb-4 bg-blue-500/10 py-2 rounded-lg">Création du {selectionInfo.start.toLocaleDateString('fr-FR')} au {new Date(selectionInfo.end.getTime()-864e5).toLocaleDateString('fr-FR')}</p>)}{!editingEvent&&multiSelectedDates.length>0&&(<p className="text-center text-blue-300 mb-4 bg-blue-500/10 py-2 rounded-lg">Création sur {multiSelectedDates.length} date(s) sélectionnée(s)</p>)}<form onSubmit={handleEventSubmit} className="space-y-6"><div><label className="block text-sm font-medium text-gray-300 mb-2">Lieu *</label><select required value={eventForm.location_id} onChange={e=>setEventForm({...eventForm,location_id:e.target.value})} className="dark-select w-full"><option value="">Sélectionner un lieu</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-300 mb-2">Prestataires *</label><div className="space-y-2 max-h-40 overflow-y-auto bg-white/5 rounded-lg p-3 border border-white/20">{providers.map(p=>(<label key={p.id} className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={eventForm.provider_ids.includes(p.id)} onChange={e=>{const newIds=e.target.checked?[...eventForm.provider_ids, p.id]:eventForm.provider_ids.filter(id=>id!==p.id);setEventForm({...eventForm, provider_ids:newIds})}} className="w-4 h-4 text-blue-400 bg-white/5 border-white/20 rounded focus:ring-blue-400"/><span className="text-white">{p.name}</span></label>))}</div></div><div className="flex gap-4"><button type="submit" className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2"><Save size={16}/>{editingEvent?'Mettre à jour':'Créer'}</button>{editingEvent&&(<button type="button" onClick={()=>deleteEvent(editingEvent.id)} className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2"><Trash2 size={16}/>Supprimer</button>)}</div></form></div></div>}
      {showProviderModal && <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"><div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-md w-full"><div className="flex items-center justify-between mb-6"><h3 className="text-2xl font-bold text-white">{editingProvider?'Modifier prestataire':'Nouveau prestataire'}</h3><button onClick={resetProviderForm} className="text-gray-400 hover:text-white text-2xl">×</button></div><form onSubmit={handleProviderSubmit} className="space-y-6"><div><label className="block text-sm font-medium text-gray-300 mb-2">Nom *</label><input type="text" required value={providerForm.name} onChange={e=>setProviderForm({name:e.target.value})} className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400" placeholder="Ex: DJ Martin"/></div><div className="flex gap-4"><button type="submit" className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 rounded-lg font-semibold">{editingProvider?'Mettre à jour':'Ajouter'}</button><button type="button" onClick={resetProviderForm} className="px-6 border-2 border-white/30 text-white rounded-lg font-semibold">Annuler</button></div></form></div></div>}
      {showLocationModal && <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"><div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-md w-full"><div className="flex items-center justify-between mb-6"><h3 className="text-2xl font-bold text-white">{editingLocation?'Modifier le lieu':'Nouveau lieu'}</h3><button onClick={resetLocationForm} className="text-gray-400 hover:text-white text-2xl">×</button></div><form onSubmit={handleLocationSubmit} className="space-y-6"><div><label className="block text-sm font-medium text-gray-300 mb-2">Nom *</label><input type="text" required value={locationForm.name} onChange={e=>setLocationForm({...locationForm,name:e.target.value})} className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400" placeholder="Ex: Salle des fêtes"/></div><div><label className="block text-sm font-medium text-gray-300 mb-2">Couleur *</label><div className="flex items-center gap-3"><input type="color" value={locationForm.color} onChange={e=>setLocationForm({...locationForm,color:e.target.value})} className="w-12 h-12 rounded-lg border border-white/20 bg-white/5"/><input type="text" value={locationForm.color} onChange={e=>setLocationForm({...locationForm,color:e.target.value})} className="flex-1 bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-green-400" placeholder="#3B82F6"/></div></div><div className="flex gap-4"><button type="submit" className="flex-1 bg-gradient-to-r from-green-500 to-green-600 text-white py-3 rounded-lg font-semibold">{editingLocation?'Mettre à jour':'Ajouter'}</button><button type="button" onClick={resetLocationForm} className="px-6 border-2 border-white/30 text-white rounded-lg font-semibold">Annuler</button></div></form></div></div>}

      {multiSelectedDates.length > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-gray-800/80 backdrop-blur-md border border-white/20 rounded-xl shadow-2xl p-3 flex items-center gap-4 z-50 animate-fade-in-up">
          <div className="text-white font-bold text-sm px-2">{multiSelectedDates.length} jour(s) sélectionné(s)</div>
          <button onClick={handleBulkCreate} className="bg-blue-600 text-white px-4 py-2 text-sm rounded-lg font-semibold hover:bg-blue-500 transition-colors flex items-center gap-2"><Plus size={16}/> Créer</button>
          <button onClick={handleBulkDelete} className="bg-red-600 text-white px-4 py-2 text-sm rounded-lg font-semibold hover:bg-red-500 transition-colors flex items-center gap-2"><Trash2 size={16}/> Supprimer</button>
          <button onClick={() => setMultiSelectedDates([])} className="text-gray-300 hover:text-white transition-colors"><XCircle size={20}/></button>
        </div>
      )}
    </div>
  );
};

export default AdminPlanningEditor;
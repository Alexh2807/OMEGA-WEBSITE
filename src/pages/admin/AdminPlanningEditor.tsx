import React, { useEffect, useState, useCallback, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction'; // Pour le Drag & Drop et la sélection
import 'react-calendar/dist/Calendar.css'; // Peut être conservé pour certains styles de base ou supprimé
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

  // --- Chargement des données ---
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

  // --- NOUVELLE GESTION DES EVENEMENTS ---
  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm.location_id || eventForm.provider_ids.length === 0) {
      toast.error('Veuillez sélectionner un lieu et au moins un prestataire.');
      return;
    }

    try {
      // Mode édition
      if (editingEvent) {
        const { error } = await supabase
          .from('planning_events')
          .update({
            location_id: eventForm.location_id,
            provider_ids: eventForm.provider_ids,
            // La date n'est pas modifiable ici, elle se change par drag-and-drop
          })
          .eq('id', editingEvent.id);
        if (error) throw error;
        toast.success('Événement mis à jour !');
      }
      // Mode création
      else if (selectionInfo) {
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
      if(viewRange) loadEvents(viewRange.start, viewRange.end); // Recharger
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
      resetEventForm(); // Ferme la modale si elle était ouverte en édition
      if(viewRange) loadEvents(viewRange.start, viewRange.end); // Recharger
    } catch (error) {
      console.error('Erreur suppression événement:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  // --- Fonctions utilitaires et ouverture des modales ---
  const resetProviderForm = () => { setProviderForm({ name: '' }); setEditingProvider(null); setShowProviderModal(false); };
  const resetLocationForm = () => { setLocationForm({ name: '', color: '#3B82F6' }); setEditingLocation(null); setShowLocationModal(false); };
  const resetEventForm = () => { setEventForm({ location_id: '', provider_ids: [] }); setEditingEvent(null); setShowEventModal(false); setSelectionInfo(null); };

  const startEditProvider = (provider: Provider) => { setProviderForm({ name: provider.name }); setEditingProvider(provider); setShowProviderModal(true); };
  const startEditLocation = (location: Location) => { setLocationForm({ name: location.name, color: location.color }); setEditingLocation(location); setShowLocationModal(true); };

  // --- GESTIONNAIRES D'ÉVÉNEMENTS FULLCALENDAR ---
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
    setEventForm({
      location_id: clickedEvent.location_id,
      provider_ids: clickedEvent.provider_ids,
    });
    setShowEventModal(true);
  };

  const handleEventDrop = async (dropInfo: any) => {
    const { event } = dropInfo;
    const newDate = event.start.toISOString().slice(0, 10);
    
    try {
      const { error } = await supabase
        .from('planning_events')
        .update({ event_date: newDate })
        .eq('id', event.id);

      if (error) throw error;
      toast.success('Événement déplacé !');
      // On met à jour l'état local pour une réactivité immédiate
      setEvents(prevEvents => prevEvents.map(e => e.id === event.id ? { ...e, event_date: newDate } : e));
    } catch (error) {
      console.error('Erreur déplacement événement:', error);
      toast.error('Erreur lors du déplacement');
      dropInfo.revert(); // Annule le déplacement visuel
    }
  };

  // --- Filtrage et formatage pour FullCalendar ---
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
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white text-xl">Chargement du planning...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
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
        <div className="flex items-center gap-3">
          <button
            onClick={() => exportElementAsPDF('planning-export', 'planning')}
            className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 flex items-center gap-2"
          >
            <Download size={16} />
            Export PDF
          </button>
        </div>
      </div>

      {/* Navigation par onglets */}
      <div className="flex flex-wrap gap-4 border-b border-white/20">
        {[
          { id: 'calendar', label: 'Planning', icon: CalendarIcon },
          { id: 'providers', label: 'Prestataires', icon: Users },
          { id: 'locations', label: 'Lieux', icon: MapPin },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-3 font-semibold transition-colors ${
              activeTab === tab.id
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <tab.icon size={20} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contenu des onglets */}
      {activeTab === 'calendar' && (
        <div className="space-y-6">
          {/* Filtres */}
          <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Rechercher lieu ou prestataire..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                />
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

          {/* Calendrier FullCalendar */}
          <div id="planning-export" className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-4 border border-white/10 calendar-container-dark">
            <FullCalendar
              key={providers.length + locations.length} // Force re-render if base data changes
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
                <div className="p-1 overflow-hidden text-white text-[11px] h-full">
                  <b className="truncate block">{eventInfo.event.title}</b>
                  <p className="truncate italic">{eventInfo.event.extendedProps.providers}</p>
                </div>
              )}
            />
          </div>
        </div>
      )}
      
      {/* --- Les autres onglets restent ici --- */}
      {activeTab === 'providers' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">Gestion des Prestataires</h3>
            <button onClick={() => setShowProviderModal(true)} className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center gap-2">
              <Plus size={16} /> Nouveau Prestataire
            </button>
          </div>
          {/* ... UI des prestataires ... */}
        </div>
      )}

      {activeTab === 'locations' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">Gestion des Lieux</h3>
            <button onClick={() => setShowLocationModal(true)} className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 flex items-center gap-2">
              <Plus size={16} /> Nouveau Lieu
            </button>
          </div>
          {/* ... UI des lieux ... */}
        </div>
      )}

      {/* --- MODALS --- */}
      {/* Modal Événement (simplifiée) */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-2xl w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">
                {editingEvent ? `Modifier l'événement du ${new Date(editingEvent.event_date + 'T00:00:00').toLocaleDateString('fr-FR')}` : 'Nouvel événement'}
              </h3>
              <button onClick={resetEventForm} className="text-gray-400 hover:text-white transition-colors text-2xl"> × </button>
            </div>
            {!editingEvent && selectionInfo && (
              <p className="text-center text-blue-300 mb-4 bg-blue-500/10 py-2 rounded-lg">
                Création d'événement(s) du {selectionInfo.start.toLocaleDateString('fr-FR')} au {new Date(selectionInfo.end.getTime() - 1).toLocaleDateString('fr-FR')}
              </p>
            )}

            <form onSubmit={handleEventSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Lieu de prestation *</label>
                <select required value={eventForm.location_id} onChange={e => setEventForm({ ...eventForm, location_id: e.target.value })} className="dark-select w-full">
                  <option value="">Sélectionner un lieu</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Prestataires assignés *</label>
                <div className="space-y-2 max-h-40 overflow-y-auto bg-white/5 rounded-lg p-3 border border-white/20">
                  {providers.map(p => (
                    <label key={p.id} className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={eventForm.provider_ids.includes(p.id)} onChange={e => {
                        const newIds = e.target.checked ? [...eventForm.provider_ids, p.id] : eventForm.provider_ids.filter(id => id !== p.id);
                        setEventForm({ ...eventForm, provider_ids: newIds });
                      }} className="w-4 h-4 text-blue-400 bg-white/5 border-white/20 rounded focus:ring-blue-400"/>
                      <span className="text-white">{p.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-4">
                <button type="submit" className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center justify-center gap-2">
                  <Save size={16} /> {editingEvent ? 'Mettre à jour' : 'Créer'}
                </button>
                {editingEvent && (
                  <button type="button" onClick={() => deleteEvent(editingEvent.id)} className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-red-500/25 transition-all duration-300 flex items-center justify-center gap-2">
                    <Trash2 size={16} /> Supprimer
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ... autres modales (prestataire, lieu) inchangées ... */}
    </div>
  );
};

export default AdminPlanningEditor;
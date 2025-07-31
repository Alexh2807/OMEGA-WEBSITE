import React, { useEffect, useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
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
  Eye,
  X,
  Save,
  Settings,
  FileText,
  Clock,
  User,
  Building,
  Palette,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { exportElementAsPDF } from '../../utils/pdfGenerator';
import toast from 'react-hot-toast';

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

type ViewMode = 'month' | 'week' | 'day';

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
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals et formulaires
  const [showEventModal, setShowEventModal] = useState(false);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  
  // Formulaires
  const [eventForm, setEventForm] = useState({
    event_date: '',
    location_id: '',
    provider_ids: [] as string[],
  });
  const [providerForm, setProviderForm] = useState({ name: '' });
  const [locationForm, setLocationForm] = useState({ name: '', color: '#3B82F6' });

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([loadProviders(), loadLocations(), loadEvents()]);
    } catch (error) {
      console.error('Erreur chargement données:', error);
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const loadProviders = async () => {
    const { data, error } = await supabase
      .from('planning_providers')
      .select('*')
      .order('name');
    
    if (error) {
      console.error('Erreur chargement prestataires:', error);
      toast.error('Erreur lors du chargement des prestataires');
    } else {
      setProviders(data || []);
    }
  };

  const loadLocations = async () => {
    const { data, error } = await supabase
      .from('planning_locations')
      .select('*')
      .order('name');
    
    if (error) {
      console.error('Erreur chargement lieux:', error);
      toast.error('Erreur lors du chargement des lieux');
    } else {
      setLocations(data || []);
    }
  };

  const loadEvents = async () => {
    const { data, error } = await supabase
      .from('planning_events')
      .select(`
        *,
        location:planning_locations(*)
      `)
      .order('event_date', { ascending: false });

    if (error) {
      console.error('Erreur chargement événements:', error);
      toast.error('Erreur lors du chargement des événements');
    } else {
      setEvents(data || []);
    }
  };

  // Mise à jour en temps réel des données
  useEffect(() => {
    const eventsChannel = supabase
      .channel('planning_events_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'planning_events' },
        () => {
          loadEvents();
        }
      )
      .subscribe();

    const locationsChannel = supabase
      .channel('planning_locations_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'planning_locations' },
        () => {
          loadLocations();
          loadEvents();
        }
      )
      .subscribe();

    const providersChannel = supabase
      .channel('planning_providers_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'planning_providers' },
        () => {
          loadProviders();
          loadEvents();
        }
      )
      .subscribe();

    return () => {
      eventsChannel.unsubscribe();
      locationsChannel.unsubscribe();
      providersChannel.unsubscribe();
    };
  }, []);

  // Gestion des prestataires
  const handleProviderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerForm.name.trim()) return;

    try {
      if (editingProvider) {
        const { error } = await supabase
          .from('planning_providers')
          .update({ name: providerForm.name })
          .eq('id', editingProvider.id);
        
        if (error) throw error;
        toast.success('Prestataire mis à jour');
      } else {
        const { error } = await supabase
          .from('planning_providers')
          .insert({ name: providerForm.name });
        
        if (error) throw error;
        toast.success('Prestataire ajouté');
      }
      
      resetProviderForm();
      loadProviders();
    } catch (error) {
      console.error('Erreur prestataire:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const deleteProvider = async (id: string) => {
    if (!confirm('Supprimer ce prestataire ? Tous ses événements seront également supprimés.')) return;
    
    try {
      const { error } = await supabase
        .from('planning_providers')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      toast.success('Prestataire supprimé');
      loadProviders();
      loadEvents();
    } catch (error) {
      console.error('Erreur suppression prestataire:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  // Gestion des lieux
  const handleLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationForm.name.trim()) return;

    try {
      if (editingLocation) {
        const { error } = await supabase
          .from('planning_locations')
          .update({ 
            name: locationForm.name,
            color: locationForm.color 
          })
          .eq('id', editingLocation.id);
        
        if (error) throw error;
        toast.success('Lieu mis à jour');
      } else {
        const { error } = await supabase
          .from('planning_locations')
          .insert({ 
            name: locationForm.name,
            color: locationForm.color 
          });
        
        if (error) throw error;
        toast.success('Lieu ajouté');
      }
      
      resetLocationForm();
      loadLocations();
    } catch (error) {
      console.error('Erreur lieu:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const deleteLocation = async (id: string) => {
    if (!confirm('Supprimer ce lieu ? Tous ses événements seront également supprimés.')) return;
    
    try {
      const { error } = await supabase
        .from('planning_locations')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      toast.success('Lieu supprimé');
      loadLocations();
      loadEvents();
    } catch (error) {
      console.error('Erreur suppression lieu:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  // Gestion des événements
  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm.event_date || !eventForm.location_id || eventForm.provider_ids.length === 0) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }

    try {
      if (editingEvent) {
        const { error } = await supabase
          .from('planning_events')
          .update({
            event_date: eventForm.event_date,
            location_id: eventForm.location_id,
            provider_ids: eventForm.provider_ids,
          })
          .eq('id', editingEvent.id);
        
        if (error) throw error;
        toast.success('Événement mis à jour');
      } else {
        const { error } = await supabase
          .from('planning_events')
          .insert({
            event_date: eventForm.event_date,
            location_id: eventForm.location_id,
            provider_ids: eventForm.provider_ids,
          });
        
        if (error) throw error;
        toast.success('Événement ajouté');
      }
      
      resetEventForm();
      loadEvents();
    } catch (error) {
      console.error('Erreur événement:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const deleteEvent = async (id: string) => {
    if (!confirm('Supprimer cet événement ?')) return;
    
    try {
      const { error } = await supabase
        .from('planning_events')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      toast.success('Événement supprimé');
      loadEvents();
    } catch (error) {
      console.error('Erreur suppression événement:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  // Fonctions utilitaires
  const resetProviderForm = () => {
    setProviderForm({ name: '' });
    setEditingProvider(null);
    setShowProviderModal(false);
  };

  const resetLocationForm = () => {
    setLocationForm({ name: '', color: '#3B82F6' });
    setEditingLocation(null);
    setShowLocationModal(false);
  };

  const resetEventForm = () => {
    setEventForm({
      event_date: '',
      location_id: '',
      provider_ids: [],
    });
    setEditingEvent(null);
    setShowEventModal(false);
  };

  const startEditProvider = (provider: Provider) => {
    setProviderForm({ name: provider.name });
    setEditingProvider(provider);
    setShowProviderModal(true);
  };

  const startEditLocation = (location: Location) => {
    setLocationForm({ name: location.name, color: location.color });
    setEditingLocation(location);
    setShowLocationModal(true);
  };

  const startEditEvent = (event: EventItem) => {
    setEventForm({
      event_date: event.event_date,
      location_id: event.location_id,
      provider_ids: event.provider_ids,
    });
    setEditingEvent(event);
    setShowEventModal(true);
  };

  const openEventModal = (date: Date) => {
    setEventForm({
      event_date: date.toISOString().slice(0, 10),
      location_id: locations[0]?.id || '',
      provider_ids: [],
    });
    setShowEventModal(true);
  };

  // Filtrage des événements
  const getFilteredEvents = () => {
    return events.filter(event => {
      const matchesProvider = selectedProvider === 'all' || 
        event.provider_ids.includes(selectedProvider);
      const matchesLocation = selectedLocation === 'all' || 
        event.location_id === selectedLocation;
      const matchesSearch = !searchTerm || 
        event.location?.name.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesProvider && matchesLocation && matchesSearch;
    });
  };

  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().slice(0, 10);
    return getFilteredEvents().filter(event => event.event_date === dateStr);
  };

  const getProviderName = (providerId: string) => {
    return providers.find(p => p.id === providerId)?.name || 'Prestataire inconnu';
  };

  // Export PDF amélioré
  const exportPlanningPDF = async () => {
    try {
      const element = document.getElementById('planning-export');
      if (!element) {
        toast.error('Élément de planning non trouvé');
        return;
      }

      // Préparer les données pour l'export
      const filteredEvents = getFilteredEvents();
      const providerName = selectedProvider === 'all' ? 'Tous' : 
        providers.find(p => p.id === selectedProvider)?.name || 'Inconnu';
      const locationName = selectedLocation === 'all' ? 'Tous' : 
        locations.find(l => l.id === selectedLocation)?.name || 'Inconnu';
      
      const fileName = `planning-${providerName}-${locationName}-${new Date().toISOString().slice(0, 10)}`;
      
      await exportElementAsPDF('planning-export', fileName);
      toast.success('Planning exporté en PDF');
    } catch (error) {
      console.error('Erreur export PDF:', error);
      toast.error('Erreur lors de l\'export PDF');
    }
  };

  // Contenu du calendrier
  const tileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null;

    const dayEvents = getEventsForDate(date);
    if (dayEvents.length === 0) return null;

    const mainEvent = dayEvents[0];

    return (
      <div
        className="h-full w-full absolute top-0 left-0 p-1 flex flex-col text-white overflow-hidden"
        style={{ 
          backgroundColor: mainEvent.location?.color || '#374151',
          textShadow: '0 1px 2px rgba(0,0,0,0.5)' 
        }}
      >
        <strong className="font-bold text-xs truncate pt-5">
          {mainEvent.location?.name}
        </strong>
        <p className="text-xs truncate">
          {mainEvent.provider_ids.map(id => getProviderName(id)).join(', ')}
        </p>
        {dayEvents.length > 1 && (
          <div className="mt-auto text-right text-xs font-bold">
            + {dayEvents.length - 1}
          </div>
        )}
      </div>
    );
  };

  const tileClassName = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null;
    const dayEvents = getEventsForDate(date);
    const classes = [];
    if (dayEvents.length > 0) {
      classes.push('has-events');
    }
    return classes.join(' ');
  };

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
            Gérez vos événements, prestataires et lieux de prestations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportPlanningPDF}
            className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 flex items-center gap-2"
          >
            <Download size={16} />
            Export PDF
          </button>
          <button
            onClick={() => setShowEventModal(true)}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center gap-2"
          >
            <Plus size={16} />
            Nouvel Événement
          </button>
        </div>
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-white">{events.length}</div>
          <div className="text-gray-400 text-sm">Événements total</div>
        </div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-blue-400">{providers.length}</div>
          <div className="text-gray-400 text-sm">Prestataires</div>
        </div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-green-400">{locations.length}</div>
          <div className="text-gray-400 text-sm">Lieux</div>
        </div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-yellow-400">
            {events.filter(e => new Date(e.event_date) >= new Date()).length}
          </div>
          <div className="text-gray-400 text-sm">À venir</div>
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
          {/* Filtres et contrôles */}
          <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1 relative">
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  size={20}
                />
                <input
                  type="text"
                  placeholder="Rechercher par lieu..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                />
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="text-gray-400" size={20} />
                  <select
                    value={selectedProvider}
                    onChange={e => setSelectedProvider(e.target.value)}
                    className="bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-blue-400 focus:outline-none"
                  >
                    <option value="all">Tous les prestataires</option>
                    {providers.map(provider => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="flex items-center gap-2">
                  <MapPin className="text-gray-400" size={20} />
                  <select
                    value={selectedLocation}
                    onChange={e => setSelectedLocation(e.target.value)}
                    className="bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-blue-400 focus:outline-none"
                  >
                    <option value="all">Tous les lieux</option>
                    {locations.map(location => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Calendrier principal */}
          <div className="grid lg:grid-cols-4 gap-6">
            {/* Calendrier */}
            <div className="lg:col-span-3">
              <div 
                id="planning-export" 
                className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-white">
                    Planning {selectedProvider !== 'all' && `- ${providers.find(p => p.id === selectedProvider)?.name}`}
                  </h3>
                  <div className="text-gray-400 text-sm">
                    {getFilteredEvents().length} événement(s) affiché(s)
                  </div>
                </div>
                
                <div className="calendar-container">
                  <style jsx>{`
                    .calendar-container .react-calendar {
                      width: 100%;
                      background: transparent;
                      border: none;
                      color: white;
                      font-family: inherit;
                    }
                    .calendar-container .react-calendar__tile {
                      background: rgba(255, 255, 255, 0.05);
                      border: 1px solid rgba(255, 255, 255, 0.1);
                      color: white;
                      padding: 0;
                      height: 100px;
                      position: relative;
                      overflow: hidden;
                    }
                    .calendar-container .react-calendar__tile:hover {
                      background: rgba(59, 130, 246, 0.2);
                      cursor: pointer;
                    }
                    .calendar-container .react-calendar__tile--active {
                      background: rgba(59, 130, 246, 0.3) !important;
                    }
                    .calendar-container .react-calendar__tile--now {
                      background: rgba(251, 191, 36, 0.2);
                    }
                    .calendar-container .react-calendar__tile.has-events {
                      padding: 0;
                    }
                    .calendar-container .react-calendar__tile.has-events .react-calendar__tile__label {
                      font-weight: bold;
                      color: white;
                      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
                    }
                    .calendar-container .react-calendar__month-view__days__day-number {
                      position: absolute;
                      top: 5px;
                      right: 5px;
                      z-index: 10;
                      background: rgba(0,0,0,0.3);
                      padding: 2px 5px;
                      border-radius: 5px;
                      font-size: 0.75rem;
                    }
                    .calendar-container .react-calendar__month-view__weekdays {
                      background: rgba(255, 255, 255, 0.1);
                    }
                    .calendar-container .react-calendar__month-view__weekdays__weekday {
                      padding: 0.75rem;
                      color: #9CA3AF;
                      font-weight: 600;
                      text-transform: uppercase;
                      font-size: 0.75rem;
                    }
                    .calendar-container .react-calendar__navigation {
                      margin-bottom: 1rem;
                    }
                    .calendar-container .react-calendar__navigation button {
                      background: rgba(255, 255, 255, 0.1);
                      border: 1px solid rgba(255, 255, 255, 0.2);
                      color: white;
                      padding: 0.5rem 1rem;
                      border-radius: 0.5rem;
                      font-weight: 600;
                    }
                    .calendar-container .react-calendar__navigation button:hover {
                      background: rgba(59, 130, 246, 0.3);
                    }
                  `}</style>
                  
                  <Calendar
                    onClickDay={openEventModal}
                    tileContent={tileContent}
                    tileClassName={tileClassName}
                    value={currentDate}
                    onChange={(date) => setCurrentDate(date as Date)}
                    locale="fr-FR"
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Panneau latéral - Événements du jour sélectionné */}
            <div className="lg:col-span-1">
              <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10 sticky top-6">
                <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Clock className="text-blue-400" size={20} />
                  {currentDate.toLocaleDateString('fr-FR', { 
                    weekday: 'long', 
                    day: 'numeric', 
                    month: 'long' 
                  })}
                </h4>
                
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {getEventsForDate(currentDate).map(event => (
                    <div
                      key={event.id}
                      className="bg-white/5 rounded-lg p-3 border border-white/10"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: event.location?.color }}
                        />
                        <div className="flex gap-1">
                          <button
                            onClick={() => startEditEvent(event)}
                            className="p-1 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            onClick={() => deleteEvent(event.id)}
                            className="p-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      
                      <div className="text-white font-medium text-sm mb-1">
                        {event.location?.name}
                      </div>
                      
                      <div className="text-gray-400 text-xs">
                        {event.provider_ids.map(id => getProviderName(id)).join(', ')}
                      </div>
                    </div>
                  ))}
                  
                  {getEventsForDate(currentDate).length === 0 && (
                    <div className="text-center py-8">
                      <CalendarIcon className="text-gray-400 mx-auto mb-2" size={32} />
                      <p className="text-gray-400 text-sm">Aucun événement ce jour</p>
                      <button
                        onClick={() => openEventModal(currentDate)}
                        className="mt-3 bg-blue-500/20 text-blue-400 px-3 py-1 rounded-lg text-sm hover:bg-blue-500/30 transition-colors"
                      >
                        Ajouter un événement
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'providers' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">Gestion des Prestataires</h3>
            <button
              onClick={() => setShowProviderModal(true)}
              className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center gap-2"
            >
              <Plus size={16} />
              Nouveau Prestataire
            </button>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {providers.map(provider => (
              <div
                key={provider.id}
                className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-500/20 rounded-lg p-2">
                      <User className="text-blue-400" size={20} />
                    </div>
                    <div>
                      <h4 className="text-white font-semibold">{provider.name}</h4>
                      <p className="text-gray-400 text-sm">
                        {events.filter(e => e.provider_ids.includes(provider.id)).length} événement(s)
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEditProvider(provider)}
                      className="p-2 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => deleteProvider(provider.id)}
                      className="p-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                
                <div className="text-gray-400 text-xs">
                  Créé le {new Date(provider.created_at).toLocaleDateString('fr-FR')}
                </div>
              </div>
            ))}
          </div>

          {providers.length === 0 && (
            <div className="text-center py-12">
              <Users className="text-gray-400 mx-auto mb-4" size={48} />
              <h4 className="text-white font-semibold mb-2">Aucun prestataire</h4>
              <p className="text-gray-400 mb-4">Ajoutez votre premier prestataire</p>
              <button
                onClick={() => setShowProviderModal(true)}
                className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-full font-semibold"
              >
                Ajouter un prestataire
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'locations' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">Gestion des Lieux</h3>
            <button
              onClick={() => setShowLocationModal(true)}
              className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 flex items-center gap-2"
            >
              <Plus size={16} />
              Nouveau Lieu
            </button>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {locations.map(location => (
              <div
                key={location.id}
                className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-4 h-4 rounded-full border-2 border-white/20"
                      style={{ backgroundColor: location.color }}
                    />
                    <div>
                      <h4 className="text-white font-semibold">{location.name}</h4>
                      <p className="text-gray-400 text-sm">
                        {events.filter(e => e.location_id === location.id).length} événement(s)
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEditLocation(location)}
                      className="p-2 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => deleteLocation(location.id)}
                      className="p-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                
                <div className="text-gray-400 text-xs">
                  Créé le {new Date(location.created_at).toLocaleDateString('fr-FR')}
                </div>
              </div>
            ))}
          </div>

          {locations.length === 0 && (
            <div className="text-center py-12">
              <MapPin className="text-gray-400 mx-auto mb-4" size={48} />
              <h4 className="text-white font-semibold mb-2">Aucun lieu</h4>
              <p className="text-gray-400 mb-4">Ajoutez votre premier lieu de prestation</p>
              <button
                onClick={() => setShowLocationModal(true)}
                className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-full font-semibold"
              >
                Ajouter un lieu
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal Événement */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-2xl w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">
                {editingEvent ? 'Modifier l\'événement' : 'Nouvel événement'}
              </h3>
              <button
                onClick={resetEventForm}
                className="text-gray-400 hover:text-white transition-colors text-2xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleEventSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Date de l'événement *
                </label>
                <input
                  type="date"
                  required
                  value={eventForm.event_date}
                  onChange={e => setEventForm({ ...eventForm, event_date: e.target.value })}
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-blue-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Lieu de prestation *
                </label>
                <select
                  required
                  value={eventForm.location_id}
                  onChange={e => setEventForm({ ...eventForm, location_id: e.target.value })}
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-blue-400 focus:outline-none"
                >
                  <option value="">Sélectionner un lieu</option>
                  {locations.map(location => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Prestataires assignés *
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto bg-white/5 rounded-lg p-3 border border-white/20">
                  {providers.map(provider => (
                    <label key={provider.id} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={eventForm.provider_ids.includes(provider.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEventForm({
                              ...eventForm,
                              provider_ids: [...eventForm.provider_ids, provider.id]
                            });
                          } else {
                            setEventForm({
                              ...eventForm,
                              provider_ids: eventForm.provider_ids.filter(id => id !== provider.id)
                            });
                          }
                        }}
                        className="w-4 h-4 text-blue-400 bg-white/5 border-white/20 rounded focus:ring-blue-400"
                      />
                      <span className="text-white">{provider.name}</span>
                    </label>
                  ))}
                </div>
                {eventForm.provider_ids.length === 0 && (
                  <p className="text-red-400 text-sm mt-1">Sélectionnez au moins un prestataire</p>
                )}
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center justify-center gap-2"
                >
                  <Save size={16} />
                  {editingEvent ? 'Mettre à jour' : 'Créer l\'événement'}
                </button>
                <button
                  type="button"
                  onClick={resetEventForm}
                  className="px-6 border-2 border-white/30 text-white rounded-lg font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Prestataire */}
      {showProviderModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">
                {editingProvider ? 'Modifier le prestataire' : 'Nouveau prestataire'}
              </h3>
              <button
                onClick={resetProviderForm}
                className="text-gray-400 hover:text-white transition-colors text-2xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleProviderSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nom du prestataire *
                </label>
                <input
                  type="text"
                  required
                  value={providerForm.name}
                  onChange={e => setProviderForm({ name: e.target.value })}
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                  placeholder="Ex: DJ Martin, Éclairagiste Pro..."
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300"
                >
                  {editingProvider ? 'Mettre à jour' : 'Ajouter'}
                </button>
                <button
                  type="button"
                  onClick={resetProviderForm}
                  className="px-6 border-2 border-white/30 text-white rounded-lg font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Lieu */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">
                {editingLocation ? 'Modifier le lieu' : 'Nouveau lieu'}
              </h3>
              <button
                onClick={resetLocationForm}
                className="text-gray-400 hover:text-white transition-colors text-2xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleLocationSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nom du lieu *
                </label>
                <input
                  type="text"
                  required
                  value={locationForm.name}
                  onChange={e => setLocationForm({ ...locationForm, name: e.target.value })}
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-green-400 focus:outline-none"
                  placeholder="Ex: Salle des fêtes, Château..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Couleur d'affichage *
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={locationForm.color}
                    onChange={e => setLocationForm({ ...locationForm, color: e.target.value })}
                    className="w-12 h-12 rounded-lg border border-white/20 bg-white/5"
                  />
                  <input
                    type="text"
                    value={locationForm.color}
                    onChange={e => setLocationForm({ ...locationForm, color: e.target.value })}
                    className="flex-1 bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-green-400 focus:outline-none"
                    placeholder="#3B82F6"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  className="flex-1 bg-gradient-to-r from-green-500 to-green-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300"
                >
                  {editingLocation ? 'Mettre à jour' : 'Ajouter'}
                </button>
                <button
                  type="button"
                  onClick={resetLocationForm}
                  className="px-6 border-2 border-white/30 text-white rounded-lg font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPlanningEditor;
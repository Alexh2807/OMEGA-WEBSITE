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
  Save,
  User,
  Palette,
  X,
  Layers,
  Loader2,
  BarChart2,
  Tag,
  Euro,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { exportElementAsPDF } from '../../utils/pdfGenerator';
import toast from 'react-hot-toast';

// --- Interfaces de types ---
interface Provider {
  id: string;
  name: string;
  costs: { [key: string]: number }; // key: event_type_id
  created_at: string;
}

interface EventType {
  id: string;
  name: string;
  created_at: string;
}

interface Location {
  id: string;
  name: string;
  color: string;
  event_type_id: string | null;
  event_type?: EventType;
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
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'calendar' | 'providers' | 'locations'>('calendar');
  const [selectedProvider, setSelectedProvider] = useState('all');
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [selectedEventType, setSelectedEventType] = useState('all');
  const [viewRange, setViewRange] = useState<{ start: Date; end: Date } | null>(null);
  const [numberOfMonths, setNumberOfMonths] = useState(3);
  const [multiSelectedDates, setMultiSelectedDates] = useState<string[]>([]);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const calendarRef = useRef<FullCalendar>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [selectionInfo, setSelectionInfo] = useState<{ start: Date; end: Date } | null>(null);
  const [eventForm, setEventForm] = useState({ location_id: '', provider_ids: [] as string[] });
  const [providerForm, setProviderForm] = useState<{ name: string; costs: { [key: string]: string } }>({ name: '', costs: {} });
  const [locationForm, setLocationForm] = useState({ name: '', color: '#3B82F6', event_type_id: '' });

  const toYYYYMMDD = (date: Date) => { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, '0'); const day = String(date.getDate()).padStart(2, '0'); return `${year}-${month}-${day}`; };

  const loadProviders = async () => { const { data, error } = await supabase.from('planning_providers').select('*').order('name'); if (error) toast.error('Erreur chargement prestataires'); else setProviders(data || []); };
  const loadLocations = async () => { const { data, error } = await supabase.from('planning_locations').select('*, event_type:planning_event_types(*)').order('name'); if (error) toast.error('Erreur chargement lieux'); else setLocations(data || []); };
  const loadEventTypes = async () => { const { data, error } = await supabase.from('planning_event_types').select('*').order('name'); if (error) toast.error('Erreur chargement types'); else setEventTypes(data || []); };
  const loadEvents = useCallback(async (start: Date, end: Date) => { const { data, error } = await supabase.from('planning_events').select('*, location:planning_locations(*, event_type:planning_event_types(*))').gte('event_date', toYYYYMMDD(start)).lte('event_date', toYYYYMMDD(end)); if (error) toast.error('Erreur chargement événements'); else setEvents(data || []); }, []);
  const forceRefresh = useCallback(() => { if (viewRange) { loadEvents(viewRange.start, viewRange.end); } }, [viewRange, loadEvents]);

  useEffect(() => { const loadInitialData = async () => { setLoading(true); await Promise.all([loadProviders(), loadLocations(), loadEventTypes()]); setLoading(false); }; loadInitialData(); }, []);
  useEffect(() => { forceRefresh(); }, [forceRefresh]);

  const handleGenericSubmit = async (action: any, successMessage: string): Promise<boolean> => { const { error } = await action; if (error) { console.error(error); toast.error(`Erreur: ${error.message}`); return false; } toast.success(successMessage); return true; };
  
  const handleProviderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const costsToSave: { [key: string]: number } = {};
    for (const key in providerForm.costs) { const value = parseFloat(providerForm.costs[key]); if (!isNaN(value)) { costsToSave[key] = value; } }
    const action = editingProvider ? supabase.from('planning_providers').update({ name: providerForm.name, costs: costsToSave }).eq('id', editingProvider.id) : supabase.from('planning_providers').insert({ name: providerForm.name, costs: costsToSave });
    const success = await handleGenericSubmit(action, `Prestataire ${editingProvider ? 'mis à jour' : 'ajouté'}.`);
    if (success) { loadProviders(); resetProviderForm(); }
  };

  const handleLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const action = editingLocation ? supabase.from('planning_locations').update({ ...locationForm, event_type_id: locationForm.event_type_id || null }).eq('id', editingLocation.id) : supabase.from('planning_locations').insert({ ...locationForm, event_type_id: locationForm.event_type_id || null });
    const success = await handleGenericSubmit(action, `Lieu ${editingLocation ? 'mis à jour' : 'ajouté'}.`);
    if (success) { loadLocations(); resetLocationForm(); }
  };

  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm.location_id || eventForm.provider_ids.length === 0) { return toast.error('Veuillez sélectionner un lieu et au moins un prestataire.'); }
    const eventData = { location_id: eventForm.location_id, provider_ids: eventForm.provider_ids };
    let success = false;
    if (editingEvent) {
      success = await handleGenericSubmit(supabase.from('planning_events').update(eventData).eq('id', editingEvent.id), 'Événement mis à jour !');
    } else {
      let eventsToInsert = [];
      if (selectionInfo) { let currentDate = new Date(selectionInfo.start); while (currentDate < selectionInfo.end) { eventsToInsert.push({ ...eventData, event_date: toYYYYMMDD(currentDate) }); currentDate.setDate(currentDate.getDate() + 1); } } 
      else if (multiSelectedDates.length > 0) { eventsToInsert = multiSelectedDates.map(dateStr => ({ ...eventData, event_date: dateStr })); }
      if (eventsToInsert.length > 0) { success = await handleGenericSubmit(supabase.from('planning_events').insert(eventsToInsert), `${eventsToInsert.length} événement(s) créé(s) !`); }
    }
    if (success) { forceRefresh(); resetEventForm(); }
  };

  const confirmAndDelete = async (message: string, action: any): Promise<boolean> => { if (window.confirm(message)) { return await handleGenericSubmit(action, "Suppression réussie."); } return false; };
  const deleteProvider = async (id: string) => { const success = await confirmAndDelete('Supprimer ce prestataire ?', supabase.from('planning_providers').delete().eq('id', id)); if(success) loadProviders(); };
  const deleteLocation = async (id: string) => { const success = await confirmAndDelete('Supprimer ce lieu ?', supabase.from('planning_locations').delete().eq('id', id)); if(success) loadLocations(); };
  const deleteEvent = async (id: string) => { const success = await confirmAndDelete('Supprimer cet événement ?', supabase.from('planning_events').delete().eq('id', id)); if(success) { forceRefresh(); resetEventForm(); } };

  const resetProviderForm = () => { setProviderForm({ name: '', costs: {} }); setEditingProvider(null); setShowProviderModal(false); };
  const resetLocationForm = () => { setLocationForm({ name: '', color: '#3B82F6', event_type_id: '' }); setEditingLocation(null); setShowLocationModal(false); };
  const resetEventForm = () => { setEventForm({ location_id: '', provider_ids: [] }); setEditingEvent(null); setShowEventModal(false); setSelectionInfo(null); setMultiSelectedDates([]); setIsMultiSelectMode(false); };
  
  const startEditProvider = (p: Provider) => { const costs = eventTypes.reduce((acc, et) => { acc[et.id] = p.costs?.[et.id]?.toString() || ''; return acc; }, {} as {[key: string]: string}); setProviderForm({ name: p.name, costs }); setEditingProvider(p); setShowProviderModal(true); };
  const startEditLocation = (l: Location) => { setLocationForm({ name: l.name, color: l.color, event_type_id: l.event_type_id || '' }); setEditingLocation(l); setShowLocationModal(true); };

  const handleBulkDelete = async () => { const success = await confirmAndDelete(`Supprimer les ${multiSelectedDates.length} événements ?`, supabase.from('planning_events').delete().in('event_date', multiSelectedDates)); if(success) { forceRefresh(); resetEventForm(); } };
  const handleBulkCreate = () => { if (multiSelectedDates.length > 0) { setEditingEvent(null); setSelectionInfo(null); setEventForm({ location_id: locations[0]?.id || '', provider_ids: [] }); setShowEventModal(true); } };

  const handleDatesSet = (arg: any) => setViewRange({ start: arg.start, end: arg.end });
  const handleSelect = (selectInfo: any) => { const calendarApi = calendarRef.current?.getApi(); if (!calendarApi) return; calendarApi.unselect(); if (isMultiSelectMode) { const dateStr = selectInfo.startStr; setMultiSelectedDates(prev => prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr]); return; } setMultiSelectedDates([]); setEditingEvent(null); setEventForm({ location_id: locations[0]?.id || '', provider_ids: [] }); setSelectionInfo({ start: selectInfo.start, end: selectInfo.end }); setShowEventModal(true); };
  const handleEventClick = (clickInfo: any) => { setMultiSelectedDates([]); const event = events.find(e => e.id === clickInfo.event.id); if (event) { setEditingEvent(event); setEventForm({ location_id: event.location_id, provider_ids: event.provider_ids }); setShowEventModal(true); } };
  const handleEventDrop = async (info: any) => { const { event, oldEvent } = info; const newDate = toYYYYMMDD(event.start); const eventId = event.id; setEvents(currentEvents => currentEvents.map(e => e.id === eventId ? { ...e, event_date: newDate } : e)); const { error } = await supabase.from('planning_events').update({ event_date: newDate }).eq('id', eventId); if (error) { toast.error("Le déplacement a échoué."); setEvents(currentEvents => currentEvents.map(e => e.id === eventId ? { ...e, event_date: toYYYYMMDD(oldEvent.start) } : e)); info.revert(); } };
  
  const handleExportPDF = async () => { if (isExporting) return; setIsExporting(true); const toastId = toast.loading('Génération du PDF...'); try { await exportElementAsPDF('planning-export', `planning-${toYYYYMMDD(new Date())}`); toast.success('PDF généré !', { id: toastId }); } catch (error) { console.error(error); toast.error('Échec du PDF.', { id: toastId }); } finally { setIsExporting(false); } };

  const filteredEvents = useMemo(() => events.filter(event => (selectedProvider === 'all' || event.provider_ids.includes(selectedProvider)) && (selectedLocation === 'all' || event.location_id === selectedLocation) && (selectedEventType === 'all' || event.location?.event_type_id === selectedEventType)), [events, selectedProvider, selectedLocation, selectedEventType]);
  
  const allCalendarEvents = useMemo(() => { const backgroundSelection = multiSelectedDates.map(date => ({ id: `selection-${date}`, start: date, allDay: true, display: 'background', backgroundColor: 'rgba(59, 130, 246, 0.4)' })); return [ ...filteredEvents.map(e => ({ id: e.id, title: e.location?.name || '?', start: e.event_date, allDay: true, backgroundColor: e.location?.color, borderColor: e.location?.color, extendedProps: { providers: e.provider_ids.map(id => providers.find(p => p.id === id)?.name).join(', '), eventType: e.location?.event_type?.name || 'N/A' } })), ...backgroundSelection ]; }, [filteredEvents, providers, multiSelectedDates]);

  const detailedStats = useMemo(() => {
    const eventTypeMap = new Map<string, { count: number; cost: number }>();
    const providerCostMap = new Map<string, { count: number; cost: number }>();

    filteredEvents.forEach(event => {
        const typeId = event.location?.event_type_id;
        const typeName = event.location?.event_type?.name || 'Non défini';

        let currentTypeStat = eventTypeMap.get(typeName) || { count: 0, cost: 0 };
        currentTypeStat.count += 1;

        if (typeId) {
            event.provider_ids.forEach(providerId => {
                const provider = providers.find(p => p.id === providerId);
                if (provider) {
                    const costForEvent = provider.costs?.[typeId] || 0;
                    currentTypeStat.cost += costForEvent;

                    let currentProviderStat = providerCostMap.get(provider.name) || { count: 0, cost: 0 };
                    currentProviderStat.count += 1;
                    currentProviderStat.cost += costForEvent;
                    providerCostMap.set(provider.name, currentProviderStat);
                }
            });
        }
        eventTypeMap.set(typeName, currentTypeStat);
    });

    const totalCost = Array.from(providerCostMap.values()).reduce((sum, { cost }) => sum + cost, 0);

    return {
        eventTypeStats: Array.from(eventTypeMap.entries()).sort((a, b) => b[1].count - a[1].count),
        providerCostStats: Array.from(providerCostMap.entries()).sort((a, b) => b[1].cost - a[1].cost),
        totalCost,
        totalEvents: filteredEvents.length,
    };
  }, [filteredEvents, providers]);

  const getButtonClass = (monthValue: number) => `px-3 py-1 text-sm rounded-md ${numberOfMonths === monthValue ? 'bg-blue-600 text-white' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`;

  const exportPlanningScreenshot = async (fileName: string) => {
    try {
      // Trouver l'élément du calendrier FullCalendar
      const calendarElement = document.querySelector('.fc') as HTMLElement;
      if (!calendarElement) {
        throw new Error('Calendrier non trouvé pour l\'export');
      }

      // Capturer uniquement le calendrier avec une haute qualité
      const canvas = await html2canvas(calendarElement, {
        scale: 2, // Haute résolution
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#111827', // Fond sombre cohérent
        logging: false,
        width: calendarElement.scrollWidth,
        height: calendarElement.scrollHeight,
        scrollX: 0,
        scrollY: 0,
        // Options spécifiques pour préserver le rendu exact
        foreignObjectRendering: false,
        removeContainer: false,
        letterRendering: true,
        onclone: (clonedDoc) => {
          // S'assurer que le calendrier cloné garde son apparence
          const clonedCalendar = clonedDoc.querySelector('.fc') as HTMLElement;
          if (clonedCalendar) {
            clonedCalendar.style.transform = 'none';
            clonedCalendar.style.position = 'static';
            clonedCalendar.style.overflow = 'visible';
            
            // Corriger tous les éléments de texte
            const textElements = clonedCalendar.querySelectorAll('*');
            textElements.forEach((el: any) => {
              if (el.style) {
                el.style.transform = 'none';
                el.style.lineHeight = '1.2';
                el.style.verticalAlign = 'baseline';
              }
            });
          }
        }
      });

      // Créer le PDF en format paysage pour mieux accommoder le calendrier
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      // Calculer les dimensions pour que l'image s'adapte à la page
      const canvasAspectRatio = canvas.width / canvas.height;
      let imgWidth = pageWidth - 20; // Marges de 10mm de chaque côté
      let imgHeight = imgWidth / canvasAspectRatio;
      
      // Si l'image est trop haute, ajuster selon la hauteur
      if (imgHeight > pageHeight - 20) {
        imgHeight = pageHeight - 20;
        imgWidth = imgHeight * canvasAspectRatio;
      }
      
      // Centrer l'image sur la page
      const xOffset = (pageWidth - imgWidth) / 2;
      const yOffset = (pageHeight - imgHeight) / 2;
      
      // Ajouter l'image au PDF
      const imgData = canvas.toDataURL('image/png', 1.0);
      pdf.addImage(imgData, 'PNG', xOffset, yOffset, imgWidth, imgHeight);
      
      // Ajouter un titre en haut
      pdf.setFontSize(16);
      pdf.setTextColor(0, 0, 0);
      pdf.text('Planning OMEGA - Export', pageWidth / 2, 10, { align: 'center' });
      
      // Ajouter la date d'export en bas
      pdf.setFontSize(10);
      pdf.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
      
      pdf.save(`${fileName}.pdf`);
      return true;
    } catch (error) {
      console.error('Erreur lors de la génération du PDF du planning:', error);
      throw error;
    }
  };

  const tabsConfig = [
    { id: 'calendar', label: 'Planning', icon: CalendarIcon },
    { id: 'providers', label: 'Prestataires', icon: Users },
    { id: 'locations', label: 'Lieux', icon: MapPin }
  ];

  if (loading) return <div className="flex items-center justify-center h-64 text-white text-xl">Chargement du planning...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3"><CalendarIcon className="text-blue-400" size={32} /> Planning Événementiel</h1><p className="text-gray-400">Gérez, filtrez et planifiez tous les événements à venir.</p></div>
        <button onClick={handleExportPDF} disabled={isExporting} className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">{isExporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}{isExporting ? 'Génération...' : 'Export PDF'}</button>
      </div>
      
      <div className="flex flex-wrap gap-4 border-b border-white/20">
        {tabsConfig.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-6 py-3 font-semibold transition-colors ${activeTab === tab.id ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}>
            <tab.icon size={20} /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'calendar' && (
        <div className="space-y-6">
            <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-3"><BarChart2 className="text-purple-400" /> Statistiques Détaillées (selon filtres)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="bg-white/5 p-4 rounded-lg space-y-2">
                        <div className="flex justify-between items-center"><span className="text-gray-400 text-sm">Événements affichés</span><span className="text-xl font-bold text-white">{detailedStats.totalEvents}</span></div>
                        <div className="flex justify-between items-center"><span className="text-gray-400 text-sm">Coût Total Prestataires</span><span className="text-xl font-bold text-green-400">{detailedStats.totalCost.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span></div>
                    </div>
                    <div className="bg-white/5 p-4 rounded-lg">
                        <div className="text-gray-400 text-sm mb-2">Répartition par Type</div>
                        <div className="space-y-2 text-sm max-h-24 overflow-y-auto">
                            {detailedStats.eventTypeStats.length > 0 ? detailedStats.eventTypeStats.map(([name, {count, cost}]) => (<div key={name} className="flex justify-between items-center"><span className="text-gray-300">{name}</span><div className="text-right"><span className="text-white font-bold bg-purple-500/20 px-2 py-0.5 rounded">{count}</span><span className=\"text-green-400 text-xs ml-2">({cost.toFixed(2)}€)</span></div></div>)) : <p className=\"text-gray-500 text-xs text-center py-4">Aucun événement.</p>}
                        </div>
                    </div>
                    <div className="bg-white/5 p-4 rounded-lg">
                        <div className="text-gray-400 text-sm mb-2">Coût par Prestataire</div>
                        <div className="space-y-2 text-sm max-h-24 overflow-y-auto">
                            {detailedStats.providerCostStats.length > 0 ? detailedStats.providerCostStats.map(([name, {count, cost}]) => (<div key={name} className="flex justify-between items-center"><span className="text-gray-300">{name} ({count})</span><span className="text-green-400 font-bold">{cost.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span></div>)) : <p className="text-gray-500 text-xs text-center py-4">Aucun coût enregistré.</p>}
                        </div>
                    </div>
                </div>
            </div>
            <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                  <div className="flex items-center gap-2"><Users className="text-gray-400" size={20} /><select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)} className="dark-select w-full"><option value="all">Tous les prestataires</option>{providers.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}</select></div>
                  <div className="flex items-center gap-2"><MapPin className="text-gray-400" size={20} /><select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)} className="dark-select w-full"><option value="all">Tous les lieux</option>{locations.map(l => (<option key={l.id} value={l.id}>{l.name}</option>))}</select></div>
                  <div className="flex items-center gap-2"><Tag className="text-gray-400" size={20} /><select value={selectedEventType} onChange={e => setSelectedEventType(e.target.value)} className="dark-select w-full"><option value="all">Tous les types</option>{eventTypes.map(et => (<option key={et.id} value={et.id}>{et.name}</option>))}</select></div>
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
              {multiSelectedDates.length > 0 && (<div className="sticky top-4 z-40 w-max mx-auto bg-gray-900/80 backdrop-blur-lg border border-white/20 rounded-xl shadow-2xl p-3 flex items-center gap-4 transition-all duration-300 animate-fade-in-up mb-4"><div className="flex items-center gap-2 text-white font-bold"><Layers size={20} className="text-blue-400" /><span>{multiSelectedDates.length} jour(s)</span></div><div className="h-8 w-px bg-white/20"></div><div className="flex items-center gap-2"><button onClick={handleBulkCreate} className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2 rounded-lg text-sm"><Plus size={16} /> Créer</button><button onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-500 text-white font-semibold px-4 py-2 rounded-lg text-sm"><Trash2 size={16} /> Supprimer</button><button onClick={() => { setMultiSelectedDates([]); setIsMultiSelectMode(false); }} className="bg-gray-600 hover:bg-gray-500 text-white p-2 rounded-full"><X size={16} /></button></div></div>)}
              <style>{`.calendar-container-dark{--fc-bg-color:rgba(17,24,39,0.5);--fc-border-color:rgba(255,255,255,0.1);--fc-text-color:#E5E7EB;--fc-text-secondary-color:#9CA3AF;--fc-button-bg-color:rgba(255,255,255,0.05);--fc-button-hover-bg-color:rgba(59,130,246,0.3);--fc-button-active-bg-color:rgba(59,130,246,0.4);--fc-today-bg-color:rgba(59,130,246,0.15);--fc-select-bg-color:rgba(59,130,246,0.25)}.calendar-container-dark .fc{background:var(--fc-bg-color);backdrop-filter:blur(10px);border:1px solid var(--fc-border-color);border-radius:1rem;padding:1.5rem;color:var(--fc-text-color)}.fc .fc-toolbar-title{color:#FFFFFF;font-weight:700}.fc .fc-button{background:var(--fc-button-bg-color);border:1px solid var(--fc-border-color);color:var(--fc-text-color);transition:background-color .3s;text-transform:capitalize}.fc .fc-button:hover{background:var(--fc-button-hover-bg-color)}.fc .fc-button-primary:not(:disabled).fc-button-active,.fc .fc-button-primary:not(:disabled):active{background:var(--fc-button-active-bg-color);border-color:var(--fc-button-active-bg-color)}.fc .fc-daygrid-day{border-color:var(--fc-border-color);transition:background-color .3s}.fc .fc-day-today{background-color:var(--fc-today-bg-color)!important}.fc .fc-daygrid-day-number{color:var(--fc-text-secondary-color);padding:.5em}.fc .fc-col-header-cell{background:rgba(255,255,255,0.05);color:var(--fc-text-secondary-color);border-color:var(--fc-border-color)}.fc .fc-daygrid-event{border-radius:4px;padding:2px 4px;margin-top:2px;font-size:.7rem;font-weight:500;box-shadow:0 2px 4px rgba(0,0,0,.2)}.fc .fc-daygrid-day.fc-day-future .fc-daygrid-day-number{color:var(--fc-text-color)}.fc-h-event .fc-event-main{padding:2px 4px}`}</style>
              <FullCalendar ref={calendarRef} key={`${numberOfMonths}-${providers.length}-${locations.length}-${eventTypes.length}`} plugins={[dayGridPlugin, interactionPlugin]} initialView="dayGrid" duration={{ months: numberOfMonths }} locale="fr" weekends={true} events={allCalendarEvents} headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }} buttonText={{ today: "Aujourd'hui" }} editable={true} selectable={true} selectMirror={true} dayMaxEvents={2} datesSet={handleDatesSet} select={handleSelect} eventClick={handleEventClick} eventDrop={handleEventDrop} eventContent={info => (<div className="p-1 overflow-hidden text-white text-[11px] h-full cursor-pointer"><div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor: info.event.backgroundColor}}></div><b className="truncate block">{info.event.title}</b></div><p className="truncate italic opacity-80 pl-3.5">{info.event.extendedProps.eventType}</p><p className="truncate italic opacity-60 pl-3.5">{info.event.extendedProps.providers}</p></div>)} />
            </div>
        </div>
      )}
      
      {activeTab === 'providers' && ( <div className="space-y-6"> <div className="flex items-center justify-between"><h3 className="text-xl font-bold text-white">Gestion des Prestataires</h3><button onClick={() => { setEditingProvider(null); setProviderForm({ name: '', costs: {} }); setShowProviderModal(true); }} className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center gap-2"><Plus size={16}/> Nouveau</button></div> <div className=\"grid md:grid-cols-2 lg:grid-cols-3 gap-4"> {providers.map(p=>(<div key={p.id} className=\"bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10"><div className=\"flex items-center justify-between"><div className=\"flex items-center gap-3"><div className=\"bg-blue-500/20 rounded-lg p-2"><User className=\"text-blue-400" size={20}/></div><div><h4 className=\"text-white font-semibold">{p.name}</h4><p className=\"text-gray-400 text-sm">{events.filter(e=>e.provider_ids.includes(p.id)).length} événement(s)</p></div></div><div className=\"flex gap-1"><button onClick={()=>startEditProvider(p)} className=\"p-2 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30"><Edit3 size={14}/></button><button onClick={()=>deleteProvider(p.id)} className=\"p-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"><Trash2 size={14}/></button></div></div></div>))} </div> {providers.length===0&&(<div className=\"text-center py-12"><Users className=\"text-gray-400 mx-auto mb-4" size={48}/><h4 className=\"text-white font-semibold mb-2">Aucun prestataire</h4><button onClick={()=>setShowProviderModal(true)} className=\"bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-full font-semibold">Ajouter un prestataire</button></div>)} </div> )}
      {activeTab === 'locations' && ( <div className="space-y-6"> <div className="flex items-center justify-between"><h3 className="text-xl font-bold text-white">Gestion des Lieux</h3><button onClick={() => { setEditingLocation(null); setLocationForm({ name: '', color: '#3B82F6', event_type_id: '' }); setShowLocationModal(true); }} className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 flex items-center gap-2"><Plus size={16}/> Nouveau</button></div> <div className=\"grid md:grid-cols-2 lg:grid-cols-3 gap-4"> {locations.map(l=>(<div key={l.id} className=\"bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10"><div className=\"flex items-center justify-between"><div className=\"flex items-center gap-3"><div className=\"w-4 h-4 rounded-full border-2 border-white/20 flex-shrink-0" style={{backgroundColor: l.color}}/><div><h4 className=\"text-white font-semibold">{l.name}</h4><p className=\"text-gray-400 text-sm">{l.event_type?.name || 'Type non défini'}</p></div></div><div className=\"flex gap-1"><button onClick={()=>startEditLocation(l)} className=\"p-2 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"><Edit3 size={14}/></button><button onClick={()=>deleteLocation(l.id)} className=\"p-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"><Trash2 size={14}/></button></div></div></div>))} </div> {locations.length===0&&(<div className=\"text-center py-12"><MapPin className=\"text-gray-400 mx-auto mb-4" size={48}/><h4 className=\"text-white font-semibold mb-2">Aucun lieu</h4><button onClick={()=>setShowLocationModal(true)} className=\"bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-full font-semibold">Ajouter un lieu</button></div>)} </div> )}
      
      {showEventModal && ( <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"> <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-2xl w-full"> <div className="flex items-center justify-between mb-6"><h3 className="text-2xl font-bold text-white">{editingEvent ? `Modifier: ${new Date(editingEvent.event_date + 'T00:00:00').toLocaleDateString('fr-FR')}` : 'Nouvel événement'}</h3><button onClick={resetEventForm} className="text-gray-400 hover:text-white text-2xl">×</button></div> {!editingEvent&&selectionInfo&&(<p className="text-center text-blue-300 mb-4 bg-blue-500/10 py-2 rounded-lg">Création du {toYYYYMMDD(selectionInfo.start)} au {toYYYYMMDD(new Date(selectionInfo.end.getTime()-864e5))}</p>)} {!editingEvent && multiSelectedDates.length > 0 && (<p className=\"text-center text-blue-300 mb-4 bg-blue-500/10 py-2 rounded-lg">Création sur <b>{multiSelectedDates.length} dates</b></p>)} <form onSubmit={handleEventSubmit} className=\"space-y-6"> <div><label className=\"block text-sm font-medium text-gray-300 mb-2">Lieu *</label><select required value={eventForm.location_id} onChange={e=>setEventForm({...eventForm, location_id:e.target.value})} className=\"dark-select w-full"><option value="">Sélectionner un lieu</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name} ({l.event_type?.name || 'N/A'})</option>)}</select></div> <div><label className=\"block text-sm font-medium text-gray-300 mb-2">Prestataires *</label><div className=\"space-y-2 max-h-40 overflow-y-auto bg-white/5 rounded-lg p-3 border border-white/20">{providers.map(p=>(<label key={p.id} className=\"flex items-center gap-3 cursor-pointer"><input type=\"checkbox" checked={eventForm.provider_ids.includes(p.id)} onChange={e=>{const newIds=e.target.checked?[...eventForm.provider_ids, p.id]:eventForm.provider_ids.filter(id=>id!==p.id);setEventForm({...eventForm, provider_ids: newIds})}} className="w-4 h-4 text-blue-400 bg-white/5 border-white/20 rounded focus:ring-blue-400"/><span className="text-white">{p.name}</span></label>))}</div></div> <div className="flex gap-4"> <button type="submit" className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2"><Save size={16}/>{editingEvent?'Mettre à jour':'Créer'}</button> {editingEvent&&(<button type="button" onClick={()=>deleteEvent(editingEvent.id)} className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2"><Trash2 size={16}/>Supprimer</button>)} </div> </form> </div> </div> )}
      {showProviderModal && ( <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"> <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-md w-full max-h-[90vh] overflow-y-auto"> <div className="flex items-center justify-between mb-6"><h3 className="text-2xl font-bold text-white">{editingProvider ? 'Modifier prestataire' : 'Nouveau prestataire'}</h3><button onClick={resetProviderForm} className="text-gray-400 hover:text-white text-2xl">×</button></div> <form onSubmit={handleProviderSubmit} className="space-y-6"> <div><label className="block text-sm font-medium text-gray-300 mb-2">Nom *</label><input type="text" required value={providerForm.name} onChange={e=>setProviderForm(f => ({...f, name: e.target.value}))} className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400" placeholder="Ex: DJ Martin"/></div> <div><label className="block text-sm font-medium text-gray-300 mb-2">Coûts par type de soirée (€)</label><div className="space-y-3 bg-white/5 p-3 rounded-lg border border-white/20">{eventTypes.map(et => (<div key={et.id} className="grid grid-cols-3 items-center gap-2"><label htmlFor={`cost-${et.id}`} className="text-sm text-gray-300 col-span-2">{et.name}</label><input id={`cost-${et.id}`} type="number" step="0.01" value={providerForm.costs[et.id] || ''} onChange={e => setProviderForm(f => ({...f, costs: {...f.costs, [et.id]: e.target.value}}))} className="col-span-1 w-full bg-white/10 border border-white/20 rounded-md px-2 py-1 text-white placeholder-gray-400 focus:border-blue-400 text-right" placeholder=\"0.00"/></div>))}</div></div> <div className="flex gap-4"><button type="submit" className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 rounded-lg font-semibold">{editingProvider ? 'Mettre à jour' : 'Ajouter'}</button><button type="button" onClick={resetProviderForm} className="px-6 border-2 border-white/30 text-white rounded-lg font-semibold">Annuler</button></div> </form> </div> </div> )}
      {showLocationModal && ( <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"> <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-md w-full"> <div className="flex items-center justify-between mb-6"><h3 className="text-2xl font-bold text-white">{editingLocation ? 'Modifier le lieu' : 'Nouveau lieu'}</h3><button onClick={resetLocationForm} className="text-gray-400 hover:text-white text-2xl">×</button></div> <form onSubmit={handleLocationSubmit} className="space-y-6"> <div><label className="block text-sm font-medium text-gray-300 mb-2">Nom *</label><input type="text" required value={locationForm.name} onChange={e=>setLocationForm({...locationForm, name: e.target.value})} className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-blue-400" placeholder="Ex: Salle des fêtes"/></div> <div><label className="block text-sm font-medium text-gray-300 mb-2">Type de soirée par défaut *</label><select required value={locationForm.event_type_id} onChange={e => setLocationForm({...locationForm, event_type_id: e.target.value})} className="dark-select w-full"><option value="">Sélectionner un type</option>{eventTypes.map(et => (<option key={et.id} value={et.id}>{et.name}</option>))}</select></div> <div><label className="block text-sm font-medium text-gray-300 mb-2">Couleur *</label><div className="flex items-center gap-3"><input type="color" value={locationForm.color} onChange={e=>setLocationForm({...locationForm, color: e.target.value})} className="w-12 h-12 rounded-lg border border-white/20 bg-white/5"/><input type=\"text" value={locationForm.color} onChange={e=>setLocationForm({...locationForm, color: e.target.value})} className="flex-1 bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-green-400\" placeholder="#3B82F6"/></div></div> <div className="flex gap-4"><button type="submit" className="flex-1 bg-gradient-to-r from-green-500 to-green-600 text-white py-3 rounded-lg font-semibold">{editingLocation?'Mettre à jour':'Ajouter'}</button><button type="button" onClick={resetLocationForm} className="px-6 border-2 border-white/30 text-white rounded-lg font-semibold">Annuler</button></div> </form> </div> </div> )}
    </div>
  );
};

export default AdminPlanningEditor;
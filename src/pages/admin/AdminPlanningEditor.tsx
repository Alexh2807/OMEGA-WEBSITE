import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { exportElementAsPDF } from '../../utils/pdfGenerator';
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
  X,
  Layers,
  Loader2,
  BarChart2,
  Tag,
  Clock,
  Euro,
  Eye,
  Copy,
  Zap,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

// --- Interfaces de types ---
interface Provider {
  id: string;
  name: string;
  costs: { [key: string]: number };
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

// --- Composant pour les événements enrichis ---
const EnhancedEventContent = ({ eventInfo }: { eventInfo: any }) => {
  const providers = eventInfo.event.extendedProps.providers;
  const eventType = eventInfo.event.extendedProps.eventType;
  const cost = eventInfo.event.extendedProps.cost;
  
  return (
    <div className="p-1.5 overflow-hidden text-white text-[10px] h-full cursor-pointer group hover:scale-105 transition-transform duration-200">
      <div className="flex items-center gap-1.5 mb-1">
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm"
          style={{ backgroundColor: eventInfo.event.backgroundColor }}
        />
        <b className="truncate block font-semibold">{eventInfo.event.title}</b>
      </div>
      
      <div className="space-y-0.5 pl-4">
        <div className="flex items-center gap-1">
          <Tag size={8} className="opacity-70" />
          <span className="truncate italic opacity-90 text-[9px]">{eventType}</span>
        </div>
        
        <div className="flex items-center gap-1">
          <Users size={8} className="opacity-70" />
          <span className="truncate italic opacity-80 text-[9px]">{providers}</span>
        </div>
        
        {cost > 0 && (
          <div className="flex items-center gap-1">
            <Euro size={8} className="opacity-70" />
            <span className="truncate font-medium text-green-300 text-[9px]">{cost}€</span>
          </div>
        )}
      </div>
      
      {/* Indicateur hover */}
      <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded pointer-events-none" />
    </div>
  );
};

// --- Composant pour les statistiques en temps réel ---
const LiveStats = ({ stats }: { stats: any }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
    <div className="bg-white/5 p-4 rounded-lg border border-white/10 hover:border-blue-400/30 transition-all duration-300">
      <div className="flex justify-between items-center">
        <span className="text-gray-400 text-sm flex items-center gap-2">
          <CalendarIcon size={16} />
          Événements affichés
        </span>
        <span className="text-2xl font-bold text-white">{stats.totalEvents}</span>
      </div>
    </div>
    
    <div className="bg-white/5 p-4 rounded-lg border border-white/10 hover:border-green-400/30 transition-all duration-300">
      <div className="flex justify-between items-center">
        <span className="text-gray-400 text-sm flex items-center gap-2">
          <Euro size={16} />
          Coût Total
        </span>
        <span className="text-2xl font-bold text-green-400">
          {stats.totalCost.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
        </span>
      </div>
    </div>
    
    <div className="bg-white/5 p-4 rounded-lg border border-white/10 hover:border-purple-400/30 transition-all duration-300">
      <div className="flex justify-between items-center">
        <span className="text-gray-400 text-sm flex items-center gap-2">
          <Users size={16} />
          Prestataires actifs
        </span>
        <span className="text-2xl font-bold text-purple-400">
          {stats.activeProviders}
        </span>
      </div>
    </div>
  </div>
);

// --- Composant principal ---
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; event?: any; date?: string } | null>(null);
  const [optimisticUpdates, setOptimisticUpdates] = useState<Set<string>>(new Set());
  const [loadingStates, setLoadingStates] = useState<{ [key: string]: boolean }>({});
  const calendarRef = useRef<FullCalendar>(null);
  
  // États des modales
  const [showEventModal, setShowEventModal] = useState(false);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [selectionInfo, setSelectionInfo] = useState<{ start: Date; end: Date } | null>(null);
  
  // États des formulaires
  const [eventForm, setEventForm] = useState({ location_id: '', provider_ids: [] as string[] });
  const [providerForm, setProviderForm] = useState<{ name: string; costs: { [key: string]: string } }>({ name: '', costs: {} });
  const [locationForm, setLocationForm] = useState({ name: '', color: '#3B82F6', event_type_id: '' });
  
  // États pour la validation en temps réel
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

  const toYYYYMMDD = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // --- Fonctions de chargement avec mise en cache ---
  const loadProviders = useCallback(async () => {
    setLoadingStates(prev => ({ ...prev, providers: true }));
    try {
      const { data, error } = await supabase.from('planning_providers').select('*').order('name');
      if (error) {
        toast.error('Erreur chargement prestataires');
        console.error(error);
      } else {
        setProviders(data || []);
      }
    } finally {
      setLoadingStates(prev => ({ ...prev, providers: false }));
    }
  }, []);

  const loadLocations = useCallback(async () => {
    setLoadingStates(prev => ({ ...prev, locations: true }));
    try {
      const { data, error } = await supabase
        .from('planning_locations')
        .select('*, event_type:planning_event_types(*)')
        .order('name');
      if (error) {
        toast.error('Erreur chargement lieux');
        console.error(error);
      } else {
        setLocations(data || []);
      }
    } finally {
      setLoadingStates(prev => ({ ...prev, locations: false }));
    }
  }, []);

  const loadEventTypes = useCallback(async () => {
    setLoadingStates(prev => ({ ...prev, eventTypes: true }));
    try {
      const { data, error } = await supabase.from('planning_event_types').select('*').order('name');
      if (error) {
        toast.error('Erreur chargement types');
        console.error(error);
      } else {
        setEventTypes(data || []);
      }
    } finally {
      setLoadingStates(prev => ({ ...prev, eventTypes: false }));
    }
  }, []);

  const loadEvents = useCallback(async (start: Date, end: Date) => {
    setLoadingStates(prev => ({ ...prev, events: true }));
    try {
      const { data, error } = await supabase
        .from('planning_events')
        .select('*, location:planning_locations(*, event_type:planning_event_types(*))')
        .gte('event_date', toYYYYMMDD(start))
        .lte('event_date', toYYYYMMDD(end));
      if (error) {
        toast.error('Erreur chargement événements');
        console.error(error);
      } else {
        setEvents(data || []);
      }
    } finally {
      setLoadingStates(prev => ({ ...prev, events: false }));
    }
  }, []);

  // --- Mise à jour optimiste ---
  const withOptimisticUpdate = async (id: string, action: () => Promise<any>, rollback?: () => void) => {
    setOptimisticUpdates(prev => new Set(prev).add(id));
    try {
      await action();
    } catch (error) {
      if (rollback) rollback();
      throw error;
    } finally {
      setOptimisticUpdates(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    }
  };

  // --- Abonnements temps réel ---
  useEffect(() => {
    const subscriptions = [
      supabase
        .channel('planning_events_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'planning_events' }, () => {
          if (viewRange) loadEvents(viewRange.start, viewRange.end);
        })
        .subscribe(),
      
      supabase
        .channel('planning_providers_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'planning_providers' }, loadProviders)
        .subscribe(),
      
      supabase
        .channel('planning_locations_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'planning_locations' }, loadLocations)
        .subscribe(),
    ];

    return () => {
      subscriptions.forEach(sub => sub.unsubscribe());
    };
  }, [viewRange, loadEvents, loadProviders, loadLocations]);

  // --- Validation en temps réel ---
  const validateEventForm = useCallback(() => {
    const errors: { [key: string]: string } = {};
    if (!eventForm.location_id) errors.location = 'Lieu requis';
    if (eventForm.provider_ids.length === 0) errors.providers = 'Au moins un prestataire requis';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [eventForm]);

  const validateProviderForm = useCallback(() => {
    const errors: { [key: string]: string } = {};
    if (!providerForm.name.trim()) errors.name = 'Nom requis';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [providerForm]);

  const validateLocationForm = useCallback(() => {
    const errors: { [key: string]: string } = {};
    if (!locationForm.name.trim()) errors.name = 'Nom requis';
    if (!locationForm.event_type_id) errors.eventType = 'Type requis';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [locationForm]);

  // --- Gestionnaires d'événements améliorés ---
  const handleGenericSubmit = async (action: any, successMessage: string): Promise<boolean> => {
    const { error } = await action;
    if (error) {
      console.error(error);
      toast.error(`Erreur: ${error.message}`);
      return false;
    }
    toast.success(successMessage);
    return true;
  };

  const handleProviderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateProviderForm()) return;

    const costsToSave: { [key: string]: number } = {};
    for (const key in providerForm.costs) {
      const value = parseFloat(providerForm.costs[key]);
      if (!isNaN(value)) {
        costsToSave[key] = value;
      }
    }

    const optimisticId = editingProvider?.id || 'new-provider';
    
    await withOptimisticUpdate(
      optimisticId,
      async () => {
        const action = editingProvider
          ? supabase.from('planning_providers').update({ name: providerForm.name, costs: costsToSave }).eq('id', editingProvider.id)
          : supabase.from('planning_providers').insert({ name: providerForm.name, costs: costsToSave });
        
        const success = await handleGenericSubmit(action, `Prestataire ${editingProvider ? 'mis à jour' : 'ajouté'}.`);
        if (success) {
          resetProviderForm();
        }
      }
    );
  };

  const handleLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateLocationForm()) return;

    const optimisticId = editingLocation?.id || 'new-location';
    
    await withOptimisticUpdate(
      optimisticId,
      async () => {
        const action = editingLocation
          ? supabase
              .from('planning_locations')
              .update({ ...locationForm, event_type_id: locationForm.event_type_id || null })
              .eq('id', editingLocation.id)
          : supabase.from('planning_locations').insert({ ...locationForm, event_type_id: locationForm.event_type_id || null });
        
        const success = await handleGenericSubmit(action, `Lieu ${editingLocation ? 'mis à jour' : 'ajouté'}.`);
        if (success) {
          resetLocationForm();
        }
      }
    );
  };

  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEventForm()) return;

    const eventData = { location_id: eventForm.location_id, provider_ids: eventForm.provider_ids };
    
    await withOptimisticUpdate(
      editingEvent?.id || 'new-event',
      async () => {
        if (editingEvent) {
          const success = await handleGenericSubmit(
            supabase.from('planning_events').update(eventData).eq('id', editingEvent.id),
            'Événement mis à jour !'
          );
          if (success) resetEventForm();
        } else {
          let eventsToInsert: any[] = [];
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
            const success = await handleGenericSubmit(
              supabase.from('planning_events').insert(eventsToInsert),
              `${eventsToInsert.length} événement(s) créé(s) !`
            );
            if (success) resetEventForm();
          }
        }
      }
    );
  };

  // --- Fonctions de suppression avec confirmation améliorée ---
  const confirmAndDelete = async (message: string, action: any): Promise<boolean> => {
    if (window.confirm(message)) {
      return await handleGenericSubmit(action, 'Suppression réussie.');
    }
    return false;
  };

  const deleteProvider = async (id: string) => {
    await withOptimisticUpdate(
      id,
      async () => {
        const success = await confirmAndDelete('Supprimer ce prestataire ?', supabase.from('planning_providers').delete().eq('id', id));
        if (success) {
          setProviders(prev => prev.filter(p => p.id !== id));
        }
      }
    );
  };

  const deleteLocation = async (id: string) => {
    await withOptimisticUpdate(
      id,
      async () => {
        const success = await confirmAndDelete('Supprimer ce lieu ?', supabase.from('planning_locations').delete().eq('id', id));
        if (success) {
          setLocations(prev => prev.filter(l => l.id !== id));
        }
      }
    );
  };

  const deleteEvent = async (id: string) => {
    await withOptimisticUpdate(
      id,
      async () => {
        const success = await confirmAndDelete('Supprimer cet événement ?', supabase.from('planning_events').delete().eq('id', id));
        if (success) {
          setEvents(prev => prev.filter(e => e.id !== id));
          resetEventForm();
        }
      }
    );
  };

  // --- Fonctions de réinitialisation ---
  const resetProviderForm = () => {
    setProviderForm({ name: '', costs: {} });
    setEditingProvider(null);
    setShowProviderModal(false);
    setFormErrors({});
  };

  const resetLocationForm = () => {
    setLocationForm({ name: '', color: '#3B82F6', event_type_id: '' });
    setEditingLocation(null);
    setShowLocationModal(false);
    setFormErrors({});
  };

  const resetEventForm = () => {
    setEventForm({ location_id: '', provider_ids: [] });
    setEditingEvent(null);
    setShowEventModal(false);
    setSelectionInfo(null);
    setMultiSelectedDates([]);
    setIsMultiSelectMode(false);
    setFormErrors({});
  };

  // --- Fonctions d'édition ---
  const startEditProvider = (p: Provider) => {
    const costs = eventTypes.reduce((acc, et) => {
      acc[et.id] = p.costs?.[et.id]?.toString() || '';
      return acc;
    }, {} as { [key: string]: string });
    setProviderForm({ name: p.name, costs });
    setEditingProvider(p);
    setShowProviderModal(true);
  };

  const startEditLocation = (l: Location) => {
    setLocationForm({ name: l.name, color: l.color, event_type_id: l.event_type_id || '' });
    setEditingLocation(l);
    setShowLocationModal(true);
  };

  // --- Gestion du menu contextuel ---
  const handleContextMenu = (e: React.MouseEvent, event?: any, date?: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, event, date });
  };

  const closeContextMenu = () => setContextMenu(null);

  // --- Gestionnaires FullCalendar améliorés ---
  const handleBulkDelete = async () => {
    if (multiSelectedDates.length === 0) return;
    
    await withOptimisticUpdate(
      'bulk-delete',
      async () => {
        const success = await confirmAndDelete(
          `Supprimer les ${multiSelectedDates.length} événements ?`,
          supabase.from('planning_events').delete().in('event_date', multiSelectedDates)
        );
        if (success) {
          setEvents(prev => prev.filter(e => !multiSelectedDates.includes(e.event_date)));
          resetEventForm();
        }
      }
    );
  };

  const handleBulkCreate = () => {
    if (multiSelectedDates.length > 0) {
      setEditingEvent(null);
      setSelectionInfo(null);
      setEventForm({ location_id: locations[0]?.id || '', provider_ids: [] });
      setShowEventModal(true);
    }
  };

  const handleDatesSet = (arg: any) => setViewRange({ start: arg.start, end: arg.end });

  const handleSelect = (selectInfo: any) => {
    const calendarApi = calendarRef.current?.getApi();
    if (!calendarApi) return;
    calendarApi.unselect();
    
    if (isMultiSelectMode) {
      const dateStr = selectInfo.startStr;
      setMultiSelectedDates(prev => 
        prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr]
      );
      return;
    }
    
    setMultiSelectedDates([]);
    setEditingEvent(null);
    setEventForm({ location_id: locations[0]?.id || '', provider_ids: [] });
    setSelectionInfo({ start: selectInfo.start, end: selectInfo.end });
    setShowEventModal(true);
  };

  const handleEventClick = (clickInfo: any) => {
    setMultiSelectedDates([]);
    const event = events.find(e => e.id === clickInfo.event.id);
    if (event) {
      setEditingEvent(event);
      setEventForm({ location_id: event.location_id, provider_ids: event.provider_ids });
      setShowEventModal(true);
    }
  };

  const handleEventDrop = async (info: any) => {
    const { event, oldEvent } = info;
    const newDate = toYYYYMMDD(event.start);
    const eventId = event.id;
    
    // Mise à jour optimiste
    setEvents(currentEvents => 
      currentEvents.map(e => e.id === eventId ? { ...e, event_date: newDate } : e)
    );
    
    try {
      const { error } = await supabase.from('planning_events').update({ event_date: newDate }).eq('id', eventId);
      if (error) {
        throw error;
      }
      toast.success('Événement déplacé avec succès');
    } catch (error) {
      toast.error('Le déplacement a échoué.');
      setEvents(currentEvents =>
        currentEvents.map(e => e.id === eventId ? { ...e, event_date: toYYYYMMDD(oldEvent.start) } : e)
      );
      info.revert();
    }
  };

  // --- Export PDF amélioré ---
  const exportPlanningScreenshot = async (fileName: string) => {
    const calendarElement = document.querySelector('.fc') as HTMLElement;
    if (!calendarElement) {
      throw new Error('Calendrier non trouvé');
    }

    // Attendre que les polices soient chargées
    if ((document as any).fonts?.ready) {
      await (document as any).fonts.ready;
    }

    const canvas = await html2canvas(calendarElement, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#111827',
      logging: false,
      allowTaint: true,
      onclone: (clonedDoc) => {
        // Stabiliser les styles pour la capture
        const clonedCalendar = clonedDoc.querySelector('.fc') as HTMLElement;
        if (clonedCalendar) {
          clonedCalendar.style.transform = 'none';
          clonedCalendar.style.transition = 'none';
          clonedCalendar.style.animation = 'none';
        }
      },
    });

    // Créer le PDF
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF('l', 'mm', 'a4');
    
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    
    const availableWidth = pageWidth - (margin * 2);
    const availableHeight = pageHeight - (margin * 2);
    
    const imgAspectRatio = canvas.width / canvas.height;
    let imgWidth = availableWidth;
    let imgHeight = imgWidth / imgAspectRatio;
    
    if (imgHeight > availableHeight) {
      imgHeight = availableHeight;
      imgWidth = imgHeight * imgAspectRatio;
    }
    
    const x = (pageWidth - imgWidth) / 2;
    const y = (pageHeight - imgHeight) / 2;
    
    pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
    pdf.save(`${fileName}.pdf`);
    return true;
  };

  const handleExportPDF = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const toastId = toast.loading('📸 Capture du planning en cours...');
    
    try {
      await exportPlanningScreenshot(`planning-${toYYYYMMDD(new Date())}`);
      toast.success('📄 PDF généré avec succès !', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('❌ Échec de la génération PDF', { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  // --- Chargement initial ---
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      await Promise.all([loadProviders(), loadLocations(), loadEventTypes()]);
      setLoading(false);
    };
    loadInitialData();
  }, [loadProviders, loadLocations, loadEventTypes]);

  useEffect(() => {
    if (viewRange) {
      loadEvents(viewRange.start, viewRange.end);
    }
  }, [viewRange, loadEvents]);

  // --- Fermeture du menu contextuel ---
  useEffect(() => {
    const handleClickOutside = () => closeContextMenu();
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // --- Calculs des statistiques ---
  const filteredEvents = useMemo(
    () =>
      events.filter(
        event =>
          (selectedProvider === 'all' || event.provider_ids.includes(selectedProvider)) &&
          (selectedLocation === 'all' || event.location_id === selectedLocation) &&
          (selectedEventType === 'all' || event.location?.event_type_id === selectedEventType)
      ),
    [events, selectedProvider, selectedLocation, selectedEventType]
  );

  const detailedStats = useMemo(() => {
    const eventTypeMap = new Map<string, { count: number; cost: number }>();
    const providerCostMap = new Map<string, { count: number; cost: number }>();
    const activeProviders = new Set<string>();

    filteredEvents.forEach(event => {
      const typeId = event.location?.event_type_id;
      const typeName = event.location?.event_type?.name || 'Non défini';

      let currentTypeStat = eventTypeMap.get(typeName) || { count: 0, cost: 0 };
      currentTypeStat.count += 1;

      if (typeId) {
        event.provider_ids.forEach(providerId => {
          activeProviders.add(providerId);
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
      activeProviders: activeProviders.size,
    };
  }, [filteredEvents, providers]);

  // --- Événements du calendrier ---
  const allCalendarEvents = useMemo(() => {
    const backgroundSelection = multiSelectedDates.map(date => ({
      id: `selection-${date}`,
      start: date,
      allDay: true,
      display: 'background',
      backgroundColor: 'rgba(59, 130, 246, 0.4)',
      classNames: ['animate-pulse'],
    }));

    return [
      ...filteredEvents.map(e => {
        const eventProviders = e.provider_ids.map(id => providers.find(p => p.id === id)?.name).filter(Boolean);
        const eventCost = e.location?.event_type_id 
          ? e.provider_ids.reduce((sum, pid) => {
              const provider = providers.find(p => p.id === pid);
              return sum + (provider?.costs?.[e.location!.event_type_id!] || 0);
            }, 0)
          : 0;

        return {
          id: e.id,
          title: e.location?.name || '?',
          start: e.event_date,
          allDay: true,
          backgroundColor: e.location?.color || '#3B82F6',
          borderColor: e.location?.color || '#3B82F6',
          classNames: optimisticUpdates.has(e.id) ? ['opacity-50', 'animate-pulse'] : [],
          extendedProps: {
            providers: eventProviders.join(', ') || 'Aucun',
            eventType: e.location?.event_type?.name || 'N/A',
            cost: eventCost,
          },
        };
      }),
      ...backgroundSelection,
    ];
  }, [filteredEvents, providers, multiSelectedDates, optimisticUpdates]);

  const getButtonClass = (monthValue: number) =>
    `px-4 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
      numberOfMonths === monthValue 
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' 
        : 'bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white'
    }`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white text-xl flex items-center gap-3">
          <Loader2 className="animate-spin" size={24} />
          Chargement du planning...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <CalendarIcon className="text-blue-400" size={32} />
            Planning Événementiel
          </h1>
          <p className="text-gray-400">
            Gérez, filtrez et planifiez tous les événements à venir avec une interface moderne et intuitive.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              loadProviders();
              loadLocations();
              loadEventTypes();
              if (viewRange) loadEvents(viewRange.start, viewRange.end);
            }}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Actualiser
          </button>
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
            {isExporting ? 'Génération...' : 'Export PDF'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 border-b border-white/20">
        {[
          { id: 'calendar', label: 'Planning', icon: CalendarIcon },
          { id: 'providers', label: 'Prestataires', icon: Users },
          { id: 'locations', label: 'Lieux', icon: MapPin },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-200 ${
              activeTab === tab.id 
                ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-400/5' 
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <tab.icon size={20} />
            {tab.label}
            {loadingStates[tab.id] && <Loader2 className="animate-spin" size={14} />}
          </button>
        ))}
      </div>

      {activeTab === 'calendar' && (
        <div className="space-y-6">
          {/* Statistiques en temps réel */}
          <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
              <BarChart2 className="text-purple-400" />
              Statistiques en Temps Réel
            </h3>
            <LiveStats stats={detailedStats} />
            
            {/* Détails par type et prestataire */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                <div className="text-gray-400 text-sm mb-3 flex items-center gap-2">
                  <Tag size={16} />
                  Répartition par Type d'Événement
                </div>
                <div className="space-y-2 text-sm max-h-32 overflow-y-auto">
                  {detailedStats.eventTypeStats.length > 0 ? (
                    detailedStats.eventTypeStats.map(([name, { count, cost }]) => (
                      <div key={name} className="flex justify-between items-center p-2 bg-white/5 rounded hover:bg-white/10 transition-colors">
                        <span className="text-gray-300">{name}</span>
                        <div className="text-right">
                          <span className="text-white font-bold bg-purple-500/20 px-2 py-1 rounded text-xs">
                            {count} événement{count > 1 ? 's' : ''}
                          </span>
                          <div className="text-green-400 text-xs mt-1">
                            {cost.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-xs text-center py-4">Aucun événement.</p>
                  )}
                </div>
              </div>
              
              <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                <div className="text-gray-400 text-sm mb-3 flex items-center gap-2">
                  <Users size={16} />
                  Coût par Prestataire
                </div>
                <div className="space-y-2 text-sm max-h-32 overflow-y-auto">
                  {detailedStats.providerCostStats.length > 0 ? (
                    detailedStats.providerCostStats.map(([name, { count, cost }]) => (
                      <div key={name} className="flex justify-between items-center p-2 bg-white/5 rounded hover:bg-white/10 transition-colors">
                        <span className="text-gray-300">
                          {name} ({count})
                        </span>
                        <span className="text-green-400 font-bold">
                          {cost.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-xs text-center py-4">Aucun coût enregistré.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Filtres améliorés */}
          <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              <div className="flex items-center gap-2">
                <Users className="text-gray-400" size={20} />
                <select 
                  value={selectedProvider} 
                  onChange={e => setSelectedProvider(e.target.value)} 
                  className="dark-select w-full transition-all duration-200 hover:border-blue-400/50"
                >
                  <option value="all">Tous les prestataires</option>
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <MapPin className="text-gray-400" size={20} />
                <select 
                  value={selectedLocation} 
                  onChange={e => setSelectedLocation(e.target.value)} 
                  className="dark-select w-full transition-all duration-200 hover:border-green-400/50"
                >
                  <option value="all">Tous les lieux</option>
                  {locations.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <Tag className="text-gray-400" size={20} />
                <select 
                  value={selectedEventType} 
                  onChange={e => setSelectedEventType(e.target.value)} 
                  className="dark-select w-full transition-all duration-200 hover:border-purple-400/50"
                >
                  <option value="all">Tous les types</option>
                  {eventTypes.map(et => (
                    <option key={et.id} value={et.id}>
                      {et.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex justify-between items-center mt-6">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsMultiSelectMode(prev => !prev)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                    isMultiSelectMode 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' 
                      : 'bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white'
                  }`}
                >
                  <Layers size={16} />
                  Sélection Multiple
                  {isMultiSelectMode && <Zap size={14} className="animate-pulse" />}
                </button>
                
                {multiSelectedDates.length > 0 && (
                  <div className="flex items-center gap-2 text-blue-400 font-medium">
                    <CheckCircle size={16} />
                    {multiSelectedDates.length} date{multiSelectedDates.length > 1 ? 's' : ''} sélectionnée{multiSelectedDates.length > 1 ? 's' : ''}
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-300">Vue:</span>
                <button onClick={() => setNumberOfMonths(1)} className={getButtonClass(1)}>
                  1 Mois
                </button>
                <button onClick={() => setNumberOfMonths(3)} className={getButtonClass(3)}>
                  3 Mois
                </button>
                <button onClick={() => setNumberOfMonths(6)} className={getButtonClass(6)}>
                  6 Mois
                </button>
              </div>
            </div>
          </div>

          {/* Barre d'actions pour sélection multiple */}
          {multiSelectedDates.length > 0 && (
            <div className="sticky top-4 z-40 w-max mx-auto bg-gradient-to-r from-gray-900/90 to-gray-800/90 backdrop-blur-lg border border-white/20 rounded-xl shadow-2xl p-4 animate-slide-up">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 text-white font-bold">
                  <Layers size={20} className="text-blue-400" />
                  <span>{multiSelectedDates.length} jour{multiSelectedDates.length > 1 ? 's' : ''} sélectionné{multiSelectedDates.length > 1 ? 's' : ''}</span>
                </div>
                
                <div className="h-8 w-px bg-white/20" />
                
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleBulkCreate} 
                    className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-blue-500/25"
                  >
                    <Plus size={16} />
                    Créer Événements
                  </button>
                  
                  <button 
                    onClick={handleBulkDelete} 
                    className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-red-500/25"
                  >
                    <Trash2 size={16} />
                    Supprimer
                  </button>
                  
                  <button
                    onClick={() => {
                      setMultiSelectedDates([]);
                      setIsMultiSelectMode(false);
                    }}
                    className="bg-gray-600 hover:bg-gray-500 text-white p-2 rounded-lg transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Calendrier avec styles améliorés */}
          <div className="calendar-container-enhanced relative">
            <style>{`
              .calendar-container-enhanced {
                --fc-bg-color: rgba(17, 24, 39, 0.6);
                --fc-border-color: rgba(255, 255, 255, 0.1);
                --fc-text-color: #E5E7EB;
                --fc-text-secondary-color: #9CA3AF;
                --fc-button-bg-color: rgba(255, 255, 255, 0.05);
                --fc-button-hover-bg-color: rgba(59, 130, 246, 0.3);
                --fc-button-active-bg-color: rgba(59, 130, 246, 0.4);
                --fc-today-bg-color: rgba(59, 130, 246, 0.15);
                --fc-select-bg-color: rgba(59, 130, 246, 0.25);
              }
              
              .calendar-container-enhanced .fc {
                background: var(--fc-bg-color);
                backdrop-filter: blur(12px);
                border: 1px solid var(--fc-border-color);
                border-radius: 1rem;
                padding: 1.5rem;
                color: var(--fc-text-color);
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
              }
              
              .fc .fc-toolbar-title {
                color: #FFFFFF;
                font-weight: 700;
                font-size: 1.5rem;
              }
              
              .fc .fc-button {
                background: var(--fc-button-bg-color);
                border: 1px solid var(--fc-border-color);
                color: var(--fc-text-color);
                transition: all 0.3s ease;
                text-transform: capitalize;
                font-weight: 500;
                border-radius: 0.5rem;
              }
              
              .fc .fc-button:hover {
                background: var(--fc-button-hover-bg-color);
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
              }
              
              .fc .fc-button-primary:not(:disabled).fc-button-active,
              .fc .fc-button-primary:not(:disabled):active {
                background: var(--fc-button-active-bg-color);
                border-color: var(--fc-button-active-bg-color);
              }
              
              .fc .fc-daygrid-day {
                border-color: var(--fc-border-color);
                transition: all 0.3s ease;
              }
              
              .fc .fc-daygrid-day:hover {
                background-color: rgba(255, 255, 255, 0.02);
              }
              
              .fc .fc-day-today {
                background-color: var(--fc-today-bg-color) !important;
                border-color: rgba(59, 130, 246, 0.3) !important;
              }
              
              .fc .fc-daygrid-day-number {
                color: var(--fc-text-secondary-color);
                padding: 0.5em;
                font-weight: 500;
              }
              
              .fc .fc-col-header-cell {
                background: rgba(255, 255, 255, 0.05);
                color: var(--fc-text-secondary-color);
                border-color: var(--fc-border-color);
                font-weight: 600;
                text-transform: uppercase;
                font-size: 0.75rem;
                letter-spacing: 0.05em;
              }
              
              .fc .fc-daygrid-event {
                border-radius: 6px;
                padding: 3px 6px;
                margin: 1px;
                font-size: 0.7rem;
                font-weight: 500;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                transition: all 0.2s ease;
                border: 1px solid rgba(255, 255, 255, 0.1);
              }
              
              .fc .fc-daygrid-event:hover {
                transform: scale(1.02);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
                z-index: 10;
              }
              
              .fc .fc-daygrid-day.fc-day-future .fc-daygrid-day-number {
                color: var(--fc-text-color);
              }
              
              .fc-h-event .fc-event-main {
                padding: 3px 6px;
              }
              
              @keyframes fade-in {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
              }
              
              @keyframes slide-up {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
              }
              
              .animate-fade-in {
                animation: fade-in 0.3s ease-out;
              }
              
              .animate-slide-up {
                animation: slide-up 0.4s ease-out;
              }
            `}</style>

            <FullCalendar
              ref={calendarRef}
              key={`${numberOfMonths}-${providers.length}-${locations.length}-${eventTypes.length}`}
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
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
              moreLinkText="autres"
              datesSet={handleDatesSet}
              select={handleSelect}
              eventClick={handleEventClick}
              eventDrop={handleEventDrop}
              eventContent={(info) => <EnhancedEventContent eventInfo={info} />}
              eventMouseEnter={(info) => {
                info.el.style.zIndex = '1000';
                info.el.style.transform = 'scale(1.05)';
              }}
              eventMouseLeave={(info) => {
                info.el.style.zIndex = '';
                info.el.style.transform = '';
              }}
              loading={(isLoading) => {
                if (isLoading) {
                  setLoadingStates(prev => ({ ...prev, calendar: true }));
                } else {
                  setLoadingStates(prev => ({ ...prev, calendar: false }));
                }
              }}
            />
            
            {loadingStates.calendar && (
              <div className="absolute inset-0 bg-black/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                <div className="bg-gray-900/90 text-white px-6 py-3 rounded-lg flex items-center gap-3">
                  <Loader2 className="animate-spin" size={20} />
                  Mise à jour du calendrier...
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'providers' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Users className="text-blue-400" size={24} />
              Gestion des Prestataires
            </h3>
            <button
              onClick={() => {
                setEditingProvider(null);
                setProviderForm({ name: '', costs: {} });
                setShowProviderModal(true);
              }}
              className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center gap-2"
            >
              <Plus size={16} />
              Nouveau Prestataire
            </button>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {providers.map(p => {
              const eventCount = events.filter(e => e.provider_ids.includes(p.id)).length;
              const totalCost = Object.values(p.costs || {}).reduce((sum, cost) => sum + cost, 0);
              
              return (
                <div
                  key={p.id}
                  className={`bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-xl p-6 border border-white/10 hover:border-blue-400/30 transition-all duration-300 hover:transform hover:-translate-y-1 hover:shadow-xl ${
                    optimisticUpdates.has(p.id) ? 'opacity-50 animate-pulse' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-lg p-3">
                        <User className="text-blue-400" size={20} />
                      </div>
                      <div>
                        <h4 className="text-white font-semibold text-lg">{p.name}</h4>
                        <div className="flex items-center gap-4 text-sm text-gray-400">
                          <span className="flex items-center gap-1">
                            <CalendarIcon size={12} />
                            {eventCount} événement{eventCount > 1 ? 's' : ''}
                          </span>
                          {totalCost > 0 && (
                            <span className="flex items-center gap-1 text-green-400">
                              <Euro size={12} />
                              {totalCost.toFixed(2)}€
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEditProvider(p)}
                        className="p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-all duration-200 hover:scale-110"
                        title="Modifier"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        onClick={() => deleteProvider(p.id)}
                        className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-all duration-200 hover:scale-110"
                        title="Supprimer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  
                  {/* Aperçu des coûts */}
                  {Object.keys(p.costs || {}).length > 0 && (
                    <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                      <div className="text-gray-400 text-xs mb-2">Tarifs par type :</div>
                      <div className="space-y-1">
                        {Object.entries(p.costs || {}).slice(0, 3).map(([typeId, cost]) => {
                          const typeName = eventTypes.find(et => et.id === typeId)?.name || 'Type inconnu';
                          return (
                            <div key={typeId} className="flex justify-between text-xs">
                              <span className="text-gray-300 truncate">{typeName}</span>
                              <span className="text-green-400 font-medium">{cost}€</span>
                            </div>
                          );
                        })}
                        {Object.keys(p.costs || {}).length > 3 && (
                          <div className="text-gray-400 text-xs text-center">
                            +{Object.keys(p.costs || {}).length - 3} autre{Object.keys(p.costs || {}).length - 3 > 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {providers.length === 0 && (
            <div className="text-center py-12 animate-fade-in">
              <Users className="text-gray-400 mx-auto mb-4" size={48} />
              <h4 className="text-white font-semibold mb-2">Aucun prestataire</h4>
              <p className="text-gray-400 mb-6">Commencez par ajouter vos prestataires</p>
              <button
                onClick={() => setShowProviderModal(true)}
                className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300"
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
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <MapPin className="text-green-400" size={24} />
              Gestion des Lieux
            </h3>
            <button
              onClick={() => {
                setEditingLocation(null);
                setLocationForm({ name: '', color: '#3B82F6', event_type_id: '' });
                setShowLocationModal(true);
              }}
              className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 flex items-center gap-2"
            >
              <Plus size={16} />
              Nouveau Lieu
            </button>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {locations.map(l => {
              const eventCount = events.filter(e => e.location_id === l.id).length;
              
              return (
                <div
                  key={l.id}
                  className={`bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-xl p-6 border border-white/10 hover:border-green-400/30 transition-all duration-300 hover:transform hover:-translate-y-1 hover:shadow-xl ${
                    optimisticUpdates.has(l.id) ? 'opacity-50 animate-pulse' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-6 h-6 rounded-lg border-2 border-white/20 flex-shrink-0 shadow-lg" 
                        style={{ backgroundColor: l.color }}
                      />
                      <div>
                        <h4 className="text-white font-semibold text-lg">{l.name}</h4>
                        <div className="flex items-center gap-4 text-sm text-gray-400">
                          <span className="flex items-center gap-1">
                            <Tag size={12} />
                            {l.event_type?.name || 'Type non défini'}
                          </span>
                          <span className="flex items-center gap-1">
                            <CalendarIcon size={12} />
                            {eventCount} événement{eventCount > 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEditLocation(l)}
                        className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-all duration-200 hover:scale-110"
                        title="Modifier"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        onClick={() => deleteLocation(l.id)}
                        className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-all duration-200 hover:scale-110"
                        title="Supprimer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  
                  {/* Indicateur visuel du type */}
                  <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-sm">Type d'événement</span>
                      <span className="text-white font-medium">
                        {l.event_type?.name || 'Non défini'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {locations.length === 0 && (
            <div className="text-center py-12 animate-fade-in">
              <MapPin className="text-gray-400 mx-auto mb-4" size={48} />
              <h4 className="text-white font-semibold mb-2">Aucun lieu</h4>
              <p className="text-gray-400 mb-6">Ajoutez vos premiers lieux d'événements</p>
              <button
                onClick={() => setShowLocationModal(true)}
                className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300"
              >
                Ajouter un lieu
              </button>
            </div>
          )}
        </div>
      )}

      {/* Menu contextuel */}
      {contextMenu && (
        <div
          className="fixed bg-gray-900/95 backdrop-blur-md border border-white/20 rounded-lg shadow-2xl z-50 py-2 min-w-[200px] animate-fade-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.event ? (
            <>
              <button
                onClick={() => {
                  const event = events.find(e => e.id === contextMenu.event.id);
                  if (event) {
                    setEditingEvent(event);
                    setEventForm({ location_id: event.location_id, provider_ids: event.provider_ids });
                    setShowEventModal(true);
                  }
                  closeContextMenu();
                }}
                className="w-full text-left px-4 py-2 text-white hover:bg-blue-500/20 transition-colors flex items-center gap-2"
              >
                <Edit3 size={16} />
                Modifier l'événement
              </button>
              <button
                onClick={() => {
                  deleteEvent(contextMenu.event.id);
                  closeContextMenu();
                }}
                className="w-full text-left px-4 py-2 text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-2"
              >
                <Trash2 size={16} />
                Supprimer l'événement
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                if (contextMenu.date) {
                  setSelectionInfo({ 
                    start: new Date(contextMenu.date), 
                    end: new Date(new Date(contextMenu.date).getTime() + 86400000) 
                  });
                  setEventForm({ location_id: locations[0]?.id || '', provider_ids: [] });
                  setShowEventModal(true);
                }
                closeContextMenu();
              }}
              className="w-full text-left px-4 py-2 text-white hover:bg-green-500/20 transition-colors flex items-center gap-2"
            >
              <Plus size={16} />
              Ajouter un événement
            </button>
          )}
        </div>
      )}

      {/* Modal événement amélioré */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-2xl w-full transform transition-all duration-300">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                <CalendarIcon className="text-blue-400" size={28} />
                {editingEvent 
                  ? `Modifier: ${new Date(editingEvent.event_date + 'T00:00:00').toLocaleDateString('fr-FR')}` 
                  : 'Nouvel événement'
                }
              </h3>
              <button 
                onClick={resetEventForm} 
                className="text-gray-400 hover:text-white transition-colors text-2xl hover:rotate-90 duration-300"
              >
                ×
              </button>
            </div>
            
            {/* Informations de création */}
            {!editingEvent && selectionInfo && (
              <div className="text-center text-blue-300 mb-6 bg-gradient-to-r from-blue-500/10 to-purple-500/10 py-3 rounded-lg border border-blue-500/20">
                <Clock className="inline mr-2" size={16} />
                Création du {toYYYYMMDD(selectionInfo.start)} au {toYYYYMMDD(new Date(selectionInfo.end.getTime() - 864e5))}
              </div>
            )}
            
            {!editingEvent && multiSelectedDates.length > 0 && (
              <div className="text-center text-blue-300 mb-6 bg-gradient-to-r from-blue-500/10 to-purple-500/10 py-3 rounded-lg border border-blue-500/20">
                <Layers className="inline mr-2" size={16} />
                Création sur <b>{multiSelectedDates.length} dates sélectionnées</b>
              </div>
            )}
            
            <form onSubmit={handleEventSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  <MapPin className="inline mr-2" size={16} />
                  Lieu de l'événement *
                </label>
                <select
                  required
                  value={eventForm.location_id}
                  onChange={e => {
                    setEventForm({ ...eventForm, location_id: e.target.value });
                    validateEventForm();
                  }}
                  className={`dark-select w-full transition-all duration-200 ${
                    formErrors.location ? 'border-red-400 focus:border-red-400' : 'focus:border-blue-400'
                  }`}
                >
                  <option value="">Sélectionner un lieu</option>
                  {locations.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.event_type?.name || 'N/A'})
                    </option>
                  ))}
                </select>
                {formErrors.location && (
                  <p className="text-red-400 text-sm mt-1 flex items-center gap-1">
                    <AlertTriangle size={14} />
                    {formErrors.location}
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  <Users className="inline mr-2" size={16} />
                  Prestataires assignés *
                </label>
                <div className={`space-y-3 max-h-48 overflow-y-auto bg-white/5 rounded-lg p-4 border transition-all duration-200 ${
                  formErrors.providers ? 'border-red-400' : 'border-white/20'
                }`}>
                  {providers.map(p => (
                    <label key={p.id} className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={eventForm.provider_ids.includes(p.id)}
                        onChange={e => {
                          const newIds = e.target.checked
                            ? [...eventForm.provider_ids, p.id]
                            : eventForm.provider_ids.filter(id => id !== p.id);
                          setEventForm({ ...eventForm, provider_ids: newIds });
                          validateEventForm();
                        }}
                        className="w-4 h-4 text-blue-400 bg-white/5 border-white/20 rounded focus:ring-blue-400 transition-all duration-200"
                      />
                      <span className="text-white group-hover:text-blue-400 transition-colors">
                        {p.name}
                      </span>
                      {/* Affichage du coût si disponible */}
                      {eventForm.location_id && (() => {
                        const location = locations.find(l => l.id === eventForm.location_id);
                        const cost = location?.event_type_id ? p.costs?.[location.event_type_id] : null;
                        return cost ? (
                          <span className="text-green-400 text-sm ml-auto">
                            {cost}€
                          </span>
                        ) : null;
                      })()}
                    </label>
                  ))}
                </div>
                {formErrors.providers && (
                  <p className="text-red-400 text-sm mt-1 flex items-center gap-1">
                    <AlertTriangle size={14} />
                    {formErrors.providers}
                  </p>
                )}
              </div>
              
              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={!validateEventForm()}
                  className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save size={16} />
                  {editingEvent ? 'Mettre à jour' : 'Créer'}
                </button>
                {editingEvent && (
                  <button
                    type="button"
                    onClick={() => deleteEvent(editingEvent.id)}
                    className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-red-500/25 transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    <Trash2 size={16} />
                    Supprimer
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal prestataire amélioré */}
      {showProviderModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-md w-full max-h-[90vh] overflow-y-auto transform transition-all duration-300">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                <Users className="text-blue-400" size={28} />
                {editingProvider ? 'Modifier prestataire' : 'Nouveau prestataire'}
              </h3>
              <button 
                onClick={resetProviderForm} 
                className="text-gray-400 hover:text-white transition-colors text-2xl hover:rotate-90 duration-300"
              >
                ×
              </button>
            </div>
            
            <form onSubmit={handleProviderSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  <User className="inline mr-2" size={16} />
                  Nom du prestataire *
                </label>
                <input
                  type="text"
                  required
                  value={providerForm.name}
                  onChange={e => {
                    setProviderForm(f => ({ ...f, name: e.target.value }));
                    validateProviderForm();
                  }}
                  className={`w-full bg-white/5 border rounded-lg px-4 py-3 text-white placeholder-gray-400 transition-all duration-200 ${
                    formErrors.name ? 'border-red-400 focus:border-red-400' : 'border-white/20 focus:border-blue-400'
                  }`}
                  placeholder="Ex: DJ Martin, Éclairagiste Pro..."
                />
                {formErrors.name && (
                  <p className="text-red-400 text-sm mt-1 flex items-center gap-1">
                    <AlertTriangle size={14} />
                    {formErrors.name}
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  <Euro className="inline mr-2" size={16} />
                  Tarifs par type d'événement (€)
                </label>
                <div className="space-y-3 bg-white/5 p-4 rounded-lg border border-white/20">
                  {eventTypes.map(et => (
                    <div key={et.id} className="grid grid-cols-3 items-center gap-3">
                      <label htmlFor={`cost-${et.id}`} className="text-sm text-gray-300 col-span-2">
                        {et.name}
                      </label>
                      <input
                        id={`cost-${et.id}`}
                        type="number"
                        step="0.01"
                        min="0"
                        value={providerForm.costs[et.id] || ''}
                        onChange={e => setProviderForm(f => ({ 
                          ...f, 
                          costs: { ...f.costs, [et.id]: e.target.value } 
                        }))}
                        className="col-span-1 w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white placeholder-gray-400 focus:border-blue-400 text-right transition-all duration-200"
                        placeholder="0.00"
                      />
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="flex gap-4">
                <button 
                  type="submit" 
                  disabled={!validateProviderForm()}
                  className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Modal lieu amélioré */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-md w-full transform transition-all duration-300">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                <MapPin className="text-green-400" size={28} />
                {editingLocation ? 'Modifier le lieu' : 'Nouveau lieu'}
              </h3>
              <button 
                onClick={resetLocationForm} 
                className="text-gray-400 hover:text-white transition-colors text-2xl hover:rotate-90 duration-300"
              >
                ×
              </button>
            </div>
            
            <form onSubmit={handleLocationSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  <MapPin className="inline mr-2" size={16} />
                  Nom du lieu *
                </label>
                <input
                  type="text"
                  required
                  value={locationForm.name}
                  onChange={e => {
                    setLocationForm({ ...locationForm, name: e.target.value });
                    validateLocationForm();
                  }}
                  className={`w-full bg-white/5 border rounded-lg px-4 py-3 text-white placeholder-gray-400 transition-all duration-200 ${
                    formErrors.name ? 'border-red-400 focus:border-red-400' : 'border-white/20 focus:border-green-400'
                  }`}
                  placeholder="Ex: Salle des fêtes, Parc municipal..."
                />
                {formErrors.name && (
                  <p className="text-red-400 text-sm mt-1 flex items-center gap-1">
                    <AlertTriangle size={14} />
                    {formErrors.name}
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  <Tag className="inline mr-2" size={16} />
                  Type d'événement par défaut *
                </label>
                <select
                  required
                  value={locationForm.event_type_id}
                  onChange={e => {
                    setLocationForm({ ...locationForm, event_type_id: e.target.value });
                    validateLocationForm();
                  }}
                  className={`dark-select w-full transition-all duration-200 ${
                    formErrors.eventType ? 'border-red-400 focus:border-red-400' : 'focus:border-green-400'
                  }`}
                >
                  <option value="">Sélectionner un type</option>
                  {eventTypes.map(et => (
                    <option key={et.id} value={et.id}>
                      {et.name}
                    </option>
                  ))}
                </select>
                {formErrors.eventType && (
                  <p className="text-red-400 text-sm mt-1 flex items-center gap-1">
                    <AlertTriangle size={14} />
                    {formErrors.eventType}
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Couleur d'affichage *
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="color"
                    value={locationForm.color}
                    onChange={e => setLocationForm({ ...locationForm, color: e.target.value })}
                    className="w-16 h-12 rounded-lg border-2 border-white/20 bg-white/5 cursor-pointer hover:border-white/40 transition-colors"
                  />
                  <input
                    type="text"
                    value={locationForm.color}
                    onChange={e => setLocationForm({ ...locationForm, color: e.target.value })}
                    className="flex-1 bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-green-400 transition-all duration-200"
                    placeholder="#3B82F6"
                  />
                  <div 
                    className="w-12 h-12 rounded-lg border-2 border-white/20 shadow-lg"
                    style={{ backgroundColor: locationForm.color }}
                  />
                </div>
              </div>
              
              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={!validateLocationForm()}
                  className="flex-1 bg-gradient-to-r from-green-500 to-green-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
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
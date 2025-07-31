import React, { useEffect, useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { Calendar as CalendarIcon, Plus, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { exportElementAsPDF } from '../../utils/pdfGenerator';

interface Provider {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
  color: string;
}

interface EventItem {
  id: string;
  event_date: string;
  provider_ids: string[];
  location: Location | null;
}

const AdminPlanningEditor: React.FC = () => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('all');
  const [modalDate, setModalDate] = useState<Date | null>(null);
  const [form, setForm] = useState<{ location_id: string; provider_ids: string[] }>(
    { location_id: '', provider_ids: [] }
  );
  const [activeTab, setActiveTab] = useState<'calendar' | 'settings'>('calendar');
  const [newLocation, setNewLocation] = useState({ name: '', color: '#ffffff' });
  const [newProvider, setNewProvider] = useState({ name: '' });

  useEffect(() => {
    loadProviders();
    loadLocations();
    loadEvents();
  }, []);

  const loadProviders = async () => {
    const { data } = await supabase
      .from('planning_providers')
      .select('id, name')
      .order('name');
    setProviders(data || []);
  };

  const loadLocations = async () => {
    const { data } = await supabase
      .from('planning_locations')
      .select('id, name, color')
      .order('name');
    setLocations(data || []);
  };

  const loadEvents = async () => {
    const { data } = await supabase
      .from('planning_events')
      .select('id, event_date, provider_ids, location:planning_locations(*)');
    setEvents(data || []);
  };

  const addLocation = async () => {
    if (!newLocation.name) return;
    const { data, error } = await supabase
      .from('planning_locations')
      .insert(newLocation)
      .select('id, name, color')
      .single();
    if (!error && data) {
      setLocations(prev => [...prev, data]);
    }
    setNewLocation({ name: '', color: '#ffffff' });
  };

  const addProvider = async () => {
    if (!newProvider.name) return;
    const { data, error } = await supabase
      .from('planning_providers')
      .insert({ name: newProvider.name })
      .select('id, name')
      .single();
    if (!error && data) {
      setProviders(prev => [...prev, data]);
    }
    setNewProvider({ name: '' });
  };

  const openModal = (date: Date) => {
    setModalDate(date);
    if (locations[0]) {
      setForm({ location_id: locations[0].id, provider_ids: [] });
    }
  };

  const saveEvent = async () => {
    if (!modalDate) return;
    const { data, error } = await supabase
      .from('planning_events')
      .insert({
        event_date: modalDate.toISOString().slice(0, 10),
        location_id: form.location_id,
        provider_ids: form.provider_ids,
      })
      .select('id, event_date, provider_ids, location:planning_locations(*)')
      .single();
    if (!error && data) {
      setEvents(prev => [...prev, data]);
    }
    setModalDate(null);
  };

  const eventsForDay = (date: Date) =>
    events.filter(
      ev =>
        ev.event_date === date.toISOString().slice(0, 10) &&
        (selectedProvider === 'all' || ev.provider_ids.includes(selectedProvider))
    );

  const tileContent = ({ date }: { date: Date }) => {
    const dayEvents = eventsForDay(date);
    if (dayEvents.length === 0) return null;
    return (
      <div className="space-y-0.5 text-xs mt-1">
        {dayEvents.map(ev => (
          <div
            key={ev.id}
            style={{ backgroundColor: ev.location?.color || '#555' }}
            className="px-1 rounded"
          >
            {ev.location?.name}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="text-white space-y-6">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <CalendarIcon /> Planning Evenementiel
      </h2>

      <div className="flex gap-4 mb-4">
        <button
          onClick={() => setActiveTab('calendar')}
          className={`font-semibold ${
            activeTab === 'calendar'
              ? 'text-yellow-400 border-b-2 border-yellow-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Planning
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`font-semibold ${
            activeTab === 'settings'
              ? 'text-yellow-400 border-b-2 border-yellow-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Parametrage
        </button>
      </div>

      {activeTab === 'calendar' && (
        <>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              Prestataire:
              <select
                value={selectedProvider}
                onChange={e => setSelectedProvider(e.target.value)}
                className="dark-select ml-2 rounded px-2 py-1"
              >
                <option value="all">Tous</option>
                {providers.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => exportElementAsPDF('planning-calendar', 'planning')}
              className="flex items-center gap-2 text-sm bg-yellow-500 text-black px-3 py-1 rounded"
            >
              <Download size={16} /> Export PDF
            </button>
          </div>
          <div id="planning-calendar" className="bg-white/5 p-4 rounded-lg w-[60%] mx-auto">
            <Calendar onClickDay={openModal} tileContent={tileContent} />
          </div>
          {modalDate && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-gray-900 p-6 rounded space-y-4 w-80">
                <h3 className="text-lg font-semibold">Ajouter un evenement</h3>
                <div className="space-y-2">
                  <p>Date: {modalDate.toLocaleDateString()}</p>
                  <select
                    value={form.location_id}
                    onChange={e => setForm({ ...form, location_id: e.target.value })}
                    className="dark-select w-full p-2 rounded"
                  >
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                  <div className="space-y-1">
                    {providers.map(prov => (
                      <label key={prov.id} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={form.provider_ids.includes(prov.id)}
                          onChange={() =>
                            setForm(prev => {
                              const exists = prev.provider_ids.includes(prov.id);
                              return {
                                ...prev,
                                provider_ids: exists
                                  ? prev.provider_ids.filter(id => id !== prov.id)
                                  : [...prev.provider_ids, prov.id],
                              };
                            })
                          }
                        />
                        <span className="text-sm">{prov.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setModalDate(null)} className="px-3 py-1 border rounded">
                    Annuler
                  </button>
                  <button
                    onClick={saveEvent}
                    className="bg-yellow-500 text-black px-3 py-1 rounded flex items-center gap-2"
                  >
                    <Plus size={16} /> Enregistrer
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-8">
          <div>
            <h3 className="font-semibold mb-2">Lieux de prestation</h3>
            <form
              onSubmit={e => {
                e.preventDefault();
                addLocation();
              }}
              className="flex items-center gap-2 mb-4"
            >
              <input
                value={newLocation.name}
                onChange={e => setNewLocation({ ...newLocation, name: e.target.value })}
                placeholder="Nom du lieu"
                className="flex-1 p-2 rounded bg-gray-800 border border-gray-700"
              />
              <input
                type="color"
                value={newLocation.color}
                onChange={e => setNewLocation({ ...newLocation, color: e.target.value })}
                className="w-10 h-10 p-0 border-none"
              />
              <button type="submit" className="bg-yellow-500 text-black px-3 py-1 rounded flex items-center gap-1">
                <Plus size={16} /> Ajouter
              </button>
            </form>
            <ul className="space-y-1">
              {locations.map(loc => (
                <li key={loc.id} className="flex items-center gap-2 text-sm">
                  <span className="w-4 h-4 rounded" style={{ backgroundColor: loc.color }} />
                  <span>{loc.name}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Prestataires</h3>
            <form
              onSubmit={e => {
                e.preventDefault();
                addProvider();
              }}
              className="flex items-center gap-2 mb-4"
            >
              <input
                value={newProvider.name}
                onChange={e => setNewProvider({ name: e.target.value })}
                placeholder="Nom du prestataire"
                className="flex-1 p-2 rounded bg-gray-800 border border-gray-700"
              />
              <button type="submit" className="bg-yellow-500 text-black px-3 py-1 rounded flex items-center gap-1">
                <Plus size={16} /> Ajouter
              </button>
            </form>
            <ul className="space-y-1 text-sm">
              {providers.map(p => (
                <li key={p.id}>{p.name}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPlanningEditor;


import React, { useState } from 'react';
import { Calendar, Plus, Download } from 'lucide-react';
import { exportElementAsPDF } from '../../utils/pdfGenerator';

interface EventItem {
  id: string;
  date: string;
  location: string;
  color: string;
  providers: string[];
}

const defaultProviders = ['Prestataire 1', 'Prestataire 2', 'Prestataire 3'];

const AdminPlanningEditor: React.FC = () => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [providers] = useState<string[]>(defaultProviders);
  const [form, setForm] = useState({
    date: '',
    location: '',
    color: '#ff0000',
    providers: [] as string[],
  });

  const toggleProvider = (name: string) => {
    setForm(prev => ({
      ...prev,
      providers: prev.providers.includes(name)
        ? prev.providers.filter(p => p !== name)
        : [...prev.providers, name],
    }));
  };

  const addEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date || !form.location) return;
    const newEvent: EventItem = {
      id: Date.now().toString(),
      date: form.date,
      location: form.location,
      color: form.color,
      providers: form.providers,
    };
    setEvents(prev => [...prev, newEvent]);
    setForm({ date: '', location: '', color: '#ff0000', providers: [] });
  };

  const exportGeneralPDF = () => exportElementAsPDF('planning-table', 'planning-general');

  const exportProviderPDF = (provider: string) =>
    exportElementAsPDF(`planning-${provider}`, `planning-${provider}`);

  return (
    <div className="text-white space-y-8">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <Calendar /> Planning Événementiel
      </h2>

      <form
        onSubmit={addEvent}
        className="bg-white/5 p-4 rounded-lg space-y-4"
      >
        <div className="grid md:grid-cols-4 gap-4">
          <input
            type="date"
            value={form.date}
            onChange={e => setForm({ ...form, date: e.target.value })}
            className="bg-gray-800 rounded p-2"
            required
          />
          <input
            type="text"
            placeholder="Lieu"
            value={form.location}
            onChange={e => setForm({ ...form, location: e.target.value })}
            className="bg-gray-800 rounded p-2"
            required
          />
          <input
            type="color"
            value={form.color}
            onChange={e => setForm({ ...form, color: e.target.value })}
            className="w-16 h-10 p-1"
          />
          <div className="flex items-center gap-2">
            {providers.map(p => (
              <label key={p} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={form.providers.includes(p)}
                  onChange={() => toggleProvider(p)}
                />
                <span className="text-sm">{p}</span>
              </label>
            ))}
          </div>
        </div>
        <button
          type="submit"
          className="flex items-center gap-2 bg-yellow-500 text-black px-4 py-2 rounded font-semibold"
        >
          <Plus size={16} /> Ajouter
        </button>
      </form>

      {events.length > 0 && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold">Planning Général</h3>
            <button
              onClick={exportGeneralPDF}
              className="flex items-center gap-2 text-sm bg-yellow-500 text-black px-3 py-1 rounded"
            >
              <Download size={16} /> Export PDF
            </button>
          </div>
          <table
            id="planning-table"
            className="w-full text-left border-collapse"
          >
            <thead>
              <tr className="bg-white/10">
                <th className="p-2">Date</th>
                <th className="p-2">Lieu</th>
                <th className="p-2">Prestataires</th>
              </tr>
            </thead>
            <tbody>
              {events.map(ev => (
                <tr key={ev.id} style={{ backgroundColor: ev.color }}>
                  <td className="p-2">{ev.date}</td>
                  <td className="p-2">{ev.location}</td>
                  <td className="p-2">{ev.providers.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {providers.map(provider => {
        const providerEvents = events.filter(e => e.providers.includes(provider));
        if (providerEvents.length === 0) return null;
        return (
          <div key={provider} className="space-y-2">
            <div className="flex justify-between items-center mt-8">
              <h3 className="text-xl font-semibold">Planning {provider}</h3>
              <button
                onClick={() => exportProviderPDF(provider)}
                className="flex items-center gap-2 text-sm bg-yellow-500 text-black px-3 py-1 rounded"
              >
                <Download size={16} /> Export PDF
              </button>
            </div>
            <table
              id={`planning-${provider}`}
              className="w-full text-left border-collapse"
            >
              <thead>
                <tr className="bg-white/10">
                  <th className="p-2">Date</th>
                  <th className="p-2">Lieu</th>
                </tr>
              </thead>
              <tbody>
                {providerEvents.map(ev => (
                  <tr key={ev.id} style={{ backgroundColor: ev.color }}>
                    <td className="p-2">{ev.date}</td>
                    <td className="p-2">{ev.location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
};

export default AdminPlanningEditor;


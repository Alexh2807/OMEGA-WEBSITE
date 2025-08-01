import React, { useState } from 'react';

// A simple settings page for administrators to adjust basic site options.
// This component can later be extended to persist settings via Supabase or other backend services.
const AdminSettings = () => {
  // Local state for form inputs
  const [siteName, setSiteName] = useState('OMEGA');
  const [contactEmail, setContactEmail] = useState('contact@omega.com');
  const [currency, setCurrency] = useState('EUR');

  const handleSave = () => {
    // TODO: Persist settings to backend (e.g., Supabase) when available
    alert('Paramètres enregistrés !');
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Paramètres</h2>
      <div className="space-y-4 max-w-md">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="siteName">
            Nom du site
          </label>
          <input
            id="siteName"
            className="w-full border rounded p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            value={siteName}
            onChange={e => setSiteName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="contactEmail">
            Email de contact
          </label>
          <input
            id="contactEmail"
            type="email"
            className="w-full border rounded p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            value={contactEmail}
            onChange={e => setContactEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="currency">
            Devise par défaut
          </label>
          <select
            id="currency"
            className="w-full border rounded p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            value={currency}
            onChange={e => setCurrency(e.target.value)}
          >
            <option value="EUR">Euro (€)</option>
            <option value="USD">Dollar ($)</option>
            <option value="GBP">Livre (£)</option>
          </select>
        </div>
        <button
          onClick={handleSave}
          className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
};

export default AdminSettings;

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { paysPresume, codePostalPresume } from '../utils/paysVisiteur';
import {
  MapPin,
  Plus,
  Edit3,
  Trash2,
  Check,
  Star,
  Home,
  Building,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

/* ═══════════════════════════════════════════════════════════════════════════
   PAYS DESSERVIS
   ═══════════════════════════════════════════════════════════════════════════

   Le menu ne proposait QUE France, Belgique, Suisse et Luxembourg — alors que le
   barème de livraison couvre une trentaine de destinations et que la TVA sait traiter
   toute l'Union européenne. Un client allemand, espagnol ou italien ne pouvait tout
   simplement pas enregistrer son adresse : il partait.

   La liste des pays REELLEMENT reconnus vient de la base (`country_aliases`), pas d'ici.
   C'était le but de cette table : ajouter un pays ou une orthographe se fait en SQL,
   sans redéployer le site. Ce fichier n'apporte que le NOM AFFICHÉ (majuscules et
   accents, que la table ne conserve pas puisqu'elle stocke des alias normalisés).

   ⚠ La valeur enregistrée reste un NOM (`shipping_addresses.country` est du texte), et
   ce nom doit être résolvable par `code_pays()` : chaque libellé ci-dessous a son alias
   normalisé dans `country_aliases`. Ne pas y toucher sans vérifier les deux côtés.
*/
interface PaysDesservi {
  code: string;
  nom: string;
}

const CATALOGUE_PAYS: PaysDesservi[] = [
  // France d'abord : c'est l'écrasante majorité des expéditions.
  { code: 'FR', nom: 'France' },
  { code: 'MC', nom: 'Monaco' },
  { code: 'DE', nom: 'Allemagne' },
  { code: 'AD', nom: 'Andorre' },
  { code: 'AT', nom: 'Autriche' },
  { code: 'BE', nom: 'Belgique' },
  { code: 'BG', nom: 'Bulgarie' },
  { code: 'CY', nom: 'Chypre' },
  { code: 'HR', nom: 'Croatie' },
  { code: 'DK', nom: 'Danemark' },
  { code: 'ES', nom: 'Espagne' },
  { code: 'EE', nom: 'Estonie' },
  { code: 'FI', nom: 'Finlande' },
  { code: 'GR', nom: 'Grèce' },
  { code: 'HU', nom: 'Hongrie' },
  { code: 'IE', nom: 'Irlande' },
  { code: 'IS', nom: 'Islande' },
  { code: 'IT', nom: 'Italie' },
  { code: 'LV', nom: 'Lettonie' },
  { code: 'LT', nom: 'Lituanie' },
  { code: 'LU', nom: 'Luxembourg' },
  { code: 'MT', nom: 'Malte' },
  { code: 'NO', nom: 'Norvège' },
  { code: 'NL', nom: 'Pays-Bas' },
  { code: 'PL', nom: 'Pologne' },
  { code: 'PT', nom: 'Portugal' },
  { code: 'CZ', nom: 'Tchéquie' },
  { code: 'RO', nom: 'Roumanie' },
  { code: 'GB', nom: 'Royaume-Uni' },
  { code: 'SK', nom: 'Slovaquie' },
  { code: 'SI', nom: 'Slovénie' },
  { code: 'SE', nom: 'Suède' },
  { code: 'CH', nom: 'Suisse' },
  { code: 'US', nom: 'États-Unis' },
  { code: 'CA', nom: 'Canada' },
  { code: 'MA', nom: 'Maroc' },
  { code: 'TN', nom: 'Tunisie' },
  { code: 'DZ', nom: 'Algérie' },
];

/*
  DÉPARTEMENTS ET COLLECTIVITÉS D'OUTRE-MER.

  ⚠ CE NE SONT PAS DES PAYS. On ne peut donc pas les ajouter au menu « Pays » : la
  valeur enregistrée serait « Guadeloupe », `code_pays()` renverrait NULL et la commande
  serait REFUSÉE — l'inverse du service rendu. L'outre-mer, c'est la France + un code
  postal en 97/98, et c'est le code postal qui décide (grille Colissimo OM1/OM2, TVA à
  0 % au titre de l'art. 294 du CGI).
  On le reconnaît donc à la saisie et on le NOMME, pour que le client sache que sa
  destination est bien prise en charge.
*/
const OUTRE_MER: Record<string, string> = {
  '971': 'Guadeloupe',
  '972': 'Martinique',
  '973': 'Guyane',
  '974': 'La Réunion',
  '975': 'Saint-Pierre-et-Miquelon',
  '976': 'Mayotte',
  '977': 'Saint-Barthélemy',
  '978': 'Saint-Martin',
  '984': 'Terres australes et antarctiques',
  '986': 'Wallis-et-Futuna',
  '987': 'Polynésie française',
  '988': 'Nouvelle-Calédonie',
};

/*
  FORMATS DE CODE POSTAL, par pays.

  Le formulaire acceptait n'importe quoi : « 3400 » au lieu de « 34000 », un code postal
  belge à 5 chiffres, une adresse allemande sans code. Résultat en bout de chaîne : le
  calcul de livraison ne reconnaissait pas la zone et le panier annonçait « destination
  hors zones automatiques » — un message qui envoie le client demander un devis pour une
  simple faute de frappe.
  ⚠ On VÉRIFIE LE FORMAT, on ne vérifie pas l'existence : personne ne tient à jour la
  liste des codes postaux de trente pays, et un format correct suffit à faire fonctionner
  le barème. Un pays absent de cette table n'est jamais bloqué.
*/
const FORMATS_CP: Record<string, { regex: RegExp; exemple: string }> = {
  FR: { regex: /^\d{5}$/, exemple: '34290' },
  MC: { regex: /^980\d{2}$/, exemple: '98000' },
  BE: { regex: /^\d{4}$/, exemple: '1000' },
  CH: { regex: /^\d{4}$/, exemple: '1201' },
  LU: { regex: /^\d{4}$/, exemple: '1009' },
  DE: { regex: /^\d{5}$/, exemple: '10115' },
  ES: { regex: /^\d{5}$/, exemple: '28001' },
  IT: { regex: /^\d{5}$/, exemple: '00184' },
  NL: { regex: /^\d{4}\s?[A-Za-z]{2}$/, exemple: '1012 AB' },
  PT: { regex: /^\d{4}-\d{3}$/, exemple: '1000-001' },
  AT: { regex: /^\d{4}$/, exemple: '1010' },
  DK: { regex: /^\d{4}$/, exemple: '1050' },
  FI: { regex: /^\d{5}$/, exemple: '00100' },
  SE: { regex: /^\d{3}\s?\d{2}$/, exemple: '111 29' },
  NO: { regex: /^\d{4}$/, exemple: '0150' },
  IS: { regex: /^\d{3}$/, exemple: '101' },
  IE: { regex: /^[A-Za-z]\d{2}\s?[A-Za-z0-9]{4}$/, exemple: 'D02 AF30' },
  GB: { regex: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/, exemple: 'SW1A 1AA' },
  PL: { regex: /^\d{2}-\d{3}$/, exemple: '00-001' },
  CZ: { regex: /^\d{3}\s?\d{2}$/, exemple: '110 00' },
  SK: { regex: /^\d{3}\s?\d{2}$/, exemple: '811 01' },
  HU: { regex: /^\d{4}$/, exemple: '1051' },
  RO: { regex: /^\d{6}$/, exemple: '010011' },
  BG: { regex: /^\d{4}$/, exemple: '1000' },
  GR: { regex: /^\d{3}\s?\d{2}$/, exemple: '105 57' },
  HR: { regex: /^\d{5}$/, exemple: '10000' },
  SI: { regex: /^\d{4}$/, exemple: '1000' },
  EE: { regex: /^\d{5}$/, exemple: '10111' },
  LV: { regex: /^(LV-)?\d{4}$/, exemple: 'LV-1050' },
  LT: { regex: /^(LT-)?\d{5}$/, exemple: 'LT-01100' },
  CY: { regex: /^\d{4}$/, exemple: '1010' },
  MT: { regex: /^[A-Za-z]{3}\s?\d{4}$/, exemple: 'VLT 1117' },
  AD: { regex: /^AD\d{3}$/i, exemple: 'AD500' },
  US: { regex: /^\d{5}(-\d{4})?$/, exemple: '10001' },
  CA: { regex: /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/, exemple: 'K1A 0B1' },
  MA: { regex: /^\d{5}$/, exemple: '10000' },
  TN: { regex: /^\d{4}$/, exemple: '1000' },
  DZ: { regex: /^\d{5}$/, exemple: '16000' },
};

/** Code ISO d'un nom de pays saisi, d'après le catalogue affiché. */
function codePays(nom: string): string | null {
  const n = nom.trim().toLowerCase();
  return CATALOGUE_PAYS.find(p => p.nom.toLowerCase() === n)?.code ?? null;
}

/** Territoire d'outre-mer reconnu au code postal, ou null. */
function territoireOutreMer(codePostal: string): string | null {
  const cp = codePostal.replace(/\s/g, '');
  if (!/^\d{5}$/.test(cp)) return null;
  return OUTRE_MER[cp.slice(0, 3)] ?? null;
}

/** Message d'erreur du code postal, ou null s'il est acceptable. */
function verifierCodePostal(codePostal: string, pays: string): string | null {
  const cp = codePostal.trim();
  if (!cp) return 'Code postal requis.';
  const code = codePays(pays);
  if (!code) return null; // pays hors catalogue : on ne bloque pas sur une règle inconnue
  const format = FORMATS_CP[code];
  if (!format) return null;
  if (format.regex.test(cp)) return null;
  return `Code postal invalide pour ${pays} — format attendu : ${format.exemple}.`;
}

interface ShippingAddress {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  company?: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  postal_code: string;
  country: string;
  phone?: string;
  is_default: boolean;
}

interface AddressManagerProps {
  onAddressSelect?: (address: ShippingAddress) => void;
  selectedAddressId?: string;
  showSelection?: boolean;
}

const AddressManager: React.FC<AddressManagerProps> = ({
  onAddressSelect,
  selectedAddressId,
  showSelection = false,
}) => {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<ShippingAddress | null>(
    null
  );
  /* Une soumission à la fois. Sans ce drapeau, un double clic sur « Ajouter l'adresse »
     — ou une simple impatience quand le réseau est lent — créait DEUX adresses
     identiques, que le client retrouvait ensuite dans sa liste sans savoir laquelle
     choisir. */
  const [enregistrement, setEnregistrement] = useState(false);
  /* Liste des pays réellement desservis, lue en base (voir CATALOGUE_PAYS). */
  const [paysDesservis, setPaysDesservis] = useState<PaysDesservi[]>(CATALOGUE_PAYS);
  const [formData, setFormData] = useState({
    name: '',
    first_name: '',
    last_name: '',
    company: '',
    address_line_1: '',
    address_line_2: '',
    city: '',
    postal_code: codePostalPresume(),
    country: paysPresume(),
    phone: '',
    is_default: false,
  });

  useEffect(() => {
    if (user) {
      loadAddresses();
    }
  }, [user]);

  /* Les pays proposés viennent de `country_aliases` : c'est la table qui décide de ce
     que `code_pays()` saura résoudre, donc de ce qu'on peut accepter sans risquer une
     commande bloquée plus loin. En cas d'échec de lecture (hors ligne, RLS), on garde le
     catalogue complet : mieux vaut proposer un pays de trop que d'enfermer à nouveau le
     client dans quatre destinations. */
  useEffect(() => {
    let vivant = true;
    (async () => {
      const { data, error } = await supabase.from('country_aliases').select('code');
      if (!vivant || error || !data?.length) return;
      const codes = new Set(data.map((r: { code: string }) => r.code));
      const filtres = CATALOGUE_PAYS.filter(p => codes.has(p.code));
      // Jamais de menu vide : si le filtre ne laisse rien, on garde le catalogue.
      if (filtres.length) setPaysDesservis(filtres);
    })();
    return () => {
      vivant = false;
    };
  }, []);

  const loadAddresses = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('shipping_addresses')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading addresses:', error);
        toast.error('Erreur lors du chargement des adresses');
      } else {
        setAddresses(data || []);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (enregistrement) return; // ★ anti double soumission (voir `enregistrement`)

    /* Le code postal est contrôlé ICI et pas seulement à l'écran : c'est lui qui décide
       de la zone de livraison, du tarif et — pour l'outre-mer — du régime de TVA. Une
       saisie fautive se paie tout au bout de la chaîne, par un message incompréhensible
       dans le panier. */
    const erreurCp = verifierCodePostal(formData.postal_code, formData.country);
    if (erreurCp) {
      toast.error(erreurCp);
      return;
    }

    setEnregistrement(true);
    try {
      if (editingAddress) {
        // Mise à jour
        const { error } = await supabase
          .from('shipping_addresses')
          .update(formData)
          .eq('id', editingAddress.id);

        if (error) {
          console.error('Error updating address:', error);
          toast.error('Erreur lors de la mise à jour');
        } else {
          toast.success('Adresse mise à jour avec succès');
          resetForm();
          loadAddresses();
        }
      } else {
        // Création
        const { error } = await supabase.from('shipping_addresses').insert({
          ...formData,
          user_id: user.id,
        });

        if (error) {
          console.error('Error creating address:', error);
          toast.error('Erreur lors de la création');
        } else {
          toast.success('Adresse ajoutée avec succès');
          resetForm();
          loadAddresses();
        }
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    } finally {
      setEnregistrement(false);
    }
  };

  const handleDelete = async (addressId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette adresse ?')) return;

    try {
      const { error } = await supabase
        .from('shipping_addresses')
        .delete()
        .eq('id', addressId);

      if (error) {
        console.error('Error deleting address:', error);
        toast.error('Erreur lors de la suppression');
      } else {
        toast.success('Adresse supprimée avec succès');
        loadAddresses();
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    }
  };

  const handleSetDefault = async (addressId: string) => {
    try {
      const { error } = await supabase
        .from('shipping_addresses')
        .update({ is_default: true })
        .eq('id', addressId);

      if (error) {
        console.error('Error setting default:', error);
        toast.error('Erreur lors de la mise à jour');
      } else {
        toast.success('Adresse par défaut mise à jour');
        loadAddresses();
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      first_name: '',
      last_name: '',
      company: '',
      address_line_1: '',
      address_line_2: '',
      city: '',
      postal_code: codePostalPresume(),
      country: paysPresume(),
      phone: '',
      is_default: false,
    });
    setEditingAddress(null);
    setShowForm(false);
  };

  const startEdit = (address: ShippingAddress) => {
    setFormData({
      name: address.name,
      first_name: address.first_name,
      last_name: address.last_name,
      company: address.company || '',
      address_line_1: address.address_line_1,
      address_line_2: address.address_line_2 || '',
      city: address.city,
      postal_code: address.postal_code,
      country: address.country,
      phone: address.phone || '',
      is_default: address.is_default,
    });
    setEditingAddress(address);
    setShowForm(true);
  };

  /* Contrôle « vivant » du code postal : le message apparaît sous le champ pendant la
     saisie (jamais sur un champ encore vide, ce serait accuser avant d'avoir lu), et il
     est rejoué à la soumission — l'affichage ne protège de rien à lui seul. */
  const erreurCodePostal = formData.postal_code.trim()
    ? verifierCodePostal(formData.postal_code, formData.country)
    : null;

  if (loading) {
    return <div className="text-white">Chargement des adresses...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <MapPin className="text-blue-400" size={24} />
          Mes Adresses de Livraison
        </h3>
        <button
          onClick={() => setShowForm(true)}
          className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center gap-2"
        >
          <Plus size={16} />
          Ajouter
        </button>
      </div>

      {/* Liste des adresses */}
      <div className="grid gap-4">
        {addresses.map(address => (
          <div
            key={address.id}
            className={`bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border transition-all duration-300 ${
              showSelection && selectedAddressId === address.id
                ? 'border-blue-400 bg-blue-400/10'
                : 'border-white/10 hover:border-white/20'
            }`}
          >
            {/* 375 px : la fiche et sa colonne de boutons ne tiennent pas côte à côte —
                l'adresse se retrouvait écrasée. On empile sous `sm`. */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {address.company ? (
                    <Building className="text-blue-400" size={16} />
                  ) : (
                    <Home className="text-green-400" size={16} />
                  )}
                  <span className="text-white font-semibold">
                    {address.name}
                  </span>
                  {address.is_default && (
                    <span className="bg-green-500 text-white px-2 py-1 rounded-full text-xs font-medium">
                      Par défaut
                    </span>
                  )}
                </div>

                <div className="text-gray-300 text-sm space-y-1">
                  <div>
                    {address.first_name} {address.last_name}
                  </div>
                  {address.company && <div>{address.company}</div>}
                  <div>{address.address_line_1}</div>
                  {address.address_line_2 && (
                    <div>{address.address_line_2}</div>
                  )}
                  <div>
                    {address.postal_code} {address.city}
                  </div>
                  <div>{address.country}</div>
                  {address.phone && <div>Tél: {address.phone}</div>}
                </div>
              </div>

              {/* ★ DEUX BOUTONS « ✓ » IDENTIQUES CÔTE À CÔTE : l'un choisissait
                  l'adresse pour la commande en cours, l'autre la désignait comme adresse
                  par défaut pour toujours. Même icône, même taille, même couleur — on ne
                  pouvait les distinguer qu'en survolant. Ils ne se ressemblent plus :
                  coche bleue + intitulé « Choisir » pour la sélection, ÉTOILE pour
                  l'adresse par défaut, et chacun porte son propre `aria-label`. */}
              <div className="flex flex-wrap items-start justify-end gap-2 shrink-0">
                {showSelection && (
                  <button
                    onClick={() => onAddressSelect?.(address)}
                    title={
                      selectedAddressId === address.id
                        ? 'Adresse de livraison choisie'
                        : 'Choisir cette adresse pour la livraison'
                    }
                    aria-label="Choisir cette adresse pour la livraison"
                    className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 text-sm font-medium ${
                      selectedAddressId === address.id
                        ? 'bg-blue-400 text-white'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    <Check size={16} />
                    {selectedAddressId === address.id ? 'Choisie' : 'Choisir'}
                  </button>
                )}

                {!address.is_default && (
                  <button
                    onClick={() => handleSetDefault(address.id)}
                    className="p-2 bg-white/10 text-amber-300 rounded-lg hover:bg-white/20 transition-colors"
                    title="Définir comme adresse par défaut"
                    aria-label="Définir comme adresse par défaut"
                  >
                    <Star size={16} />
                  </button>
                )}

                <button
                  onClick={() => startEdit(address)}
                  className="p-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                  title="Modifier cette adresse"
                  aria-label="Modifier cette adresse"
                >
                  <Edit3 size={16} />
                </button>

                <button
                  onClick={() => handleDelete(address.id)}
                  className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                  title="Supprimer cette adresse"
                  aria-label="Supprimer cette adresse"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {addresses.length === 0 && (
        <div className="text-center py-8">
          <MapPin className="text-gray-400 mx-auto mb-4" size={48} />
          <h4 className="text-white font-semibold mb-2">Aucune adresse</h4>
          <p className="text-gray-400 mb-4">
            Ajoutez votre première adresse de livraison
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full font-semibold"
          >
            Ajouter une adresse
          </button>
        </div>
      )}

      {/* Formulaire d'ajout/modification */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-5 sm:p-8 border border-white/10 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">
                {editingAddress ? "Modifier l'adresse" : 'Nouvelle adresse'}
              </h3>
              <button
                onClick={resetForm}
                className="text-gray-400 hover:text-white transition-colors text-2xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nom de l'adresse *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                  placeholder="Ex: Domicile, Bureau..."
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Prénom *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={e =>
                      setFormData({ ...formData, first_name: e.target.value })
                    }
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                    placeholder="Prénom"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Nom *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.last_name}
                    onChange={e =>
                      setFormData({ ...formData, last_name: e.target.value })
                    }
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                    placeholder="Nom"
                  />
                </div>
              </div>

              <div>
                {/* ⚠ Ce champ n'est QU'UNE ÉTIQUETTE DE LIVRAISON : il s'imprime sur le
                    colis, il ne déclare rien fiscalement. Il était intitulé
                    « Entreprise (optionnel) » : un client professionnel le remplissait,
                    croyait acheter au nom de sa société, et repartait facturé avec TVA
                    sans qu'on lui ait rien demandé. On dit maintenant ce qu'il fait, et
                    où se décide l'achat au nom d'une société. */}
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Société destinataire (optionnel)
                </label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={e =>
                    setFormData({ ...formData, company: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                  placeholder="Nom à faire figurer sur le colis"
                />
                <p className="text-gray-400 text-xs mt-2">
                  Sert uniquement à l'adressage du colis. Pour acheter au nom d'une
                  société et faire vérifier votre numéro de TVA, utilisez « J'achète en
                  tant que » dans le panier.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Adresse *
                </label>
                <input
                  type="text"
                  required
                  value={formData.address_line_1}
                  onChange={e =>
                    setFormData({ ...formData, address_line_1: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                  placeholder="Numéro et nom de rue"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Complément d'adresse (optionnel)
                </label>
                <input
                  type="text"
                  value={formData.address_line_2}
                  onChange={e =>
                    setFormData({ ...formData, address_line_2: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                  placeholder="Appartement, étage, bâtiment..."
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Code postal *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.postal_code}
                    onChange={e =>
                      setFormData({ ...formData, postal_code: e.target.value })
                    }
                    className={`w-full bg-white/5 border rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none ${
                      erreurCodePostal
                        ? 'border-red-400/60 focus:border-red-400'
                        : 'border-white/20 focus:border-blue-400'
                    }`}
                    placeholder={
                      FORMATS_CP[codePays(formData.country) || '']?.exemple || 'Code postal'
                    }
                  />
                  {/* Signalé PENDANT la saisie : découvrir « code postal invalide » au
                      moment de payer, c'est perdre le client. */}
                  {erreurCodePostal && (
                    <p className="text-red-400 text-sm mt-2 flex items-start gap-1.5">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      {erreurCodePostal}
                    </p>
                  )}
                  {/* Outre-mer reconnu : on le NOMME, pour que le client sache qu'il est
                      desservi — et pourquoi son tarif et sa TVA ne sont pas ceux de la
                      métropole. */}
                  {!erreurCodePostal && territoireOutreMer(formData.postal_code) && (
                    <p className="text-emerald-300 text-sm mt-2 leading-relaxed">
                      Destination reconnue : {territoireOutreMer(formData.postal_code)}{' '}
                      (outre-mer). Tarif Colissimo outre-mer, et livraison exonérée de TVA
                      au titre de l'article 294 du CGI.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Ville *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.city}
                    onChange={e =>
                      setFormData({ ...formData, city: e.target.value })
                    }
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                    placeholder="Ville"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Pays *
                  </label>
                  <select
                    required
                    value={formData.country}
                    onChange={e =>
                      setFormData({ ...formData, country: e.target.value })
                    }
                    className="w-full dark-select rounded-lg px-4 py-3 focus:border-blue-400 focus:outline-none"
                  >
                    {/* Le pays du client peut ne plus figurer dans la liste desservie
                        (adresse ancienne) : on ne le fait pas disparaître silencieusement
                        du formulaire, sinon la modification écraserait son pays. */}
                    {formData.country &&
                      !paysDesservis.some(p => p.nom === formData.country) && (
                        <option value={formData.country}>{formData.country}</option>
                      )}
                    {paysDesservis.map(p => (
                      <option key={p.code} value={p.nom}>
                        {p.nom}
                      </option>
                    ))}
                  </select>
                  {codePays(formData.country) === 'FR' && (
                    <p className="text-gray-400 text-xs mt-2">
                      Outre-mer (Guadeloupe, Martinique, Guyane, La Réunion, Mayotte…) :
                      choisissez « France » et saisissez votre code postal en 97xxx ou
                      98xxx — c'est lui qui détermine le transport et la TVA.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Téléphone (optionnel)
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                    placeholder="Numéro de téléphone"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={formData.is_default}
                  onChange={e =>
                    setFormData({ ...formData, is_default: e.target.checked })
                  }
                  className="w-4 h-4 text-blue-400 bg-white/5 border-white/20 rounded focus:ring-blue-400"
                />
                <label htmlFor="is_default" className="text-gray-300">
                  Définir comme adresse par défaut
                </label>
              </div>

              <div className="flex gap-4 pt-4">
                {/* Désactivé pendant l'enregistrement : c'est ce qui empêche le double
                    clic de créer deux adresses identiques. */}
                <button
                  type="submit"
                  disabled={enregistrement || !!erreurCodePostal}
                  className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {enregistrement && <Loader2 size={16} className="animate-spin" />}
                  {enregistrement
                    ? 'Enregistrement…'
                    : editingAddress
                      ? 'Mettre à jour'
                      : "Ajouter l'adresse"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={enregistrement}
                  className="px-6 border-2 border-white/30 text-white rounded-lg font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300 disabled:opacity-50"
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

export default AddressManager;

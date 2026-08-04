import React, { useState, useEffect } from 'react';
import {
  Settings,
  RefreshCw,
  Image as ImageIcon,
  CheckCircle,
  AlertCircle,
  Info,
  Folder,
  FileImage,
  Terminal,
  Store,
  ShoppingCart,
  Phone,
  Truck,
  Mail,
  Send,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getAllAvailableImages } from '../../utils/imageManager';
import { useSiteSettings } from '../../contexts/SiteSettingsContext';
import { COMPANY_INFO } from '../../config/legalInfo';
import { supabase } from '../../lib/supabase';
import type { ShippingConfig, ModeLivraison } from '../../utils/shipping';

/* Un seuil de franco `null` (« pas de franco sur cette zone ») et un seuil à 0 €
   (« port offert à partir du premier euro ») sont DEUX réglages différents. Un champ
   texte vide porte le premier, jamais le second. */
const seuilVersTexte = (v: number | null): string => (v === null ? '' : String(v));
const texteVersSeuil = (s: string): number | null =>
  s.trim() === '' ? null : parseFloat(s.replace(',', '.'));

/**
 * Les types d'e-mails, dans l'ordre d'affichage.
 * ⚠ Les clés correspondent EXACTEMENT à celles que lit `private.notify()` côté base :
 * un type absent de `site_settings.email_notifications` vaut « désactivé ».
 */
const TYPES_NOTIFICATION: {
  cle: string;
  libelle: string;
  detail: string;
  pour: 'admin' | 'client';
}[] = [
  { cle: 'order_new', libelle: 'Nouvelle commande', detail: 'Un client vient de commander.', pour: 'admin' },
  { cle: 'contact_new', libelle: 'Message du site', detail: 'Le formulaire de contact a été rempli.', pour: 'admin' },
  { cle: 'bug_new', libelle: 'Signalement OMEGADMX', detail: 'Un utilisateur signale un problème.', pour: 'admin' },
  { cle: 'bug_reply_client', libelle: 'Réponse du client', detail: 'Il répond sur un signalement en cours.', pour: 'admin' },
  { cle: 'account_new', libelle: 'Nouveau compte', detail: 'Une inscription vient d’être enregistrée.', pour: 'admin' },
  { cle: 'order_ack', libelle: 'Confirmation de commande', detail: 'Récapitulatif des articles dès le paiement. Obligatoire en vente à distance.', pour: 'client' },
  { cle: 'contact_ack', libelle: 'Accusé de réception', detail: 'Son message nous est bien parvenu.', pour: 'client' },
  { cle: 'bug_ack', libelle: 'Signalement enregistré', detail: 'Lui transmet son code de suivi.', pour: 'client' },
  { cle: 'order_status', libelle: 'Suivi de commande', detail: 'Sa commande change d’état (expédiée, livrée…).', pour: 'client' },
  { cle: 'contact_answered', libelle: 'Réponse à son message', detail: 'Vous lui répondez depuis le back-office.', pour: 'client' },
  { cle: 'bug_reply_admin', libelle: 'Réponse à son signalement', detail: 'Vous répondez sur son ticket.', pour: 'client' },
];

const AdminSettings = () => {
  const { vitrineMode, setVitrineMode, shippingConfig, setShippingConfig } =
    useSiteSettings();
  const [savingMode, setSavingMode] = useState(false);
  const [savingShipping, setSavingShipping] = useState(false);

  // --- Notifications e-mail --------------------------------------------------
  // Lues et écrites ici plutôt que dans SiteSettingsContext : elles ne servent qu'à
  // cet écran, alors que le contexte est chargé par toutes les pages du site public.
  const [notifs, setNotifs] = useState<Record<string, boolean> | null>(null);
  const [savingNotifs, setSavingNotifs] = useState(false);
  const [testEnCours, setTestEnCours] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'email_notifications')
        .maybeSingle();
      if (error) {
        console.error('Chargement des notifications :', error);
        toast.error('Réglages de notification illisibles');
      }
      setNotifs((data?.value as Record<string, boolean>) || {});
    })();
  }, []);

  const enregistrerNotifs = async (suivant: Record<string, boolean>) => {
    const precedent = notifs;
    setNotifs(suivant); // l'interrupteur bascule tout de suite…
    setSavingNotifs(true);
    const { error } = await supabase.from('site_settings').upsert({
      key: 'email_notifications',
      value: suivant,
      updated_at: new Date().toISOString(),
    });
    setSavingNotifs(false);
    if (error) {
      setNotifs(precedent); // … et revient en arrière si la base a refusé.
      console.error('Enregistrement des notifications :', error);
      toast.error("Le réglage n'a pas pu être enregistré");
    }
  };

  const envoyerTest = async () => {
    setTestEnCours(true);
    const { error } = await supabase.rpc('notify_send_test');
    setTestEnCours(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('E-mail de test envoyé aux administrateurs');
    }
  };
  const [shipForm, setShipForm] = useState({
    brackets: [] as { max_kg: string; price: string }[],
    over_price: '',
    europe_surcharge: '',
    default_weight: '',
    z_fr_0_200: '',
    z_fr_200_500: '',
    z_fr_far: '',
    z_europe: '',
    z_express: '',
    near_km: '',
    mid_km: '',
    delay_days: '',
    /* ── Réglages v3 du moteur de livraison (`src/utils/shipping.ts`) ──────────
       Ils EXISTAIENT en base et pilotaient déjà les prix, mais aucun écran ne les
       exposait : l'exploitant ne pouvait ni voir ni changer le mode par défaut, les
       suppléments palette ou les seuils de franco. Un réglage invisible est un
       réglage que personne ne corrige. */
    utiliser_bareme_personnalise: false,
    signature_domicile: true,
    service_express: 'chrono18',
    service_relais: 'mondial_relay',
    service_outre_mer: 'prioritaire',
    mode_par_defaut: 'domicile',
    retrait_actif: true,
    retrait_delai_j: '',
    diviseur_volumetrique: '',
    sup_hayon: '',
    sup_rdv: '',
    sup_particulier: '',
    sup_zone_difficile: '',
    sup_corse_iles: '',
    sup_carburant_pct: '',
    sup_hors_gabarit: '',
    /* Franco : chaîne VIDE = pas de franco sur cette zone (et non « franco à 0 € »,
       qui offrirait le port à tout le monde). La distinction est portée jusqu'en base
       par un `null`. */
    franco_metropole: '',
    franco_corse_iles: '',
    franco_ue: '',
    franco_outre_mer: '',
    franco_modes: [] as string[],
  });

  // Recharge le formulaire quand la config arrive de la base.
  useEffect(() => {
    setShipForm({
      brackets: shippingConfig.parcel_brackets.map(b => ({
        max_kg: String(b.max_kg),
        price: String(b.price),
      })),
      over_price: String(shippingConfig.parcel_over_price),
      europe_surcharge: String(shippingConfig.parcel_europe_surcharge),
      default_weight: String(shippingConfig.default_weight_kg),
      z_fr_0_200: String(shippingConfig.pallet_zones.fr_0_200),
      z_fr_200_500: String(shippingConfig.pallet_zones.fr_200_500),
      z_fr_far: String(shippingConfig.pallet_zones.fr_far),
      z_europe: String(shippingConfig.pallet_zones.europe),
      z_express: String(shippingConfig.pallet_zones.express_eu),
      near_km: String(shippingConfig.near_km_max),
      mid_km: String(shippingConfig.mid_km_max),
      delay_days: String(shippingConfig.delay_days),

      utiliser_bareme_personnalise: shippingConfig.utiliser_bareme_personnalise,
      signature_domicile: shippingConfig.signature_domicile,
      service_express: shippingConfig.service_express,
      service_relais: shippingConfig.service_relais,
      service_outre_mer: shippingConfig.service_outre_mer,
      mode_par_defaut: shippingConfig.mode_par_defaut,
      retrait_actif: shippingConfig.retrait_actif,
      retrait_delai_j: String(shippingConfig.retrait_delai_j),
      diviseur_volumetrique: String(shippingConfig.diviseur_volumetrique),
      sup_hayon: String(shippingConfig.supplements_palette.hayon_ht),
      sup_rdv: String(shippingConfig.supplements_palette.rdv_ht),
      sup_particulier: String(shippingConfig.supplements_palette.particulier_ht),
      sup_zone_difficile: String(shippingConfig.supplements_palette.zone_difficile_ht),
      sup_corse_iles: String(shippingConfig.supplements_palette.corse_iles_ht),
      sup_carburant_pct: String(
        shippingConfig.supplements_palette.surcharge_carburant_pct
      ),
      sup_hors_gabarit: String(
        shippingConfig.supplements_palette.hors_gabarit_colissimo_ht
      ),
      // `null` (pas de franco) → chaîne vide dans le formulaire.
      franco_metropole: seuilVersTexte(shippingConfig.franco.metropole),
      franco_corse_iles: seuilVersTexte(shippingConfig.franco.corse_iles),
      franco_ue: seuilVersTexte(shippingConfig.franco.ue),
      franco_outre_mer: seuilVersTexte(shippingConfig.franco.outre_mer),
      franco_modes: [...shippingConfig.franco_modes],
    });
  }, [shippingConfig]);

  const num = (s: string) => parseFloat(String(s).replace(',', '.'));

  const setBracket = (i: number, field: 'max_kg' | 'price', value: string) => {
    const brackets = shipForm.brackets.map((b, j) =>
      j === i ? { ...b, [field]: value } : b
    );
    setShipForm({ ...shipForm, brackets });
  };

  const handleSaveShipping = async () => {
    const brackets = shipForm.brackets
      .map(b => ({ max_kg: num(b.max_kg), price: num(b.price) }))
      .filter(b => !isNaN(b.max_kg) && !isNaN(b.price));
    if (
      !brackets.length ||
      brackets.some(b => b.max_kg <= 0 || b.price < 0)
    ) {
      toast.error('Barème colis invalide : chaque tranche doit avoir un poids > 0 et un prix ≥ 0.');
      return;
    }

    const values = {
      over_price: num(shipForm.over_price),
      europe_surcharge: num(shipForm.europe_surcharge),
      default_weight: num(shipForm.default_weight),
      z_fr_0_200: num(shipForm.z_fr_0_200),
      z_fr_200_500: num(shipForm.z_fr_200_500),
      z_fr_far: num(shipForm.z_fr_far),
      z_europe: num(shipForm.z_europe),
      z_express: num(shipForm.z_express),
      near_km: num(shipForm.near_km),
      mid_km: num(shipForm.mid_km),
      delay_days: parseInt(shipForm.delay_days, 10),
    };
    if (Object.values(values).some(v => isNaN(v) || v < 0)) {
      toast.error('Tarifs, seuils ou délai invalides : vérifiez les valeurs saisies.');
      return;
    }
    if (values.near_km >= values.mid_km) {
      toast.error('Le seuil « zone proche » doit être inférieur au seuil « zone intermédiaire ».');
      return;
    }

    /* Les suppléments palette et le diviseur volumétrique sont eux aussi contrôlés :
       un diviseur à 0 ferait une division par zéro dans le poids volumétrique, et un
       supplément négatif offrirait de l'argent au client. */
    const avances = {
      retrait_delai_j: parseInt(shipForm.retrait_delai_j, 10),
      diviseur_volumetrique: num(shipForm.diviseur_volumetrique),
      sup_hayon: num(shipForm.sup_hayon),
      sup_rdv: num(shipForm.sup_rdv),
      sup_particulier: num(shipForm.sup_particulier),
      sup_zone_difficile: num(shipForm.sup_zone_difficile),
      sup_corse_iles: num(shipForm.sup_corse_iles),
      sup_carburant_pct: num(shipForm.sup_carburant_pct),
      sup_hors_gabarit: num(shipForm.sup_hors_gabarit),
    };
    if (Object.values(avances).some(v => isNaN(v) || v < 0)) {
      toast.error('Suppléments palette, délai de retrait ou diviseur invalides.');
      return;
    }
    if (avances.diviseur_volumetrique <= 0) {
      toast.error(
        'Le diviseur du poids volumétrique doit être strictement positif (5000 chez tous les transporteurs).'
      );
      return;
    }

    // Franco : vide = pas de franco. Une valeur saisie doit être un nombre positif.
    const francos = {
      metropole: texteVersSeuil(shipForm.franco_metropole),
      corse_iles: texteVersSeuil(shipForm.franco_corse_iles),
      ue: texteVersSeuil(shipForm.franco_ue),
      outre_mer: texteVersSeuil(shipForm.franco_outre_mer),
    };
    if (Object.values(francos).some(v => v !== null && (isNaN(v) || v < 0))) {
      toast.error(
        'Seuil de franco invalide : laissez la case VIDE pour désactiver le franco sur une zone.'
      );
      return;
    }

    setSavingShipping(true);
    const { error } = await setShippingConfig({
      ...shippingConfig, // préserve depot & champs avancés
      parcel_brackets: brackets.sort((a, b) => a.max_kg - b.max_kg),
      parcel_over_price: values.over_price,
      parcel_europe_surcharge: values.europe_surcharge,
      default_weight_kg: values.default_weight || 1,
      pallet_zones: {
        fr_0_200: values.z_fr_0_200,
        fr_200_500: values.z_fr_200_500,
        fr_far: values.z_fr_far,
        europe: values.z_europe,
        express_eu: values.z_express,
      },
      near_km_max: values.near_km,
      mid_km_max: values.mid_km,
      delay_days: values.delay_days || 7,

      utiliser_bareme_personnalise: shipForm.utiliser_bareme_personnalise,
      signature_domicile: shipForm.signature_domicile,
      service_express: shipForm.service_express as ShippingConfig['service_express'],
      service_relais: shipForm.service_relais as ShippingConfig['service_relais'],
      service_outre_mer:
        shipForm.service_outre_mer as ShippingConfig['service_outre_mer'],
      mode_par_defaut: shipForm.mode_par_defaut as ModeLivraison,
      retrait_actif: shipForm.retrait_actif,
      retrait_delai_j: avances.retrait_delai_j || 2,
      diviseur_volumetrique: avances.diviseur_volumetrique,
      supplements_palette: {
        hayon_ht: avances.sup_hayon,
        rdv_ht: avances.sup_rdv,
        particulier_ht: avances.sup_particulier,
        zone_difficile_ht: avances.sup_zone_difficile,
        corse_iles_ht: avances.sup_corse_iles,
        surcharge_carburant_pct: avances.sup_carburant_pct,
        hors_gabarit_colissimo_ht: avances.sup_hors_gabarit,
      },
      franco: francos,
      franco_modes: shipForm.franco_modes as ModeLivraison[],
    });
    setSavingShipping(false);
    if (error) {
      toast.error(error, { duration: 8000 });
      return;
    }
    toast.success('Tarifs de livraison enregistrés.');
  };
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    count: number;
    message: string;
    timestamp?: string;
  } | null>(null);

  const handleScanImages = async () => {
    setScanning(true);
    setScanResult(null);

    try {
      // Afficher un message d'instruction
      toast(
        <div className="flex flex-col gap-2">
          <div className="font-bold">Scan des images</div>
          <div className="text-sm">
            Pour scanner les images, exécutez cette commande dans votre terminal :
          </div>
          <code className="bg-black/50 px-2 py-1 rounded text-xs">
            npm run scan-images
          </code>
          <div className="text-xs text-gray-400 mt-1">
            Puis rechargez cette page pour voir les nouvelles images
          </div>
        </div>,
        {
          duration: 8000,
          icon: <Terminal className="text-blue-400" size={20} />,
        }
      );

      // Simuler un délai pour l'UX
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Compter les images actuelles
      const currentImages = getAllAvailableImages();

      setScanResult({
        success: true,
        count: currentImages.length,
        message: `${currentImages.length} images actuellement disponibles. Exécutez "npm run scan-images" pour mettre à jour la liste.`,
        timestamp: new Date().toLocaleString('fr-FR'),
      });

      toast.success('Consultez les instructions ci-dessus');
    } catch (error) {
      console.error('Erreur scan:', error);
      setScanResult({
        success: false,
        count: 0,
        message: 'Une erreur est survenue',
      });
      toast.error('Erreur lors du scan');
    } finally {
      setScanning(false);
    }
  };

  const currentImageCount = getAllAvailableImages().length;

  const handleModeChange = async (vitrine: boolean) => {
    if (vitrine === vitrineMode) return;
    setSavingMode(true);
    const { error } = await setVitrineMode(vitrine);
    setSavingMode(false);
    if (error) {
      toast.error(error, { duration: 8000 });
      return;
    }
    toast.success(
      vitrine
        ? 'Mode Vitrine activé : la vente en ligne est désactivée (devis + téléphone).'
        : 'Boutique en ligne activée : panier et paiement sont visibles.'
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <Settings className="text-purple-400" size={32} />
          Paramètres Système
        </h1>
        <p className="text-gray-400">
          Configuration et maintenance du système OMEGA
        </p>
      </div>

      {/* Section Mode du site : Vitrine / Boutique en ligne */}
      <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
        <div className="flex items-center gap-3 mb-2">
          <Store className="text-purple-400" size={24} />
          <h2 className="text-2xl font-bold text-white">Mode du site</h2>
        </div>
        <p className="text-gray-400 text-sm mb-6">
          En mode <b>Vitrine</b>, le site présente les produits sans vente en
          ligne : panier et paiement sont masqués partout, remplacés par
          « Demander un devis » et l'appel direct au {COMPANY_INFO.phone}.
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          <button
            onClick={() => handleModeChange(true)}
            disabled={savingMode}
            className={`text-left rounded-xl p-5 border transition-all duration-300 ${
              vitrineMode
                ? 'bg-purple-500/15 border-purple-400/60 ring-1 ring-purple-400/40'
                : 'bg-white/5 border-white/10 hover:border-white/30'
            } disabled:opacity-60`}
          >
            <div className="flex items-center gap-3 mb-2">
              <Phone className={vitrineMode ? 'text-purple-300' : 'text-gray-400'} size={20} />
              <span className="text-white font-semibold">Vitrine (devis / téléphone)</span>
              {vitrineMode && (
                <span className="ml-auto text-xs font-bold text-purple-300 bg-purple-500/20 px-2 py-1 rounded-full">
                  ACTIF
                </span>
              )}
            </div>
            <p className="text-gray-400 text-sm">
              Aucun achat en ligne possible. Les visiteurs demandent un devis ou
              appellent le {COMPANY_INFO.phone}.
            </p>
          </button>

          <button
            onClick={() => handleModeChange(false)}
            disabled={savingMode}
            className={`text-left rounded-xl p-5 border transition-all duration-300 ${
              !vitrineMode
                ? 'bg-green-500/15 border-green-400/60 ring-1 ring-green-400/40'
                : 'bg-white/5 border-white/10 hover:border-white/30'
            } disabled:opacity-60`}
          >
            <div className="flex items-center gap-3 mb-2">
              <ShoppingCart className={!vitrineMode ? 'text-green-300' : 'text-gray-400'} size={20} />
              <span className="text-white font-semibold">Boutique en ligne</span>
              {!vitrineMode && (
                <span className="ml-auto text-xs font-bold text-green-300 bg-green-500/20 px-2 py-1 rounded-full">
                  ACTIF
                </span>
              )}
            </div>
            <p className="text-gray-400 text-sm">
              Panier, paiement Stripe et commandes actifs. À n'ouvrir que
              lorsque la boutique est prête à vendre.
            </p>
          </button>
        </div>
      </div>

      {/* Section Livraison : barème colis au poids + palette par zones */}
      <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
        <div className="flex items-center gap-3 mb-2">
          <Truck className="text-blue-400" size={24} />
          <h2 className="text-2xl font-bold text-white">Livraison</h2>
        </div>
        <p className="text-gray-400 text-sm mb-6">
          Chaque produit a un <b>gabarit</b> (fiche produit) : <b>Colis</b> =
          tarifé au <b>poids total</b> du panier (barème ci-dessous) ;{' '}
          <b>Palette / encombrant</b> = tarifé <b>par unité</b> selon la zone,
          calculée automatiquement depuis le code postal (distance routière
          estimée depuis le dépôt de {shippingConfig.depot.label}) ou le pays.
          Les colis voyagent sans surcoût avec une palette. DOM-TOM et hors
          Europe : devis.
        </p>

        {/* Barème colis au poids */}
        <h3 className="text-white font-semibold mb-3">
          Barème colis — tranches de poids
        </h3>
        <div className="space-y-2 mb-3">
          {shipForm.brackets.map((b, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-gray-400 text-sm w-16 text-right">
                Jusqu'à
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={b.max_kg}
                onChange={e => setBracket(i, 'max_kg', e.target.value)}
                className="w-24 bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-white text-center focus:border-blue-400 focus:outline-none"
              />
              <span className="text-gray-400 text-sm">kg</span>
              <span className="text-gray-500">→</span>
              <input
                type="text"
                inputMode="decimal"
                value={b.price}
                onChange={e => setBracket(i, 'price', e.target.value)}
                className="w-28 bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-white text-center focus:border-blue-400 focus:outline-none"
              />
              <span className="text-gray-400 text-sm">€</span>
              <button
                onClick={() =>
                  setShipForm({
                    ...shipForm,
                    brackets: shipForm.brackets.filter((_, j) => j !== i),
                  })
                }
                className="text-red-400/70 hover:text-red-400 text-sm ml-2"
                title="Supprimer cette tranche"
              >
                Supprimer
              </button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <button
            onClick={() =>
              setShipForm({
                ...shipForm,
                brackets: [...shipForm.brackets, { max_kg: '', price: '' }],
              })
            }
            className="border border-white/20 text-gray-300 hover:text-white hover:border-white/40 px-4 py-2 rounded-lg text-sm transition-colors"
          >
            + Ajouter une tranche
          </button>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">Au-delà :</span>
            <input
              type="text"
              inputMode="decimal"
              value={shipForm.over_price}
              onChange={e =>
                setShipForm({ ...shipForm, over_price: e.target.value })
              }
              className="w-28 bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-white text-center focus:border-blue-400 focus:outline-none"
            />
            <span className="text-gray-400 text-sm">€</span>
          </div>
        </div>

        {/* Palette par zones */}
        <h3 className="text-white font-semibold mb-3">
          Palette / encombrant — prix par unité et par zone
        </h3>
        <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
          {(
            [
              ['z_fr_0_200', `France 0–${shipForm.near_km || '200'} km`],
              ['z_fr_200_500', `France ${shipForm.near_km || '200'}–${shipForm.mid_km || '500'} km`],
              ['z_fr_far', 'France entière'],
              ['z_europe', 'Europe'],
              ['z_express', 'Express Europe'],
            ] as const
          ).map(([field, label]) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {label}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={shipForm[field]}
                  onChange={e =>
                    setShipForm({ ...shipForm, [field]: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-white text-center focus:border-blue-400 focus:outline-none"
                />
                <span className="text-gray-400 text-sm">€</span>
              </div>
            </div>
          ))}
        </div>

        {/* Réglages avancés */}
        <div className="grid md:grid-cols-5 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Seuil zone proche (km)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={shipForm.near_km}
              onChange={e =>
                setShipForm({ ...shipForm, near_km: e.target.value })
              }
              className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-white text-center focus:border-blue-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Seuil zone intermédiaire (km)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={shipForm.mid_km}
              onChange={e =>
                setShipForm({ ...shipForm, mid_km: e.target.value })
              }
              className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-white text-center focus:border-blue-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Surcoût colis Europe (€)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={shipForm.europe_surcharge}
              onChange={e =>
                setShipForm({ ...shipForm, europe_surcharge: e.target.value })
              }
              className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-white text-center focus:border-blue-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Poids par défaut (kg)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={shipForm.default_weight}
              onChange={e =>
                setShipForm({ ...shipForm, default_weight: e.target.value })
              }
              className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-white text-center focus:border-blue-400 focus:outline-none"
            />
            <p className="text-gray-500 text-xs mt-1">
              Produit sans poids renseigné
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Délai d'expédition (jours)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={shipForm.delay_days}
              onChange={e =>
                setShipForm({ ...shipForm, delay_days: e.target.value })
              }
              className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-white text-center focus:border-blue-400 focus:outline-none"
            />
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            MODES D'EXPÉDITION (moteur v3)
            Ces réglages pilotaient DÉJÀ les prix affichés au client, mais aucun
            écran ne les montrait : impossible de savoir quel mode était proposé
            par défaut, ni de le changer sans redéployer le site.
            ═══════════════════════════════════════════════════════════════════ */}
        <h3 className="text-white font-semibold mb-1 mt-8">Modes d'expédition</h3>
        <p className="text-gray-400 text-sm mb-4">
          Quatre modes sont proposés au client — <b>domicile</b>, <b>express</b>,{' '}
          <b>relais</b>, <b>palette</b> — plus le <b>retrait</b> au dépôt de{' '}
          {shippingConfig.depot.label}. Au-delà de 30 kg ou hors gabarit, la bascule
          en palette est automatique.
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Mode proposé par défaut
            </label>
            <select
              value={shipForm.mode_par_defaut}
              onChange={e =>
                setShipForm({ ...shipForm, mode_par_defaut: e.target.value })
              }
              className="w-full dark-select rounded-lg px-3 py-2"
            >
              <option value="domicile">Domicile</option>
              <option value="express">Express</option>
              <option value="relais">Point relais</option>
              <option value="palette">Palette / encombrant</option>
              <option value="retrait">Retrait au dépôt</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Offre express
            </label>
            <select
              value={shipForm.service_express}
              onChange={e =>
                setShipForm({ ...shipForm, service_express: e.target.value })
              }
              className="w-full dark-select rounded-lg px-3 py-2"
            >
              <option value="chrono18">Chronopost 18 (avant 18 h) — moins cher</option>
              <option value="chrono13">Chronopost 13 (avant 13 h)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Réseau de points relais
            </label>
            <select
              value={shipForm.service_relais}
              onChange={e =>
                setShipForm({ ...shipForm, service_relais: e.target.value })
              }
              className="w-full dark-select rounded-lg px-3 py-2"
            >
              <option value="mondial_relay">Mondial Relay</option>
              <option value="colissimo_point_retrait">Colissimo point de retrait</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Offre outre-mer
            </label>
            <select
              value={shipForm.service_outre_mer}
              onChange={e =>
                setShipForm({ ...shipForm, service_outre_mer: e.target.value })
              }
              className="w-full dark-select rounded-lg px-3 py-2"
            >
              <option value="prioritaire">Prioritaire (6 à 18 jours)</option>
              <option value="economique">Économique maritime (13 à 31 jours)</option>
            </select>
            <p className="text-gray-500 text-xs mt-1">
              Grille Colissimo OM1/OM2 — jamais le tarif métropole
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <label className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-lg p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={shipForm.signature_domicile}
              onChange={e =>
                setShipForm({ ...shipForm, signature_domicile: e.target.checked })
              }
              className="mt-1"
            />
            <span className="text-sm text-gray-300">
              <b className="text-white">Signature à la livraison</b>
              <br />
              <span className="text-gray-500 text-xs">
                Recommandé : le matériel expédié a de la valeur, et sans signature la
                preuve de remise n'existe pas.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-lg p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={shipForm.retrait_actif}
              onChange={e =>
                setShipForm({ ...shipForm, retrait_actif: e.target.checked })
              }
              className="mt-1"
            />
            <span className="text-sm text-gray-300">
              <b className="text-white">Retrait au dépôt</b>
              <br />
              <span className="text-gray-500 text-xs">
                Gratuit, {shippingConfig.depot.label}
              </span>
            </span>
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Délai de retrait (jours ouvrés)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={shipForm.retrait_delai_j}
              onChange={e =>
                setShipForm({ ...shipForm, retrait_delai_j: e.target.value })
              }
              className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-white text-center focus:border-blue-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Diviseur du poids volumétrique
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={shipForm.diviseur_volumetrique}
              onChange={e =>
                setShipForm({ ...shipForm, diviseur_volumetrique: e.target.value })
              }
              className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-white text-center focus:border-blue-400 focus:outline-none"
            />
            <p className="text-gray-500 text-xs mt-1">
              (L × l × h en cm) ÷ ce nombre. 5000 chez tous les transporteurs. On
              facture le plus élevé des deux poids.
            </p>
          </div>
        </div>

        <label className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={shipForm.utiliser_bareme_personnalise}
            onChange={e =>
              setShipForm({
                ...shipForm,
                utiliser_bareme_personnalise: e.target.checked,
              })
            }
            className="mt-1"
          />
          <span className="text-sm text-gray-300">
            <b className="text-white">
              Utiliser mes barèmes ci-dessus au lieu des grilles transporteurs 2026
            </b>
            <br />
            <span className="text-gray-500 text-xs">
              Décoché (recommandé) : les prix viennent des grilles réelles Colissimo,
              Chronopost, Mondial Relay et messagerie. Coché : les tranches saisies
              plus haut reprennent la main sur la métropole et l'Europe. Les
              corrections de zone (outre-mer, Corse, code postal invalide) restent
              actives dans les deux cas — c'est ce qui empêchait de vendre à perte
              jusqu'à 135 € par colis vers l'outre-mer.
            </span>
          </span>
        </label>

        {/* ═══ Suppléments palette ═══ */}
        <h3 className="text-white font-semibold mb-1">Suppléments palette (€ HT)</h3>
        <p className="text-gray-400 text-sm mb-4">
          Facturés en plus du transport quand la situation l'exige. Les valeurs par
          défaut sont les médianes des fourchettes publiées par les transporteurs
          (référentiel 2026) ; la surcharge carburant est indexée mensuellement et se
          révise chaque mois.
        </p>
        <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
          {(
            [
              ['sup_hayon', 'Hayon élévateur', 'Camion sans quai de déchargement'],
              ['sup_rdv', 'Prise de rendez-vous', 'Livraison sur créneau convenu'],
              ['sup_particulier', 'Livraison à particulier', 'Palette hors adresse professionnelle'],
              ['sup_zone_difficile', 'Zone difficile', 'Montagne, centre-ville'],
              ['sup_corse_iles', 'Corse et îles', 'Jamais le tarif métropole nu'],
              ['sup_carburant_pct', 'Surcharge carburant (%)', 'Indexée chaque mois'],
              ['sup_hors_gabarit', 'Hors gabarit Colissimo', 'L+l+h de 150 à 200 cm'],
            ] as const
          ).map(([field, label, aide]) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {label}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={shipForm[field]}
                onChange={e =>
                  setShipForm({ ...shipForm, [field]: e.target.value })
                }
                className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-white text-center focus:border-blue-400 focus:outline-none"
              />
              <p className="text-gray-500 text-xs mt-1">{aide}</p>
            </div>
          ))}
        </div>

        {/* ═══ Franco de port ═══ */}
        <h3 className="text-white font-semibold mb-1">Franco de port (€ HT)</h3>
        <p className="text-gray-400 text-sm mb-4">
          Montant de commande à partir duquel le port est offert.{' '}
          <b>Laissez la case VIDE pour ne pas offrir le port sur une zone</b> — une
          case vide et un zéro ne disent pas la même chose : zéro offrirait le port
          dès le premier euro. Le franco est une décision commerciale : hors
          métropole, le transport coûte 2 à 10 fois plus cher, d'où des cases vides
          par défaut.
        </p>
        <div className="grid md:grid-cols-4 gap-4 mb-4">
          {(
            [
              ['franco_metropole', 'France métropolitaine'],
              ['franco_corse_iles', 'Corse et îles'],
              ['franco_ue', 'Union européenne'],
              ['franco_outre_mer', 'Outre-mer'],
            ] as const
          ).map(([field, label]) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {label}
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="pas de franco"
                value={shipForm[field]}
                onChange={e =>
                  setShipForm({ ...shipForm, [field]: e.target.value })
                }
                className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-white text-center placeholder-gray-600 focus:border-blue-400 focus:outline-none"
              />
            </div>
          ))}
        </div>
        <div className="mb-6">
          <span className="block text-sm font-medium text-gray-300 mb-2">
            Modes éligibles au franco
          </span>
          <div className="flex flex-wrap gap-3">
            {(
              [
                ['domicile', 'Domicile'],
                ['relais', 'Point relais'],
                ['express', 'Express'],
                ['palette', 'Palette'],
              ] as const
            ).map(([mode, label]) => (
              <label
                key={mode}
                className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 cursor-pointer text-sm text-gray-300"
              >
                <input
                  type="checkbox"
                  checked={shipForm.franco_modes.includes(mode)}
                  onChange={e =>
                    setShipForm({
                      ...shipForm,
                      franco_modes: e.target.checked
                        ? [...shipForm.franco_modes, mode]
                        : shipForm.franco_modes.filter(m => m !== mode),
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <p className="text-gray-500 text-xs mt-2">
            Offrir un envoi express ou une palette revient à payer 40 à 280 € de
            transport sur une commande qui vient d'atteindre le seuil : les deux sont
            décochés par défaut.
          </p>
        </div>

        <button
          onClick={handleSaveShipping}
          disabled={savingShipping}
          className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 disabled:opacity-50"
        >
          {savingShipping ? 'Enregistrement…' : 'Enregistrer les tarifs'}
        </button>
      </div>

      {/* Section Notifications e-mail */}
      <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
        <div className="flex items-center gap-3 mb-2">
          <Mail className="text-blue-400" size={24} />
          <h2 className="text-2xl font-bold text-white">Notifications par e-mail</h2>
        </div>
        <p className="text-gray-400 text-sm mb-6">
          Envoyées depuis votre messagerie{' '}
          <span className="text-gray-300">omegasud.fr</span>. Chaque type se règle
          séparément et prend effet immédiatement.
        </p>

        {notifs === null ? (
          <div className="text-gray-400 text-sm">Chargement…</div>
        ) : (
          <div className="space-y-6">
            {(['admin', 'client'] as const).map(pour => (
              <div key={pour}>
                <h3 className="text-white font-semibold mb-3">
                  {pour === 'admin'
                    ? 'Ce que les administrateurs reçoivent'
                    : 'Ce que le client reçoit'}
                </h3>
                <div className="space-y-2">
                  {TYPES_NOTIFICATION.filter(t => t.pour === pour).map(t => {
                    const actif = notifs[t.cle] === true;
                    return (
                      <button
                        key={t.cle}
                        type="button"
                        role="switch"
                        aria-checked={actif}
                        onClick={() =>
                          enregistrerNotifs({ ...notifs, [t.cle]: !actif })
                        }
                        disabled={savingNotifs}
                        className="w-full flex items-center justify-between gap-4 bg-white/5 hover:bg-white/10 rounded-lg p-4 border border-white/10 text-left transition-colors disabled:opacity-60"
                      >
                        <span>
                          <span className="block text-white font-medium">
                            {t.libelle}
                          </span>
                          <span className="block text-gray-400 text-sm">
                            {t.detail}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 w-11 h-6 rounded-full p-1 transition-colors ${
                            actif ? 'bg-blue-500' : 'bg-white/15'
                          }`}
                        >
                          <span
                            className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                              actif ? 'translate-x-5' : ''
                            }`}
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={envoyerTest}
                disabled={testEnCours}
                className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold flex items-center gap-2 hover:shadow-lg hover:shadow-blue-500/25 transition-all disabled:opacity-60"
              >
                <Send size={16} />
                {testEnCours ? 'Envoi…' : 'Envoyer un e-mail de test'}
              </button>
              <span className="text-gray-500 text-sm">
                Part vers tous les comptes administrateurs, quels que soient les types
                cochés ci-dessus.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Section Gestion des Images */}
      <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
        <div className="flex items-center gap-3 mb-6">
          <ImageIcon className="text-blue-400" size={24} />
          <h2 className="text-2xl font-bold text-white">Gestion des Images</h2>
        </div>

        <div className="space-y-6">
          {/* Statistiques */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <FileImage className="text-blue-400" size={20} />
                <span className="text-gray-400 text-sm">Images disponibles</span>
              </div>
              <div className="text-3xl font-bold text-white">{currentImageCount}</div>
            </div>

            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Folder className="text-green-400" size={20} />
                <span className="text-gray-400 text-sm">Dossier source</span>
              </div>
              <div className="text-sm font-mono text-white">/public/products/</div>
            </div>

            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Info className="text-blue-400" size={20} />
                <span className="text-gray-400 text-sm">Formats supportés</span>
              </div>
              <div className="text-xs text-white">PNG, JPG, WEBP, SVG, GIF</div>
            </div>
          </div>

          {/* Instruction Box */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="text-blue-400 flex-shrink-0 mt-1" size={20} />
              <div className="space-y-2">
                <h3 className="text-white font-semibold">Comment scanner les images ?</h3>
                <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
                  <li>Ajoutez vos images dans le dossier <code className="bg-black/30 px-1 rounded">/public/products/</code></li>
                  <li>Ouvrez un terminal dans le dossier du projet</li>
                  <li>Exécutez la commande : <code className="bg-black/30 px-2 py-1 rounded">npm run scan-images</code></li>
                  <li>Rechargez cette page pour voir les nouvelles images</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Bouton Scan */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleScanImages}
              disabled={scanning}
              className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw
                className={scanning ? 'animate-spin' : ''}
                size={20}
              />
              {scanning ? 'Instructions...' : 'Voir les instructions'}
            </button>

            <button
              onClick={() => window.location.reload()}
              className="border-2 border-white/30 text-white px-6 py-4 rounded-lg font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300"
            >
              Recharger la page
            </button>
          </div>

          {/* Résultat du scan */}
          {scanResult && (
            <div
              className={`rounded-lg p-4 border ${
                scanResult.success
                  ? 'bg-green-500/10 border-green-500/20'
                  : 'bg-red-500/10 border-red-500/20'
              }`}
            >
              <div className="flex items-start gap-3">
                {scanResult.success ? (
                  <CheckCircle className="text-green-400 flex-shrink-0" size={20} />
                ) : (
                  <AlertCircle className="text-red-400 flex-shrink-0" size={20} />
                )}
                <div className="flex-1">
                  <div
                    className={`font-semibold mb-1 ${
                      scanResult.success ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {scanResult.success ? 'Information' : 'Erreur'}
                  </div>
                  <div className="text-gray-300 text-sm">{scanResult.message}</div>
                  {scanResult.timestamp && (
                    <div className="text-gray-500 text-xs mt-2">
                      {scanResult.timestamp}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Guide rapide */}
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <Terminal className="text-purple-400" size={18} />
              Commande Terminal
            </h3>
            <div className="bg-black/50 rounded p-3 font-mono text-sm">
              <div className="text-gray-400 mb-1"># Scanner les images</div>
              <div className="text-green-400">npm run scan-images</div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Cette commande scanne automatiquement le dossier /public/products/ et met à jour la liste des images disponibles dans l'admin.
            </p>
          </div>
        </div>
      </div>

      {/* Section Informations Système */}
      <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
        <div className="flex items-center gap-3 mb-6">
          <Info className="text-blue-400" size={24} />
          <h2 className="text-2xl font-bold text-white">Informations Système</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <div className="text-gray-400 text-sm mb-1">Version</div>
            <div className="text-white font-semibold">OMEGA WEBSITE v1.0</div>
          </div>

          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <div className="text-gray-400 text-sm mb-1">Environnement</div>
            <div className="text-white font-semibold">
              {import.meta.env.MODE === 'development' ? 'Développement' : 'Production'}
            </div>
          </div>

          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <div className="text-gray-400 text-sm mb-1">Base de données</div>
            <div className="text-white font-semibold">Supabase</div>
          </div>

          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <div className="text-gray-400 text-sm mb-1">Framework</div>
            <div className="text-white font-semibold">React + Vite + TypeScript</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;

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
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getAllAvailableImages } from '../../utils/imageManager';
import { useSiteSettings } from '../../contexts/SiteSettingsContext';
import { COMPANY_INFO } from '../../config/legalInfo';

const AdminSettings = () => {
  const { vitrineMode, setVitrineMode, shippingConfig, setShippingConfig } =
    useSiteSettings();
  const [savingMode, setSavingMode] = useState(false);
  const [savingShipping, setSavingShipping] = useState(false);
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

        <button
          onClick={handleSaveShipping}
          disabled={savingShipping}
          className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 disabled:opacity-50"
        >
          {savingShipping ? 'Enregistrement…' : 'Enregistrer les tarifs'}
        </button>
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

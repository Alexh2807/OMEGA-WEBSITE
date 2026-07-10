import React, { useState } from 'react';
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
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getAllAvailableImages } from '../../utils/imageManager';
import { useSiteSettings } from '../../contexts/SiteSettingsContext';
import { COMPANY_INFO } from '../../config/legalInfo';

const AdminSettings = () => {
  const { vitrineMode, setVitrineMode } = useSiteSettings();
  const [savingMode, setSavingMode] = useState(false);
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

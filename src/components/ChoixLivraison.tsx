import React from 'react';
import {
  Truck,
  Zap,
  Store,
  Package,
  MapPin,
  Check,
  Clock,
  Info,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { OffreLivraison, ModeLivraison } from '../utils/shipping';

/**
 * Sélecteur d'offre de livraison.
 *
 * POURQUOI UN COMPOSANT AUTONOME : le panier n'est pas le seul endroit où le
 * client choisit son transport (tunnel de commande, renouvellement d'une
 * commande, back-office SAV). Ce composant ne connaît ni le panier, ni
 * Supabase, ni le contexte : on lui donne des offres, il renvoie celle que le
 * client a cliquée. Toute la logique tarifaire reste dans `utils/shipping.ts`.
 *
 * POURQUOI `flex-col` PUIS `sm:flex-row` : le récapitulatif du panier actuel
 * met transporteur, délai et prix sur une seule ligne, ce qui écrase le prix
 * sous 360 px de large. Ici la carte s'empile verticalement par défaut et ne
 * passe en ligne qu'à partir de `sm`.
 *
 * Le point relais n'est PAS un faux sélecteur : tant que l'API transporteur
 * (Sendcloud `/api/v3/service-points` ou Boxtal) n'est pas branchée, on affiche
 * un encart honnête « à implémenter » plutôt qu'une liste bidon qui ferait
 * croire au client que son relais est réservé.
 */

export interface ChoixLivraisonProps {
  /** Offres renvoyées par `listerOffresLivraison()`. */
  offres: OffreLivraison[];
  /** `service` de l'offre actuellement sélectionnée. */
  valeur: string | null;
  /** Appelé avec l'offre cliquée. */
  onChange: (offre: OffreLivraison) => void;
  /** Affiche le squelette de chargement. */
  chargement?: boolean;
  /** Affiche les prix HT au lieu des prix TTC (cohérent avec le panier pro). */
  affichageHt?: boolean;
  className?: string;
}

const ICONES: Record<ModeLivraison, LucideIcon> = {
  domicile: Truck,
  express: Zap,
  relais: Store,
  palette: Package,
  retrait: MapPin,
};

const LIBELLES_MODE: Record<ModeLivraison, string> = {
  domicile: 'À domicile',
  express: 'Express',
  relais: 'Point relais',
  palette: 'Sur palette',
  retrait: 'Retrait au dépôt',
};

function formatEuro(montant: number): string {
  return montant.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  });
}

/** « sous 1 à 2 jours ouvrés », « sous 1 jour ouvré ». */
function formatDelai(min: number, max: number): string {
  if (max <= 0) return 'délai à confirmer';
  if (min === max) return `sous ${min} jour${min > 1 ? 's' : ''} ouvré${min > 1 ? 's' : ''}`;
  return `sous ${min} à ${max} jours ouvrés`;
}

const ChoixLivraison: React.FC<ChoixLivraisonProps> = ({
  offres,
  valeur,
  onChange,
  chargement = false,
  affichageHt = false,
  className = '',
}) => {
  /* Badges : calculés sur les seules offres chiffrées. Le retrait au dépôt est
     gratuit et gagnerait systématiquement « le moins cher » — ce serait vrai
     mais inutile, on ne compare que les offres réellement expédiées. */
  const chiffrees = offres.filter(o => !o.sur_devis && o.mode !== 'retrait');
  const prixMini = chiffrees.length ? Math.min(...chiffrees.map(o => o.prix_ttc)) : null;
  const delaiMini = chiffrees.length ? Math.min(...chiffrees.map(o => o.delai_max_j)) : null;

  if (chargement) {
    return (
      <div className={`space-y-3 ${className}`} aria-busy="true" aria-live="polite">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Loader2 size={16} className="animate-spin" />
          Recherche des offres de livraison…
        </div>
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="bg-white/5 border border-white/10 rounded-xl p-4 animate-pulse"
          >
            <div className="h-4 w-1/3 bg-white/10 rounded mb-3" />
            <div className="h-3 w-1/2 bg-white/10 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!offres.length) {
    return (
      <div
        className={`bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-gray-400 ${className}`}
      >
        Aucune offre de livraison à afficher pour le moment.
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`} role="radiogroup" aria-label="Mode de livraison">
      {offres.map(offre => {
        const Icone = ICONES[offre.mode] ?? Truck;
        const selectionnee = valeur === offre.service;
        const gratuite = !offre.sur_devis && offre.prix_ttc === 0;
        const leMoinsCher =
          !offre.sur_devis && prixMini !== null && offre.mode !== 'retrait' && offre.prix_ttc === prixMini;
        const lePlusRapide =
          !offre.sur_devis && delaiMini !== null && offre.mode !== 'retrait' && offre.delai_max_j === delaiMini;

        /* Une offre « sur devis » n'est pas sélectionnable : elle explique
           pourquoi le tarif ne peut pas être calculé (adresse à compléter,
           code postal invalide, destination hors zone) et rien de plus. */
        if (offre.sur_devis) {
          return (
            <div
              key={offre.service}
              className="bg-amber-500/5 border border-amber-400/25 rounded-xl p-4"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-300 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-white font-medium">{offre.libelle}</p>
                  {offre.motif && (
                    <p className="text-amber-200/90 text-sm mt-1 leading-relaxed">{offre.motif}</p>
                  )}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={offre.service}>
            <button
              type="button"
              role="radio"
              aria-checked={selectionnee}
              onClick={() => onChange(offre)}
              className={`w-full text-left bg-white/5 border rounded-xl p-4 transition-all duration-200 hover:border-white/25 focus:outline-none focus:ring-2 focus:ring-blue-400/60 ${
                selectionnee
                  ? 'border-blue-400/70 ring-1 ring-blue-400/40 bg-blue-500/10'
                  : 'border-white/10'
              }`}
            >
              {/* Mobile : tout s'empile. À partir de sm : transporteur à gauche,
                  prix à droite. */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
                      selectionnee ? 'bg-blue-500/25 text-blue-200' : 'bg-white/5 text-gray-300'
                    }`}
                  >
                    <Icone size={18} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs uppercase tracking-wide text-gray-400">
                        {LIBELLES_MODE[offre.mode]}
                      </span>
                      {selectionnee && (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-200">
                          <Check size={12} /> Sélectionné
                        </span>
                      )}
                    </div>
                    <p className="text-white font-semibold leading-snug break-words">
                      {offre.libelle}
                    </p>
                    <p className="flex items-center gap-1.5 text-sm text-gray-400 mt-1">
                      <Clock size={14} className="shrink-0" />
                      {formatDelai(offre.delai_min_j, offre.delai_max_j)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-start sm:text-right">
                  <span
                    className={`font-bold text-lg ${gratuite ? 'text-emerald-300' : 'text-white'}`}
                  >
                    {gratuite
                      ? 'Offerte'
                      : formatEuro(affichageHt ? offre.prix_ht : offre.prix_ttc)}
                  </span>
                  {!gratuite && (
                    <span className="text-xs text-gray-400">
                      {affichageHt
                        ? `soit ${formatEuro(offre.prix_ttc)} TTC`
                        : `dont TVA · ${formatEuro(offre.prix_ht)} HT`}
                    </span>
                  )}
                </div>
              </div>

              {(leMoinsCher || lePlusRapide || offre.motif) && (
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {leMoinsCher && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/25">
                      Le moins cher
                    </span>
                  )}
                  {lePlusRapide && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-400/25">
                      Le plus rapide
                    </span>
                  )}
                  {offre.motif && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Info size={12} className="shrink-0" />
                      {offre.motif}
                    </span>
                  )}
                </div>
              )}
            </button>

            {/* Choix du point relais — uniquement quand l'offre relais est
                sélectionnée, et sans faire semblant d'avoir la liste. */}
            {selectionnee && offre.relais_requis && (
              <div className="mt-2 ml-0 sm:ml-12 bg-white/5 border border-dashed border-white/20 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <MapPin size={18} className="text-blue-300 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-white font-medium">Choix du point relais</p>
                    <p className="text-sm text-gray-400 mt-1 leading-relaxed">
                      La carte des points relais n'est pas encore branchée :
                      l'intégration de l'API {offre.carrier === 'mondial_relay'
                        ? 'Mondial Relay'
                        : 'du transporteur'}{' '}
                      reste <strong className="text-amber-300">à implémenter côté API transporteur</strong>.
                    </p>
                    <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                      En attendant, notre équipe vous contacte après la commande pour fixer
                      ensemble le relais le plus proche de chez vous.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ChoixLivraison;

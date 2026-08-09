import React from 'react';
import { Link } from 'react-router-dom';
import { Cpu, MonitorPlay, ArrowRight } from 'lucide-react';

/**
 * « Boîtier ≠ Logiciel » — le repère commun aux deux pages OMEGA DMX.
 *
 * Le boîtier s'appelle OMEGA DMX Interface, le logiciel s'appelle OMEGADMX : une seule
 * espace les sépare, et les visiteurs confondaient les deux pages. RÈGLE DE NOMMAGE DU
 * SITE, appliquée partout (menu, titres, textes, illustrations) :
 *
 *   • le nom n'est JAMAIS servi nu — il est précédé de sa nature : « le boîtier OMEGA DMX
 *     Interface », « le logiciel OMEGADMX » ;
 *   • le mot « interface » ne désigne QUE le boîtier. Pour l'écran du logiciel on dit
 *     « prise en main », « affichage », « fenêtre » — jamais « interface » ;
 *   • une icône fixe accompagne chaque nature : puce = boîtier, écran = logiciel.
 *
 * Ce composant est volontairement partagé : deux copies divergeraient à la première
 * retouche, et la confusion reviendrait par là.
 */

const OmegaDmxDuo: React.FC<{ actif: 'boitier' | 'logiciel'; className?: string }> = ({
  actif,
  className = '',
}) => {
  const cartes = [
    {
      cle: 'boitier' as const,
      icone: Cpu,
      nature: 'Le boîtier',
      nom: 'OMEGA DMX Interface',
      quoi: 'Le matériel que vous achetez.',
      detail: '2 sorties XLR, 1024 canaux, radio jusqu’à 1 km. Il envoie le DMX aux machines.',
      to: '/omega-dmx-interface',
      cta: 'Voir le boîtier',
    },
    {
      cle: 'logiciel' as const,
      icone: MonitorPlay,
      nature: 'Le logiciel',
      nom: 'OMEGADMX',
      quoi: 'Le programme sur votre ordinateur.',
      detail:
        'Pages de lyres, plateau 3D, effets, scènes. Il est fourni avec le boîtier, sans abonnement.',
      to: '/omega-dmx-logiciel',
      cta: 'Voir le logiciel',
    },
  ];

  return (
    <section className={`border-y border-white/10 bg-zinc-950/60 py-14 md:py-16 ${className}`}>
      <div className="mx-auto max-w-5xl px-5">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-white/40">
          Deux produits, deux noms proches
        </p>
        <h2 className="mt-3 text-center text-2xl font-semibold tracking-tight md:text-3xl">
          Le boîtier et le logiciel ne sont pas la même chose
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-white/50">
          Les noms se ressemblent — <strong className="text-white/80">OMEGA DMX Interface</strong>{' '}
          est le boîtier, <strong className="text-white/80">OMEGADMX</strong> est le logiciel. Les
          deux vont ensemble : le logiciel est inclus à l’achat du boîtier.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {cartes.map((c) => {
            const courant = c.cle === actif;
            return (
              <div
                key={c.cle}
                className={`relative rounded-2xl border p-6 transition ${
                  courant
                    ? 'border-white/40 bg-white/[0.06]'
                    : 'border-white/10 bg-black/40 hover:border-white/25'
                }`}
              >
                {courant && (
                  <span className="absolute right-5 top-5 rounded-full border border-white/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">
                    Vous êtes ici
                  </span>
                )}
                <c.icone size={22} strokeWidth={1.5} className="text-white" />
                <div className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-white/45">
                  {c.nature}
                </div>
                <div className="mt-1 text-xl font-semibold tracking-tight">{c.nom}</div>
                <p className="mt-3 text-sm font-medium text-white/75">{c.quoi}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-white/45">{c.detail}</p>
                {!courant && (
                  <Link
                    to={c.to}
                    className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white transition hover:gap-3"
                  >
                    {c.cta}
                    <ArrowRight size={15} />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default OmegaDmxDuo;

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  MonitorPlay,
  Move,
  Palette,
  Layers,
  Zap,
  Shield,
  Gauge,
  Sparkles,
  CircuitBoard,
  Ban,
  Download,
  Radio,
  KeyRound,
  Check,
} from 'lucide-react';

/* Apparition au scroll — même pattern que la fiche boîtier. */
const Reveal: React.FC<{
  children: React.ReactNode;
  className?: string;
  delay?: number;
}> = ({ children, className = '', delay = 0 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true);
            obs.unobserve(e.target);
          }
        }),
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
      } ${className}`}
    >
      {children}
    </div>
  );
};

const GALLERY = [
  {
    src: '/products/omega-dmx-soft-live-stage.png',
    alt: 'Vue 3D avec effet circulaire et faisceau orange',
    label: 'Vue 3D · effet cercle',
    title: 'Mouvements automatiques en 3D',
    text: 'Cercle, huit, swing, wave : amplitude, vitesse et déphasage entre lyres. Le plateau 3D montre chaque faisceau pendant que vous réglez.',
  },
  {
    src: '/products/omega-dmx-soft-3d.webp',
    alt: 'Visualisation 3D multi-projecteurs',
    label: 'Scène multi-lyres',
    title: 'Concevez avant d’allumer la salle',
    text: 'Placez vos projecteurs, orientez les faisceaux, testez les scènes — sans brancher un seul projecteur.',
  },
  {
    src: '/products/omega-dmx-soft-color.webp',
    alt: 'Mixage couleur et canaux DMX',
    label: 'Couleur & canaux',
    title: 'Couleur, gobos, dimmer',
    text: 'Faders précis par canal, presets, isolation d’attributs : un contrôle de régie, pas un jouet.',
  },
  {
    src: '/products/omega-dmx-soft-dashboard.webp',
    alt: 'Console et scènes OMEGADMX',
    label: 'Console live',
    title: 'Jouez le show en live',
    text: 'Scènes, faders, pages de machines et blackout : pensé pour le jour J, pas seulement pour la préprod.',
  },
  {
    src: '/products/omega-dmx-soft-plan2d.webp',
    alt: 'Plan d’implantation 2D',
    label: 'Plan 2D',
    title: 'Implantation claire',
    text: 'Glissez-déposez vos lyres sur le plan, gérez symétrie et inversions sans vous perdre dans un tableur.',
  },
  {
    src: '/products/omega-dmx-soft-move.webp',
    alt: 'Contrôle PAN/TILT',
    label: 'Mouvement',
    title: 'PAN / TILT maîtrisés',
    text: 'Pad de trajectoire, types de mouvement et réglages fins pour des balayages propres et synchronisés.',
  },
];

const FEATURES = [
  {
    icon: Boxes,
    t: 'Vue 3D temps réel',
    d: 'Faisceaux, positions et mouvements visibles pendant que vous programmez.',
  },
  {
    icon: Move,
    t: 'Effets de mouvement',
    d: 'Cercle, huit, swing, wave — avec amplitude, vitesse et déphasage multi-lyres.',
  },
  {
    icon: Palette,
    t: 'Couleur & attributs',
    d: 'RVB, blanc, gobos, dimmer, FX : un pilotage fin de chaque canal.',
  },
  {
    icon: Layers,
    t: 'Scènes & console',
    d: 'Pages machines, scènes générales, faders et blackout pour la régie live.',
  },
  {
    icon: CircuitBoard,
    t: '2 univers DMX',
    d: '1024 canaux avec le boîtier OMEGA — ou licence pour une interface tierce.',
  },
  {
    icon: Radio,
    t: 'Sans fil OMEGA',
    d: 'Monitoring du signal et pilotage jusqu’à longue portée avec les cartes OMEGA.',
  },
  {
    icon: Shield,
    t: 'Show protégé',
    d: 'Sauvegarde continue dans le boîtier : le spectacle continue même si le PC lâche.',
  },
  {
    icon: KeyRound,
    t: 'Licence flexible',
    d: 'Gratuit avec boîtier OMEGA. Licence optionnelle pour Sunlite et autres interfaces.',
  },
];

const OmegaDmxLogicielPage = () => {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* HERO */}
      <section className="relative pt-28 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-950/40 via-black to-black" />
        <div className="absolute top-20 right-0 w-[480px] h-[480px] bg-purple-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[360px] h-[360px] bg-blue-600/10 rounded-full blur-3xl" />

        <div className="container mx-auto px-6 relative">
          <Link
            to="/omega-dmx-interface"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-8"
          >
            <ArrowLeft size={16} />
            Voir le boîtier OMEGA DMX
          </Link>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/25 rounded-full px-4 py-2 mb-6">
                <MonitorPlay className="text-purple-400" size={16} />
                <span className="text-purple-300 text-sm font-medium tracking-wider uppercase">
                  Logiciel de pilotage
                </span>
              </div>
              <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-5">
                OMEGADMX
                <span className="block bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                  Le logiciel de régie
                </span>
              </h1>
              <p className="text-xl text-gray-300 leading-relaxed max-w-xl mb-8">
                Programmez vos lyres en 3D, enchaînez les scènes et pilotez jusqu’à 2 univers DMX.
                Inclus avec le boîtier OMEGA — sans abonnement.
              </p>

              <div className="flex flex-wrap gap-3 mb-8">
                {['Vue 3D', 'Effets mouvement', 'Sans abonnement', 'Windows'].map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1.5 text-sm bg-white/5 border border-white/10 text-gray-200 px-3 py-1.5 rounded-full"
                  >
                    <Check size={14} className="text-blue-400" />
                    {t}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap gap-4">
                <Link
                  to="/omega-dmx-interface"
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-7 py-3.5 rounded-full font-semibold hover:shadow-xl hover:shadow-blue-500/25 transition-all"
                >
                  Boîtier + logiciel inclus
                  <ArrowRight size={18} />
                </Link>
                <Link
                  to="/contact"
                  className="inline-flex items-center gap-2 border border-white/15 text-white px-7 py-3.5 rounded-full font-semibold hover:bg-white/5 transition-colors"
                >
                  Demander une démo
                </Link>
              </div>

              <p className="mt-5 text-sm text-gray-500">
                Licence optionnelle pour piloter une interface d’une autre marque (Sunlite…).
              </p>
            </div>

            <Reveal>
              <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-gray-950 shadow-2xl shadow-blue-900/20">
                <img
                  src="/products/omega-dmx-soft-live-stage.png"
                  alt="OMEGADMX — plateau scénique 3D avec effet de mouvement"
                  className="w-full h-auto"
                />
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/70 to-transparent p-5">
                  <div className="text-xs font-semibold tracking-wider text-blue-300 mb-1">
                    CAPTURE RÉELLE · EFFET CERCLE
                  </div>
                  <div className="text-white font-bold">Plateau 3D · PAN/TILT automatiques</div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* POURQUOI */}
      <section className="py-20 border-t border-white/5">
        <div className="container mx-auto px-6">
          <Reveal>
            <div className="text-center max-w-3xl mx-auto mb-14">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Pensé pour la régie, pas pour le labo
              </h2>
              <p className="text-gray-400 text-lg">
                Une interface claire, des mouvements prêts à l’emploi, une vue 3D pour anticiper le
                rendu — et la solidité d’un boîtier qui peut sauver le show si le PC s’arrête.
              </p>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f, i) => (
              <Reveal key={f.t} delay={i * 60}>
                <div className="h-full p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-blue-500/30 transition-colors">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-600/20 flex items-center justify-center mb-4">
                    <f.icon className="text-blue-400" size={22} />
                  </div>
                  <h3 className="font-bold text-white mb-1.5">{f.t}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{f.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* GALERIE */}
      <section className="py-20 bg-gradient-to-b from-black via-blue-950/10 to-black">
        <div className="container mx-auto px-6">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto mb-12">
              <div className="inline-flex items-center gap-2 text-purple-400 text-sm font-semibold tracking-wider uppercase mb-3">
                <Sparkles size={16} />
                Dans le logiciel
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-3">De la 3D au live</h2>
              <p className="text-gray-400">
                Quelques écrans tirés d’OMEGADMX : programmation, effets et lecture en conditions
                de show.
              </p>
            </div>
          </Reveal>

          <div className="space-y-10">
            {GALLERY.map((g, i) => (
              <Reveal key={g.src} delay={(i % 3) * 80}>
                <div
                  className={`grid lg:grid-cols-2 gap-8 items-center ${
                    i % 2 === 1 ? 'lg:[&>*:first-child]:order-2' : ''
                  }`}
                >
                  <div className="rounded-2xl overflow-hidden border border-white/10 bg-black">
                    <img src={g.src} alt={g.alt} className="w-full h-auto object-cover" loading="lazy" />
                  </div>
                  <div>
                    <span className="inline-block text-xs font-semibold tracking-wider uppercase text-blue-400 mb-3">
                      {g.label}
                    </span>
                    <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">{g.title}</h3>
                    <p className="text-gray-400 text-lg leading-relaxed">{g.text}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* MOUVEMENTS */}
      <section className="py-20 border-t border-white/5">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <Reveal>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Effets de mouvement en un clic
              </h2>
              <p className="text-gray-400 text-lg mb-6 leading-relaxed">
                Plus besoin de dessiner chaque point de trajectoire à la main. Choisissez un type de
                mouvement, ajustez l’amplitude et la vitesse, décalez les lyres entre elles : le
                rendu 3D suit en direct.
              </p>
              <div className="flex flex-wrap gap-2 mb-6">
                {['Cercle', 'Huit', 'Swing', 'Wave', 'Déphasage multi-lyres'].map((m) => (
                  <span
                    key={m}
                    className="text-sm bg-white/5 border border-white/10 text-gray-200 px-4 py-2 rounded-full"
                  >
                    {m}
                  </span>
                ))}
              </div>
              <ul className="space-y-3 text-gray-300">
                {[
                  'Amplitude PAN / TILT indépendantes',
                  'Vitesse en Hz, déphasage en degrés',
                  'Position de repos et trajectoire sur pad',
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <Check className="text-green-400 mt-0.5 flex-shrink-0" size={18} />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={100}>
              <div className="rounded-3xl overflow-hidden border border-white/10">
                <img
                  src="/products/omega-dmx-soft-live-stage.png"
                  alt="Effet de mouvement circulaire sur lyre en 3D"
                  className="w-full"
                />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* MODÈLE ÉCO */}
      <section className="py-20 bg-gradient-to-b from-gray-950 to-black">
        <div className="container mx-auto px-6">
          <Reveal>
            <div className="max-w-4xl mx-auto rounded-3xl border border-white/10 bg-white/[0.03] p-8 md:p-12">
              <div className="grid md:grid-cols-2 gap-10">
                <div>
                  <div className="inline-flex items-center gap-2 text-green-400 text-sm font-semibold mb-3">
                    <Ban size={16} />
                    Sans abonnement
                  </div>
                  <h2 className="text-3xl font-bold mb-4">Comment c’est financé ?</h2>
                  <p className="text-gray-400 leading-relaxed">
                    Avec un boîtier OMEGA DMX, le logiciel est inclus : l’achat du matériel finance
                    le développement. Pour piloter une interface d’une autre marque, une licence
                    OMEGADMX prend le relais.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-black/40 border border-white/10">
                    <div className="font-bold text-white mb-1">Boîtier OMEGA DMX</div>
                    <div className="text-sm text-gray-400">
                      Logiciel gratuit · 2 univers · sauvegarde show dans le boîtier
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-black/40 border border-white/10">
                    <div className="font-bold text-white mb-1">Licence logiciel</div>
                    <div className="text-sm text-gray-400">
                      Interfaces tierces (ex. Sunlite) · activation sur 2 postes
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 mt-10 pt-8 border-t border-white/10">
                <Link
                  to="/omega-dmx-interface"
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-7 py-3.5 rounded-full font-semibold"
                >
                  Découvrir le boîtier
                  <ArrowRight size={18} />
                </Link>
                <Link
                  to="/contact"
                  className="inline-flex items-center gap-2 border border-white/15 px-7 py-3.5 rounded-full font-semibold hover:bg-white/5"
                >
                  Nous contacter
                </Link>
              </div>
            </div>
          </Reveal>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto mt-12">
            {[
              { icon: Zap, t: 'Rapide', d: 'Fluide le jour J' },
              { icon: Shield, t: 'Fiable', d: 'Show sécurisé' },
              { icon: Gauge, t: 'Stable', d: 'Sortie DMX solide' },
              { icon: Download, t: 'Mises à jour', d: 'Incluses, en un clic' },
            ].map((h, i) => (
              <Reveal key={h.t} delay={i * 80}>
                <div className="text-center p-5 rounded-2xl bg-white/5 border border-white/10">
                  <h.icon className="mx-auto text-blue-400 mb-2" size={24} />
                  <div className="font-bold text-white">{h.t}</div>
                  <div className="text-xs text-gray-400 mt-1">{h.d}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default OmegaDmxLogicielPage;

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Boxes,
  MonitorPlay,
  Move,
  Palette,
  Layers,
  Wifi,
  Shield,
  Sparkles,
  Ban,
  Radio,
  LayoutGrid,
  Bug,
  EyeOff,
  Wrench,
  Check,
  ShoppingCart,
} from 'lucide-react';

/* ================================================================== */
/*  OMEGADMX Logiciel — Product Experience + parallax                 */
/*  Captures RÉELLES de l'app Windows (public/products/omega-dmx-v2-) */
/* ================================================================== */

const IMG = {
  afx: '/products/omega-dmx-v2-page-afx.webp',
  beam: '/products/omega-dmx-v2-page-beam.webp',
  color: '/products/omega-dmx-v2-couleur.webp',
  dmx: '/products/omega-dmx-v2-sortie-dmx.webp',
  conn: '/products/omega-dmx-v2-connexion.webp',
  dimmer: '/products/omega-dmx-v2-dimmer-page.webp',
  effet: '/products/omega-dmx-v2-effet-3d.webp',
  controle: '/products/omega-dmx-v2-controle.webp',
  box: '/products/omega-dmx-px-hero-box.webp',
};

const FEATURES = [
  {
    id: 'pages',
    kicker: 'Pages de lyres',
    title: 'Une page = une machine (ou un groupe)',
    text: 'Onglets par lyre, scènes & presets, plateau 3D et contrôles en live. Changez de machine sans perdre le fil du show.',
    img: IMG.afx,
    icon: LayoutGrid,
    points: ['Onglets multi-machines', 'Scènes & presets par page', 'Plateau 3D + position'],
  },
  {
    id: 'controle',
    kicker: 'Contrôle complet',
    title: 'Dimmer, gobos, couleur, mouvements',
    text: 'Sur une Beam réelle : intensité, strobe, gobos, iris, roue de couleur, FX cercle / huit / swing et plan 2D d’implantation.',
    img: IMG.beam,
    icon: Wrench,
    reverse: true,
    points: ['Gobos & optiques', 'FX mouvement', 'Canaux DMX mappés'],
  },
  {
    id: 'couleur',
    kicker: 'Couleur RGBW',
    title: 'Mélange précis, canal par canal',
    text: 'Roue de couleur, faders R/V/B/Blanc, ambre, outils de mélange, FX rainbow et flash — le look sous les yeux.',
    img: IMG.color,
    icon: Palette,
    points: ['Mélange RGBW live', 'Presets de teintes', 'FX rainbow / flash'],
  },
  {
    id: '3d',
    kicker: 'Vue 3D',
    title: 'Concevez avant d’allumer la salle',
    text: 'Le plateau scénique 3D reproduit faisceaux et mouvements pendant que vous programmez. Perspective face, dessus, côté…',
    img: IMG.effet,
    icon: Boxes,
    reverse: true,
    points: ['Faisceaux temps réel', 'Vues Face / Dessus / Côté', 'Effets visibles en 3D'],
  },
  {
    id: 'sortie',
    kicker: 'Sortie DMX',
    title: 'Les 512 canaux sous les yeux',
    text: 'Moniteur de sortie DMX : univers, canaux actifs et valeurs live — pour le debug en régie sans deviner.',
    img: IMG.dmx,
    icon: Layers,
    points: ['Grille 512 canaux', 'Valeurs en live', 'Multi-univers'],
  },
  {
    id: 'connexion',
    kicker: 'Connexion boîtier',
    title: 'WiFi, USB ou Bluetooth',
    text: 'Paramètres Interface DMX : détection automatique du boîtier OMEGA (ou Sunlite), choix du port, liaison fiable.',
    img: IMG.conn,
    icon: Wifi,
    reverse: true,
    points: ['USB / WiFi / Bluetooth', 'Détection auto', 'Port COM avancé'],
  },
  {
    id: 'dimmer',
    kicker: 'Dimmer de page',
    title: 'Intensité et blackout par page',
    text: 'Réglez le niveau d’une page entière, multiplié par le Dimmer Master — et blackout de page en un clic.',
    img: IMG.dimmer,
    icon: EyeOff,
    points: ['Dimmer de page', 'Blackout ciblé', 'Contrôle master'],
  },
];

const MORE = [
  { icon: Move, t: 'Mouvements auto', d: 'Cercle, huit, swing, wave, déphasage multi-lyres.' },
  { icon: LayoutGrid, t: 'Masquage de pages', d: 'Masquez une page sans la perdre — récupérable dans le gestionnaire.' },
  { icon: Bug, t: 'Signalement rapide', d: 'Aide → Signaler un problème : ticket + suivi, même compte OMEGA.' },
  { icon: Radio, t: 'Monitoring signal', d: 'Qualité de liaison des cartes sans fil sous contrôle.' },
  { icon: Shield, t: 'Show protégé', d: 'Sauvegarde continue dans le boîtier OMEGA.' },
  { icon: Ban, t: 'Sans abonnement', d: 'Logiciel inclus avec le boîtier. Licence optionnelle pour interfaces tierces.' },
];

/** Révélation + léger décalage 3D au scroll */
const Reveal: React.FC<{
  children: React.ReactNode;
  className?: string;
  delay?: number;
}> = ({ children, className = '', delay = 0 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (ents) =>
        ents.forEach((e) => {
          if (e.isIntersecting) {
            setOn(true);
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.1, rootMargin: '0px 0px -6% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-[900ms] ease-out ${
        on ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-14'
      } ${className}`}
    >
      {children}
    </div>
  );
};

/** Cadre UI en perspective (style product shot) */
const ScreenFrame: React.FC<{
  src: string;
  alt: string;
  tilt?: 'left' | 'right' | 'none';
  className?: string;
}> = ({ src, alt, tilt = 'none', className = '' }) => {
  const rot =
    tilt === 'left' ? 'rotateY(8deg) rotateX(4deg)' : tilt === 'right' ? 'rotateY(-8deg) rotateX(4deg)' : 'none';
  return (
    <div
      className={`relative ${className}`}
      style={{ perspective: '1400px' }}
    >
      <div
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.85)] transition-transform duration-700 will-change-transform"
        style={{
          transform: rot,
          transformStyle: 'preserve-3d',
        }}
      >
        <div className="absolute inset-0 z-10 pointer-events-none bg-gradient-to-tr from-blue-500/10 via-transparent to-purple-500/10" />
        <img src={src} alt={alt} className="block w-full h-auto object-cover" loading="lazy" />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
      </div>
    </div>
  );
};

/** Parallax layer driven by scroll */
const useParallax = (speed = 0.15) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const mid = rect.top + rect.height / 2 - window.innerHeight / 2;
        el.style.transform = `translate3d(0, ${(-mid * speed).toFixed(1)}px, 0)`;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [speed]);
  return ref;
};

const ParallaxImg: React.FC<{ src: string; alt: string; speed?: number; className?: string }> = ({
  src,
  alt,
  speed = 0.12,
  className = '',
}) => {
  const ref = useParallax(speed);
  return (
    <div className={`overflow-hidden ${className}`}>
      <div ref={ref} className="will-change-transform">
        <img src={src} alt={alt} className="w-full h-auto scale-110 object-cover" loading="lazy" />
      </div>
    </div>
  );
};

const OmegaDmxLogicielPage = () => {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-blue-500/30 overflow-x-hidden">
      {/* ─── HERO PARALLAX ─── */}
      <section className="relative min-h-[100svh] flex items-end pb-20 pt-28">
        <div className="absolute inset-0 overflow-hidden">
          <ParallaxImg
            src={IMG.afx}
            alt="OMEGADMX — page machine et vue 3D"
            speed={0.18}
            className="absolute inset-0 h-full"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/40" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-7xl px-5">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-300/90 mb-4">
            Logiciel de pilotage · Captures réelles
          </p>
          <h1 className="max-w-4xl text-5xl md:text-7xl lg:text-8xl font-semibold tracking-tight leading-[1.02]">
            OMEGADMX
            <span className="block text-white/40 font-normal text-3xl md:text-5xl mt-3">
              La régie, en 3D.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/65 leading-relaxed">
            Pages de lyres, éditeurs, masquage, connexion boîtier, sortie DMX, signalements —
            le logiciel inclus avec l’interface OMEGA, sans abonnement.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              to="/omega-dmx-interface"
              className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-black hover:bg-white/90 transition"
            >
              <ShoppingCart size={18} />
              Voir le boîtier
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 px-7 py-3.5 text-sm font-semibold hover:bg-white/5 transition"
            >
              Explorer les fonctions
              <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </section>

      {/* ─── FLOATING TRIPTYCH ─── */}
      <section className="relative py-24 md:py-32 border-t border-white/5">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-white/40">
              Dans le logiciel
            </p>
            <h2 className="mt-4 text-center text-3xl md:text-5xl font-semibold tracking-tight">
              De la page machine au moniteur DMX
            </h2>
          </Reveal>

          <div
            className="mt-16 grid gap-6 md:grid-cols-3 items-end"
            style={{ perspective: '1600px' }}
          >
            <Reveal delay={0}>
              <ScreenFrame src={IMG.beam} alt="Contrôle Beam — gobos et FX" tilt="left" />
            </Reveal>
            <Reveal delay={100}>
              <ScreenFrame src={IMG.afx} alt="Page AFX — 3D et scènes" tilt="none" className="md:-translate-y-8" />
            </Reveal>
            <Reveal delay={200}>
              <ScreenFrame src={IMG.dmx} alt="Moniteur sortie DMX 512" tilt="right" />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── FEATURE CHAPTERS ─── */}
      <div id="features">
        {FEATURES.map((f, i) => (
          <section
            key={f.id}
            id={f.id}
            className="border-t border-white/5 py-20 md:py-28 scroll-mt-24"
          >
            <div
              className={`mx-auto grid max-w-7xl items-center gap-12 px-5 lg:grid-cols-2 lg:gap-16 ${
                f.reverse ? 'lg:[&>*:first-child]:order-2' : ''
              }`}
            >
              <Reveal>
                <ScreenFrame
                  src={f.img}
                  alt={f.title}
                  tilt={f.reverse ? 'left' : 'right'}
                />
              </Reveal>
              <Reveal delay={120}>
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-blue-400/90">
                  <f.icon size={14} />
                  {f.kicker}
                </div>
                <h3 className="mt-4 text-3xl md:text-4xl font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-4 text-base md:text-lg text-white/55 leading-relaxed">{f.text}</p>
                <ul className="mt-8 space-y-3">
                  {f.points.map((p) => (
                    <li key={p} className="flex items-start gap-3 text-sm md:text-base text-white/75">
                      <Check className="mt-0.5 shrink-0 text-blue-400" size={18} />
                      {p}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          </section>
        ))}
      </div>

      {/* ─── FULL BLEED SORTIE DMX ─── */}
      <section className="relative min-h-[70svh] flex items-end">
        <div className="absolute inset-0 overflow-hidden">
          <ParallaxImg src={IMG.dmx} alt="Sortie DMX" speed={0.14} className="absolute inset-0 h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/20" />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-5 pb-16 w-full">
          <Reveal>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300/90">
              <MonitorPlay size={14} />
              Moniteur live
            </div>
            <h2 className="mt-4 max-w-2xl text-3xl md:text-5xl font-semibold tracking-tight">
              Ce qui sort vraiment sur le DMX
            </h2>
            <p className="mt-4 max-w-lg text-white/60 text-lg">
              Plus de « ça devrait marcher ». La grille 512 canaux affiche les valeurs actives en
              temps réel.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ─── MORE FEATURES GRID ─── */}
      <section className="border-t border-white/5 py-24 md:py-32 bg-zinc-950/40">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal>
            <h2 className="text-center text-3xl md:text-4xl font-semibold tracking-tight">
              Et encore…
            </h2>
            <p className="mt-3 text-center text-white/45 max-w-xl mx-auto">
              Masquage de pages, signalement rapide, monitoring, sauvegarde boîtier — le quotidien de
              la régie.
            </p>
          </Reveal>
          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {MORE.map((m, i) => (
              <Reveal key={m.t} delay={i * 50}>
                <div className="h-full rounded-2xl border border-white/10 bg-black/50 p-7 hover:border-white/20 transition">
                  <m.icon className="text-blue-400" size={24} strokeWidth={1.5} />
                  <h3 className="mt-5 text-lg font-semibold">{m.t}</h3>
                  <p className="mt-2 text-sm text-white/50 leading-relaxed">{m.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── GALLERY STRIP ─── */}
      <section className="border-t border-white/5 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-10">
              Galerie — captures réelles
            </h2>
          </Reveal>
          <div className="grid md:grid-cols-2 gap-5">
            {[
              { src: IMG.afx, cap: 'Page machine · scènes & 3D' },
              { src: IMG.beam, cap: 'Contrôle Beam · gobos & FX' },
              { src: IMG.color, cap: 'Couleur RGBW & intensité' },
              { src: IMG.dmx, cap: 'Sortie DMX 512 canaux' },
              { src: IMG.conn, cap: 'Connexion boîtier' },
              { src: IMG.dimmer, cap: 'Dimmer / blackout de page' },
            ].map((g, i) => (
              <Reveal key={g.cap} delay={(i % 2) * 60}>
                <figure className="group overflow-hidden rounded-2xl border border-white/10 bg-zinc-950">
                  <div className="overflow-hidden">
                    <img
                      src={g.src}
                      alt={g.cap}
                      className="aspect-[16/10] w-full object-cover object-top transition duration-700 group-hover:scale-[1.03]"
                      loading="lazy"
                    />
                  </div>
                  <figcaption className="px-5 py-3 text-sm text-white/45 border-t border-white/5">
                    {g.cap}
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="relative border-t border-white/5 py-28 overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <img src={IMG.box} alt="" className="w-full h-full object-cover" />
        </div>
        <div className="absolute inset-0 bg-black/80" />
        <div className="relative z-10 mx-auto max-w-3xl px-5 text-center">
          <Reveal>
            <Sparkles className="mx-auto text-blue-400 mb-4" size={28} />
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight">
              Logiciel inclus.
              <span className="block text-white/40">Sans abonnement.</span>
            </h2>
            <p className="mt-5 text-white/55 max-w-md mx-auto">
              Avec le boîtier OMEGA DMX, OMEGADMX est fourni. Licence optionnelle pour les
              interfaces d’autres marques.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Link
                to="/omega-dmx-interface"
                className="inline-flex items-center gap-2 rounded-full bg-white px-10 py-4 text-sm font-semibold text-black hover:bg-white/90"
              >
                Découvrir OMEGA DMX
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 rounded-full border border-white/25 px-8 py-4 text-sm font-semibold hover:bg-white/5"
              >
                Demander une démo
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
};

export default OmegaDmxLogicielPage;

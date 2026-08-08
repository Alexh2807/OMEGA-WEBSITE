import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  Mail,
  Layers,
  Wifi,
  Ban,
  Save,
  MonitorPlay,
  Radio,
  Zap,
  Shield,
  ChevronDown,
  Check,
  Antenna,
  Cable,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Product } from '../types';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useSiteSettings } from '../contexts/SiteSettingsContext';
import toast from 'react-hot-toast';

/* ================================================================== */
/*  OMEGA DMX Interface — Product Experience                           */
/*  Photos RÉELLES du boîtier (P102…) + callouts animés               */
/* ================================================================== */

const BOX = {
  hero: '/products/p1021135.webp',
  dmxClose: '/products/omega-box-dmx-close.webp',
  sidePorts: '/products/omega-box-side-ports.webp',
  antennes: '/products/omega-box-antennes.webp',
  antenneUsb: '/products/omega-box-antenne-usb.webp',
  topPorts: '/products/omega-box-top-ports.webp',
  angle: '/products/omega-box-angle.webp',
  detail: '/products/omega-box-detail.webp',
  soft: '/products/omega-dmx-v2-page-afx.webp',
};

const PRICE_TTC = 429;
const PRICE_HT = PRICE_TTC / 1.2;

type Callout = {
  /** 0–100 % position du point sur l'image */
  x: number;
  y: number;
  label: string;
  sub?: string;
  /** côté de l'étiquette */
  side?: 'left' | 'right';
  color?: string;
};

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
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-[900ms] ease-out ${
        on ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
      } ${className}`}
    >
      {children}
    </div>
  );
};

/**
 * Photo produit + fils/callouts animés (repères sur ports, antenne…).
 * Les positions sont en % pour rester responsive.
 */
const AnnotatedPhoto: React.FC<{
  src: string;
  alt: string;
  callouts: Callout[];
  className?: string;
}> = ({ src, alt, callouts, className = '' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setActive(true);
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 ${className}`}>
      <img src={src} alt={alt} className="block w-full h-auto object-cover" loading="lazy" />

      {/* Callouts */}
      {callouts.map((c, i) => {
        const side = c.side || (c.x > 50 ? 'right' : 'left');
        const color = c.color || '#38bdf8';
        const labelX = side === 'right' ? Math.min(c.x + 18, 92) : Math.max(c.x - 18, 8);
        const labelY = Math.max(c.y - 8, 8);

        return (
          <div
            key={i}
            className="pointer-events-none absolute inset-0"
            style={{
              opacity: active ? 1 : 0,
              transition: `opacity 0.6s ease ${0.2 + i * 0.15}s`,
            }}
          >
            {/* SVG wire */}
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <line
                x1={c.x}
                y1={c.y}
                x2={labelX}
                y2={labelY}
                stroke={color}
                strokeWidth="0.35"
                strokeDasharray="1.2 0.8"
                className={active ? 'omx-wire-draw' : ''}
                style={{
                  filter: `drop-shadow(0 0 2px ${color})`,
                  animationDelay: `${0.25 + i * 0.15}s`,
                }}
              />
            </svg>

            {/* Hotspot pulse */}
            <span
              className="absolute block h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${c.x}%`,
                top: `${c.y}%`,
                background: color,
                boxShadow: `0 0 0 0 ${color}`,
                animation: active ? 'omxPulse 2s ease-out infinite' : 'none',
                animationDelay: `${0.3 + i * 0.15}s`,
              }}
            />
            <span
              className="absolute block h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white/80"
              style={{ left: `${c.x}%`, top: `${c.y}%`, background: color }}
            />

            {/* Label card */}
            <div
              className="absolute max-w-[46%] -translate-x-1/2 -translate-y-full rounded-xl border border-white/15 bg-black/80 px-3 py-2 backdrop-blur-md shadow-xl"
              style={{
                left: `${labelX}%`,
                top: `${labelY}%`,
                borderColor: `${color}55`,
                transform: active
                  ? 'translate(-50%, calc(-100% - 6px))'
                  : 'translate(-50%, calc(-100% + 8px))',
                transition: `transform 0.55s cubic-bezier(.16,1,.3,1) ${0.3 + i * 0.12}s, opacity 0.45s ease ${0.3 + i * 0.12}s`,
                opacity: active ? 1 : 0,
              }}
            >
              <div className="text-[11px] font-bold tracking-wide" style={{ color }}>
                {c.label}
              </div>
              {c.sub && <div className="mt-0.5 text-[10px] leading-snug text-white/55">{c.sub}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const OmegaDmxInterfacePage = () => {
  const [sticky, setSticky] = useState(false);
  const [dbProduct, setDbProduct] = useState<Product | null>(null);
  const { addToCart } = useCart();
  const { user, affichagePrix } = useAuth();
  const { vitrineMode } = useSiteSettings();
  const navigate = useNavigate();
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('products')
        .select('*')
        .ilike('name', '%dmx%')
        .limit(1)
        .maybeSingle();
      if (data) setDbProduct(data);
    })();
  }, []);

  useEffect(() => {
    const onScroll = () => {
      if (!heroRef.current) return;
      setSticky(heroRef.current.getBoundingClientRect().bottom < 64);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isPro = affichagePrix === 'ht';
  const mainPrice = isPro ? PRICE_HT : PRICE_TTC;
  const mainLabel = isPro ? 'HT' : 'TTC';
  const altPrice = isPro
    ? `${PRICE_TTC.toFixed(2).replace('.', ',')} € TTC`
    : `${PRICE_HT.toFixed(2).replace('.', ',')} € HT`;
  const fmt = (n: number) =>
    n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const handleBuy = () => {
    if (vitrineMode) {
      navigate('/contact?sujet=devis&produit=OMEGA%20DMX%20Interface');
      return;
    }
    if (!user) {
      toast.error('Connectez-vous pour passer commande');
      navigate('/connexion');
      return;
    }
    if (dbProduct) addToCart(dbProduct);
    else {
      toast('Pour finaliser, contactez notre équipe', { duration: 4000 });
      navigate('/contact');
    }
  };

  const buyLabel = vitrineMode ? 'Demander un devis' : `Commander — ${fmt(mainPrice)} €`;

  return (
    <div className="min-h-screen bg-black text-white selection:bg-blue-500/40">
      <style>{`
        @keyframes omxPulse {
          0% { box-shadow: 0 0 0 0 rgba(56,189,248,.55); }
          70% { box-shadow: 0 0 0 14px rgba(56,189,248,0); }
          100% { box-shadow: 0 0 0 0 rgba(56,189,248,0); }
        }
        @keyframes omxWireDraw {
          from { stroke-dashoffset: 24; opacity: 0; }
          to { stroke-dashoffset: 0; opacity: 1; }
        }
        .omx-wire-draw {
          stroke-dasharray: 1.2 0.9;
          animation: omxWireDraw 0.9s ease forwards;
        }
      `}</style>

      {/* STICKY BAR */}
      <div
        className={`fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-black/90 backdrop-blur-xl transition-transform duration-300 ${
          sticky ? 'translate-y-0' : '-translate-y-full'
        }`}
        style={{ paddingTop: 'max(4.5rem, env(safe-area-inset-top))' }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <img src={BOX.hero} alt="" className="h-10 w-14 rounded object-cover" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-wide">OMEGA DMX Interface</div>
              <div className="text-xs text-white/50">
                {fmt(mainPrice)} € {mainLabel} · logiciel inclus
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleBuy}
            className="shrink-0 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            {vitrineMode ? 'Devis' : 'Commander'}
          </button>
        </div>
      </div>

      {/* ─── HERO : vrai boîtier ─── */}
      <section
        ref={heroRef}
        className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden pb-16 pt-28"
      >
        <div className="pointer-events-none absolute inset-0">
          <img
            src={BOX.hero}
            alt="OMEGA DMX Interface — boîtier réel, 2 sorties XLR"
            className="h-full w-full object-cover object-[center_60%]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/25" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/20 to-transparent" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-7xl px-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-white/60">
            Fabrication OMEGA · Design réel
          </p>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl lg:text-8xl">
            OMEGA DMX
            <span className="mt-2 block text-2xl font-normal text-white/45 md:text-4xl">
              Interface
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/70 md:text-xl">
            2 sorties DMX. 1024 canaux. Antenne interchangeable jusqu&apos;à&nbsp;1&nbsp;km.
            <br className="hidden sm:block" />
            Logiciel inclus — sans abonnement.
          </p>

          <div className="mt-10 flex flex-wrap items-end gap-6">
            <div>
              <div className="text-4xl font-semibold tracking-tight md:text-5xl">
                {fmt(mainPrice)} €
                <span className="ml-2 text-lg font-normal text-white/45">{mainLabel}</span>
              </div>
              <div className="mt-1 text-sm text-white/40">soit {altPrice}</div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleBuy}
                className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-black transition hover:bg-white/90"
              >
                <ShoppingCart size={18} />
                {buyLabel}
              </button>
              <a
                href="#boitier"
                className="inline-flex items-center gap-2 rounded-full border border-white/25 px-7 py-3.5 text-sm font-semibold transition hover:border-white/50 hover:bg-white/5"
              >
                Voir le boîtier
                <ChevronDown size={16} />
              </a>
            </div>
          </div>

          <div className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-4">
            {[
              { k: '2', v: 'sorties DMX' },
              { k: '1024', v: 'canaux' },
              { k: '1 km', v: 'sans fil max.' },
              { k: '0 €', v: 'abonnement' },
            ].map((s) => (
              <div key={s.v} className="bg-black/80 px-4 py-5 text-center backdrop-blur">
                <div className="text-2xl font-semibold tracking-tight md:text-3xl">{s.k}</div>
                <div className="mt-1 text-xs uppercase tracking-wider text-white/40">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 2 SORTIES DMX + CALL OUTS ─── */}
      <section id="boitier" className="scroll-mt-28 border-t border-white/5 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-400/90">
                <Cable size={14} />
                2 univers DMX
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
                Deux sorties XLR.
                <span className="block text-white/40">Deux univers.</span>
              </h2>
              <p className="mt-5 text-base leading-relaxed text-white/55 md:text-lg">
                Le boîtier embarque <strong className="text-white">2 sorties DMX physiques</strong>{' '}
                — Univers&nbsp;1 et Univers&nbsp;2 — soit jusqu&apos;à{' '}
                <strong className="text-white">1024 canaux</strong> en simultané.
              </p>
              <p className="mt-4 text-base leading-relaxed text-white/55 md:text-lg">
                Et ce n&apos;est pas tout : ces <strong className="text-white">2 univers
                peuvent aussi partir en sans fil</strong> via les{' '}
                <strong className="text-white">récepteurs OMEGA</strong>, pour alléger le câblage
                sur le terrain.
              </p>
              <ul className="mt-8 space-y-3">
                {[
                  '2 × XLR 3 points — DMX OUT',
                  'Univers 1 + Univers 2 câblés ou radio',
                  'Récepteurs OMEGA pour le sans-fil multi-projecteurs',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-sm text-white/75 md:text-base">
                    <Check className="mt-0.5 shrink-0 text-cyan-400" size={18} />
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={100}>
              <AnnotatedPhoto
                src={BOX.dmxClose}
                alt="OMEGA DMX Interface — deux sorties XLR DMX"
                callouts={[
                  {
                    x: 48,
                    y: 62,
                    label: 'Univers 1',
                    sub: 'Sortie DMX OUT 1 · 512 canaux',
                    side: 'left',
                    color: '#38bdf8',
                  },
                  {
                    x: 72,
                    y: 52,
                    label: 'Univers 2',
                    sub: 'Sortie DMX OUT 2 · 512 canaux',
                    side: 'right',
                    color: '#a78bfa',
                  },
                ]}
              />
              <p className="mt-3 text-center text-xs text-white/35">
                Photo réelle du boîtier — repères animés sur les 2 sorties DMX
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── ANTENNES INTERCHANGEABLES ─── */}
      <section className="border-t border-white/5 bg-zinc-950/40 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <Reveal className="order-2 lg:order-1">
              <AnnotatedPhoto
                src={BOX.antennes}
                alt="Connecteur d’antenne RP-SMA et antennes interchangeables"
                callouts={[
                  {
                    x: 58,
                    y: 38,
                    label: 'Connecteur RP-SMA',
                    sub: 'Antenne amovible, changeable en 2 s',
                    side: 'right',
                    color: '#fbbf24',
                  },
                  {
                    x: 35,
                    y: 72,
                    label: 'Antennes au choix',
                    sub: 'Courte, longue… selon la portée voulue',
                    side: 'left',
                    color: '#34d399',
                  },
                ]}
              />
            </Reveal>
            <Reveal delay={100} className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-amber-400/90">
                <Antenna size={14} />
                Sans fil jusqu&apos;à 1 km
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
                Antenne interchangeable.
                <span className="block text-white/40">Portée adaptée à la salle.</span>
              </h2>
              <p className="mt-5 text-base leading-relaxed text-white/55 md:text-lg">
                Le connecteur <strong className="text-white">RP-SMA</strong> permet de changer
                d&apos;antenne selon le besoin : compacte pour la régie proche, plus longue pour
                étendre la liaison radio.
              </p>
              <p className="mt-4 text-base leading-relaxed text-white/55 md:text-lg">
                Avec les <strong className="text-white">récepteurs OMEGA</strong> et la bonne
                antenne, le sans-fil peut atteindre jusqu&apos;à{' '}
                <strong className="text-white">1&nbsp;km</strong> en conditions favorables —
                idéal pour les grands sites et les installations multi-zones.
              </p>
              <ul className="mt-8 space-y-3">
                {[
                  'Antenne fournie + emplacement RP-SMA standard',
                  'Portée extensible jusqu’à 1 km (avec récepteurs OMEGA)',
                  'Les 2 univers DMX partent aussi en radio',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-sm text-white/75 md:text-base">
                    <Check className="mt-0.5 shrink-0 text-amber-400" size={18} />
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── DESIGN + USB ─── */}
      <section className="border-t border-white/5 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-white/40">
              Design réel
            </p>
            <h2 className="mt-4 text-center text-3xl font-semibold tracking-tight md:text-5xl">
              Fabriqué pour le terrain
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-white/50">
              Coque texturée, face avant gravée OMEGA, connectique pro — le boîtier tel qu&apos;il
              sort de production.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-5 md:grid-cols-2">
            <Reveal>
              <AnnotatedPhoto
                src={BOX.sidePorts}
                alt="Face latérale — sorties DMX et antenne"
                callouts={[
                  {
                    x: 78,
                    y: 32,
                    label: 'Univers 1',
                    sub: 'XLR DMX OUT',
                    side: 'right',
                    color: '#38bdf8',
                  },
                  {
                    x: 82,
                    y: 58,
                    label: 'Univers 2',
                    sub: 'XLR DMX OUT',
                    side: 'right',
                    color: '#a78bfa',
                  },
                  {
                    x: 48,
                    y: 8,
                    label: 'Antenne',
                    sub: 'Sans fil OMEGA',
                    side: 'left',
                    color: '#34d399',
                  },
                ]}
              />
            </Reveal>
            <Reveal delay={80}>
              <AnnotatedPhoto
                src={BOX.antenneUsb}
                alt="Connecteur antenne et USB-C"
                callouts={[
                  {
                    x: 42,
                    y: 42,
                    label: 'Antenne RP-SMA',
                    sub: 'Interchangeable',
                    side: 'left',
                    color: '#fbbf24',
                  },
                  {
                    x: 58,
                    y: 68,
                    label: 'USB-C',
                    sub: 'Alimentation / liaison PC',
                    side: 'right',
                    color: '#38bdf8',
                  },
                ]}
              />
            </Reveal>
          </div>

          {/* Gallery strip */}
          <div className="mt-5 grid grid-cols-2 gap-5 md:grid-cols-3">
            {[
              { src: BOX.topPorts, cap: 'Vue dessus — double XLR' },
              { src: BOX.angle, cap: 'Perspective produit' },
              { src: BOX.detail, cap: 'Détail coque & face avant' },
            ].map((g, i) => (
              <Reveal key={g.cap} delay={i * 60}>
                <figure className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950">
                  <img
                    src={g.src}
                    alt={g.cap}
                    className="aspect-[4/3] w-full object-cover"
                    loading="lazy"
                  />
                  <figcaption className="border-t border-white/5 px-4 py-2.5 text-xs text-white/40">
                    {g.cap}
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── RADIO + RÉCEPTEURS ─── */}
      <section className="border-t border-white/5 bg-gradient-to-b from-blue-950/20 to-black py-20 md:py-28">
        <div className="mx-auto max-w-4xl px-5 text-center">
          <Reveal>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-blue-400/90">
              <Radio size={14} />
              Système sans fil OMEGA
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
              Câblé ou radio — les 2 univers suivent
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/55 md:text-lg">
              Utilisez les sorties XLR en filaire, ou envoyez les{' '}
              <strong className="text-white">mêmes 2 univers en sans fil</strong> vers les
              récepteurs OMEGA placés près des machines. Moins de câble, plus de liberté — jusqu&apos;à
              1&nbsp;km selon l&apos;antenne et le site.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-3 text-left">
              {[
                { icon: Cable, t: '2× DMX OUT', d: 'Univers 1 & 2 en XLR 3 pts' },
                { icon: Wifi, t: 'Radio OMEGA', d: 'Mêmes univers vers les récepteurs' },
                { icon: Antenna, t: 'Antenne libre', d: 'Portée adaptée, jusqu’à 1 km' },
              ].map((c) => (
                <div
                  key={c.t}
                  className="rounded-2xl border border-white/10 bg-black/50 p-5"
                >
                  <c.icon className="text-blue-400" size={22} strokeWidth={1.5} />
                  <div className="mt-3 font-semibold">{c.t}</div>
                  <div className="mt-1 text-sm text-white/45">{c.d}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── LOGICIEL (secondaire) ─── */}
      <section className="relative border-t border-white/5">
        <div className="relative min-h-[60svh] md:min-h-[75svh]">
          <img
            src={BOX.soft}
            alt="Logiciel OMEGADMX inclus"
            className="absolute inset-0 h-full w-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/30" />
          <div className="relative z-10 flex min-h-[60svh] items-end px-5 pb-16 md:min-h-[75svh] md:pb-24">
            <div className="mx-auto w-full max-w-7xl">
              <Reveal>
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
                  <MonitorPlay size={14} />
                  Logiciel inclus
                </div>
                <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight md:text-5xl">
                  OMEGADMX — la régie en 3D
                </h2>
                <p className="mt-4 max-w-lg text-white/65">
                  Fourni avec le boîtier. Pas d&apos;abonnement. Vue 3D, scènes, gobos, moniteur
                  DMX…
                </p>
                <Link
                  to="/omega-dmx-logiciel"
                  className="mt-8 inline-flex text-sm font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-white"
                >
                  Voir la présentation logiciel
                </Link>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ─── SPECS ─── */}
      <section className="border-t border-white/5 py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-5">
          <Reveal>
            <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
              Caractéristiques
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <dl className="mt-12 divide-y divide-white/10 border-y border-white/10">
              {[
                ['Sorties DMX', '2 × XLR 3 pts (Univers 1 & 2)'],
                ['Canaux', '1024 (2 × 512)'],
                ['Sans fil', 'Jusqu’à 1 km avec récepteurs OMEGA + antenne adaptée'],
                ['Antenne', 'RP-SMA interchangeable'],
                ['Liaison PC', 'USB-C / WiFi / Bluetooth'],
                ['Logiciel', 'OMEGADMX inclus — Windows'],
                ['Abonnement', 'Aucun'],
                ['Sauvegarde show', 'Interne au boîtier'],
                ['Prix', `${fmt(mainPrice)} € ${mainLabel}`],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8"
                >
                  <dt className="text-sm text-white/45">{k}</dt>
                  <dd className="text-sm font-medium text-white sm:text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="relative overflow-hidden border-t border-white/5 py-28 md:py-36">
        <div className="pointer-events-none absolute inset-0">
          <img src={BOX.hero} alt="" className="h-full w-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-black/75" />
        </div>
        <div className="relative z-10 mx-auto max-w-3xl px-5 text-center">
          <Reveal>
            <h2 className="text-4xl font-semibold tracking-tight md:text-6xl">
              Prêt pour la régie.
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-white/55">
              OMEGA DMX Interface — {fmt(mainPrice)} € {mainLabel}. 2 univers, antenne libre,
              logiciel inclus.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                onClick={handleBuy}
                className="inline-flex items-center gap-2 rounded-full bg-white px-10 py-4 text-sm font-semibold text-black transition hover:bg-white/90"
              >
                <ShoppingCart size={18} />
                {buyLabel}
              </button>
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 rounded-full border border-white/25 px-8 py-4 text-sm font-semibold transition hover:bg-white/5"
              >
                <Mail size={18} />
                Demander une démo
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-4 text-xs text-white/35">
              <span className="inline-flex items-center gap-1.5">
                <Zap size={12} /> Fabrication OMEGA
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Shield size={12} /> Show protégé
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Ban size={12} /> Sans abonnement
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Save size={12} /> Sauvegarde boîtier
              </span>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
};

export default OmegaDmxInterfacePage;

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
  Boxes,
  Palette,
  Move,
  LayoutGrid,
  EyeOff,
  ArrowRight,
  X,
  Smartphone,
  Tablet,
  Flame,
  CloudFog,
  Library,
  Gauge,
  Sparkles,
  Cpu,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Product } from '../types';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useSiteSettings } from '../contexts/SiteSettingsContext';
import toast from 'react-hot-toast';
import {
  SvgWireless1024,
  SvgBackupBox,
  SvgMultiDevice,
} from '../components/OmegaDmxSystemSvgs';
import { AnnotatedPhoto } from '../components/callout-editor/AnnotatedPhoto';
import {
  AdminCalloutEditor,
  handleAddCallout,
  type EditorTool,
} from '../components/callout-editor/AdminCalloutEditor';
import { usePageCallouts } from '../components/callout-editor/usePageCallouts';
import { PHOTO_IDS } from '../components/callout-editor/defaults';

/* ================================================================== */
/*  OMEGA DMX Interface — Product Experience                           */
/*  Photos réelles + callouts éditables (admin) + galerie + logiciel   */
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
  softAfx: '/products/omega-dmx-v2-page-afx.webp',
  softBeam: '/products/omega-dmx-v2-page-beam.webp',
  softColor: '/products/omega-dmx-v2-couleur.webp',
  soft3d: '/products/omega-dmx-v2-effet-3d.webp',
  softDmx: '/products/omega-dmx-v2-sortie-dmx.webp',
  softConn: '/products/omega-dmx-v2-connexion.webp',
};

/** Toutes les photos produit réelles (galerie) */
const GALLERY: { src: string; cap: string }[] = [
  { src: '/products/p1021135.webp', cap: 'Vue produit — double sortie DMX' },
  { src: '/products/p1021134.webp', cap: 'Gros plan XLR · Univers 1 & 2' },
  { src: '/products/p1021128.webp', cap: 'Face avant gravée OMEGA' },
  { src: '/products/p1021132.webp', cap: 'Connecteur RP-SMA + antennes' },
  { src: '/products/p1021133.webp', cap: 'Antennes interchangeables' },
  { src: '/products/p1021130.webp', cap: 'Antenne & USB-C' },
  { src: '/products/p1021131.webp', cap: 'Détail USB-C / liaison PC' },
  { src: '/products/p1021129.webp', cap: 'Profil antenne' },
  { src: '/products/omega-box-top-ports.webp', cap: 'Vue ¾ — ports & antenne' },
];

const PRICE_TTC = 429;
const PRICE_HT = PRICE_TTC / 1.2;

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

const OmegaDmxInterfacePage = () => {
  const [sticky, setSticky] = useState(false);
  const [dbProduct, setDbProduct] = useState<Product | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const { addToCart } = useCart();
  const { user, affichagePrix, isAdmin } = useAuth();
  const { vitrineMode } = useSiteSettings();
  const navigate = useNavigate();
  const heroRef = useRef<HTMLElement>(null);

  /* ── Édition admin des callouts ── */
  const calloutsApi = usePageCallouts();
  const [editMode, setEditMode] = useState(false);
  const [editTool, setEditTool] = useState<EditorTool>('select');
  const [selectedCallout, setSelectedCallout] = useState<{
    photoId: string;
    calloutId: string;
  } | null>(null);

  const photoEditProps = (photoId: string) =>
    editMode && isAdmin
      ? {
          editMode: true as const,
          tool: editTool,
          selectedId: selectedCallout?.photoId === photoId ? selectedCallout.calloutId : null,
          onSelect: (pid: string, cid: string | null) => {
            if (!cid) setSelectedCallout(null);
            else setSelectedCallout({ photoId: pid, calloutId: cid });
          },
          onChangeCallout: calloutsApi.updateCallout,
          onAddAt: (pid: string, x: number, y: number) =>
            handleAddCallout(calloutsApi, pid, x, y, setSelectedCallout, setEditTool),
        }
      : { editMode: false as const };

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

  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') setLightbox((i) => (i === null ? i : (i + 1) % GALLERY.length));
      if (e.key === 'ArrowLeft')
        setLightbox((i) => (i === null ? i : (i - 1 + GALLERY.length) % GALLERY.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

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
    <div
      className={`min-h-screen bg-black text-white selection:bg-white/20 ${
        editMode && isAdmin ? 'pb-8' : ''
      }`}
    >
      {/* Mode édition admin — haut gauche */}
      {isAdmin && (
        <AdminCalloutEditor
          api={calloutsApi}
          editMode={editMode}
          setEditMode={setEditMode}
          tool={editTool}
          setTool={setEditTool}
          selected={selectedCallout}
          setSelected={setSelectedCallout}
        />
      )}

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

      {/* ─── HERO ─── */}
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
            Logiciel OMEGADMX inclus — sans abonnement.
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

      {/* ─── 2 SORTIES DMX ─── */}
      <section id="boitier" className="scroll-mt-28 border-t border-white/5 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/50">
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
                    <Check className="mt-0.5 shrink-0 text-white" size={18} />
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={100}>
              <AnnotatedPhoto
                src={BOX.dmxClose}
                alt="OMEGA DMX Interface — deux sorties XLR DMX"
                photoId={PHOTO_IDS.dmxClose}
                callouts={calloutsApi.getCallouts(PHOTO_IDS.dmxClose)}
                {...photoEditProps(PHOTO_IDS.dmxClose)}
              />
              <p className="mt-3 text-center text-xs text-white/35">
                Photo réelle — repères centrés sur les 2 sorties XLR
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── ANTENNES ─── */}
      <section className="border-t border-white/5 bg-zinc-950/40 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <Reveal className="order-2 lg:order-1">
              <AnnotatedPhoto
                src={BOX.antennes}
                alt="Connecteur d’antenne RP-SMA et antennes interchangeables"
                photoId={PHOTO_IDS.antennes}
                callouts={calloutsApi.getCallouts(PHOTO_IDS.antennes)}
                {...photoEditProps(PHOTO_IDS.antennes)}
              />
            </Reveal>
            <Reveal delay={100} className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/50">
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
                    <Check className="mt-0.5 shrink-0 text-white" size={18} />
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
                photoId={PHOTO_IDS.sidePorts}
                callouts={calloutsApi.getCallouts(PHOTO_IDS.sidePorts)}
                {...photoEditProps(PHOTO_IDS.sidePorts)}
              />
            </Reveal>
            <Reveal delay={80}>
              <AnnotatedPhoto
                src={BOX.antenneUsb}
                alt="Connecteur antenne et USB-C"
                photoId={PHOTO_IDS.antenneUsb}
                callouts={calloutsApi.getCallouts(PHOTO_IDS.antenneUsb)}
                {...photoEditProps(PHOTO_IDS.antenneUsb)}
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── GALERIE PHOTO ─── */}
      <section id="galerie" className="border-t border-white/5 bg-zinc-950/30 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-white/40">
              Galerie
            </p>
            <h2 className="mt-4 text-center text-3xl font-semibold tracking-tight md:text-5xl">
              Le boîtier sous tous les angles
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-white/50">
              Photos réelles de production — pas de rendu 3D marketing.
            </p>
          </Reveal>

          <div className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
            {GALLERY.map((g, i) => (
              <Reveal key={g.src} delay={i * 40}>
                <button
                  type="button"
                  onClick={() => setLightbox(i)}
                  className="group relative w-full overflow-hidden rounded-xl border border-white/10 bg-zinc-950 text-left transition hover:border-white/25"
                >
                  <img
                    src={g.src}
                    alt={g.cap}
                    className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                    loading="lazy"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2.5 pt-8 text-[11px] text-white/70 opacity-0 transition group-hover:opacity-100 sm:text-xs">
                    {g.cap}
                  </span>
                </button>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── RADIO + RÉCEPTEURS ─── */}
      <section className="border-t border-white/5 py-20 md:py-28">
        <div className="mx-auto max-w-4xl px-5 text-center">
          <Reveal>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/50">
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
                <div key={c.t} className="rounded-2xl border border-white/10 bg-zinc-950/60 p-5">
                  <c.icon className="text-white" size={22} strokeWidth={1.5} />
                  <div className="mt-3 font-semibold">{c.t}</div>
                  <div className="mt-1 text-sm text-white/45">{c.d}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── SYSTÈMES ILLUSTRÉS (SVG B/W animés) ─── */}
      <section id="systemes" className="border-t border-white/5 bg-zinc-950/40 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-white/40">
              Architecture terrain
            </p>
            <h2 className="mt-4 text-center text-3xl font-semibold tracking-tight md:text-5xl">
              Trois piliers du système
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-white/50">
              1024 canaux sans fil, sauvegarde dans le boîtier, pilotage depuis n&apos;importe quel
              poste — illustré en noir et blanc.
            </p>
          </Reveal>

          <div className="mt-16 space-y-20 md:space-y-28">
            {/* 1 — 1024 wireless */}
            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <Reveal>
                <div className="rounded-2xl border border-white/10 bg-black/60 px-4 py-6 sm:px-6">
                  <SvgWireless1024 />
                </div>
              </Reveal>
              <Reveal delay={80}>
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/50">
                  <Radio size={14} />
                  1024 canaux · sans fil
                </div>
                <h3 className="mt-4 text-2xl font-semibold tracking-tight md:text-4xl">
                  Deux univers. Filaire ou radio.
                </h3>
                <p className="mt-4 text-base leading-relaxed text-white/55 md:text-lg">
                  L&apos;interface envoie jusqu&apos;à <strong className="text-white">1024 canaux</strong>{' '}
                  (Univers&nbsp;1 + Univers&nbsp;2). Les mêmes flux partent en XLR ou vers les{' '}
                  <strong className="text-white">récepteurs OMEGA</strong> placés près des lyres et
                  machines — moins de câble, même stabilité.
                </p>
                <ul className="mt-6 space-y-2.5">
                  {[
                    '2 × 512 canaux simultanés',
                    'Récepteurs OMEGA multi-zones',
                    'Portée jusqu’à 1 km avec antenne adaptée',
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2.5 text-sm text-white/70">
                      <Check className="mt-0.5 shrink-0 text-white" size={16} />
                      {t}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>

            {/* 2 — Sauvegarde boîtier */}
            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <Reveal className="order-2 lg:order-1">
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/50">
                  <Shield size={14} />
                  Sauvegarde boîtier
                </div>
                <h3 className="mt-4 text-2xl font-semibold tracking-tight md:text-4xl">
                  Le show vit dans l&apos;interface.
                </h3>
                <p className="mt-4 text-base leading-relaxed text-white/55 md:text-lg">
                  Pendant que vous travaillez dans OMEGADMX, le show est{' '}
                  <strong className="text-white">synchronisé en continu dans le boîtier</strong>.
                  Coupure PC, câble retiré, plantage : le contenu reste protégé côté hardware —
                  prêt pour la reprise.
                </p>
                <ul className="mt-6 space-y-2.5">
                  {[
                    'Écriture continue en mémoire boîtier',
                    'Indépendant du PC une fois synchronisé',
                    'Conçu pour les aléas du terrain',
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2.5 text-sm text-white/70">
                      <Check className="mt-0.5 shrink-0 text-white" size={16} />
                      {t}
                    </li>
                  ))}
                </ul>
              </Reveal>
              <Reveal delay={80} className="order-1 lg:order-2">
                <div className="rounded-2xl border border-white/10 bg-black/60 px-4 py-6 sm:px-6">
                  <SvgBackupBox />
                </div>
              </Reveal>
            </div>

            {/* 3 — Multi-device */}
            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <Reveal>
                <div className="rounded-2xl border border-white/10 bg-black/60 px-4 py-6 sm:px-6">
                  <SvgMultiDevice />
                </div>
              </Reveal>
              <Reveal delay={80}>
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/50">
                  <Smartphone size={14} />
                  PC · téléphone · tablette
                </div>
                <h3 className="mt-4 text-2xl font-semibold tracking-tight md:text-4xl">
                  Un boîtier, plusieurs postes.
                </h3>
                <p className="mt-4 text-base leading-relaxed text-white/55 md:text-lg">
                  Connectez-vous en <strong className="text-white">USB-C, WiFi ou Bluetooth</strong>{' '}
                  depuis un ordinateur de régie, une tablette en face plateau ou un téléphone pour
                  un contrôle de secours. Le boîtier reste le cœur stable du réseau DMX.
                </p>
                <div className="mt-6 grid grid-cols-3 gap-3">
                  {[
                    { icon: MonitorPlay, t: 'PC' },
                    { icon: Tablet, t: 'Tablette' },
                    { icon: Smartphone, t: 'Téléphone' },
                  ].map((d) => (
                    <div
                      key={d.t}
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-4 text-center"
                    >
                      <d.icon className="mx-auto text-white" size={20} strokeWidth={1.5} />
                      <div className="mt-2 text-xs font-medium text-white/70">{d.t}</div>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ─── TRANSITION : Que permet ce boîtier ─── */}
      <section id="pourquoi" className="relative overflow-hidden border-t border-white/5 py-24 md:py-32">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.06)_0%,transparent_65%)]" />
        </div>
        <div className="relative z-10 mx-auto max-w-4xl px-5 text-center">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-white/40">
              Que permet ce boîtier
            </p>
            <h2 className="mt-6 text-3xl font-semibold leading-tight tracking-tight md:text-5xl lg:text-6xl">
              Conçu pour la rapidité
              <span className="block text-white/40">et la stabilité sur le terrain.</span>
            </h2>
            <p className="mx-auto mt-8 max-w-2xl text-base leading-relaxed text-white/60 md:text-lg">
              Nous avons développé l&apos;interface OMEGA pour répondre à une exigence simple :
              aller vite, tenir le choc, et ne jamais vous laisser tomber en conditions réelles —
              salles, festivals, tournées, installations temporaires.
            </p>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/55 md:text-lg">
              C&apos;est pour cette raison que vous pouvez{' '}
              <strong className="text-white">
                oublier les logiciels de pilotage que vous connaissez jusqu&apos;à présent
              </strong>{' '}
              — et laisser place à{' '}
              <strong className="text-white">OMEGADMX</strong> : le logiciel aux possibilités
              infinies, très rapide, moderne, avec une automatisation qui simplifie les effets et
              mouvements complexes sur l&apos;ensemble de votre parc.
            </p>
          </Reveal>

          <Reveal delay={100}>
            <div className="mx-auto mt-12 h-px w-24 bg-white/25" />
            <p className="mx-auto mt-10 max-w-xl text-sm uppercase tracking-[0.2em] text-white/35">
              Du boîtier au logiciel
            </p>
            <div className="mt-4 flex items-center justify-center gap-3 text-white/50">
              <span className="text-sm">Interface OMEGA</span>
              <ArrowRight size={16} className="text-white/30" />
              <span className="text-sm font-semibold text-white">OMEGADMX</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── LOGICIEL OMEGADMX — lien fort ─── */}
      <section id="logiciel" className="border-t border-white/5 bg-zinc-950/40 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal>
            <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/50">
                  <MonitorPlay size={14} />
                  Logiciel inclus
                </div>
                <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
                  OMEGADMX — possibilités infinies,
                  <span className="block text-white/40">rapidité, modernité.</span>
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/55 md:text-lg">
                  Fourni avec le boîtier. <strong className="text-white">Sans abonnement.</strong>{' '}
                  Pensé pour piloter lyres, spots, machines à fumée, flammes, CO₂ et effets
                  spéciaux — avec des automatisations qui vous simplifient la vie sur les
                  mouvements et effets les plus complexes.
                </p>
              </div>
              <Link
                to="/omega-dmx-logiciel"
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-sm font-semibold transition hover:border-white/50 hover:bg-white/5"
              >
                Voir le logiciel en détail
                <ArrowRight size={16} />
              </Link>
            </div>
          </Reveal>

          {/* Stats clés logiciel */}
          <Reveal delay={40}>
            <div className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-4">
              {[
                { k: '11 500+', v: 'machines en librairie' },
                { k: '1024', v: 'canaux pilotés' },
                { k: '0 €', v: 'abonnement' },
                { k: 'PC ancien', v: 'toujours fluide' },
              ].map((s) => (
                <div key={s.v} className="bg-black/85 px-4 py-6 text-center">
                  <div className="text-2xl font-semibold tracking-tight md:text-3xl">{s.k}</div>
                  <div className="mt-1 text-xs uppercase tracking-wider text-white/40">{s.v}</div>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Bandeau capture */}
          <Reveal delay={60}>
            <div className="relative mt-12 overflow-hidden rounded-2xl border border-white/10">
              <img
                src={BOX.softAfx}
                alt="OMEGADMX — page machine avec plateau 3D"
                className="max-h-[52vh] w-full object-cover object-top"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                <p className="text-sm text-white/70 md:text-base">
                  Page machine, plateau 3D, contrôles live — connecté à votre boîtier en USB, WiFi
                  ou Bluetooth.
                </p>
              </div>
            </div>
          </Reveal>

          {/* Parc machines pris en charge */}
          <Reveal delay={40}>
            <h3 className="mt-16 text-center text-xl font-semibold tracking-tight md:text-2xl">
              Tout votre parc — lumières & effets spéciaux
            </h3>
            <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-white/45 md:text-base">
              Lyres, spots, fumée, flammes, CO₂… tout est pensé et pris en charge pour vous.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { icon: Move, t: 'Lyres' },
                { icon: Zap, t: 'Spots' },
                { icon: CloudFog, t: 'Fumée / hazer' },
                { icon: Flame, t: 'Flammes' },
                { icon: Sparkles, t: 'CO₂ & FX' },
                { icon: Layers, t: 'Et bien plus' },
              ].map((m) => (
                <div
                  key={m.t}
                  className="rounded-xl border border-white/10 bg-black/40 px-3 py-5 text-center"
                >
                  <m.icon className="mx-auto text-white" size={22} strokeWidth={1.5} />
                  <div className="mt-2 text-xs font-medium text-white/70">{m.t}</div>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Capacités liées au boîtier */}
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Library,
                t: 'Librairie 11 500+ machines',
                d: 'Plus de 11 500 profils proposés directement et gratuitement dans le logiciel — patch rapide, zéro abonnement librairie.',
              },
              {
                icon: Sparkles,
                t: 'Automatisations intelligentes',
                d: 'Effets et mouvements complexes sur tout le parc : cercle, huit, wave, déphasages multi-lyres — sans tout programmer à la main.',
              },
              {
                icon: Gauge,
                t: 'Optimisé pour tous les PC',
                d: 'Très optimisé pour tourner même sur des ordinateurs anciens — sans compromettre la qualité ni les graphismes du logiciel.',
              },
              {
                icon: LayoutGrid,
                t: 'Pages de lyres',
                d: 'Une page par machine ou groupe. Scènes, presets et dimmer de page — le show structuré sur vos 1024 canaux.',
              },
              {
                icon: Boxes,
                t: 'Plateau 3D live',
                d: 'Visualisez faisceaux et mouvements pendant que le boîtier envoie le DMX. Concevez avant d’allumer la salle.',
              },
              {
                icon: Palette,
                t: 'Couleur & gobos',
                d: 'RGBW, roues, gobos, iris, strobe — mappés sur les canaux de vos projecteurs via le patch OMEGADMX.',
              },
              {
                icon: Move,
                t: 'FX mouvements',
                d: 'Cercle, huit, swing, wave… générés dans le logiciel, sortis en DMX par l’interface (filaire ou radio).',
              },
              {
                icon: Layers,
                t: 'Moniteur 512 canaux',
                d: 'Regardez en live ce que le boîtier envoie sur Univers 1 et 2 — debug régie sans deviner.',
              },
              {
                icon: Wifi,
                t: 'Connexion multi-appareils',
                d: 'USB-C, WiFi ou Bluetooth. PC, tablette, téléphone — détection auto de l’interface OMEGA.',
              },
              {
                icon: EyeOff,
                t: 'Blackout & dimmers',
                d: 'Dimmer master, dimmer de page, blackout ciblé — la main sur l’intensité sans couper le boîtier.',
              },
              {
                icon: Save,
                t: 'Show dans le boîtier',
                d: 'Sauvegarde continue côté interface : le show est protégé même si le PC se coupe.',
              },
              {
                icon: Cpu,
                t: 'Rapide & moderne',
                d: 'Interface fluide, workflows terrain, stabilité au service de la régie — pensé pour l’exigence du live.',
              },
            ].map((f, i) => (
              <Reveal key={f.t} delay={i * 30}>
                <div className="h-full rounded-2xl border border-white/10 bg-black/40 p-5">
                  <f.icon className="text-white" size={20} strokeWidth={1.5} />
                  <div className="mt-3 text-sm font-semibold">{f.t}</div>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/45">{f.d}</p>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Mini galerie logiciel */}
          <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { src: BOX.softBeam, cap: 'Contrôle Beam' },
              { src: BOX.softColor, cap: 'Mélange couleur' },
              { src: BOX.soft3d, cap: 'Effets 3D' },
              { src: BOX.softDmx, cap: 'Sortie DMX' },
            ].map((g, i) => (
              <Reveal key={g.cap} delay={i * 50}>
                <figure className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950">
                  <img
                    src={g.src}
                    alt={g.cap}
                    className="aspect-video w-full object-cover object-top"
                    loading="lazy"
                  />
                  <figcaption className="border-t border-white/5 px-3 py-2 text-[11px] text-white/40">
                    {g.cap}
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>

          <Reveal delay={80}>
            <div className="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-black/50 px-6 py-10 text-center sm:flex-row sm:justify-between sm:text-left">
              <div>
                <div className="text-lg font-semibold">
                  Oubliez l&apos;ancien monde. Passez à OMEGADMX.
                </div>
                <p className="mt-1 max-w-lg text-sm text-white/50">
                  Boîtier + logiciel = régie complète. 2 univers, radio, sauvegarde, 11 500+
                  machines, automatisations — une seule chaîne, du patch à la sortie XLR.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/omega-dmx-logiciel"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
                >
                  Présentation OMEGADMX
                  <ArrowRight size={16} />
                </Link>
                <a
                  href="#systemes"
                  className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-sm font-semibold transition hover:bg-white/5"
                >
                  Voir l&apos;architecture
                </a>
              </div>
            </div>
          </Reveal>
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
                ['Canaux', '1024 (2 × 512) — filaire ou sans fil'],
                ['Sans fil', 'Jusqu’à 1 km avec récepteurs OMEGA + antenne adaptée'],
                ['Antenne', 'RP-SMA interchangeable'],
                ['Connexion', 'USB-C / WiFi / Bluetooth — PC, tablette, téléphone'],
                ['Logiciel', 'OMEGADMX inclus — Windows'],
                ['Librairie', '11 500+ machines gratuites dans le logiciel'],
                ['Abonnement', 'Aucun'],
                ['Sauvegarde show', 'Interne au boîtier (sync continue)'],
                ['Performance', 'Optimisé pour PC récents et anciens'],
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
              logiciel OMEGADMX inclus.
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

      {/* Lightbox galerie */}
      {lightbox !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal
          aria-label="Galerie photo"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full border border-white/20 p-2 text-white/80 transition hover:bg-white/10"
            onClick={() => setLightbox(null)}
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
          <button
            type="button"
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 px-3 py-6 text-white/70 transition hover:bg-white/10 md:left-6"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox((i) => (i === null ? i : (i - 1 + GALLERY.length) % GALLERY.length));
            }}
            aria-label="Précédent"
          >
            ‹
          </button>
          <figure
            className="max-h-[90vh] max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={GALLERY[lightbox].src}
              alt={GALLERY[lightbox].cap}
              className="max-h-[82vh] w-full rounded-lg object-contain"
            />
            <figcaption className="mt-3 text-center text-sm text-white/55">
              {GALLERY[lightbox].cap} · {lightbox + 1}/{GALLERY.length}
            </figcaption>
          </figure>
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 px-3 py-6 text-white/70 transition hover:bg-white/10 md:right-6"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox((i) => (i === null ? i : (i + 1) % GALLERY.length));
            }}
            aria-label="Suivant"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
};

export default OmegaDmxInterfacePage;

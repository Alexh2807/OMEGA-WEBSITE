import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  Mail,
  Layers,
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
  ArrowRight,
  X,
  Smartphone,
  Tablet,
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
  SvgSignalQuality,
  SvgMultiSession,
} from '../components/OmegaDmxSystemSvgs';
import OmegaDmxDuo from '../components/OmegaDmxDuo';
import { EditableImage } from '../components/callout-editor/EditableImage';
import {
  AdminCalloutEditor,
  handleAddCallout,
  type EditorTool,
} from '../components/callout-editor/AdminCalloutEditor';
import { usePageCallouts } from '../components/callout-editor/usePageCallouts';
import { PHOTO_IDS } from '../components/callout-editor/defaults';
import { GalleryManager } from '../components/callout-editor/GalleryManager';
import { dateFinOffre, prixApres, useOffreLancement } from '../utils/offreLancement';

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

/* Prix de REPLI du boîtier, affiché seulement tant que la fiche produit (SKU
   OMGA-DMX-ITF) n'est pas encore chargée. Le prix affiché vient de la BASE, comme
   le prix encaissé : l'ancien prix codé en dur (390 € HT = 468 €) contredisait la
   base (469 €) et le client payait 1 € de plus que le prix annoncé. */
const PRICE_TTC_REPLI = 479;

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

  /* ── Édition admin : callouts + 3D sur toute image ── */
  const calloutsApi = usePageCallouts();
  const [editMode, setEditMode] = useState(false);
  const [editTool, setEditTool] = useState<EditorTool>('select');
  const [selectedCallout, setSelectedCallout] = useState<{
    photoId: string;
    calloutId: string;
  } | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  const imageProps = (photoId: string) => ({
    photoId,
    callouts: calloutsApi.getCallouts(photoId),
    transform: calloutsApi.getTransform(photoId),
    imageSelected: selectedImageId === photoId || selectedCallout?.photoId === photoId,
    ...(editMode && isAdmin
      ? {
          editMode: true as const,
          tool: editTool,
          selectedId:
            selectedCallout?.photoId === photoId ? selectedCallout.calloutId : null,
          onSelectImage: (pid: string) => {
            setSelectedImageId(pid);
            if (selectedCallout?.photoId !== pid) setSelectedCallout(null);
          },
          onSelect: (pid: string, cid: string | null) => {
            setSelectedImageId(pid);
            if (!cid) setSelectedCallout(null);
            else setSelectedCallout({ photoId: pid, calloutId: cid });
          },
          onChangeCallout: calloutsApi.updateCallout,
          onAddAt: (pid: string, x: number, y: number) => {
            setSelectedImageId(pid);
            handleAddCallout(calloutsApi, pid, x, y, setSelectedCallout, setEditTool);
          },
        }
      : { editMode: false as const }),
  });

  useEffect(() => {
    (async () => {
      /* ⚠ Recherche par SKU, JAMAIS par « le nom contient dmx » : la Licence OMEGADMX
         contient elle aussi « DMX » dans son nom. Avec l'ancien filtre + limit(1) sans
         tri, le bouton « Commander » de cette page pouvait mettre la LICENCE au panier
         à la place du boîtier. Le SKU est unique en base : aucune ambiguïté possible. */
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('sku', 'OMGA-DMX-ITF')
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

  const gallery = calloutsApi.gallery;

  useEffect(() => {
    if (lightbox === null) return;
    const len = gallery.length || 1;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') setLightbox((i) => (i === null ? i : (i + 1) % len));
      if (e.key === 'ArrowLeft')
        setLightbox((i) => (i === null ? i : (i - 1 + len) % len));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, gallery.length]);

  const offre = useOffreLancement();
  const offreBoitier = offre && offre.sku === 'OMGA-DMX-ITF' ? offre : null;
  const PRICE_TTC = dbProduct?.price ?? PRICE_TTC_REPLI;
  const PRICE_HT = dbProduct?.price_ht ?? Math.round((PRICE_TTC / 1.2) * 100) / 100;
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
          selectedImageId={selectedImageId}
          setSelectedImageId={setSelectedImageId}
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
              <div className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Boîtier</div>
              <div className="truncate text-sm font-semibold tracking-wide">OMEGA DMX Interface</div>
              <div className="text-xs text-white/50">
                {fmt(mainPrice)} € {mainLabel} · logiciel OMEGADMX inclus
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
          <div className="pointer-events-auto absolute inset-0">
            <EditableImage
              src={BOX.hero}
              alt="OMEGA DMX Interface — boîtier réel, 2 sorties XLR"
              cover
              framed={false}
              className="h-full w-full"
              aspectClass="h-full w-full"
              {...imageProps(PHOTO_IDS.hero)}
            />
          </div>
          {/* ⚠ Voiles séparés bureau / téléphone.
              Le dégradé HORIZONTAL (from-black/75) sert à dégager la colonne de texte à
              gauche sur un écran large. Sur un téléphone, cette même colonne occupe TOUTE
              la largeur : le voile couvrait donc la photo entière et le boîtier disparaissait
              dans le noir. On le réserve au bureau, et on garde sur mobile un simple dégradé
              vertical, plus doux, qui laisse la photo respirer derrière le titre. */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/10 md:via-black/55 md:to-black/25" />
          <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-black/75 via-black/20 to-transparent md:block" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-7xl px-5">
          {/* ⚠ NOMMAGE — le titre annonce D'ABORD la nature du produit. « OMEGA DMX » servi nu
              se confondait avec le logiciel OMEGADMX (une espace d'écart). Le mot « boîtier »
              n'est donc pas décoratif : c'est lui qui distingue les deux pages. */}
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/40 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.28em] text-white/75">
            <Cpu size={14} strokeWidth={1.8} />
            Le boîtier
          </p>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl lg:text-8xl">
            OMEGA DMX
            <span className="mt-2 block text-2xl font-normal text-white/45 md:text-4xl">
              Interface
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/70 md:text-xl">
            Le premier boîtier au monde à diffuser{' '}
            <strong className="text-white">2 univers DMX en sans fil</strong> — 1024 canaux,
            antenne interchangeable jusqu&apos;à&nbsp;1&nbsp;km.{' '}
            {/* ⚠ Le {' '} ci-dessus est indispensable : sur téléphone le <br> est masqué, et
                sans lui les deux phrases se collaient — « 1 km.Livré avec le logiciel ». */}
            <br className="hidden sm:block" />
            Livré avec le logiciel OMEGADMX — sans abonnement.
          </p>
          <a
            href="#avancee"
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white/70 underline-offset-4 transition hover:text-white hover:underline"
          >
            Ce que ça change
            <ArrowRight size={15} />
          </a>

          <div className="mt-10 flex flex-wrap items-end gap-6">
            <div>
              <div className="text-4xl font-semibold tracking-tight md:text-5xl">
                {fmt(mainPrice)} €
                <span className="ml-2 text-lg font-normal text-white/45">{mainLabel}</span>
              </div>
              <div className="mt-1 text-sm text-white/40">soit {altPrice}</div>
              {offreBoitier && (
                <div className="mt-3 text-sm text-white/70">
                  <span className="font-semibold text-white">Prix de lancement</span> jusqu'au{' '}
                  {dateFinOffre(offreBoitier, true)}, puis {prixApres(offreBoitier, isPro)}
                </div>
              )}
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

      {/* ─── BOÎTIER ≠ LOGICIEL — levée de doute, avant tout le reste ─── */}
      <OmegaDmxDuo actif="boitier" />

      {/* ─── L'AVANCÉE : 2 univers en sans fil + qualité de liaison par machine ───
          ⚠ « Premier au monde » est une allégation de primauté : elle engage (DGCCRF,
          concurrents). Elle est affichée ici à la demande expresse du client. Si elle
          doit être nuancée un jour, c'est ICI et dans le hero qu'il faut la reprendre. */}
      <section
        id="avancee"
        className="relative scroll-mt-28 overflow-hidden border-t border-white/5 py-20 md:py-28"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.08)_0%,transparent_60%)]" />
        <div className="relative z-10 mx-auto max-w-7xl px-5">
          <Reveal>
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/[0.06] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.26em] text-white">
                <Sparkles size={14} strokeWidth={1.8} />
                Une première mondiale
              </span>
              <h2 className="mt-6 text-3xl font-semibold leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Le premier boîtier au monde à diffuser
                <span className="block text-white/45">2 univers DMX en sans fil.</span>
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/60 md:text-lg">
                Jusqu&apos;ici, passer en radio voulait dire se contenter d&apos;un seul
                univers — donc 512 canaux, donc arbitrer entre les machines. Le boîtier{' '}
                <strong className="text-white">OMEGA DMX Interface</strong> émet les{' '}
                <strong className="text-white">deux univers simultanément</strong>, sans fil :
                1024 canaux pour tout le parc, et plus d&apos;arbitrage à faire.
              </p>
            </div>
          </Reveal>

          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: Radio,
                t: '2 univers en radio',
                d: 'Univers 1 et Univers 2 diffusés en même temps — pas d’alternance, pas de second émetteur à ajouter.',
              },
              {
                icon: Layers,
                t: '1024 canaux réellement libres',
                d: 'Le parc entier tient sur un seul boîtier : plus besoin de sacrifier des machines faute de canaux.',
              },
              {
                icon: Antenna,
                t: 'Filaire et radio ensemble',
                d: 'Les mêmes deux univers partent en XLR et en radio — vous mélangez les deux sur un même show.',
              },
            ].map((c) => (
              <Reveal key={c.t}>
                <div className="h-full rounded-2xl border border-white/10 bg-zinc-950/60 p-6">
                  <c.icon className="text-white" size={22} strokeWidth={1.5} />
                  <div className="mt-4 font-semibold">{c.t}</div>
                  <div className="mt-2 text-sm leading-relaxed text-white/50">{c.d}</div>
                </div>
              </Reveal>
            ))}
          </div>

          {/* ── Qualité de liaison, récepteur par récepteur ── */}
          <div className="mt-20 grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/50">
                <Gauge size={14} />
                Qualité de liaison
              </div>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight md:text-4xl">
                Vous savez ce que reçoit
                <span className="block text-white/40">chaque machine.</span>
              </h3>
              <p className="mt-5 text-base leading-relaxed text-white/55 md:text-lg">
                Le boîtier ne se contente pas d&apos;émettre : il{' '}
                <strong className="text-white">remonte le niveau de réception de chaque
                récepteur</strong>, machine par machine. La lyre en fond de plateau, celle
                derrière un mur porteur, celle au bout de la perche — vous voyez laquelle
                reçoit bien avant que le public n&apos;entre, au lieu de le découvrir en plein
                show.
              </p>
              <ul className="mt-6 space-y-2.5">
                {[
                  'Niveau de réception par récepteur, lu en direct',
                  'Repérage immédiat de la machine en limite de portée',
                  'Disponible aussi quand le boîtier est branché en USB',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-sm text-white/70">
                    <Check className="mt-0.5 shrink-0 text-white" size={16} />
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={80}>
              <div className="rounded-2xl border border-white/10 bg-black/60 px-4 py-6 sm:px-6">
                <SvgSignalQuality />
              </div>
            </Reveal>
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
                Des embases <strong className="text-white">XLR 3 points verrouillables</strong>,
                montées sur une face gravée : ce qui est branché reste branché, même après une
                nuit de manutention et un rangement en flight-case.
              </p>
              <ul className="mt-8 space-y-3">
                {[
                  '2 × XLR 3 points — DMX OUT, verrouillage à clip',
                  'Un univers par embase — repérage gravé, pas d’étiquette qui se décolle',
                  'Châssis usiné : les embases ne bougent pas dans le temps',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-sm text-white/75 md:text-base">
                    <Check className="mt-0.5 shrink-0 text-white" size={18} />
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={100}>
              <EditableImage
                src={BOX.dmxClose}
                alt="OMEGA DMX Interface — deux sorties XLR DMX"
                {...imageProps(PHOTO_IDS.dmxClose)}
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
              <EditableImage
                src={BOX.antennes}
                alt="Connecteur d’antenne RP-SMA et antennes interchangeables"
                {...imageProps(PHOTO_IDS.antennes)}
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
              <EditableImage
                src={BOX.sidePorts}
                alt="Face latérale — sorties DMX et antenne"
                {...imageProps(PHOTO_IDS.sidePorts)}
              />
            </Reveal>
            <Reveal delay={80}>
              <EditableImage
                src={BOX.antenneUsb}
                alt="Connecteur antenne et USB-C"
                {...imageProps(PHOTO_IDS.antenneUsb)}
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
            {gallery.map((g, i) => (
              <Reveal key={g.id} delay={i * 40}>
                <div className="relative w-full">
                  <EditableImage
                    src={g.src}
                    alt={g.cap}
                    cover
                    framed
                    hoverCaption
                    caption={g.cap}
                    onActivate={editMode ? undefined : () => setLightbox(i)}
                    aspectClass="aspect-[16/10]"
                    className="w-full"
                    {...imageProps(g.id)}
                  />
                  {editMode && isAdmin && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!confirm(`Supprimer « ${g.cap || 'cette photo'} » de la galerie ?`))
                          return;
                        calloutsApi.removeGalleryItem(g.id);
                        toast.success('Photo retirée — enregistrez pour publier');
                      }}
                      className="absolute right-2 top-2 z-30 rounded-full border border-red-400/40 bg-black/80 p-1.5 text-red-300 shadow-lg transition hover:bg-red-500/20"
                      title="Supprimer de la galerie"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </Reveal>
            ))}

            {/* Tuile « ajouter » en mode édition */}
            {editMode && isAdmin && (
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('gallery-manager');
                  el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  // Ouvre via focus du manager — le bouton principal est dans GalleryManager
                  const addBtn = document.querySelector(
                    '[data-gallery-add]',
                  ) as HTMLButtonElement | null;
                  addBtn?.click();
                }}
                className="flex aspect-[16/10] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-400/40 bg-amber-400/5 text-amber-200/90 transition hover:border-amber-400/70 hover:bg-amber-400/10"
              >
                <span className="text-2xl font-light">+</span>
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Ajouter une photo
                </span>
              </button>
            )}
          </div>

          {editMode && isAdmin && (
            <div id="gallery-manager">
              <GalleryManager api={calloutsApi} open />
            </div>
          )}
        </div>
      </section>

      {/* ─── PERFORMANCES : le travail interne, invisible mais mesurable ───
          Cette section remplace un doublon « câblé ou radio » : le sujet est traité une
          seule fois, dans « Une première mondiale ». Ici on parle du moteur. */}
      <section className="border-t border-white/5 py-20 md:py-28">
        <div className="mx-auto max-w-4xl px-5 text-center">
          <Reveal>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/50">
              <Zap size={14} />
              Optimisation interne
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
              Le travail qu&apos;on ne voit pas
              <span className="block text-white/40">est celui qui tient le show.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/55 md:text-lg">
              Un boîtier DMX se juge à ce qu&apos;il fait quand la salle est pleine et que tout
              tourne en même temps. Le cœur du boîtier a été retravaillé pour que la sortie DMX
              reste régulière quoi qu&apos;il arrive — pendant une rafale de faders, pendant une
              sauvegarde, pendant une reconnexion.
            </p>
            <div className="mt-10 grid gap-4 text-left sm:grid-cols-2">
              {[
                {
                  icon: Gauge,
                  t: 'Débit DMX régulier',
                  d: 'La trame part à cadence stable au lieu de suivre les à-coups du PC : pas de saccade sur un mouvement lent.',
                },
                {
                  icon: Zap,
                  t: 'Rien ne bloque la sortie',
                  d: 'Les tâches lourdes (écriture du show, télémétrie) ne passent jamais devant l’émission DMX.',
                },
                {
                  icon: Shield,
                  t: 'Récupération automatique',
                  d: 'Si la radio se fige, le boîtier se répare tout seul en moins d’une seconde, sans couper la sortie câblée.',
                },
                {
                  icon: Save,
                  t: 'Mémoire interne rapide',
                  d: 'Transferts et sauvegardes accélérés : le show monte dans le boîtier sans immobiliser la régie.',
                },
              ].map((c) => (
                <div key={c.t} className="rounded-2xl border border-white/10 bg-zinc-950/60 p-5">
                  <c.icon className="text-white" size={22} strokeWidth={1.5} />
                  <div className="mt-3 font-semibold">{c.t}</div>
                  <div className="mt-1.5 text-sm leading-relaxed text-white/45">{c.d}</div>
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
                  Un seul émetteur
                </div>
                <h3 className="mt-4 text-2xl font-semibold tracking-tight md:text-4xl">
                  Tout le parc, depuis un seul point.
                </h3>
                <p className="mt-4 text-base leading-relaxed text-white/55 md:text-lg">
                  Un <strong className="text-white">récepteur OMEGA</strong> par machine, un seul
                  boîtier pour tous. Pas de répéteur à ajouter quand le plateau s&apos;agrandit,
                  pas de zone à découper : vous posez les machines où la mise en scène les
                  demande, y compris là où tirer une ligne DMX était impossible.
                </p>
                <ul className="mt-6 space-y-2.5">
                  {[
                    'Machines dispersées, structures éloignées, décors mobiles',
                    'Aucun répéteur ni second émetteur à prévoir',
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
                  Le show vit dans le boîtier.
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
                  Pilotez le boîtier sans le brancher.
                </h3>
                <p className="mt-4 text-base leading-relaxed text-white/55 md:text-lg">
                  Le boîtier crée son <strong className="text-white">propre réseau WiFi</strong> :
                  vous vous y connectez depuis un PC, une{' '}
                  <strong className="text-white">tablette ou un téléphone Android</strong>, sans
                  box, sans installation réseau, sans le moindre câble entre vous et lui. Posez le
                  boîtier près des machines et gardez la main depuis la salle.
                </p>
                <p className="mt-4 text-base leading-relaxed text-white/55 md:text-lg">
                  L&apos;USB-C reste là quand vous le voulez — mais il n&apos;est plus une
                  obligation pour travailler.
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

      {/* ─── SESSIONS SIMULTANÉES : récupération du show + reprise en secours ─── */}
      <section id="sessions" className="scroll-mt-28 border-t border-white/5 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal>
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/40">
                Plusieurs appareils, en même temps
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
                Deux postes sur le même boîtier.
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/55 md:text-lg">
                Les appareils ne se chassent pas l&apos;un l&apos;autre : plusieurs peuvent être
                connectés <strong className="text-white">en même temps</strong>, et
                n&apos;importe lequel peut <strong className="text-white">récupérer le show en
                cours</strong> pour reprendre le travail là où il en est.
              </p>
            </div>
          </Reveal>

          <div className="mt-14 grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <div className="rounded-2xl border border-white/10 bg-black/60 px-4 py-6 sm:px-6">
                <SvgMultiSession />
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div className="space-y-8">
                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/50">
                    <MonitorPlay size={14} />
                    Programmer depuis la salle
                  </div>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight md:text-2xl">
                    Voyez la lumière de face, pas de côté.
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-white/55">
                    Quand la régie est fixe et mal placée — en fond de salle, en balcon, sur le
                    côté — vous programmez sans jamais voir le rendu réel. Prenez une tablette,
                    récupérez le show sur place et{' '}
                    <strong className="text-white">réglez vos états depuis le point de vue du
                    public</strong>. Le poste de régie, lui, reste connecté.
                  </p>
                </div>

                <div className="border-t border-white/10 pt-8">
                  <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/50">
                    <Shield size={14} />
                    Un second appareil en secours
                  </div>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight md:text-2xl">
                    Le relais est déjà branché.
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-white/55">
                    Gardez un deuxième appareil connecté et à jour pendant le show. Si le poste
                    principal se fige ou s&apos;éteint, vous{' '}
                    <strong className="text-white">reprenez la main immédiatement</strong> —
                    aucune reconnexion à négocier, aucun fichier à retrouver, le show continue.
                  </p>
                </div>

                <ul className="space-y-2.5 border-t border-white/10 pt-8">
                  {[
                    'Plusieurs appareils connectés simultanément au boîtier',
                    'Récupération du show en cours sur n’importe lequel',
                    'Reprise de la main sans interrompre la sortie DMX',
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2.5 text-sm text-white/70">
                      <Check className="mt-0.5 shrink-0 text-white" size={16} />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>


      {/* ─── LOGICIEL OMEGADMX — lien vers la page dédiée ─── */}
      <section id="logiciel" className="border-t border-white/5 bg-zinc-950/40 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/50">
                  <MonitorPlay size={14} />
                  Logiciel inclus
                </div>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
                  Le boîtier est livré
                  <span className="block text-white/40">avec le logiciel OMEGADMX.</span>
                </h2>
                <p className="mt-5 max-w-xl text-base leading-relaxed text-white/55 md:text-lg">
                  La régie complète, du patch à la sortie XLR : lyres, spots, fumée, flammes
                  et CO₂ pilotés depuis un seul écran, avec le boîtier détecté en USB-C ou en
                  WiFi.
                </p>
                <ul className="mt-7 space-y-3">
                  {[
                    'Librairie de 11 500+ profils de machines, incluse',
                    'Plateau 3D live : le faisceau à l’écran pendant que le DMX part',
                    'Effets et mouvements générés (cercle, huit, wave, déphasage de groupe)',
                    'Console MIDI configurée en quelques minutes, sans programmation',
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-3 text-sm text-white/65 md:text-base">
                      <Check size={16} className="mt-0.5 shrink-0 text-white/70" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/omega-dmx-logiciel"
                  className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-sm font-semibold transition hover:border-white/50 hover:bg-white/5"
                >
                  Voir le logiciel OMEGADMX en détail
                  <ArrowRight size={16} />
                </Link>
              </div>
            </Reveal>

            <Reveal delay={60}>
              <EditableImage
                src={BOX.softAfx}
                alt="OMEGADMX — page machine avec plateau 3D"
                cover
                framed
                aspectClass="aspect-[16/10]"
                className="w-full"
                imgClassName="object-top"
                {...imageProps(PHOTO_IDS.softAfx)}
              />
            </Reveal>
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
                ['Canaux', '1024 (2 × 512) — filaire ou sans fil'],
                ['Sans fil', '2 univers diffusés simultanément — une première mondiale'],
                ['Portée radio', 'Jusqu’à 1 km avec récepteurs OMEGA + antenne adaptée'],
                ['Qualité de liaison', 'Niveau de réception remonté par récepteur, en direct'],
                ['Antenne', 'RP-SMA interchangeable'],
                ['Connexion', 'USB-C / WiFi — PC, tablette, téléphone'],
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
              const len = gallery.length || 1;
              setLightbox((i) => (i === null ? i : (i - 1 + len) % len));
            }}
            aria-label="Précédent"
          >
            ‹
          </button>
          <figure
            className="flex max-h-[90vh] max-w-5xl flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {gallery[lightbox] && (() => {
              const item = gallery[lightbox];
              const t = calloutsApi.getTransform(item.id);
              const orient = t.orient ?? 0;
              const swapped = orient === 90 || orient === 270;
              return (
                <>
                  {/* Même orientation que sur la page (sinon l’image paraît à l’envers) */}
                  <div
                    className="flex max-h-[82vh] max-w-full items-center justify-center overflow-visible"
                    style={{ perspective: `${t.perspective || 900}px` }}
                  >
                    <img
                      src={item.src}
                      alt={item.cap}
                      className="rounded-xl object-contain shadow-2xl"
                      style={{
                        maxHeight: swapped ? 'min(82vh, 90vw)' : '82vh',
                        maxWidth: swapped ? 'min(82vh, 90vw)' : '100%',
                        transform: [
                          `rotateX(${t.rotateX || 0}deg)`,
                          `rotateY(${t.rotateY || 0}deg)`,
                          `rotateZ(${orient + (t.rotateZ || 0)}deg)`,
                          `scale(${t.scale ?? 1})`,
                        ].join(' '),
                        transformOrigin: 'center center',
                      }}
                    />
                  </div>
                  <figcaption className="mt-3 text-center text-sm text-white/55">
                    {item.cap} · {lightbox + 1}/{gallery.length}
                    {orient !== 0 && (
                      <span className="ml-2 text-white/30">({orient}°)</span>
                    )}
                  </figcaption>
                </>
              );
            })()}
          </figure>
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 px-3 py-6 text-white/70 transition hover:bg-white/10 md:right-6"
            onClick={(e) => {
              e.stopPropagation();
              const len = gallery.length || 1;
              setLightbox((i) => (i === null ? i : (i + 1) % len));
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

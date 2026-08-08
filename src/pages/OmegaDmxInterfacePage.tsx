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
  Boxes,
  Move,
  Palette,
  Radio,
  Zap,
  Shield,
  ChevronDown,
  Check,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Product } from '../types';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useSiteSettings } from '../contexts/SiteSettingsContext';
import toast from 'react-hot-toast';

/* ================================================================== */
/*  OMEGA DMX — Product Experience (inspiré Tesla / GoPro / MDG)     */
/*  Scroll immersif, visuels plein cadre, CTA permanent.             */
/* ================================================================== */

const ASSETS = {
  heroBox: '/products/omega-dmx-px-hero-box.jpg',
  softUi: '/products/omega-dmx-px-soft-ui.jpg',
  softStage: '/products/omega-dmx-px-soft-stage.jpg',
  softPlace: '/products/omega-dmx-px-soft-placement.jpg',
  softLive: '/products/omega-dmx-px-soft-live.png',
  softColor: '/products/omega-dmx-px-soft-color.jpg',
  softMove: '/products/omega-dmx-px-soft-move.jpg',
  softPlan: '/products/omega-dmx-px-soft-plan.jpg',
};

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
      {/* ─── STICKY PRODUCT BAR ─── */}
      <div
        className={`fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-black/90 backdrop-blur-xl transition-transform duration-300 ${
          sticky ? 'translate-y-0' : '-translate-y-full'
        }`}
        style={{ paddingTop: 'max(4.5rem, env(safe-area-inset-top))' }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <img src={ASSETS.heroBox} alt="" className="h-10 w-14 object-contain" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-wide">OMEGA DMX</div>
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
            src={ASSETS.heroBox}
            alt=""
            className="h-full w-full object-cover object-center opacity-90"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/30" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-black/40" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-7xl px-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-white/60">
            Interface DMX · Fabrication OMEGA
          </p>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl lg:text-8xl">
            OMEGA DMX
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/70 md:text-xl">
            2 univers. 1024 canaux. Logiciel inclus.
            <br className="hidden sm:block" />
            Sans abonnement — conçu pour la régie live.
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
                href="#experience"
                className="inline-flex items-center gap-2 rounded-full border border-white/25 px-7 py-3.5 text-sm font-semibold text-white transition hover:border-white/50 hover:bg-white/5"
              >
                Découvrir
                <ChevronDown size={16} />
              </a>
            </div>
          </div>

          <div className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-4">
            {[
              { k: '2', v: 'univers DMX' },
              { k: '1024', v: 'canaux' },
              { k: '1 km', v: 'sans fil (cartes)' },
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

      {/* ─── EXPERIENCE INTRO ─── */}
      <section id="experience" className="scroll-mt-28 border-t border-white/5 py-24 md:py-32">
        <div className="mx-auto max-w-4xl px-5 text-center">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-400/90">
              L&apos;expérience
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
              Un boîtier. Un logiciel.
              <span className="block text-white/45">Tout ce qu&apos;il faut pour le show.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/55 md:text-lg">
              OMEGA DMX remplace les empilements d&apos;interfaces et d&apos;abonnements par un
              système clair : hardware fiable, logiciel de régie en 3D, sauvegarde du show dans le
              boîtier.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ─── FULL BLEED SOFTWARE ─── */}
      <section id="logiciel" className="relative scroll-mt-28">
        <div className="relative min-h-[70svh] md:min-h-[85svh]">
          <img
            src={ASSETS.softUi}
            alt="Logiciel OMEGADMX — vue 3D et pilotage"
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-transparent" />
          <div className="relative z-10 flex min-h-[70svh] items-end px-5 pb-16 md:min-h-[85svh] md:pb-24">
            <div className="mx-auto w-full max-w-7xl">
              <Reveal>
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
                  <MonitorPlay size={14} />
                  Logiciel OMEGADMX
                </div>
                <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight md:text-6xl">
                  Concevez en 3D.
                  <br />
                  Jouez en live.
                </h2>
                <p className="mt-5 max-w-lg text-base text-white/65 md:text-lg">
                  Faisceaux, mouvements, scènes : le logiciel inclus visualise le show avant
                  d&apos;allumer la salle — et pilote jusqu&apos;à 2 univers DMX le jour J.
                </p>
                <Link
                  to="/omega-dmx-logiciel"
                  className="mt-8 inline-flex text-sm font-semibold text-white underline decoration-white/30 underline-offset-4 transition hover:decoration-white"
                >
                  Voir la présentation logiciel
                </Link>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FEATURE CHAPTERS ─── */}
      {[
        {
          kicker: 'Mouvement',
          title: 'Effets automatiques, rendu immédiat',
          text: 'Cercle, huit, swing, wave. Amplitude, vitesse, déphasage entre lyres — le plateau 3D suit en direct pendant que vous réglez.',
          img: ASSETS.softLive,
          icon: Move,
          points: ['Cercle · Huit · Swing · Wave', 'Déphasage multi-lyres', 'Pad PAN / TILT'],
        },
        {
          kicker: 'Implantation',
          title: 'Placez vos machines comme sur le terrain',
          text: 'Plateau 3D et plan 2D : glissez vos projecteurs, gérez la symétrie et les inversions sans tableur.',
          img: ASSETS.softPlace,
          icon: Boxes,
          reverse: true,
          points: ['Vue 3D temps réel', 'Plan 2D d’implantation', 'Symétrie & inversions'],
        },
        {
          kicker: 'Couleur & canaux',
          title: 'Un contrôle de régie, pas un jouet',
          text: 'Faders RVB, blanc, gobos, dimmer, FX : chaque attribut sous la main, pour des looks propres et reproductibles.',
          img: ASSETS.softColor,
          icon: Palette,
          points: ['Mixage couleur précis', 'Gobos & dimmer', 'Scènes prêtes au live'],
        },
      ].map((ch, i) => (
        <section
          key={ch.kicker}
          className="border-t border-white/5 py-20 md:py-28"
        >
          <div
            className={`mx-auto grid max-w-7xl items-center gap-10 px-5 lg:grid-cols-2 lg:gap-16 ${
              ch.reverse ? 'lg:[&>*:first-child]:order-2' : ''
            }`}
          >
            <Reveal delay={40}>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/50">
                <img src={ch.img} alt={ch.title} className="w-full object-cover" loading="lazy" />
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-blue-400/90">
                <ch.icon size={14} />
                {ch.kicker}
              </div>
              <h3 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">{ch.title}</h3>
              <p className="mt-4 text-base leading-relaxed text-white/55 md:text-lg">{ch.text}</p>
              <ul className="mt-8 space-y-3">
                {ch.points.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-sm text-white/75 md:text-base">
                    <Check className="mt-0.5 shrink-0 text-blue-400" size={18} />
                    {p}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>
      ))}

      {/* ─── HARDWARE PILLARS ─── */}
      <section className="border-t border-white/5 bg-zinc-950/50 py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-white/40">
              Hardware
            </p>
            <h2 className="mt-4 text-center text-3xl font-semibold tracking-tight md:text-5xl">
              Pensé pour ne pas lâcher le jour J
            </h2>
          </Reveal>

          <div className="mt-16 grid gap-5 md:grid-cols-3">
            {[
              {
                icon: Layers,
                t: '2 univers natifs',
                d: '1024 canaux en simultané, sans dongle ni licence mensuelle pour le boîtier OMEGA.',
              },
              {
                icon: Wifi,
                t: 'Sans fil jusqu’à 1 km',
                d: 'Avec les cartes réceptrices OMEGA : monitoring du signal et portée pensée pour le terrain.',
              },
              {
                icon: Save,
                t: 'Show dans le boîtier',
                d: 'Sauvegarde continue. Si le PC plante, le boîtier peut garder le spectacle en vie.',
              },
              {
                icon: Ban,
                t: 'Sans abonnement',
                d: 'Vous achetez, vous gardez. Le logiciel est inclus avec le boîtier.',
              },
              {
                icon: Radio,
                t: 'Monitoring live',
                d: 'Qualité de liaison visible pour anticiper les projecteurs en limite de portée.',
              },
              {
                icon: Shield,
                t: 'Mises à jour',
                d: 'Boîtier et logiciel évoluent — pas de location de fonctionnalités de base.',
              },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 50}>
                <div className="h-full rounded-2xl border border-white/10 bg-black/60 p-7 transition hover:border-white/20">
                  <c.icon className="text-blue-400" size={24} strokeWidth={1.5} />
                  <h3 className="mt-5 text-lg font-semibold">{c.t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/50">{c.d}</p>
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
            <div className="mb-12 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/40">
                  Dans le logiciel
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                  De la préprod au live
                </h2>
              </div>
              <Link
                to="/omega-dmx-logiciel"
                className="text-sm font-semibold text-white/70 underline decoration-white/20 underline-offset-4 hover:text-white hover:decoration-white"
              >
                Toutes les vues logiciel
              </Link>
            </div>
          </Reveal>

          <div className="grid gap-4 md:grid-cols-2">
            {[
              { src: ASSETS.softStage, cap: 'Plateau 3D multi-projecteurs' },
              { src: ASSETS.softMove, cap: 'Mouvements PAN / TILT' },
              { src: ASSETS.softPlan, cap: 'Plan d’implantation 2D' },
              { src: ASSETS.softLive, cap: 'Capture live — effet & faisceau' },
            ].map((g, i) => (
              <Reveal key={g.cap} delay={(i % 2) * 80}>
                <figure className="group overflow-hidden rounded-2xl border border-white/10 bg-zinc-950">
                  <img
                    src={g.src}
                    alt={g.cap}
                    className="aspect-[16/10] w-full object-cover transition duration-700 group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                  <figcaption className="border-t border-white/5 px-5 py-3 text-sm text-white/45">
                    {g.cap}
                  </figcaption>
                </figure>
              </Reveal>
            ))}
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
                ['Univers DMX', '2 (1024 canaux)'],
                ['Logiciel', 'OMEGADMX inclus — Windows'],
                ['Abonnement', 'Aucun'],
                ['Sans fil', 'Jusqu’à 1 km avec cartes OMEGA (option)'],
                ['Sauvegarde show', 'Interne au boîtier'],
                ['Interfaces tierces', 'Licence optionnelle (ex. Sunlite)'],
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

      {/* ─── FINAL CTA ─── */}
      <section className="relative overflow-hidden border-t border-white/5 py-28 md:py-36">
        <div className="pointer-events-none absolute inset-0">
          <img src={ASSETS.heroBox} alt="" className="h-full w-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-black/75" />
        </div>
        <div className="relative z-10 mx-auto max-w-3xl px-5 text-center">
          <Reveal>
            <h2 className="text-4xl font-semibold tracking-tight md:text-6xl">
              Prêt pour la régie.
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-white/55">
              OMEGA DMX Interface — {fmt(mainPrice)} € {mainLabel}. Logiciel inclus, sans
              abonnement.
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
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
};

export default OmegaDmxInterfacePage;

import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BoitierDmxSvg from '../components/BoitierDmxSvg';

// Three.js pèse plus que tout le reste de la page réuni : il ne doit jamais partir
// dans le paquet principal. L'illustration vectorielle, elle, est légère et sert de
// substitut pendant le chargement.
const BoitierDmx3D = lazy(() => import('../components/BoitierDmx3D'));
import {
  ArrowLeft,
  Check,
  Shield,
  RefreshCw,
  Save,
  Activity,
  Gauge,
  Layers,
  Radio,
  Wifi,
  Sparkles,
  ChevronDown,
  ShoppingCart,
  Mail,
  Phone,
  Cpu,
  Zap,
  CircuitBoard,
  Palette,
  Move,
  Boxes,
  MonitorPlay,
  Ban,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Product } from '../types';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useSiteSettings } from '../contexts/SiteSettingsContext';
import toast from 'react-hot-toast';

/* ================================================================== */
/*  Reveal : apparition au scroll                                     */
/* ================================================================== */
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
      entries =>
        entries.forEach(e => {
          if (e.isIntersecting) {
            setVisible(true);
            obs.unobserve(e.target);
          }
        }),
      { threshold: 0.15 }
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

/* ================================================================== */
/*  SVG A — 2 univers DMX / 1024 canaux                               */
/* ================================================================== */
const UniversesSvg = () => {
  const cells = (uni: number) =>
    Array.from({ length: 48 }).map((_, i) => {
      const col = i % 16;
      const row = Math.floor(i / 16);
      return (
        <rect
          key={i}
          x={258 + col * 14.5}
          y={(uni === 1 ? 70 : 192) + row * 18}
          width="11"
          height="13"
          rx="2"
          fill={uni === 1 ? 'url(#odmxU1)' : 'url(#odmxU2)'}
          className="odmx-cell"
          style={{ animationDelay: `${(i % 16) * 0.06 + row * 0.04}s` }}
        />
      );
    });

  return (
    <svg viewBox="0 0 520 300" className="w-full h-full">
      <defs>
        <linearGradient id="odmxBoxA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0b1220" />
        </linearGradient>
        <linearGradient id="odmxU1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id="odmxU2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>

      {/* boîtier */}
      <rect x="24" y="110" width="96" height="80" rx="12" fill="url(#odmxBoxA)" stroke="#334155" strokeWidth="2" />
      <text x="72" y="142" textAnchor="middle" fontSize="15" fontWeight="bold" fill="#93c5fd">OMEGA</text>
      <text x="72" y="160" textAnchor="middle" fontSize="10" fill="#64748b" letterSpacing="2">DMX</text>
      {/* 2 ports XLR */}
      <circle cx="120" cy="135" r="7" fill="#0b1220" stroke="#3b82f6" strokeWidth="2" />
      <circle cx="120" cy="165" r="7" fill="#0b1220" stroke="#a78bfa" strokeWidth="2" />

      {/* câbles vers les 2 univers */}
      <path d="M127 135 C 190 135, 200 95, 250 95" fill="none" stroke="#3b82f6" strokeWidth="3" className="odmx-flow" />
      <path d="M127 165 C 190 165, 200 217, 250 217" fill="none" stroke="#8b5cf6" strokeWidth="3" className="odmx-flow" />

      {/* panneau univers 1 */}
      <rect x="248" y="46" width="256" height="96" rx="10" fill="#0b1220" stroke="#1e3a8a" strokeWidth="1.5" />
      <text x="258" y="40" fontSize="11" fontWeight="bold" fill="#60a5fa">UNIVERS 1</text>
      <text x="496" y="40" textAnchor="end" fontSize="10" fill="#475569">512 canaux</text>
      {cells(1)}

      {/* panneau univers 2 */}
      <rect x="248" y="168" width="256" height="96" rx="10" fill="#0b1220" stroke="#5b21b6" strokeWidth="1.5" />
      <text x="258" y="162" fontSize="11" fontWeight="bold" fill="#c084fc">UNIVERS 2</text>
      <text x="496" y="162" textAnchor="end" fontSize="10" fill="#475569">512 canaux</text>
      {cells(2)}
    </svg>
  );
};

/* ================================================================== */
/*  SVG B — Liaison sans fil + cartes dans les lyres                  */
/* ================================================================== */
const Lyre = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x}, ${y})`}>
    {/* faisceau */}
    <path d="M-7 10 L-20 40 L20 40 L7 10 Z" fill="#22d3ee" opacity="0.12" />
    {/* bras */}
    <path d="M-17 34 L-17 4 M17 34 L17 4" stroke="#475569" strokeWidth="3" fill="none" strokeLinecap="round" />
    {/* tête */}
    <rect x="-15" y="-8" width="30" height="24" rx="7" fill="#1e293b" stroke="#64748b" strokeWidth="2" />
    <circle cx="0" cy="6" r="6" fill="#22d3ee" />
    {/* base + carte sans fil */}
    <rect x="-24" y="34" width="48" height="14" rx="4" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
    <rect x="-12" y="37" width="24" height="8" rx="2" fill="#06b6d4" className="odmx-chip" />
  </g>
);

const WirelessSvg = () => {
  const lyres = [
    { x: 452, y: 64 },
    { x: 488, y: 162 },
    { x: 452, y: 258 },
  ];
  const paths = [
    'M104,150 Q280,70 436,72',
    'M104,154 Q300,150 470,168',
    'M104,158 Q280,250 436,266',
  ];
  return (
    <svg viewBox="0 0 560 320" className="w-full h-full">
      <defs>
        <linearGradient id="odmxBoxB" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0b1220" />
        </linearGradient>
      </defs>

      {/* boîtier émetteur */}
      <rect x="24" y="116" width="80" height="74" rx="11" fill="url(#odmxBoxB)" stroke="#0ea5e9" strokeWidth="2" />
      <text x="64" y="158" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#67e8f9">OMEGA</text>
      {/* antenne + ondes */}
      <line x1="64" y1="116" x2="64" y2="92" stroke="#0ea5e9" strokeWidth="3" strokeLinecap="round" />
      <circle cx="64" cy="90" r="4" fill="#22d3ee" />
      {[0, 1, 2].map(i => (
        <circle key={i} cx="64" cy="90" r="10" fill="none" stroke="#22d3ee" strokeWidth="2">
          <animate attributeName="r" from="10" to="40" dur="2.4s" begin={`${i * 0.8}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.8" to="0" dur="2.4s" begin={`${i * 0.8}s`} repeatCount="indefinite" />
        </circle>
      ))}

      {/* liaisons + paquets de données */}
      {paths.map((p, i) => (
        <g key={i}>
          <path d={p} fill="none" stroke="#0e7490" strokeWidth="1.5" strokeDasharray="5 7" opacity="0.7" />
          <circle r="3.5" fill="#22d3ee">
            <animateMotion dur="2s" begin={`${i * 0.5}s`} repeatCount="indefinite" path={p} />
          </circle>
        </g>
      ))}

      {/* lyres équipées de la carte */}
      {lyres.map((l, i) => (
        <Lyre key={i} x={l.x} y={l.y} />
      ))}

      {/* règle de distance */}
      <line x1="120" y1="305" x2="470" y2="305" stroke="#334155" strokeWidth="1.5" />
      <line x1="120" y1="300" x2="120" y2="310" stroke="#334155" strokeWidth="1.5" />
      <line x1="470" y1="300" x2="470" y2="310" stroke="#334155" strokeWidth="1.5" />
      <text x="295" y="298" textAnchor="middle" fontSize="11" fill="#94a3b8" fontWeight="bold">
        jusqu'à 1 km
      </text>
    </svg>
  );
};

/* ================================================================== */
/*  SVG C — Sauvegarde interne anti-crash PC                          */
/* ================================================================== */
const BackupSvg = () => (
  <svg viewBox="0 0 520 280" className="w-full h-full">
    <defs>
      <linearGradient id="odmxBoxC" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#1e293b" />
        <stop offset="100%" stopColor="#0b1220" />
      </linearGradient>
    </defs>

    {/* ordinateur en panne */}
    <g opacity="0.85">
      <rect x="40" y="86" width="120" height="78" rx="8" fill="#0b1220" stroke="#7f1d1d" strokeWidth="2" />
      <rect x="78" y="164" width="44" height="10" rx="3" fill="#0b1220" stroke="#7f1d1d" strokeWidth="2" />
      <rect x="58" y="176" width="84" height="8" rx="3" fill="#1e293b" />
      <line x1="78" y1="108" x2="122" y2="142" stroke="#ef4444" strokeWidth="4" strokeLinecap="round" />
      <line x1="122" y1="108" x2="78" y2="142" stroke="#ef4444" strokeWidth="4" strokeLinecap="round" />
    </g>
    <text x="100" y="206" textAnchor="middle" fontSize="12" fill="#f87171" fontWeight="bold">PC en panne</text>

    {/* flèche relais */}
    <path d="M178 125 L250 125" fill="none" stroke="#22c55e" strokeWidth="3" strokeDasharray="6 6" className="odmx-flow" />
    <path d="M250 125 l-10 -6 l0 12 z" fill="#22c55e" />

    {/* boîtier qui prend le relais (bouclier + mémoire) */}
    <path d="M340 60 L410 78 L410 138 Q410 178 340 196 Q270 178 270 138 L270 78 Z" fill="#06281f" stroke="#22c55e" strokeWidth="2" opacity="0.5" />
    <rect x="300" y="98" width="80" height="60" rx="10" fill="url(#odmxBoxC)" stroke="#22c55e" strokeWidth="2" />
    <rect x="316" y="112" width="48" height="20" rx="4" fill="#0b1220" stroke="#22c55e" strokeWidth="1.5" />
    <text x="340" y="127" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#4ade80">SHOW</text>
    <circle cx="340" cy="146" r="4" fill="#22c55e" className="odmx-chip" />

    {/* sortie : le show continue */}
    <path d="M380 128 L470 128" fill="none" stroke="#22c55e" strokeWidth="3" className="odmx-flow" />
    <text x="425" y="120" textAnchor="middle" fontSize="11" fill="#4ade80" fontWeight="bold">DMX OK</text>
    <text x="340" y="222" textAnchor="middle" fontSize="12" fill="#4ade80" fontWeight="bold">Le show continue</text>
  </svg>
);

/* ================================================================== */
/*  SVG D — Monitoring de la qualité du signal                        */
/* ================================================================== */
const SignalMonitorSvg = () => {
  const rows = [
    { label: 'Lyre 01', q: 0.96, color: '#22c55e' },
    { label: 'Lyre 02', q: 0.88, color: '#22c55e' },
    { label: 'Lyre 03', q: 0.62, color: '#eab308' },
    { label: 'Lyre 04', q: 0.91, color: '#22c55e' },
  ];
  return (
    <svg viewBox="0 0 420 280" className="w-full h-full">
      <rect x="20" y="20" width="380" height="240" rx="14" fill="#0b1220" stroke="#1e293b" strokeWidth="2" />
      <text x="40" y="52" fontSize="13" fontWeight="bold" fill="#67e8f9" letterSpacing="1">
        QUALITÉ DU SIGNAL
      </text>
      <line x1="40" y1="64" x2="380" y2="64" stroke="#1e293b" strokeWidth="1.5" />
      {rows.map((r, i) => {
        const y = 92 + i * 42;
        return (
          <g key={i}>
            <circle cx="48" cy={y} r="5" fill={r.color} className="odmx-chip" style={{ animationDelay: `${i * 0.3}s` }} />
            <text x="64" y={y + 4} fontSize="12" fill="#cbd5e1">{r.label}</text>
            <rect x="150" y={y - 6} width="180" height="12" rx="6" fill="#1e293b" />
            <rect
              x="150"
              y={y - 6}
              width={180 * r.q}
              height="12"
              rx="6"
              fill={r.color}
              className="odmx-bar"
              style={{ transformOrigin: `150px ${y}px`, animationDelay: `${i * 0.2}s` }}
            />
            <text x="344" y={y + 4} fontSize="11" fontWeight="bold" fill={r.color}>
              {Math.round(r.q * 100)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
};

/* ================================================================== */
/*  PAGE                                                              */
/* ================================================================== */
const PRODUCT_IMAGE = '/products/omega-dmx-interface.webp';
const PRICE_TTC = 429;
const PRICE_HT = PRICE_TTC / 1.2;

const OmegaDmxInterfacePage = () => {
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [dbProduct, setDbProduct] = useState<Product | null>(null);
  const { addToCart } = useCart();
  const { user, userType } = useAuth();
  const { vitrineMode } = useSiteSettings();
  const navigate = useNavigate();

  const heroRef = useRef<HTMLDivElement>(null);

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
      if (heroRef.current) setShowStickyBar(heroRef.current.getBoundingClientRect().bottom < 0);
    };
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isPro = userType === 'pro';
  const mainPrice = isPro ? PRICE_HT : PRICE_TTC;
  const mainLabel = isPro ? 'HT' : 'TTC';
  const altPrice = isPro
    ? `${PRICE_TTC.toFixed(2).replace('.', ',')}€ TTC`
    : `${PRICE_HT.toFixed(2).replace('.', ',')}€ HT`;
  const fmt = (n: number) =>
    n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleBuy = () => {
    // MODE VITRINE : pas de commande en ligne → demande de devis pré-remplie.
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
      toast('Pour finaliser votre commande, contactez notre équipe 📩', { duration: 4000 });
      navigate('/contact');
    }
  };

  const valueChips = [
    { icon: Layers, label: '2 univers DMX' },
    { icon: Cpu, label: '1024 canaux' },
    { icon: Ban, label: 'Sans abonnement' },
    { icon: Wifi, label: "Sans fil jusqu'à 1 km" },
  ];

  return (
    <div className="min-h-screen bg-black overflow-hidden">
      <style>{`
        @keyframes odmxCell {0%,100%{opacity:.18} 50%{opacity:1}}
        @keyframes odmxBar {0%{transform:scaleX(.25)} 50%{transform:scaleX(1)} 100%{transform:scaleX(.25)}}
        @keyframes odmxChip {0%,100%{opacity:.4} 50%{opacity:1}}
        @keyframes odmxFlow {to{stroke-dashoffset:-24}}
        @keyframes odmxFloatImg {0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)}}
        .odmx-cell{animation:odmxCell 2.4s ease-in-out infinite}
        .odmx-bar{animation:odmxBar 2.6s ease-in-out infinite}
        .odmx-chip{animation:odmxChip 1.5s ease-in-out infinite}
        .odmx-flow{stroke-dasharray:6 6;animation:odmxFlow 1s linear infinite}
        .odmx-float-img{animation:odmxFloatImg 6s ease-in-out infinite}
      `}</style>

      {/* ----------------------- STICKY BUY BAR ----------------------- */}
      <div
        className={`fixed top-0 left-0 right-0 bg-black/95 backdrop-blur-lg border-b border-white/10 z-40 transition-transform duration-300 ${
          showStickyBar ? 'translate-y-0' : '-translate-y-full'
        }`}
        style={{ paddingTop: '80px' }}
      >
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={PRODUCT_IMAGE} alt="OMEGA DMX Interface" className="w-12 h-12 object-contain" />
            <div>
              <h2 className="text-white font-bold leading-tight">OMEGA DMX Interface</h2>
              <div className="text-blue-400 font-semibold">
                {fmt(mainPrice)}€ <span className="text-sm text-gray-400">{mainLabel}</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleBuy}
            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all flex items-center gap-2"
          >
            <ShoppingCart size={18} />
            {vitrineMode ? 'Demander un devis' : 'Commander'}
          </button>
        </div>
      </div>

      {/* ----------------------------- HERO --------------------------- */}
      <div ref={heroRef} className="relative pt-32 pb-16">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-950/30 via-black to-black" />
        <div
          className="absolute top-24 left-1/2 -translate-x-1/2 w-[620px] h-[620px] rounded-full blur-3xl opacity-25"
          style={{ background: 'radial-gradient(circle, #3b82f6 0%, transparent 65%)' }}
        />
        <div className="container mx-auto px-6 relative z-10">
          <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-blue-400 transition-colors mb-8">
            <ArrowLeft size={20} />
            Retour à l'accueil
          </Link>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1">
              <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-2 mb-6">
                <Sparkles className="text-blue-400" size={16} />
                <span className="text-blue-400 font-medium text-sm tracking-wider">
                  INTERFACE DMX · SANS ABONNEMENT
                </span>
              </div>

              <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
                OMEGA DMX
                <br />
                <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                  Interface
                </span>
              </h1>

              <p className="text-xl text-gray-300 mb-8 leading-relaxed">
                L'interface qui pilote <strong className="text-white">2 univers DMX</strong> — soit{' '}
                <strong className="text-white">1024 canaux</strong> — sans le moindre abonnement. Et qui
                passe en sans fil jusqu'à <strong className="text-white">1 km</strong> grâce aux cartes
                réceptrices OMEGA.
              </p>

              <div className="mb-8 p-6 bg-gradient-to-r from-blue-950/40 to-purple-950/40 rounded-2xl border border-blue-500/20">
                <div className="text-sm text-gray-400 mb-1">Prix de lancement</div>
                <div className="text-5xl font-bold text-white">
                  {fmt(mainPrice)}€<span className="text-2xl text-gray-400 ml-2">{mainLabel}</span>
                </div>
                <div className="text-gray-400 text-sm mt-1">
                  soit {altPrice} · logiciel inclus, sans abonnement
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={handleBuy}
                  className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center justify-center gap-2"
                >
                  <ShoppingCart size={20} />
                  {vitrineMode ? 'Demander un devis' : `Commander — ${fmt(mainPrice)}€`}
                </button>
                <Link
                  to="/contact"
                  className="flex-1 border-2 border-white/30 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300 text-center flex items-center justify-center gap-2"
                >
                  <Mail size={20} />
                  Demander une démo
                </Link>
              </div>
            </div>

            <div className="order-1 lg:order-2 relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-3xl blur-3xl" />
              {/* Le boîtier en 3D, orientable. Three.js pèse plus lourd que tout le
                  reste de la page : il n'est donc chargé qu'ici, en différé. En
                  attendant — et si le navigateur ne sait pas faire de 3D —
                  l'illustration vectorielle prend sa place : elle s'affiche
                  instantanément et représente le même objet. */}
              <div className="relative bg-black/60 backdrop-blur-sm rounded-3xl p-8 border border-white/10">
                <Suspense
                  fallback={<BoitierDmxSvg className="w-full h-[400px] odmx-float-img" />}
                >
                  <BoitierDmx3D className="w-full h-[400px]" />
                </Suspense>
                <p className="text-center text-gray-500 text-xs mt-3">
                  Faites glisser pour orienter le boîtier
                </p>
              </div>
              <div className="absolute -top-4 -right-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full font-bold text-sm shadow-lg">
                FABRICATION OMEGA
              </div>
            </div>
          </div>

          {/* bandeau de valeur */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-14">
            {valueChips.map((c, i) => (
              <Reveal key={i} delay={i * 100}>
                <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/10">
                  <div className="bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-xl p-2.5">
                    <c.icon className="text-blue-400" size={22} />
                  </div>
                  <span className="text-white font-semibold">{c.label}</span>
                </div>
              </Reveal>
            ))}
          </div>

          <div className="mt-10 text-center">
            <ChevronDown size={28} className="text-gray-500 animate-bounce mx-auto" />
          </div>
        </div>
      </div>

      {/* =============== 1. LE BOÎTIER : 2 UNIVERS DMX =============== */}
      <section className="py-20 bg-gradient-to-r from-blue-950/10 to-purple-950/10">
        <div className="container mx-auto px-6">
          <Reveal>
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <span className="text-blue-400 text-xs font-semibold tracking-widest uppercase">
                  Le boîtier
                </span>
                <h2 className="text-4xl font-bold text-white mt-3 mb-5">
                  2 univers DMX, 1024 canaux
                </h2>
                <p className="text-xl text-gray-300 leading-relaxed mb-6">
                  Deux sorties XLR totalement indépendantes pilotent deux univers DMX en
                  simultané, soit <strong className="text-white">1024 canaux</strong>. De quoi gérer
                  les installations les plus ambitieuses, avec des composants de toute dernière
                  génération.
                </p>
                <div className="space-y-3">
                  {[
                    'Aucun abonnement, jamais — vous achetez, vous gardez',
                    'Logiciel professionnel inclus',
                    'Filaire (XLR) ou sans fil, au choix',
                  ].map((t, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="bg-green-500/20 rounded-full p-1">
                        <Check className="text-green-400" size={16} />
                      </div>
                      <span className="text-gray-200">{t}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative aspect-[520/300] bg-gradient-to-br from-blue-950/30 to-purple-950/30 rounded-3xl border border-white/10 p-6">
                <UniversesSvg />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* =============== 2. LE SANS FIL OMEGA =============== */}
      <section className="py-20 bg-black">
        <div className="container mx-auto px-6">
          <Reveal>
            <div className="grid lg:grid-cols-2 gap-12 items-center lg:grid-flow-dense">
              <div className="lg:col-start-2">
                <span className="text-cyan-400 text-xs font-semibold tracking-widest uppercase">
                  Le sans fil OMEGA
                </span>
                <h2 className="text-4xl font-bold text-white mt-3 mb-5">
                  Passez vos lyres en sans fil, jusqu'à 1 km
                </h2>
                <p className="text-xl text-gray-300 leading-relaxed mb-6">
                  Équipez vos projecteurs d'une{' '}
                  <strong className="text-white">carte DMX sans fil OMEGA</strong> et le boîtier
                  diffuse vos deux univers directement vers eux — jusqu'à{' '}
                  <strong className="text-white">300 récepteurs</strong> et{' '}
                  <strong className="text-white">1 km de distance</strong>, sans tirer un seul câble.
                </p>
                <div className="inline-flex items-start gap-3 p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-xl">
                  <CircuitBoard className="text-cyan-400 flex-shrink-0 mt-0.5" size={20} />
                  <p className="text-cyan-100/80 text-sm">
                    Les <strong className="text-cyan-300">cartes DMX sans fil</strong> s'intègrent dans
                    vos lyres et sont <strong className="text-cyan-300">vendues séparément</strong>.
                    Une carte par projecteur à connecter.
                  </p>
                </div>
              </div>
              <div className="lg:col-start-1 relative aspect-[560/320] bg-gradient-to-br from-cyan-950/30 to-blue-950/30 rounded-3xl border border-white/10 p-6">
                <WirelessSvg />
              </div>
            </div>
          </Reveal>

          {/* 3 étapes */}
          <div className="grid md:grid-cols-3 gap-6 mt-14 max-w-5xl mx-auto">
            {[
              { icon: Radio, n: '1', t: 'Le boîtier émet', d: 'Vos 2 univers DMX sont diffusés en sans fil depuis le boîtier.' },
              { icon: CircuitBoard, n: '2', t: 'La carte reçoit', d: 'Chaque lyre équipée d\'une carte OMEGA capte instantanément son signal.' },
              { icon: Wifi, n: '3', t: "Jusqu'à 1 km", d: "Jusqu'à 300 projecteurs pilotés sans fil, sans latence perceptible." },
            ].map((s, i) => (
              <Reveal key={i} delay={i * 120}>
                <div className="relative p-6 bg-white/5 rounded-2xl border border-white/10 h-full">
                  <div className="absolute -top-3 -left-3 w-9 h-9 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold flex items-center justify-center text-sm">
                    {s.n}
                  </div>
                  <s.icon className="text-cyan-400 mb-3" size={26} />
                  <h3 className="text-white font-bold mb-2">{s.t}</h3>
                  <p className="text-gray-400 text-sm">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* =============== 3. SHOWCASE LOGICIEL =============== */}
      <section className="py-24 bg-gradient-to-b from-black via-blue-950/10 to-black">
        <div className="container mx-auto px-6">
          <Reveal>
            <div className="text-center mb-16 max-w-3xl mx-auto">
              <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-2 mb-6">
                <MonitorPlay className="text-purple-400" size={16} />
                <span className="text-purple-400 font-medium text-sm tracking-wider">LE LOGICIEL OMEGA</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                Concevez votre show, en 3D, avant la salle
              </h2>
              <p className="text-xl text-gray-400">
                Puissant, rapide et confortable. Des automatismes travaillent en coulisses pour plus
                de fiabilité et de stabilité que les systèmes de pilotage DMX actuels.
              </p>
            </div>
          </Reveal>

          {/* Grande image : vue 3D du show */}
          <Reveal>
            <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-black mb-8">
              <img
                src="/products/omega-dmx-soft-3d.webp"
                alt="Visualisation 3D du show en temps réel"
                className="w-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 p-6 md:p-8">
                <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-400/30 rounded-full px-3 py-1 mb-3">
                  <Boxes className="text-blue-300" size={14} />
                  <span className="text-blue-200 text-xs font-semibold">VUE 3D TEMPS RÉEL</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-bold text-white mb-1">
                  Visualisez chaque faisceau en direct
                </h3>
                <p className="text-gray-300 max-w-xl">
                  Le rendu scénique 3D reproduit vos lyres et leurs faisceaux pendant que vous
                  travaillez — réglez votre show sans même allumer la salle.
                </p>
              </div>
            </div>
          </Reveal>

          {/* Implantation : scène 3D + plan 2D */}
          <Reveal>
            <div className="grid lg:grid-cols-2 gap-8 mb-8">
              <div className="bg-gradient-to-br from-gray-900/60 to-gray-800/30 rounded-3xl border border-white/10 overflow-hidden">
                <div className="p-6">
                  <div className="inline-flex items-center gap-2 text-blue-400 mb-2">
                    <Boxes size={18} />
                    <span className="text-xs font-semibold tracking-wider uppercase">Plateau 3D</span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1">Implantez vos lyres comme dans la réalité</h3>
                  <p className="text-gray-400 text-sm">
                    Placez chaque projecteur sur un plateau 3D fidèle à votre scène.
                  </p>
                </div>
                <img src="/products/omega-dmx-soft-stage3d.webp" alt="Plateau scénique 3D" className="w-full object-cover" loading="lazy" />
              </div>
              <div className="bg-gradient-to-br from-gray-900/60 to-gray-800/30 rounded-3xl border border-white/10 overflow-hidden flex flex-col">
                <div className="p-6">
                  <div className="inline-flex items-center gap-2 text-amber-400 mb-2">
                    <Layers size={18} />
                    <span className="text-xs font-semibold tracking-wider uppercase">Plan 2D</span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1">Un plan d'implantation clair</h3>
                  <p className="text-gray-400 text-sm">
                    Glissez-déposez vos lyres, axe de symétrie et inversions gérés automatiquement.
                  </p>
                </div>
                <div className="mt-auto p-4">
                  <img src="/products/omega-dmx-soft-plan2d.webp" alt="Plan de scène 2D" className="w-full rounded-xl border border-white/5" loading="lazy" />
                </div>
              </div>
            </div>
          </Reveal>

          {/* Couleur + Mouvement */}
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Couleur */}
            <Reveal>
              <div className="bg-gradient-to-br from-gray-900/60 to-gray-800/30 rounded-3xl border border-white/10 overflow-hidden h-full flex flex-col">
                <div className="p-6">
                  <div className="inline-flex items-center gap-2 text-pink-400 mb-2">
                    <Palette size={18} />
                    <span className="text-xs font-semibold tracking-wider uppercase">Couleur</span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1">Mixez la couleur, canal par canal</h3>
                  <p className="text-gray-400 text-sm">
                    Faders RVB + Blanc, gobos, dimmer : un contrôle précis de chaque canal.
                  </p>
                </div>
                <div className="mt-auto bg-black p-4">
                  <img src="/products/omega-dmx-soft-color.webp" alt="Mixage couleur et canaux" className="w-full rounded-xl" loading="lazy" />
                </div>
              </div>
            </Reveal>

            {/* Mouvement */}
            <Reveal delay={120}>
              <div className="bg-gradient-to-br from-gray-900/60 to-gray-800/30 rounded-3xl border border-white/10 overflow-hidden h-full">
                <div className="grid sm:grid-cols-2 h-full">
                  <div className="p-6 flex flex-col justify-center">
                    <div className="inline-flex items-center gap-2 text-cyan-400 mb-2">
                      <Move size={18} />
                      <span className="text-xs font-semibold tracking-wider uppercase">Mouvement</span>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Des mouvements automatiques</h3>
                    <p className="text-gray-400 text-sm mb-4">
                      Cercle, huit, swing, wave… avec amplitude, vitesse et déphasage entre lyres
                      pour des effets synchronisés en quelques secondes.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {['Cercle', 'Huit', 'Swing', 'Wave'].map(m => (
                        <span key={m} className="text-xs bg-white/5 border border-white/10 text-gray-300 px-3 py-1 rounded-full">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="bg-black p-4 flex items-center">
                    <img src="/products/omega-dmx-soft-move.webp" alt="Contrôle des mouvements PAN/TILT" className="w-full rounded-xl" loading="lazy" />
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Atouts logiciel */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto mt-12">
            {[
              { icon: Zap, t: 'Rapide', d: 'Interface fluide, pensée pour le jour J.' },
              { icon: Shield, t: 'Fiable', d: 'Des automatismes sécurisent chaque action.' },
              { icon: Gauge, t: 'Stable', d: 'Une stabilité supérieure aux systèmes actuels.' },
              { icon: Sparkles, t: 'Confortable', d: 'Tout est à portée de clic.' },
            ].map((h, i) => (
              <Reveal key={i} delay={i * 100}>
                <div className="text-center p-6 bg-white/5 rounded-2xl border border-white/10 h-full">
                  <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-2xl mb-4">
                    <h.icon className="text-blue-400" size={26} />
                  </div>
                  <h3 className="text-white font-bold mb-2">{h.t}</h3>
                  <p className="text-gray-400 text-sm">{h.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* =============== 4. FIABILITÉ =============== */}
      <section className="py-20 bg-black">
        <div className="container mx-auto px-6 space-y-16">
          {/* Sauvegarde anti-crash */}
          <Reveal>
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <span className="text-green-400 text-xs font-semibold tracking-widest uppercase">Sécurité des données</span>
                <h2 className="text-4xl font-bold text-white mt-3 mb-5">Vos shows à l'abri, même si le PC lâche</h2>
                <p className="text-xl text-gray-300 leading-relaxed">
                  Vos shows lumière sont sauvegardés en continu directement dans le boîtier. Si votre
                  ordinateur plante en plein événement, le boîtier prend le relais et le spectacle
                  continue. La hantise du PC qui lâche, c'est terminé.
                </p>
                <div className="flex flex-wrap gap-3 mt-6">
                  <span className="inline-flex items-center gap-2 text-sm bg-white/5 border border-white/10 text-gray-200 px-4 py-2 rounded-full">
                    <Save size={16} className="text-green-400" /> Sauvegarde interne automatique
                  </span>
                  <span className="inline-flex items-center gap-2 text-sm bg-white/5 border border-white/10 text-gray-200 px-4 py-2 rounded-full">
                    <RefreshCw size={16} className="text-green-400" /> Mises à jour automatiques
                  </span>
                </div>
              </div>
              <div className="relative aspect-[520/280] bg-gradient-to-br from-green-950/20 to-black rounded-3xl border border-white/10 p-6">
                <BackupSvg />
              </div>
            </div>
          </Reveal>

          {/* Monitoring signal */}
          <Reveal>
            <div className="grid lg:grid-cols-2 gap-12 items-center lg:grid-flow-dense">
              <div className="lg:col-start-2">
                <span className="text-cyan-400 text-xs font-semibold tracking-widest uppercase">Monitoring</span>
                <h2 className="text-4xl font-bold text-white mt-3 mb-5">La qualité du signal sous contrôle</h2>
                <p className="text-xl text-gray-300 leading-relaxed">
                  Le logiciel mesure en temps réel la qualité de liaison de chacun de vos appareils
                  sans fil. Vous repérez d'un coup d'œil le moindre projecteur en limite de portée et
                  vous intervenez avant que le public ne voie quoi que ce soit.
                </p>
              </div>
              <div className="lg:col-start-1 relative aspect-[420/280] bg-gradient-to-br from-cyan-950/20 to-black rounded-3xl border border-white/10 p-6">
                <SignalMonitorSvg />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* =============== 5. SPÉCIFICATIONS =============== */}
      <section className="py-20 bg-gradient-to-b from-black to-gray-900">
        <div className="container mx-auto px-6">
          <Reveal>
            <h2 className="text-4xl md:text-5xl font-bold text-white text-center mb-14">
              L'essentiel en un coup d'œil
            </h2>
          </Reveal>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {[
              { icon: Layers, label: 'Sorties', value: '2 × XLR · 2 univers' },
              { icon: Cpu, label: 'Canaux', value: '1024 canaux' },
              { icon: Ban, label: 'Abonnement', value: 'Aucun, jamais' },
              { icon: Wifi, label: 'Sans fil', value: "Jusqu'à 1 km · 300 récepteurs" },
              { icon: CircuitBoard, label: 'Cartes sans fil', value: 'Vendues séparément' },
              { icon: Save, label: 'Sauvegarde', value: 'Interne & automatique' },
              { icon: Activity, label: 'Monitoring', value: 'Qualité signal en direct' },
              { icon: RefreshCw, label: 'Mises à jour', value: 'Automatiques' },
            ].map((s, i) => (
              <Reveal key={i} delay={i * 70}>
                <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 rounded-2xl p-6 border border-white/10 hover:border-blue-500/30 transition-all duration-300 group h-full">
                  <div className="flex items-start gap-4">
                    <div className="bg-blue-500/10 rounded-xl p-3 group-hover:bg-blue-500/20 transition-colors">
                      <s.icon className="text-blue-400" size={22} />
                    </div>
                    <div>
                      <div className="text-gray-400 text-sm mb-1">{s.label}</div>
                      <div className="text-white font-semibold">{s.value}</div>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* =============== 6. CTA FINAL =============== */}
      <section className="py-24 bg-gradient-to-r from-blue-950/30 to-purple-950/30 border-t border-white/10">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Passez au pilotage DMX OMEGA
          </h2>
          <p className="text-xl text-gray-300 mb-6 max-w-2xl mx-auto">
            2 univers, 1024 canaux, sans abonnement — et le sans fil jusqu'à 1 km quand vous en avez
            besoin.
          </p>
          <div className="text-5xl font-bold text-white mb-8">
            {fmt(mainPrice)}€ <span className="text-2xl text-gray-400">{mainLabel}</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleBuy}
              className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center justify-center gap-2"
            >
              <ShoppingCart size={20} />
              {vitrineMode ? 'Demander un devis' : 'Commander maintenant'}
            </button>
            <a
              href="tel:+33681239931"
              className="border-2 border-white/30 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300 flex items-center justify-center gap-2"
            >
              <Phone size={20} />
              06 81 23 99 31
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

export default OmegaDmxInterfacePage;

import React from 'react';

/**
 * Illustrations système animées — style diagramme technique produit.
 * Strictement monochrome (noir / blanc / gris), traits nets, mouvement discret.
 * Chaque SVG est autonome : styles, filtres et dégradés portent un préfixe propre
 * pour éviter toute collision d'ID quand plusieurs illustrations coexistent.
 */

const frame = 'w-full h-auto max-w-lg mx-auto select-none';

/** Police et graisses communes aux légendes */
const FONT = 'ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif';

/** Bloc de style partagé : respect de prefers-reduced-motion. */
const reducedMotion = `
  @media (prefers-reduced-motion: reduce) {
    * { animation: none !important; }
  }
`;

/* ────────────────────────────────────────────────────────────────────────────
   1 — 1024 canaux sans fil
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Un boîtier au centre, tout le parc autour, sans un câble.
 *
 * Le message n'est plus « voici la chaîne technique » (3 récepteurs alignés) mais
 * « voici l'échelle » : l'onde part du boîtier et atteint 21 machines réparties sur
 * trois arcs de plus en plus lointains. Chaque machine s'allume au PASSAGE de l'onde
 * (retard proportionnel à sa distance), ce qui rend la diffusion lisible d'un coup d'œil.
 */

/** Trois couronnes de machines autour du boîtier. Position calculée, pas dessinée à la main. */
const RINGS = [
  { r: 92, n: 5, taille: 1 },
  { r: 143, n: 7, taille: 0.86 },
  { r: 194, n: 9, taille: 0.72 },
];

/** Centre d'émission : le boîtier, posé en bas au milieu. */
const HUB = { x: 240, y: 272 };

type Machine = {
  x: number;
  y: number;
  angle: number;
  echelle: number;
  retard: number;
  cle: string;
};

const MACHINES: Machine[] = RINGS.flatMap((ring, ri) =>
  Array.from({ length: ring.n }, (_, i) => {
    // Réparties sur un demi-tour, sans jamais coller aux bords bas du cadre.
    const t = ring.n === 1 ? 0.5 : i / (ring.n - 1);
    const deg = 166 - t * 152;
    const rad = (deg * Math.PI) / 180;
    return {
      x: HUB.x + ring.r * Math.cos(rad),
      y: HUB.y - ring.r * Math.sin(rad) * 0.82, // aplati : lecture « plateau », pas « cercle »
      angle: 90 - deg, // le faisceau part du boîtier vers l'extérieur
      echelle: ring.taille,
      // L'onde met d'autant plus de temps à arriver que la machine est loin.
      retard: (ring.r / 210) * 1.5,
      cle: `${ri}-${i}`,
    };
  })
);

export const SvgWireless1024: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 480 320"
    className={`${frame} ${className}`}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Un boîtier OMEGA diffuse le DMX en sans fil à tout un parc de machines"
  >
    <defs>
      <radialGradient id="wl-halo" cx="50%" cy="90%" r="70%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
        <stop offset="55%" stopColor="#ffffff" stopOpacity="0.05" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="wl-beam" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>
      <filter id="wl-glow" x="-200%" y="-200%" width="500%" height="500%">
        <feGaussianBlur stdDeviation="2.6" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <style>{`
        .wl-onde { animation: wlOnde 3s cubic-bezier(.2,.6,.35,1) infinite;
                   transform-box: fill-box; transform-origin: 50% 100%; }
        .wl-rx   { animation: wlRx 3s ease-out infinite; }
        .wl-fx   { animation: wlFx 3s ease-out infinite; }
        .wl-hub  { animation: wlHub 3s ease-in-out infinite; }
        .wl-ant  { animation: wlAnt 3s ease-in-out infinite; }
        @keyframes wlOnde { 0% { opacity:.75; transform:scale(.06);} 80% { opacity:0; transform:scale(1);} 100% { opacity:0; } }
        @keyframes wlRx   { 0%,4% { opacity:.16;} 12% { opacity:1;} 55%,100% { opacity:.3;} }
        @keyframes wlFx   { 0%,6% { opacity:.14;} 16% { opacity:.95;} 70%,100% { opacity:.4;} }
        @keyframes wlHub  { 0%,100% { opacity:.45;} 8% { opacity:1;} }
        @keyframes wlAnt  { 0%,100% { opacity:.3;} 6% { opacity:1;} }
        ${reducedMotion}
      `}</style>
    </defs>

    <rect width="480" height="320" fill="url(#wl-halo)" />

    {/* Repères de portée — le sol du plateau */}
    <g stroke="#fff" opacity="0.1">
      {RINGS.map((ring) => (
        <ellipse
          key={ring.r}
          cx={HUB.x}
          cy={HUB.y}
          rx={ring.r}
          ry={ring.r * 0.82}
          strokeWidth="0.7"
          strokeDasharray="2 5"
        />
      ))}
    </g>

    {/* Ondes : elles partent du boîtier et balaient tout le plateau */}
    <g stroke="#fff" fill="none">
      {[0, 1, 2].map((i) => (
        <ellipse
          key={i}
          className="wl-onde"
          cx={HUB.x}
          cy={HUB.y}
          rx="212"
          ry="174"
          strokeWidth={1.6 - i * 0.35}
          style={{ animationDelay: `${i}s` }}
        />
      ))}
    </g>

    {/* ── Le parc : 21 machines, chacune avec son récepteur ── */}
    {MACHINES.map((m) => (
      <g key={m.cle} transform={`translate(${m.x.toFixed(1)},${m.y.toFixed(1)})`}>
        <g transform={`rotate(${m.angle.toFixed(1)}) scale(${m.echelle})`}>
          {/* faisceau, vers l'extérieur */}
          <path
            className="wl-fx"
            d="M-7 -4 L-17 -40 H17 L7 -4 Z"
            fill="url(#wl-beam)"
            style={{ animationDelay: `${m.retard.toFixed(2)}s` }}
          />
          {/* tête + lyre */}
          <rect x="-9" y="-9" width="18" height="10" rx="3.5" fill="#080808" stroke="#fff" strokeWidth="1.2" />
          <path d="M-9 1 v5 M9 1 v5" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" />
          <path d="M-6 6 h12 v4 h-12 z" fill="#080808" stroke="#fff" strokeWidth="1.1" />
          {/* récepteur sans fil, collé à la machine */}
          <circle
            className="wl-rx"
            cx="0"
            cy="12"
            r="2.6"
            fill="#fff"
            filter="url(#wl-glow)"
            style={{ animationDelay: `${m.retard.toFixed(2)}s` }}
          />
        </g>
      </g>
    ))}

    {/* ── Le boîtier, seul émetteur ── */}
    <g transform={`translate(${HUB.x - 34},${HUB.y - 22})`}>
      <ellipse className="wl-hub" cx="34" cy="26" rx="46" ry="14" fill="#fff" opacity="0.12" />
      <rect x="0" y="0" width="68" height="30" rx="7" fill="#0a0a0a" stroke="#fff" strokeWidth="1.7" />
      <rect x="7" y="7" width="26" height="16" rx="2.5" stroke="#fff" strokeWidth="0.9" opacity="0.55" />
      <rect x="10" y="11" width="14" height="3" rx="1.5" fill="#fff" opacity="0.5" />
      <circle cx="47" cy="10" r="4.5" stroke="#fff" strokeWidth="1" />
      <circle cx="47" cy="21" r="4.5" stroke="#fff" strokeWidth="1" />
      <circle className="wl-hub" cx="60" cy="15" r="2.6" fill="#fff" />
      {/* antenne : l'onde en part */}
      <path d="M22 0 V-16" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
      <circle className="wl-ant" cx="22" cy="-19" r="3.2" fill="#fff" filter="url(#wl-glow)" />
    </g>

    {/* Légende */}
    <text
      x={HUB.x}
      y={HUB.y + 26}
      textAnchor="middle"
      fill="#fff"
      fontSize="9"
      fontFamily={FONT}
      fontWeight="600"
      letterSpacing="1.4"
    >
      UN SEUL BOÎTIER
    </text>

    {/* Compteur */}
    <g transform="translate(20,20)">
      <text x="0" y="20" fill="#fff" fontSize="26" fontFamily={FONT} fontWeight="700" letterSpacing="-1">
        1024
      </text>
      <text x="0" y="34" fill="#fff" fontSize="8.5" fontFamily={FONT} opacity="0.5" letterSpacing="1">
        CANAUX · 2 UNIVERS
      </text>
    </g>

    <g transform="translate(338,20)">
      <text x="112" y="20" textAnchor="end" fill="#fff" fontSize="26" fontFamily={FONT} fontWeight="700" letterSpacing="-1">
        0
      </text>
      <text x="112" y="34" textAnchor="end" fill="#fff" fontSize="8.5" fontFamily={FONT} opacity="0.5" letterSpacing="1">
        CÂBLE DE DONNÉES
      </text>
    </g>

    <text x="240" y="314" textAnchor="middle" fill="#fff" fontSize="8.5" fontFamily={FONT} opacity="0.4" letterSpacing="0.4">
      Chaque machine reçoit son récepteur — jusqu&apos;à 1 km avec l&apos;antenne adaptée
    </text>
  </svg>
);


/* ────────────────────────────────────────────────────────────────────────────
   2 — Sauvegarde du show dans le boîtier
   ──────────────────────────────────────────────────────────────────────────── */

export const SvgBackupBox: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 480 320"
    className={`${frame} ${className}`}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Sauvegarde continue du show dans le boîtier OMEGA"
  >
    <defs>
      <radialGradient id="bk-vignette" cx="55%" cy="45%" r="75%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.07" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="bk-fill" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0.35" />
      </linearGradient>
      <filter id="bk-glow" x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur stdDeviation="2" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <path id="bk-route" d="M148 128 C196 128 206 150 246 158" />
      <style>{`
        .bk-route { stroke-dasharray: 4 7; animation: bkRoute 1.3s linear infinite; }
        .bk-fill  { animation: bkFill 3.6s ease-in-out infinite; transform-box: fill-box; transform-origin: 0% 50%; }
        .bk-chip  { animation: bkChip 1.8s ease-in-out infinite; }
        .bk-ring  { animation: bkRing 3.6s ease-out infinite; transform-box: fill-box; transform-origin: 50% 50%; }
        .bk-check { stroke-dasharray: 30; stroke-dashoffset: 30; animation: bkCheck 3.6s ease-in-out infinite; }
        .bk-cursor{ animation: bkCursor 3.6s ease-in-out infinite; }
        @keyframes bkRoute { to { stroke-dashoffset:-22; } }
        @keyframes bkFill  { 0% { transform:scaleX(.05);} 70%,100% { transform:scaleX(1);} }
        @keyframes bkChip  { 0%,100% { opacity:.35;} 50% { opacity:1;} }
        @keyframes bkRing  { 0% { opacity:.5; transform:scale(.85);} 100% { opacity:0; transform:scale(1.35);} }
        @keyframes bkCheck { 0%,45% { stroke-dashoffset:30;} 70%,100% { stroke-dashoffset:0;} }
        @keyframes bkCursor{ 0%,100% { opacity:0;} 50% { opacity:1;} }
        ${reducedMotion}
      `}</style>
    </defs>

    <rect width="480" height="320" fill="url(#bk-vignette)" />
    <g stroke="#fff" opacity="0.08" strokeWidth="0.6">
      {Array.from({ length: 9 }).map((_, i) => (
        <line key={`h${i}`} x1="24" y1={36 + i * 28} x2="456" y2={36 + i * 28} />
      ))}
    </g>

    {/* ── Poste de régie ── */}
    <g transform="translate(38,84)">
      <rect x="0" y="0" width="110" height="72" rx="7" fill="#080808" stroke="#fff" strokeWidth="1.5" />
      <rect x="8" y="8" width="94" height="52" rx="3" stroke="#fff" strokeWidth="0.9" opacity="0.45" />
      {/* mini-UI : faders */}
      <rect x="14" y="13" width="26" height="5" rx="2" fill="#fff" opacity="0.4" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <g key={i}>
          <line x1={16 + i * 14} y1="24" x2={16 + i * 14} y2="54" stroke="#fff" strokeWidth="1" opacity="0.18" />
          <rect
            x={13 + i * 14}
            y={30 + ((i * 7) % 18)}
            width="6"
            height="3"
            rx="1.5"
            fill="#fff"
            opacity={0.5 - i * 0.05}
          />
        </g>
      ))}
      <rect className="bk-cursor" x="96" y="50" width="1.6" height="7" fill="#fff" />
      {/* pied */}
      <path d="M44 72 L52 90 h26 l8 -18" stroke="#fff" strokeWidth="1.2" />
      <line x1="34" y1="90" x2="96" y2="90" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <text x="0" y="110" fill="#fff" fontSize="10" fontFamily={FONT} fontWeight="600">
        Logiciel OMEGADMX
      </text>
      <text x="0" y="123" fill="#fff" fontSize="8.5" fontFamily={FONT} opacity="0.4">
        PC régie · édition en cours
      </text>
    </g>

    {/* ── Flux de synchronisation ── */}
    <use href="#bk-route" stroke="#fff" strokeWidth="1" opacity="0.2" />
    <use href="#bk-route" className="bk-route" stroke="#fff" strokeWidth="1.5" opacity="0.8" />
    <circle r="3" fill="#fff" filter="url(#bk-glow)">
      <animateMotion dur="1.9s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
        <mpath href="#bk-route" />
      </animateMotion>
    </circle>
    <circle r="2" fill="#fff" opacity="0.6">
      <animateMotion dur="1.9s" begin="0.65s" repeatCount="indefinite">
        <mpath href="#bk-route" />
      </animateMotion>
    </circle>
    <text x="164" y="112" fill="#fff" fontSize="8.5" fontFamily={FONT} opacity="0.5" letterSpacing="0.5">
      sync continue
    </text>

    {/* ── Boîtier + mémoire ── */}
    <g transform="translate(248,124)">
      <rect x="0" y="0" width="100" height="76" rx="10" fill="#080808" stroke="#fff" strokeWidth="1.6" />
      <path d="M50 0 V-18" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="50" cy="-21" r="2.8" fill="#fff" filter="url(#bk-glow)" />
      <text x="12" y="22" fill="#fff" fontSize="8.5" fontFamily={FONT} letterSpacing="1.2" opacity="0.75">
        OMEGA
      </text>
      {/* barre de remplissage mémoire */}
      <rect x="12" y="30" width="58" height="8" rx="4" stroke="#fff" strokeWidth="1" opacity="0.4" />
      <rect className="bk-fill" x="14" y="32" width="54" height="4" rx="2" fill="url(#bk-fill)" />
      <text x="12" y="52" fill="#fff" fontSize="7.5" fontFamily={FONT} opacity="0.42">
        show en mémoire
      </text>
      {/* puce */}
      <g className="bk-chip" transform="translate(76,28)">
        <rect x="0" y="0" width="16" height="20" rx="2" fill="#111" stroke="#fff" strokeWidth="1" />
        {[0, 1, 2].map((i) => (
          <line key={i} x1="3" y1={5 + i * 5} x2="13" y2={5 + i * 5} stroke="#fff" strokeWidth="0.8" />
        ))}
        <path d="M-3 4 h3 M-3 10 h3 M-3 16 h3 M16 4 h3 M16 10 h3 M16 16 h3" stroke="#fff" strokeWidth="0.8" opacity="0.6" />
      </g>
      <text x="0" y="94" fill="#fff" fontSize="9" fontFamily={FONT} opacity="0.55">
        Mémoire du boîtier
      </text>
    </g>

    {/* ── Bouclier ── */}
    <g transform="translate(374,116)">
      <circle className="bk-ring" cx="32" cy="40" r="40" stroke="#fff" strokeWidth="1" />
      <path
        d="M32 4 L60 16 V42 C60 61 47 74 32 80 C17 74 4 61 4 42 V16 Z"
        fill="#080808"
        stroke="#fff"
        strokeWidth="1.5"
      />
      <path
        className="bk-check"
        d="M20 42 L29 51 L46 30"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x="0" y="98" fill="#fff" fontSize="9" fontFamily={FONT} opacity="0.55">
        Show protégé
      </text>
    </g>

    {/* ── Bandeau scénario ── */}
    <g transform="translate(38,254)">
      <rect x="0" y="0" width="404" height="46" rx="10" fill="#080808" stroke="#fff" strokeWidth="1" opacity="0.9" />
      <rect x="0" y="0" width="4" height="46" rx="2" fill="#fff" opacity="0.7" />
      <text x="18" y="20" fill="#fff" fontSize="9.5" fontFamily={FONT} opacity="0.5" letterSpacing="0.4">
        PC coupé · câble retiré · plantage
      </text>
      <text x="18" y="36" fill="#fff" fontSize="11" fontFamily={FONT} fontWeight="600">
        → le show reste dans le boîtier
      </text>
    </g>
  </svg>
);

/* ────────────────────────────────────────────────────────────────────────────
   3 — Un boîtier, plusieurs postes
   ──────────────────────────────────────────────────────────────────────────── */

export const SvgMultiDevice: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 480 320"
    className={`${frame} ${className}`}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Connexion au boîtier depuis PC, téléphone ou tablette"
  >
    <defs>
      <radialGradient id="md-vignette" cx="50%" cy="52%" r="65%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.09" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="md-sweep" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>
      <filter id="md-glow" x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur stdDeviation="2.2" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <path id="md-p1" d="M120 78 C160 100 186 128 208 152" />
      <path id="md-p2" d="M368 84 C336 108 306 132 282 152" />
      <path id="md-p3" d="M96 236 C140 218 178 196 210 178" />
      <style>{`
        .md-link  { stroke-dasharray: 3 6; animation: mdLink 1.4s linear infinite; }
        .md-sweep { animation: mdSweep 4s linear infinite; transform-box: fill-box; transform-origin: 50% 50%; }
        .md-ring  { animation: mdRing 3s ease-out infinite; transform-box: fill-box; transform-origin: 50% 50%; }
        .md-ring2 { animation-delay: 1s; }
        .md-ring3 { animation-delay: 2s; }
        .md-led   { animation: mdLed 2s ease-in-out infinite; }
        .md-scr   { animation: mdScr 3s ease-in-out infinite; }
        .md-scr2  { animation-delay: 1s; }
        .md-scr3  { animation-delay: 2s; }
        @keyframes mdLink  { to { stroke-dashoffset:-18; } }
        @keyframes mdSweep { to { transform: rotate(360deg); } }
        @keyframes mdRing  { 0% { opacity:.55; transform:scale(.5);} 100% { opacity:0; transform:scale(1);} }
        @keyframes mdLed   { 0%,100% { opacity:.25;} 50% { opacity:1;} }
        @keyframes mdScr   { 0%,100% { opacity:.25;} 50% { opacity:.7;} }
        ${reducedMotion}
      `}</style>
    </defs>

    <rect width="480" height="320" fill="url(#md-vignette)" />

    {/* Cercles de portée + balayage radar */}
    <g transform="translate(240,168)">
      {[38, 66, 94, 122].map((r) => (
        <circle key={r} cx="0" cy="0" r={r} stroke="#fff" strokeWidth="0.7" opacity="0.09" />
      ))}
      <g className="md-sweep">
        <path d="M0 0 L122 0 A122 122 0 0 1 92 80 Z" fill="url(#md-sweep)" opacity="0.5" />
      </g>
      <circle className="md-ring" cx="0" cy="0" r="122" stroke="#fff" strokeWidth="1" />
      <circle className="md-ring md-ring2" cx="0" cy="0" r="122" stroke="#fff" strokeWidth="0.9" />
      <circle className="md-ring md-ring3" cx="0" cy="0" r="122" stroke="#fff" strokeWidth="0.8" />
    </g>

    {/* Liens animés */}
    {['#md-p1', '#md-p2', '#md-p3'].map((p, i) => (
      <g key={p}>
        <use href={p} stroke="#fff" strokeWidth="1" opacity="0.16" />
        <use href={p} className="md-link" stroke="#fff" strokeWidth="1.3" opacity="0.7" />
        <circle r="2.4" fill="#fff" filter="url(#md-glow)">
          <animateMotion dur="2.4s" begin={`${i * 0.5}s`} repeatCount="indefinite">
            <mpath href={p} />
          </animateMotion>
        </circle>
      </g>
    ))}

    {/* ── Hub central : le boîtier ── */}
    <g transform="translate(204,140)">
      <rect x="0" y="0" width="72" height="54" rx="9" fill="#080808" stroke="#fff" strokeWidth="1.7" />
      <path d="M36 0 V-16" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
      <circle className="md-led" cx="36" cy="-19" r="2.8" fill="#fff" filter="url(#md-glow)" />
      <rect x="9" y="10" width="36" height="24" rx="3" stroke="#fff" strokeWidth="0.9" opacity="0.5" />
      <text x="13" y="25" fill="#fff" fontSize="7.5" fontFamily={FONT} letterSpacing="1" opacity="0.8">
        OMEGA
      </text>
      <circle className="md-led" cx="57" cy="34" r="2.6" fill="#fff" />
      <circle cx="57" cy="20" r="2.6" fill="#fff" opacity="0.2" />
      <text x="0" y="72" fill="#fff" fontSize="9.5" fontFamily={FONT} fontWeight="600" opacity="0.75">
        Boîtier
      </text>
      <text x="0" y="85" fill="#fff" fontSize="8" fontFamily={FONT} opacity="0.4">
        cœur du réseau DMX
      </text>
    </g>

    {/* ── Ordinateur ── */}
    <g transform="translate(30,34)">
      <rect x="0" y="0" width="92" height="58" rx="5" fill="#080808" stroke="#fff" strokeWidth="1.5" />
      <rect className="md-scr" x="7" y="7" width="78" height="40" rx="2" fill="#fff" opacity="0.25" />
      <rect x="7" y="7" width="78" height="40" rx="2" stroke="#fff" strokeWidth="0.8" opacity="0.4" />
      <path d="M34 58 h24 l4 10 h-32 z" fill="#080808" stroke="#fff" strokeWidth="1.1" />
      <line x1="18" y1="68" x2="74" y2="68" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
      <text x="0" y="86" fill="#fff" fontSize="9.5" fontFamily={FONT} fontWeight="600" opacity="0.7">
        Ordinateur
      </text>
      <text x="0" y="98" fill="#fff" fontSize="7.5" fontFamily={FONT} opacity="0.4" letterSpacing="0.4">
        USB-C · WiFi
      </text>
    </g>

    {/* ── Tablette ── */}
    <g transform="translate(366,32)">
      <rect x="0" y="0" width="62" height="84" rx="8" fill="#080808" stroke="#fff" strokeWidth="1.5" />
      <rect className="md-scr md-scr2" x="6" y="9" width="50" height="60" rx="3" fill="#fff" opacity="0.25" />
      <rect x="6" y="9" width="50" height="60" rx="3" stroke="#fff" strokeWidth="0.8" opacity="0.4" />
      <circle cx="31" cy="76" r="3" stroke="#fff" strokeWidth="1" />
      <text x="0" y="102" fill="#fff" fontSize="9.5" fontFamily={FONT} fontWeight="600" opacity="0.7">
        Tablette
      </text>
      <text x="0" y="114" fill="#fff" fontSize="7.5" fontFamily={FONT} opacity="0.4" letterSpacing="0.4">
        face plateau
      </text>
    </g>

    {/* ── Téléphone ── */}
    <g transform="translate(52,204)">
      <rect x="0" y="0" width="42" height="72" rx="8" fill="#080808" stroke="#fff" strokeWidth="1.5" />
      <rect className="md-scr md-scr3" x="4" y="8" width="34" height="50" rx="3" fill="#fff" opacity="0.25" />
      <rect x="4" y="8" width="34" height="50" rx="3" stroke="#fff" strokeWidth="0.8" opacity="0.4" />
      <line x1="15" y1="64" x2="27" y2="64" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
      <text x="-6" y="88" fill="#fff" fontSize="9.5" fontFamily={FONT} fontWeight="600" opacity="0.7">
        Téléphone
      </text>
      <text x="-6" y="100" fill="#fff" fontSize="7.5" fontFamily={FONT} opacity="0.4" letterSpacing="0.4">
        contrôle de secours
      </text>
    </g>

    {/* ── Bandeau protocoles ── */}
    <g transform="translate(288,246)">
      <rect x="0" y="0" width="164" height="54" rx="10" fill="#080808" stroke="#fff" strokeWidth="1" />
      <rect x="0" y="0" width="4" height="54" rx="2" fill="#fff" opacity="0.7" />
      <text x="16" y="21" fill="#fff" fontSize="10" fontFamily={FONT} fontWeight="600">
        USB-C · WiFi
      </text>
      <text x="16" y="36" fill="#fff" fontSize="8.5" fontFamily={FONT} opacity="0.45">
        Un boîtier, plusieurs postes
      </text>
      <text x="16" y="47" fill="#fff" fontSize="8.5" fontFamily={FONT} opacity="0.45">
        de commande
      </text>
    </g>
  </svg>
);

/* ────────────────────────────────────────────────────────────────────────────
   4 — Qualité du signal, récepteur par récepteur
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Le retour RSSI par machine.
 *
 * Ce que le régisseur veut savoir avant la première tombée de nuit : « est-ce que
 * CETTE lyre, au fond du plateau, reçoit correctement ? ». Le boîtier remonte la
 * qualité de liaison de chaque récepteur — donc quatre lignes indépendantes, avec
 * un niveau qui vit, et pas un simple témoin « connecté / déconnecté ».
 *
 * ⚠ Les valeurs affichées sont des ORDRES DE GRANDEUR d'illustration (dBm plausibles
 * pour du 2,4 GHz en salle). Ne pas les présenter comme une mesure du produit.
 */

const LIENS = [
  { nom: 'RX 1 · Face',       barres: 4, dbm: '-48', retard: 0 },
  { nom: 'RX 2 · Contre',     barres: 4, dbm: '-55', retard: 0.35 },
  { nom: 'RX 3 · Perche cour', barres: 3, dbm: '-67', retard: 0.7 },
  { nom: 'RX 4 · Lointain',   barres: 2, dbm: '-79', retard: 1.05 },
];

export const SvgSignalQuality: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 480 320"
    className={`${frame} ${className}`}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Le boîtier remonte la qualité du signal de chaque récepteur sans fil"
  >
    <defs>
      <radialGradient id="sq-halo" cx="18%" cy="50%" r="80%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.1" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
      <filter id="sq-glow" x="-200%" y="-200%" width="500%" height="500%">
        <feGaussianBlur stdDeviation="2.2" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <style>{`
        .sq-retour { stroke-dasharray: 3 6; animation: sqRetour 1.6s linear infinite; }
        .sq-barre  { animation: sqBarre 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 100%; }
        .sq-scan   { animation: sqScan 2.4s ease-in-out infinite; }
        .sq-led    { animation: sqLed 2.4s ease-in-out infinite; }
        @keyframes sqRetour { to { stroke-dashoffset: 18; } }
        @keyframes sqBarre  { 0%,100% { transform:scaleY(.72); opacity:.7;} 50% { transform:scaleY(1); opacity:1;} }
        @keyframes sqScan   { 0%,100% { opacity:.25;} 50% { opacity:1;} }
        @keyframes sqLed    { 0%,100% { opacity:.2;} 50% { opacity:1;} }
        ${reducedMotion}
      `}</style>
    </defs>

    <rect width="480" height="320" fill="url(#sq-halo)" />

    {/* ── Le boîtier : c'est LUI qui mesure ── */}
    <g transform="translate(26,116)">
      <rect x="0" y="0" width="76" height="56" rx="8" fill="#0a0a0a" stroke="#fff" strokeWidth="1.7" />
      <rect x="8" y="9" width="38" height="24" rx="3" stroke="#fff" strokeWidth="0.9" opacity="0.55" />
      {/* mini-jauges à l'écran du boîtier */}
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          className="sq-barre"
          x={12 + i * 8}
          y={16 + i * 2}
          width="4"
          height={13 - i * 2}
          rx="1"
          fill="#fff"
          opacity="0.6"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
      <circle cx="60" cy="16" r="5" stroke="#fff" strokeWidth="1" />
      <circle cx="60" cy="34" r="5" stroke="#fff" strokeWidth="1" />
      <path d="M24 0 V-17" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
      <circle className="sq-led" cx="24" cy="-20" r="3" fill="#fff" filter="url(#sq-glow)" />
      <text x="0" y="74" fill="#fff" fontSize="9.5" fontFamily={FONT} fontWeight="600">
        Boîtier
      </text>
      <text x="0" y="87" fill="#fff" fontSize="8" fontFamily={FONT} opacity="0.45">
        mesure chaque lien
      </text>
    </g>

    {/* ── Une ligne par récepteur ── */}
    {LIENS.map((l, i) => {
      const y = 42 + i * 62;
      return (
        <g key={l.nom}>
          {/* retour de mesure : il remonte du récepteur VERS le boîtier */}
          <path
            className="sq-retour"
            d={`M292 ${y + 22} H150 C120 ${y + 22} 112 ${y + 22} 108 144`}
            stroke="#fff"
            strokeWidth="1.1"
            opacity="0.32"
            style={{ animationDelay: `${l.retard}s` }}
          />

          {/* carte du récepteur */}
          <g transform={`translate(292,${y})`}>
            <rect x="0" y="0" width="164" height="44" rx="9" fill="#0a0a0a" stroke="#fff" strokeWidth="1.1" />
            <text x="12" y="18" fill="#fff" fontSize="9" fontFamily={FONT} fontWeight="600" letterSpacing="0.3">
              {l.nom}
            </text>
            <text x="12" y="32" fill="#fff" fontSize="8" fontFamily={FONT} opacity="0.42">
              {l.dbm} dBm
            </text>

            {/* jauge 4 barres : les barres actives vivent, les inactives restent éteintes */}
            <g transform="translate(112,10)">
              {[0, 1, 2, 3].map((b) => {
                const actif = b < l.barres;
                const h = 6 + b * 5;
                return (
                  <rect
                    key={b}
                    className={actif ? 'sq-barre' : undefined}
                    x={b * 10}
                    y={24 - h}
                    width="6"
                    height={h}
                    rx="1.5"
                    fill="#fff"
                    opacity={actif ? 0.95 : 0.14}
                    style={actif ? { animationDelay: `${l.retard + b * 0.12}s` } : undefined}
                  />
                );
              })}
            </g>
          </g>

          {/* le récepteur lui-même, dans la machine */}
          <g transform={`translate(252,${y + 12})`}>
            <rect x="0" y="0" width="22" height="20" rx="4" fill="#0a0a0a" stroke="#fff" strokeWidth="1.1" />
            <path d="M11 0 V-8" stroke="#fff" strokeWidth="1" strokeLinecap="round" />
            <circle
              className="sq-led"
              cx="11"
              cy="-10.5"
              r="2"
              fill="#fff"
              style={{ animationDelay: `${l.retard}s` }}
            />
          </g>
        </g>
      );
    })}

    <text x="26" y="308" fill="#fff" fontSize="8.5" fontFamily={FONT} opacity="0.4" letterSpacing="0.4">
      Niveau de réception lu en direct, machine par machine — y compris en liaison USB
    </text>
  </svg>
);

/* ────────────────────────────────────────────────────────────────────────────
   5 — Plusieurs appareils connectés en même temps
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Deux postes vivants sur le même boîtier.
 *
 * Le sujet n'est pas « on peut se connecter depuis plusieurs appareils » (déjà dit
 * par SvgMultiDevice) mais « les deux sont connectés EN MÊME TEMPS » : l'un programme,
 * l'autre récupère le show et peut prendre la main. D'où les deux liaisons actives
 * simultanément, et le show qui transite de l'un à l'autre.
 */
export const SvgMultiSession: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 480 320"
    className={`${frame} ${className}`}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Deux appareils connectés en même temps au boîtier, avec récupération du show et reprise en secours"
  >
    <defs>
      <radialGradient id="ms-halo" cx="22%" cy="50%" r="80%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.1" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
      <filter id="ms-glow" x="-200%" y="-200%" width="500%" height="500%">
        <feGaussianBlur stdDeviation="2.2" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <path id="ms-l1" d="M116 132 C168 120 196 100 232 86" />
      <path id="ms-l2" d="M116 168 C168 180 196 206 232 224" />
      <style>{`
        .ms-lien { stroke-dasharray: 3 6; animation: msLien 1.5s linear infinite; }
        .ms-show { stroke-dasharray: 4 5; animation: msShow 2.2s linear infinite; }
        .ms-led  { animation: msLed 2.2s ease-in-out infinite; }
        .ms-led2 { animation-delay: .5s; }
        .ms-scr  { animation: msScr 2.8s ease-in-out infinite; }
        .ms-relais { animation: msRelais 4s ease-in-out infinite; }
        @keyframes msLien { to { stroke-dashoffset:-18; } }
        @keyframes msShow { to { stroke-dashoffset:-18; } }
        @keyframes msLed  { 0%,100% { opacity:.25;} 50% { opacity:1;} }
        @keyframes msScr  { 0%,100% { opacity:.22;} 50% { opacity:.55;} }
        @keyframes msRelais { 0%,55% { opacity:.25;} 70%,100% { opacity:1;} }
        ${reducedMotion}
      `}</style>
    </defs>

    <rect width="480" height="320" fill="url(#ms-halo)" />

    {/* ── Le boîtier : il tient les deux liaisons à la fois ── */}
    <g transform="translate(34,122)">
      <rect x="0" y="0" width="78" height="56" rx="8" fill="#0a0a0a" stroke="#fff" strokeWidth="1.7" />
      <rect x="9" y="10" width="38" height="24" rx="3" stroke="#fff" strokeWidth="0.9" opacity="0.55" />
      <rect x="13" y="15" width="20" height="4" rx="1.5" fill="#fff" opacity="0.5" />
      <rect x="13" y="24" width="26" height="2.5" rx="1" fill="#fff" opacity="0.22" />
      <circle cx="61" cy="16" r="5" stroke="#fff" strokeWidth="1" />
      <circle cx="61" cy="36" r="5" stroke="#fff" strokeWidth="1" />
      <path d="M24 0 V-17" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
      <circle className="ms-led" cx="24" cy="-20" r="3" fill="#fff" filter="url(#ms-glow)" />
      {/* deux témoins de session, pas un seul */}
      <circle className="ms-led" cx="10" cy="46" r="2.4" fill="#fff" />
      <circle className="ms-led ms-led2" cx="20" cy="46" r="2.4" fill="#fff" />
      <text x="0" y="74" fill="#fff" fontSize="9.5" fontFamily={FONT} fontWeight="600">
        Boîtier
      </text>
      <text x="0" y="87" fill="#fff" fontSize="8" fontFamily={FONT} opacity="0.45">
        2 sessions ouvertes
      </text>
    </g>

    {/* Deux liaisons ACTIVES en même temps */}
    {['#ms-l1', '#ms-l2'].map((p, i) => (
      <g key={p}>
        <use href={p} stroke="#fff" strokeWidth="1" opacity="0.18" />
        <use href={p} className="ms-lien" stroke="#fff" strokeWidth="1.4" opacity="0.75" style={{ animationDelay: `${i * 0.4}s` }} />
        <circle r="2.6" fill="#fff" filter="url(#ms-glow)">
          <animateMotion dur="2.2s" begin={`${i * 0.6}s`} repeatCount="indefinite">
            <mpath href={p} />
          </animateMotion>
        </circle>
      </g>
    ))}

    {/* ── Poste 1 : la régie, fixe ── */}
    <g transform="translate(232,44)">
      <rect x="0" y="0" width="96" height="60" rx="6" fill="#0a0a0a" stroke="#fff" strokeWidth="1.5" />
      <rect className="ms-scr" x="7" y="7" width="82" height="42" rx="2" fill="#fff" />
      <rect x="7" y="7" width="82" height="42" rx="2" stroke="#fff" strokeWidth="0.8" opacity="0.4" />
      <path d="M36 60 h24 l4 9 h-32 z" fill="#0a0a0a" stroke="#fff" strokeWidth="1.1" />
      <text x="106" y="24" fill="#fff" fontSize="10" fontFamily={FONT} fontWeight="600">
        Régie
      </text>
      <text x="106" y="37" fill="#fff" fontSize="8" fontFamily={FONT} opacity="0.45">
        poste fixe · programmation
      </text>
      <g transform="translate(106,46)">
        <circle className="ms-led" cx="4" cy="4" r="2.4" fill="#fff" />
        <text x="12" y="7.5" fill="#fff" fontSize="7.5" fontFamily={FONT} opacity="0.6" letterSpacing="0.6">
          CONNECTÉ
        </text>
      </g>
    </g>

    {/* ── Poste 2 : en salle, ou en secours ── */}
    <g transform="translate(232,196)">
      <rect x="0" y="0" width="72" height="52" rx="7" fill="#0a0a0a" stroke="#fff" strokeWidth="1.5" />
      <rect className="ms-scr" x="6" y="6" width="60" height="40" rx="2.5" fill="#fff" style={{ animationDelay: '0.9s' }} />
      <rect x="6" y="6" width="60" height="40" rx="2.5" stroke="#fff" strokeWidth="0.8" opacity="0.4" />
      <text x="86" y="20" fill="#fff" fontSize="10" fontFamily={FONT} fontWeight="600">
        Tablette en salle
      </text>
      <text x="86" y="33" fill="#fff" fontSize="8" fontFamily={FONT} opacity="0.45">
        vue de face · ou secours
      </text>
      <g transform="translate(86,42)">
        <circle className="ms-led ms-led2" cx="4" cy="4" r="2.4" fill="#fff" />
        <text x="12" y="7.5" fill="#fff" fontSize="7.5" fontFamily={FONT} opacity="0.6" letterSpacing="0.6">
          CONNECTÉ
        </text>
      </g>
    </g>

    {/* Le show passe de l'un à l'autre */}
    <path
      className="ms-show"
      d="M280 112 V190"
      stroke="#fff"
      strokeWidth="1.3"
      opacity="0.55"
      strokeLinecap="round"
    />
    <path d="M280 190 l-4 -7 h8 z" fill="#fff" opacity="0.55" />
    <text x="290" y="146" fill="#fff" fontSize="8.5" fontFamily={FONT} opacity="0.5">
      le show
    </text>
    <text x="290" y="157" fill="#fff" fontSize="8.5" fontFamily={FONT} opacity="0.5">
      se récupère
    </text>

    {/* Bandeau : la reprise */}
    <g className="ms-relais" transform="translate(34,268)">
      <rect x="0" y="0" width="412" height="38" rx="9" fill="#0a0a0a" stroke="#fff" strokeWidth="1" />
      <rect x="0" y="0" width="4" height="38" rx="2" fill="#fff" opacity="0.7" />
      <text x="16" y="16" fill="#fff" fontSize="8.5" fontFamily={FONT} opacity="0.5" letterSpacing="0.4">
        Le poste principal se fige, se coupe, tombe en panne
      </text>
      <text x="16" y="30" fill="#fff" fontSize="10" fontFamily={FONT} fontWeight="600">
        → le second appareil prend le relais, sans arrêter le show
      </text>
    </g>
  </svg>
);

/* ────────────────────────────────────────────────────────────────────────────
   6 — Console MIDI : pads assignés et colorés
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * La création d'une console MIDI dans le logiciel OMEGADMX.
 *
 * Volontairement une ILLUSTRATION et non une fausse capture d'écran : le logiciel n'a
 * pas de visuel disponible pour cette fonction, et fabriquer une image qui ressemble à
 * une capture reviendrait à montrer une interface qui n'existe pas telle quelle.
 * Ici on montre le GESTE : on prend une action, on la pose sur un pad, on choisit sa
 * couleur — la grille se remplit sous les yeux.
 */

/** Pads : nuances de gris = « couleurs » de pad, en monochrome assumé. */
const PADS = [
  0.9, 0.32, 0.62, 0.18,
  0.5, 0.85, 0.24, 0.7,
  0.28, 0.55, 0.95, 0.4,
  0.66, 0.2, 0.44, 0.78,
];

export const SvgMidiConsole: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 480 320"
    className={`${frame} ${className}`}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Création d'une console MIDI dans OMEGADMX : pads assignés, couleurs choisies"
  >
    <defs>
      <radialGradient id="mi-halo" cx="50%" cy="40%" r="70%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.09" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
      <filter id="mi-glow" x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur stdDeviation="2.4" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <path id="mi-drop" d="M96 96 C150 96 190 110 214 132" />
      <style>{`
        .mi-pad    { animation: miPad 4s ease-in-out infinite; }
        .mi-cible  { animation: miCible 4s ease-in-out infinite; }
        .mi-fader  { animation: miFader 3.2s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 100%; }
        .mi-lien   { stroke-dasharray: 3 5; animation: miLien 1.4s linear infinite; }
        .mi-teinte { animation: miTeinte 4s ease-in-out infinite; }
        @keyframes miPad    { 0%,100% { opacity:.55;} 50% { opacity:1;} }
        @keyframes miCible  { 0%,45% { opacity:0;} 60% { opacity:1;} 92%,100% { opacity:0;} }
        @keyframes miFader  { 0%,100% { transform:scaleY(.55);} 50% { transform:scaleY(1);} }
        @keyframes miLien   { to { stroke-dashoffset:-16; } }
        @keyframes miTeinte { 0%,100% { opacity:.35;} 50% { opacity:1;} }
        ${reducedMotion}
      `}</style>
    </defs>

    <rect width="480" height="320" fill="url(#mi-halo)" />

    {/* ── À gauche : les actions disponibles ── */}
    <g transform="translate(24,60)">
      <text x="0" y="-12" fill="#fff" fontSize="8.5" fontFamily={FONT} opacity="0.45" letterSpacing="1">
        ACTIONS
      </text>
      {['Scène 1', 'Blackout', 'Chenillard', 'Flash'].map((a, i) => (
        <g key={a} transform={`translate(0,${i * 30})`}>
          <rect
            x="0"
            y="0"
            width="96"
            height="22"
            rx="6"
            fill="#0a0a0a"
            stroke="#fff"
            strokeWidth="1"
            opacity={i === 0 ? 1 : 0.45}
          />
          <text x="10" y="15" fill="#fff" fontSize="9" fontFamily={FONT} opacity={i === 0 ? 0.9 : 0.4}>
            {a}
          </text>
        </g>
      ))}
    </g>

    {/* On tire l'action jusqu'au pad */}
    <use href="#mi-drop" className="mi-lien" stroke="#fff" strokeWidth="1.2" opacity="0.5" />
    <circle r="3" fill="#fff" filter="url(#mi-glow)">
      <animateMotion dur="4s" repeatCount="indefinite" keyPoints="0;0;1;1" keyTimes="0;0.12;0.5;1" calcMode="linear">
        <mpath href="#mi-drop" />
      </animateMotion>
    </circle>
    <text x="132" y="82" fill="#fff" fontSize="8" fontFamily={FONT} opacity="0.45">
      glisser sur un pad
    </text>

    {/* ── La grille de pads ── */}
    <g transform="translate(214,104)">
      <rect x="-14" y="-30" width="188" height="182" rx="12" fill="#0a0a0a" stroke="#fff" strokeWidth="1.2" />
      <text x="-2" y="-14" fill="#fff" fontSize="8.5" fontFamily={FONT} opacity="0.45" letterSpacing="1">
        CONSOLE — PAGE 1
      </text>
      {PADS.map((niveau, i) => {
        const col = i % 4;
        const rang = Math.floor(i / 4);
        return (
          <g key={i} transform={`translate(${col * 40},${rang * 36})`}>
            <rect
              className="mi-pad"
              x="0"
              y="0"
              width="34"
              height="30"
              rx="5"
              fill="#fff"
              opacity={niveau * 0.9}
              style={{ animationDelay: `${(i % 7) * 0.28}s` }}
            />
            <rect x="0" y="0" width="34" height="30" rx="5" stroke="#fff" strokeWidth="0.8" opacity="0.35" />
          </g>
        );
      })}
      {/* le pad qui vient d'être assigné */}
      <rect className="mi-cible" x="-3" y="-3" width="40" height="36" rx="7" stroke="#fff" strokeWidth="2" />
    </g>

    {/* ── À droite : le choix de la couleur du pad ── */}
    <g transform="translate(412,104)">
      <text x="0" y="-14" fill="#fff" fontSize="8.5" fontFamily={FONT} opacity="0.45" letterSpacing="1">
        COULEUR
      </text>
      {[0.95, 0.75, 0.55, 0.38, 0.22, 0.12].map((n, i) => (
        <g key={i} transform={`translate(0,${i * 26})`}>
          <rect
            className={i === 0 ? 'mi-teinte' : undefined}
            x="0"
            y="0"
            width="22"
            height="20"
            rx="5"
            fill="#fff"
            opacity={n}
          />
          <rect x="0" y="0" width="22" height="20" rx="5" stroke="#fff" strokeWidth="0.7" opacity="0.3" />
        </g>
      ))}
    </g>

    {/* ── En bas : les faders de la console ── */}
    <g transform="translate(24,196)">
      <text x="0" y="-10" fill="#fff" fontSize="8.5" fontFamily={FONT} opacity="0.45" letterSpacing="1">
        FADERS
      </text>
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(${i * 26},0)`}>
          <rect x="0" y="0" width="14" height="72" rx="7" stroke="#fff" strokeWidth="0.9" opacity="0.3" />
          <rect
            className="mi-fader"
            x="3"
            y="6"
            width="8"
            height="60"
            rx="4"
            fill="#fff"
            opacity="0.7"
            style={{ animationDelay: `${i * 0.4}s` }}
          />
        </g>
      ))}
    </g>

    <text x="24" y="306" fill="#fff" fontSize="8.5" fontFamily={FONT} opacity="0.4" letterSpacing="0.4">
      Une action, un pad, une couleur — la console se construit en quelques minutes
    </text>
  </svg>
);

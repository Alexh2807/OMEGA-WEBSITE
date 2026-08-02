import React from 'react';

/**
 * Le boîtier OMEGA DMX, dessiné en vectoriel.
 *
 * Complément du modèle 3D : là où celui-ci charge Three.js, celui-ci pèse quelques
 * kilo-octets, s'affiche instantanément et reste net à toute échelle. Il sert donc
 * partout où le 3D serait disproportionné — vignette de catalogue, en-tête de fiche,
 * schéma de raccordement, aperçu sur mobile.
 *
 * Vue en trois-quarts, reprise des photos réelles : coque noire au grain d'impression,
 * capot légèrement débordant, face argentée portant deux XLR femelle à loquet PUSH,
 * antenne à embase dorée et port USB-C sur la face opposée.
 *
 * `animated` allume la respiration des ondes WiFi et le balayage de lumière sur le
 * capot. Les deux s'arrêtent si le visiteur a demandé moins d'animations
 * (`prefers-reduced-motion`), traité en CSS plus bas.
 */
const BoitierDmxSvg: React.FC<{ className?: string; animated?: boolean }> = ({
  className,
  animated = true,
}) => (
  <svg
    className={className}
    viewBox="0 0 900 560"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Boîtier OMEGA DMX Interface, vue en trois-quarts"
  >
    <defs>
      {/* Coque : le dégradé suit l'inclinaison des faces, ce qui donne le volume. */}
      <linearGradient id="bd-face" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#26262e" />
        <stop offset="55%" stopColor="#16161c" />
        <stop offset="100%" stopColor="#0d0d12" />
      </linearGradient>
      <linearGradient id="bd-capot" x1="0" y1="0" x2="0.7" y2="1">
        <stop offset="0%" stopColor="#33333d" />
        <stop offset="45%" stopColor="#1d1d24" />
        <stop offset="100%" stopColor="#141419" />
      </linearGradient>
      <linearGradient id="bd-cote" x1="0" y1="0" x2="1" y2="0.3">
        <stop offset="0%" stopColor="#101015" />
        <stop offset="100%" stopColor="#08080c" />
      </linearGradient>

      {/* Plaque argentée : alternance de bandes claires pour l'aspect pailleté. */}
      <linearGradient id="bd-argent" x1="0" y1="0" x2="1" y2="0.6">
        <stop offset="0%" stopColor="#c9ced6" />
        <stop offset="28%" stopColor="#8e949e" />
        <stop offset="52%" stopColor="#b7bdc6" />
        <stop offset="76%" stopColor="#7d838d" />
        <stop offset="100%" stopColor="#a8aeb8" />
      </linearGradient>

      <linearGradient id="bd-chrome" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0%" stopColor="#eef1f5" />
        <stop offset="40%" stopColor="#9ba1aa" />
        <stop offset="100%" stopColor="#5c626b" />
      </linearGradient>
      <linearGradient id="bd-or" x1="0" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stopColor="#f2d98a" />
        <stop offset="45%" stopColor="#c9a227" />
        <stop offset="100%" stopColor="#8a6d13" />
      </linearGradient>

      {/* Liseré de la charte, sur l'arête supérieure. */}
      <linearGradient id="bd-liseré" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#00c2ff" />
        <stop offset="55%" stopColor="#2563eb" />
        <stop offset="100%" stopColor="#a21caf" />
      </linearGradient>

      <radialGradient id="bd-halo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#00c2ff" stopOpacity="0.5" />
        <stop offset="70%" stopColor="#00c2ff" stopOpacity="0.08" />
        <stop offset="100%" stopColor="#00c2ff" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="bd-ombre" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#000" stopOpacity="0.62" />
        <stop offset="100%" stopColor="#000" stopOpacity="0" />
      </radialGradient>

      {/* Grain d'impression 3D : une turbulence fine, très peu opaque. Sans elle, les
          faces paraissent lisses et l'objet devient une maquette abstraite. */}
      <filter id="bd-grain" x="0%" y="0%" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="7" />
        <feColorMatrix type="saturate" values="0" />
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.16" intercept="0" />
        </feComponentTransfer>
      </filter>

      <clipPath id="bd-clip-capot">
        <path d="M262 168 L556 118 L742 190 L448 246 Z" />
      </clipPath>
    </defs>

    <style>{`
      @keyframes bd-onde {
        0%   { opacity: 0;   transform: scale(0.55); }
        18%  { opacity: 0.9; }
        100% { opacity: 0;   transform: scale(1.5); }
      }
      @keyframes bd-balayage { 0% { transform: translateX(-320px); } 100% { transform: translateX(560px); } }
      @keyframes bd-diode { 0%, 45% { opacity: 1; } 55%, 100% { opacity: 0.25; } }
      .bd-onde   { transform-origin: 792px 232px; }
      .bd-anim .bd-onde   { animation: bd-onde 2.6s ease-out infinite; }
      .bd-anim .bd-o2     { animation-delay: 0.85s; }
      .bd-anim .bd-o3     { animation-delay: 1.7s; }
      .bd-anim .bd-balayage { animation: bd-balayage 5.5s ease-in-out infinite; }
      .bd-anim .bd-diode  { animation: bd-diode 1.8s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .bd-anim .bd-onde, .bd-anim .bd-balayage, .bd-anim .bd-diode { animation: none; }
        .bd-onde { opacity: 0.35; }
      }
    `}</style>

    <g className={animated ? 'bd-anim' : undefined}>
      {/* Ombre portée */}
      <ellipse cx="470" cy="452" rx="250" ry="42" fill="url(#bd-ombre)" />

      {/* Ondes WiFi, centrées sur l'embase d'antenne */}
      <g fill="none" stroke="#00c2ff" strokeWidth="3" strokeLinecap="round">
        <path className="bd-onde" d="M812 208 a 34 34 0 0 1 0 48" />
        <path className="bd-onde bd-o2" d="M828 192 a 58 58 0 0 1 0 80" />
        <path className="bd-onde bd-o3" d="M844 176 a 82 82 0 0 1 0 112" />
      </g>

      {/* ---- Corps ------------------------------------------------------- */}
      {/* Face avant (celle qui porte la plaque argentée) */}
      <path
        d="M262 168 L448 246 L448 372 Q448 384 436 380 L274 316 Q262 311 262 298 Z"
        fill="url(#bd-face)"
      />
      {/* Côté droit */}
      <path
        d="M448 246 L742 190 L742 316 Q742 328 730 332 L460 380 Q448 383 448 372 Z"
        fill="url(#bd-cote)"
      />
      {/* Capot supérieur */}
      <path d="M262 168 L556 118 L742 190 L448 246 Z" fill="url(#bd-capot)" />

      {/* Grain, appliqué au capot seul : ailleurs il empâterait les détails */}
      <g clipPath="url(#bd-clip-capot)">
        <rect x="250" y="110" width="500" height="150" filter="url(#bd-grain)" />
      </g>

      {/* Balayage de lumière sur le capot */}
      <g clipPath="url(#bd-clip-capot)">
        <rect
          className="bd-balayage"
          x="0" y="100" width="120" height="170"
          fill="#ffffff" opacity="0.07"
          transform="skewX(-28)"
        />
      </g>

      {/* Arête du capot : le liseré de la charte */}
      <path d="M262 168 L556 118 L742 190" fill="none" stroke="url(#bd-liseré)" strokeWidth="2.5" opacity="0.85" />
      {/* Rainure de séparation capot / coque */}
      <path d="M262 176 L448 254 L742 198" fill="none" stroke="#000" strokeWidth="3" opacity="0.5" />

      {/* ---- Plaque argentée + XLR ---------------------------------------- */}
      <path
        d="M266 178 L444 253 L444 366 Q444 376 434 372 L276 310 Q266 306 266 296 Z"
        fill="url(#bd-argent)"
      />
      <path d="M266 178 L444 253 L444 366 Q444 376 434 372 L276 310 Q266 306 266 296 Z"
        fill="none" stroke="#000" strokeWidth="1.5" opacity="0.45" />

      {[
        { cx: 318, cy: 268 },
        { cx: 392, cy: 316 },
      ].map(({ cx, cy }) => (
        <g key={cx}>
          {/* Embase noire */}
          <ellipse cx={cx} cy={cy} rx="34" ry="34" fill="#0b0b0e" />
          {/* Collerette chromée */}
          <ellipse cx={cx} cy={cy} rx="26" ry="26" fill="url(#bd-chrome)" />
          <ellipse cx={cx} cy={cy} rx="21" ry="21" fill="#111116" />
          {/* Trois contacts à 120° */}
          {[-90, 30, 150].map(a => {
            const r = (a * Math.PI) / 180;
            return (
              <ellipse
                key={a}
                cx={cx + Math.cos(r) * 10}
                cy={cy + Math.sin(r) * 10}
                rx="4.6" ry="4.6"
                fill="url(#bd-chrome)"
              />
            );
          })}
          {/* Loquet PUSH, posé SUR l'embase et non au-dessus : à 41 px il flottait. */}
          <rect x={cx - 9} y={cy - 38} width="18" height="9" rx="3.5" fill="url(#bd-chrome)" />
          <text x={cx} y={cy - 31} textAnchor="middle" fontSize="6" fill="#2a2a30" fontFamily="Arial, sans-serif">
            PUSH
          </text>
        </g>
      ))}

      {/* ---- Face opposée : USB-C, antenne, diode ------------------------- */}
      {/* Port USB-C */}
      <g>
        <rect x="676" y="243" width="34" height="12" rx="6" fill="#07070a" transform="rotate(-9 693 249)" />
        <rect x="679" y="246" width="28" height="6" rx="3" fill="#1b1b22" transform="rotate(-9 693 249)" />
      </g>

      {/* Diode d'état */}
      <circle className="bd-diode" cx="654" cy="272" r="4.5" fill="#00c2ff" />
      <circle className="bd-diode" cx="654" cy="272" r="11" fill="url(#bd-halo)" />

      {/* Embase SMA dorée ET antenne dans le MÊME repère tourné : deux pivots
          différents les décalaient visiblement l'une de l'autre. */}
      <g transform="rotate(-9 742 232)">
        <rect x="726" y="222" width="30" height="20" rx="3" fill="url(#bd-or)" />
        <rect x="726" y="222" width="30" height="20" rx="3" fill="none" stroke="#6b5310" strokeWidth="0.8" />
        {[730, 736, 742, 748].map(x => (
          <line key={x} x1={x} y1="223" x2={x} y2="241" stroke="#8a6d13" strokeWidth="0.7" opacity="0.7" />
        ))}
        {/* Le brin part du bord de l'embase, sans interstice. */}
        <rect x="755" y="224.5" width="116" height="15" rx="7.5" fill="#15151a" />
        <rect x="755" y="226.5" width="116" height="4" rx="2" fill="#2c2c34" opacity="0.8" />
        <circle cx="867" cy="232" r="7.5" fill="#1b1b21" />
      </g>
    </g>
  </svg>
);

export default BoitierDmxSvg;

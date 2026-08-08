import React from 'react';

/**
 * Illustrations système B/W animées — style diagramme produit pro.
 * Uniquement noir / blanc / gris, traits nets, animations discrètes.
 */

const frame = 'w-full h-auto max-w-md mx-auto';

/** 1024 canaux sans fil : boîtier → radio → récepteurs → machines */
export const SvgWireless1024: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 480 320"
    className={`${frame} ${className}`}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="1024 canaux DMX en sans fil via récepteurs OMEGA"
  >
    <defs>
      <style>{`
        .omx-w-pulse { animation: omxWPulse 2.4s ease-in-out infinite; }
        .omx-w-pulse2 { animation: omxWPulse 2.4s ease-in-out infinite 0.4s; }
        .omx-w-pulse3 { animation: omxWPulse 2.4s ease-in-out infinite 0.8s; }
        .omx-w-dash { stroke-dasharray: 6 8; animation: omxWDash 1.8s linear infinite; }
        .omx-w-beam { animation: omxWBeam 2s ease-in-out infinite; transform-origin: center bottom; }
        .omx-w-beam2 { animation: omxWBeam 2s ease-in-out infinite 0.35s; transform-origin: center bottom; }
        .omx-w-beam3 { animation: omxWBeam 2s ease-in-out infinite 0.7s; transform-origin: center bottom; }
        @keyframes omxWPulse {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.85; }
        }
        @keyframes omxWDash {
          to { stroke-dashoffset: -28; }
        }
        @keyframes omxWBeam {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.95; }
        }
      `}</style>
    </defs>

    {/* Fond grille technique légère */}
    <g opacity="0.12" stroke="#fff" strokeWidth="0.5">
      {Array.from({ length: 9 }).map((_, i) => (
        <line key={`h${i}`} x1="20" y1={40 + i * 28} x2="460" y2={40 + i * 28} />
      ))}
      {Array.from({ length: 12 }).map((_, i) => (
        <line key={`v${i}`} x1={40 + i * 36} y1="30" x2={40 + i * 36} y2="290" />
      ))}
    </g>

    {/* ── Boîtier OMEGA (émetteur) ── */}
    <g transform="translate(36, 110)">
      <rect x="0" y="20" width="72" height="52" rx="6" stroke="#fff" strokeWidth="1.6" fill="#0a0a0a" />
      <rect x="8" y="28" width="40" height="28" rx="2" stroke="#fff" strokeWidth="1" opacity="0.7" />
      <text x="12" y="46" fill="#fff" fontSize="7" fontFamily="system-ui,sans-serif" letterSpacing="0.5">
        OMEGA
      </text>
      {/* XLR doubles */}
      <circle cx="62" cy="36" r="5" stroke="#fff" strokeWidth="1.2" />
      <circle cx="62" cy="54" r="5" stroke="#fff" strokeWidth="1.2" />
      {/* Antenne */}
      <line x1="36" y1="20" x2="36" y2="4" stroke="#fff" strokeWidth="1.5" />
      <circle cx="36" cy="2" r="2.5" fill="#fff" />
      <text x="8" y="90" fill="#fff" fontSize="9" fontFamily="system-ui,sans-serif" opacity="0.7">
        Interface
      </text>
      <text x="4" y="104" fill="#fff" fontSize="8" fontFamily="system-ui,sans-serif" opacity="0.45">
        2 univers · 1024 ch
      </text>
    </g>

    {/* Ondes radio animées */}
    <g transform="translate(130, 140)" stroke="#fff" fill="none">
      <path className="omx-w-pulse" d="M0 20 Q12 8 24 20" strokeWidth="1.4" />
      <path className="omx-w-pulse2" d="M0 20 Q18 0 36 20" strokeWidth="1.2" opacity="0.6" />
      <path className="omx-w-pulse3" d="M0 20 Q24 -8 48 20" strokeWidth="1" opacity="0.4" />
    </g>

    {/* Flux de données canaux */}
    <path
      className="omx-w-dash"
      d="M118 146 H200"
      stroke="#fff"
      strokeWidth="1.2"
      opacity="0.7"
    />
    <text x="145" y="136" fill="#fff" fontSize="8" fontFamily="system-ui,sans-serif" opacity="0.55">
      U1 + U2
    </text>

    {/* ── Récepteurs OMEGA ── */}
    {[0, 1, 2].map((i) => (
      <g key={i} transform={`translate(${210 + i * 78}, 118)`}>
        <rect x="0" y="24" width="40" height="36" rx="4" stroke="#fff" strokeWidth="1.3" fill="#0a0a0a" />
        <line x1="20" y1="24" x2="20" y2="10" stroke="#fff" strokeWidth="1.3" />
        <circle cx="20" cy="8" r="2" fill="#fff" />
        {/* LED pulse */}
        <circle
          className={i === 0 ? 'omx-w-pulse' : i === 1 ? 'omx-w-pulse2' : 'omx-w-pulse3'}
          cx="20"
          cy="42"
          r="3"
          fill="#fff"
        />
        <text x="2" y="76" fill="#fff" fontSize="7" fontFamily="system-ui,sans-serif" opacity="0.5">
          RX {i + 1}
        </text>
        {/* Câble vers machine */}
        <line x1="20" y1="60" x2="20" y2="88" stroke="#fff" strokeWidth="1" opacity="0.5" />
      </g>
    ))}

    {/* ── Machines (lyres / spots) ── */}
    {[0, 1, 2].map((i) => (
      <g key={`m${i}`} transform={`translate(${206 + i * 78}, 210)`}>
        {/* Base */}
        <ellipse cx="24" cy="48" rx="16" ry="5" stroke="#fff" strokeWidth="1" opacity="0.4" />
        <rect x="16" y="28" width="16" height="20" rx="2" stroke="#fff" strokeWidth="1.2" />
        {/* Tête lyre */}
        <rect x="10" y="12" width="28" height="18" rx="4" stroke="#fff" strokeWidth="1.3" fill="#0a0a0a" />
        {/* Faisceau animé */}
        <path
          className={i === 0 ? 'omx-w-beam' : i === 1 ? 'omx-w-beam2' : 'omx-w-beam3'}
          d="M18 12 L12 -8 L36 -8 L30 12"
          fill="#fff"
          opacity="0.2"
        />
      </g>
    ))}

    {/* Badge 1024 */}
    <g transform="translate(360, 36)">
      <rect x="0" y="0" width="88" height="36" rx="6" stroke="#fff" strokeWidth="1.2" fill="#0a0a0a" />
      <text x="10" y="16" fill="#fff" fontSize="14" fontFamily="system-ui,sans-serif" fontWeight="600">
        1024
      </text>
      <text x="10" y="28" fill="#fff" fontSize="8" fontFamily="system-ui,sans-serif" opacity="0.55">
        canaux sans fil
      </text>
    </g>

    <text x="36" y="300" fill="#fff" fontSize="9" fontFamily="system-ui,sans-serif" opacity="0.35">
      Câblé ou radio — les mêmes 2 univers
    </text>
  </svg>
);

/** Sauvegarde show dans le boîtier */
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
      <style>{`
        .omx-b-flow { stroke-dasharray: 5 7; animation: omxBFlow 1.6s linear infinite; }
        .omx-b-write { animation: omxBWrite 2.2s ease-in-out infinite; }
        .omx-b-shield { animation: omxBShield 3s ease-in-out infinite; }
        .omx-b-bit { animation: omxBBit 1.4s ease-in-out infinite; }
        .omx-b-bit2 { animation: omxBBit 1.4s ease-in-out infinite 0.35s; }
        .omx-b-bit3 { animation: omxBBit 1.4s ease-in-out infinite 0.7s; }
        @keyframes omxBFlow { to { stroke-dashoffset: -24; } }
        @keyframes omxBWrite {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @keyframes omxBShield {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes omxBBit {
          0%, 100% { opacity: 0.2; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-3px); }
        }
      `}</style>
    </defs>

    <g opacity="0.1" stroke="#fff" strokeWidth="0.5">
      {Array.from({ length: 8 }).map((_, i) => (
        <line key={`h${i}`} x1="24" y1={48 + i * 30} x2="456" y2={48 + i * 30} />
      ))}
    </g>

    {/* PC / régie */}
    <g transform="translate(40, 90)">
      <rect x="0" y="20" width="100" height="68" rx="4" stroke="#fff" strokeWidth="1.5" fill="#0a0a0a" />
      <rect x="8" y="28" width="84" height="48" rx="2" stroke="#fff" strokeWidth="1" opacity="0.5" />
      {/* Mini UI */}
      <rect x="14" y="34" width="28" height="8" rx="1" fill="#fff" opacity="0.35" />
      <rect x="14" y="48" width="50" height="3" fill="#fff" opacity="0.2" />
      <rect x="14" y="56" width="40" height="3" fill="#fff" opacity="0.15" />
      <rect x="14" y="64" width="45" height="3" fill="#fff" opacity="0.12" />
      {/* Stand */}
      <path d="M40 88 L50 108 H70 L80 88" stroke="#fff" strokeWidth="1.2" />
      <line x1="30" y1="108" x2="90" y2="108" stroke="#fff" strokeWidth="1.5" />
      <text x="18" y="128" fill="#fff" fontSize="9" fontFamily="system-ui,sans-serif" opacity="0.55">
        OMEGADMX
      </text>
      <text x="22" y="142" fill="#fff" fontSize="8" fontFamily="system-ui,sans-serif" opacity="0.35">
        PC régie
      </text>
    </g>

    {/* Flux de sauvegarde animé */}
    <g stroke="#fff">
      <path className="omx-b-flow" d="M150 130 C190 130, 200 130, 240 155" strokeWidth="1.4" opacity="0.75" />
      <circle className="omx-b-bit" cx="170" cy="128" r="2.5" fill="#fff" />
      <circle className="omx-b-bit2" cx="195" cy="132" r="2" fill="#fff" />
      <circle className="omx-b-bit3" cx="220" cy="145" r="2.5" fill="#fff" />
    </g>
    <text x="168" y="112" fill="#fff" fontSize="8" fontFamily="system-ui,sans-serif" opacity="0.5">
      sync show
    </text>

    {/* Boîtier avec mémoire */}
    <g transform="translate(250, 120)">
      <rect x="0" y="0" width="90" height="70" rx="8" stroke="#fff" strokeWidth="1.6" fill="#0a0a0a" />
      <rect x="10" y="12" width="50" height="36" rx="2" stroke="#fff" strokeWidth="1" opacity="0.65" />
      <text x="16" y="34" fill="#fff" fontSize="8" fontFamily="system-ui,sans-serif">
        OMEGA
      </text>
      {/* Antenne */}
      <line x1="45" y1="0" x2="45" y2="-16" stroke="#fff" strokeWidth="1.4" />
      <circle cx="45" cy="-18" r="2.5" fill="#fff" />
      {/* Chip mémoire */}
      <g className="omx-b-write">
        <rect x="68" y="18" width="14" height="18" rx="1.5" stroke="#fff" strokeWidth="1" fill="#111" />
        <line x1="71" y1="22" x2="79" y2="22" stroke="#fff" strokeWidth="0.8" />
        <line x1="71" y1="26" x2="79" y2="26" stroke="#fff" strokeWidth="0.8" />
        <line x1="71" y1="30" x2="79" y2="30" stroke="#fff" strokeWidth="0.8" />
      </g>
      <text x="8" y="92" fill="#fff" fontSize="9" fontFamily="system-ui,sans-serif" opacity="0.55">
        Mémoire boîtier
      </text>
    </g>

    {/* Bouclier protection */}
    <g className="omx-b-shield" transform="translate(370, 100)">
      <path
        d="M30 8 L52 18 V40 C52 56 40 68 30 74 C20 68 8 56 8 40 V18 Z"
        stroke="#fff"
        strokeWidth="1.5"
        fill="#0a0a0a"
      />
      <path d="M22 40 L28 46 L40 30" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <text x="4" y="96" fill="#fff" fontSize="8" fontFamily="system-ui,sans-serif" opacity="0.5">
        Show protégé
      </text>
    </g>

    {/* Scénario crash PC */}
    <g transform="translate(40, 230)">
      <rect x="0" y="0" width="400" height="48" rx="8" stroke="#fff" strokeWidth="1" opacity="0.35" fill="#0a0a0a" />
      <text x="16" y="20" fill="#fff" fontSize="10" fontFamily="system-ui,sans-serif" opacity="0.7">
        PC coupé · câble retiré · crash
      </text>
      <text x="16" y="36" fill="#fff" fontSize="10" fontFamily="system-ui,sans-serif" fontWeight="600">
        → le show reste dans le boîtier
      </text>
    </g>
  </svg>
);

/** Connexion multi-appareils : PC, téléphone, tablette */
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
      <style>{`
        .omx-d-wave { animation: omxDWave 2.5s ease-in-out infinite; }
        .omx-d-wave2 { animation: omxDWave 2.5s ease-in-out infinite 0.5s; }
        .omx-d-wave3 { animation: omxDWave 2.5s ease-in-out infinite 1s; }
        .omx-d-link { stroke-dasharray: 4 6; animation: omxDLink 2s linear infinite; }
        .omx-d-hub { animation: omxDHub 2.8s ease-in-out infinite; }
        @keyframes omxDWave {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.9; }
        }
        @keyframes omxDLink { to { stroke-dashoffset: -20; } }
        @keyframes omxDHub {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </defs>

    <g opacity="0.08" stroke="#fff" strokeWidth="0.5">
      {Array.from({ length: 10 }).map((_, i) => (
        <circle key={i} cx="240" cy="175" r={30 + i * 18} />
      ))}
    </g>

    {/* Hub central = boîtier */}
    <g transform="translate(200, 140)">
      <circle className="omx-d-hub" cx="40" cy="40" r="48" stroke="#fff" strokeWidth="1" opacity="0.2" />
      <rect x="10" y="22" width="60" height="44" rx="6" stroke="#fff" strokeWidth="1.6" fill="#0a0a0a" />
      <rect x="16" y="28" width="34" height="24" rx="2" stroke="#fff" strokeWidth="1" opacity="0.6" />
      <text x="18" y="44" fill="#fff" fontSize="7" fontFamily="system-ui,sans-serif">
        OMEGA
      </text>
      <line x1="40" y1="22" x2="40" y2="8" stroke="#fff" strokeWidth="1.4" />
      <circle cx="40" cy="6" r="2.5" fill="#fff" />
      {/* LED */}
      <circle className="omx-d-hub" cx="58" cy="48" r="2.5" fill="#fff" />
      <text x="8" y="84" fill="#fff" fontSize="9" fontFamily="system-ui,sans-serif" opacity="0.55">
        Interface
      </text>
    </g>

    {/* PC */}
    <g transform="translate(36, 48)">
      <rect x="8" y="8" width="78" height="52" rx="3" stroke="#fff" strokeWidth="1.4" fill="#0a0a0a" />
      <rect x="14" y="14" width="66" height="36" rx="1.5" stroke="#fff" strokeWidth="0.9" opacity="0.45" />
      <rect x="28" y="56" width="38" height="6" stroke="#fff" strokeWidth="1" />
      <line x1="18" y1="62" x2="86" y2="62" stroke="#fff" strokeWidth="1.3" />
      <text x="28" y="80" fill="#fff" fontSize="9" fontFamily="system-ui,sans-serif" opacity="0.65">
        Ordinateur
      </text>
      <text x="34" y="94" fill="#fff" fontSize="7" fontFamily="system-ui,sans-serif" opacity="0.4">
        USB · WiFi · BT
      </text>
      {/* Lien vers hub */}
      <path className="omx-d-link" d="M86 40 C130 50, 160 90, 210 155" stroke="#fff" strokeWidth="1.2" opacity="0.65" />
    </g>

    {/* Tablette */}
    <g transform="translate(360, 40)">
      <rect x="0" y="0" width="56" height="78" rx="6" stroke="#fff" strokeWidth="1.5" fill="#0a0a0a" />
      <rect x="6" y="10" width="44" height="52" rx="2" stroke="#fff" strokeWidth="0.9" opacity="0.45" />
      <circle cx="28" cy="70" r="3" stroke="#fff" strokeWidth="1" />
      <text x="6" y="98" fill="#fff" fontSize="9" fontFamily="system-ui,sans-serif" opacity="0.65">
        Tablette
      </text>
      <text x="10" y="112" fill="#fff" fontSize="7" fontFamily="system-ui,sans-serif" opacity="0.4">
        WiFi · BT
      </text>
      <path className="omx-d-link" d="M8 50 C-10 80, 40 120, 100 165" stroke="#fff" strokeWidth="1.2" opacity="0.65" />
    </g>

    {/* Téléphone */}
    <g transform="translate(48, 200)">
      <rect x="0" y="0" width="34" height="60" rx="5" stroke="#fff" strokeWidth="1.4" fill="#0a0a0a" />
      <rect x="4" y="8" width="26" height="40" rx="1.5" stroke="#fff" strokeWidth="0.8" opacity="0.45" />
      <line x1="12" y1="54" x2="22" y2="54" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
      <text x="0" y="76" fill="#fff" fontSize="9" fontFamily="system-ui,sans-serif" opacity="0.65">
        Téléphone
      </text>
      <text x="2" y="90" fill="#fff" fontSize="7" fontFamily="system-ui,sans-serif" opacity="0.4">
        WiFi · BT
      </text>
      <path className="omx-d-link" d="M34 30 C90 40, 140 80, 200 155" stroke="#fff" strokeWidth="1.2" opacity="0.65" />
    </g>

    {/* Ondes autour du hub */}
    <g transform="translate(240, 180)" stroke="#fff" fill="none">
      <circle className="omx-d-wave" cx="0" cy="0" r="22" strokeWidth="1" />
      <circle className="omx-d-wave2" cx="0" cy="0" r="32" strokeWidth="0.9" />
      <circle className="omx-d-wave3" cx="0" cy="0" r="42" strokeWidth="0.7" />
    </g>

    {/* Labels protocoles */}
    <g transform="translate(300, 230)">
      <rect x="0" y="0" width="140" height="52" rx="8" stroke="#fff" strokeWidth="1" opacity="0.4" fill="#0a0a0a" />
      <text x="12" y="18" fill="#fff" fontSize="9" fontFamily="system-ui,sans-serif" opacity="0.8">
        USB-C · WiFi · Bluetooth
      </text>
      <text x="12" y="34" fill="#fff" fontSize="8" fontFamily="system-ui,sans-serif" opacity="0.45">
        Un boîtier, plusieurs postes
      </text>
      <text x="12" y="46" fill="#fff" fontSize="8" fontFamily="system-ui,sans-serif" opacity="0.45">
        de commande
      </text>
    </g>
  </svg>
);

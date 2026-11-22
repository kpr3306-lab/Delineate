import type { ReactNode } from 'react';

/* Vector drawings of the four keypad phones, traced from reference photos.
   Bodies only — the keys are real buttons laid over them. Each is drawn in its own viewBox (width × 1000), matching the % boxes in CameraBodies' PHONES table. */

const Shared = () => (
  <linearGradient id="keyGloss" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
    <stop offset="1" stopColor="#fff" stopOpacity="0" />
  </linearGradient>
);
/* ── Oval keypad (2003) ─────────────────────────────────────────────────────────────────────── */
function Oval() {
  return (
    <svg viewBox="0 0 520 1000" className="rp-svg" aria-hidden="true">
      <defs>
        <Shared />
        <linearGradient id="ovFace" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d2cbbe" />
          <stop offset="0.45" stopColor="#aba394" />
          <stop offset="1" stopColor="#7d766a" />
        </linearGradient>
        <linearGradient id="ovDark" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1f2124" />
          <stop offset="0.5" stopColor="#3c3f44" />
          <stop offset="1" stopColor="#1f2124" />
        </linearGradient>
        <linearGradient id="ovKey" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e4dfd5" />
          <stop offset="1" stopColor="#b9b2a5" />
        </linearGradient>
        <radialGradient id="ovHump" cx="0.5" cy="0.35" r="0.6">
          <stop offset="0" stopColor="#ece8df" />
          <stop offset="1" stopColor="#b4ada1" />
        </radialGradient>
        <radialGradient id="ovStick" cx="0.4" cy="0.35" r="0.65">
          <stop offset="0" stopColor="#5a5d64" />
          <stop offset="1" stopColor="#0c0d0f" />
        </radialGradient>
      </defs>
      {/* graphite shell, silver face over it */}
      <path d="M260 6 C410 6 470 30 492 140 L514 430 C522 520 520 610 506 710 C490 860 470 994 260 996 C50 994 30 860 14 710 C0 610 -2 520 6 430 L28 140 C50 30 110 6 260 6 Z" fill="url(#ovDark)" />
      <path d="M260 14 C402 14 464 36 484 142 L504 420 C508 470 500 520 470 560 C442 598 448 640 452 700 C458 800 440 925 400 958 C350 982 170 982 120 958 C80 925 62 800 68 700 C72 640 78 598 50 560 C20 520 12 470 16 420 L36 142 C56 36 118 14 260 14 Z" fill="url(#ovFace)" stroke="rgba(0,0,0,.25)" strokeWidth={1.5} />
      <path d="M260 22 C390 22 452 40 470 140 L486 300" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth={4} strokeLinecap="round" />
      {/* hooded earpiece and wordmark */}
      <path d="M195 62 C210 44 310 44 325 62" fill="none" stroke="#f7f4ee" strokeWidth={6} strokeLinecap="round" />
      <rect x="200" y="62" width="120" height="22" rx="11" fill="#77726a" />
      {Array.from({ length: 9 }, (_, i) => <circle key={i} cx={216 + i * 11} cy={73} r={2.4} fill="#1d1d1d" />)}
      <text x="260" y="136" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight={800} fontSize="30" letterSpacing="3" fill="#3b3a37">DELINEATE</text>
      {/* screen bezel */}
      <rect x="88" y="176" width="344" height="434" rx="26" fill="#121416" stroke="#8f897f" strokeWidth={3} />
      {/* call / end down the wings, menu and C below them, a small key under menu */}
      <g>
        <rect x="30" y="732" width="46" height="70" rx="18" fill="url(#ovDark)" stroke="#0b0b0c" strokeWidth={2} />
        <text x="53" y="770" textAnchor="middle" fill="#cfd2d6" fontSize="18" fontFamily="Arial">✎</text>
      </g>
      {/* softkeys like wings, joystick on a raised hump */}
      <path d="M196 628 H324 Q338 628 334 641 L314 704 Q310 716 297 716 H223 Q210 716 206 704 L186 641 Q182 628 196 628 Z" fill="url(#ovHump)" stroke="rgba(0,0,0,.2)" strokeWidth={1.5} />
      {/* keypad: pearl keys on taupe, fanned into a smile */}
    </svg>
  );
}

/* ── Classic candybar (2006) ────────────────────────────────────────────────────────────────── */
function Candybar() {
  return (
    <svg viewBox="0 0 415 1000" className="rp-svg" aria-hidden="true">
      <defs>
        <Shared />
        <linearGradient id="n73Body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4a1527" />
          <stop offset="0.12" stopColor="#7a2f46" />
          <stop offset="0.5" stopColor="#68263b" />
          <stop offset="0.88" stopColor="#7a2f46" />
          <stop offset="1" stopColor="#4a1527" />
        </linearGradient>
        <linearGradient id="n73Silver" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dfe3e7" />
          <stop offset="0.5" stopColor="#b3b9c0" />
          <stop offset="1" stopColor="#8d949c" />
        </linearGradient>
        <linearGradient id="n73Key" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d4d8dc" />
          <stop offset="0.55" stopColor="#b4bac1" />
          <stop offset="1" stopColor="#8f969e" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="407" height="992" rx="44" fill="url(#n73Body)" />
      <rect x="10" y="10" width="395" height="980" rx="40" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth={2} />
      {/* top: wordmark + model, slot earpiece, light sensor, front camera */}
      <text x="40" y="60" fontFamily="Arial, Helvetica, sans-serif" fontWeight={700} fontSize="17" letterSpacing="1.5" fill="#e6dde2">DELINEATE</text>
      <text x="86" y="84" fontFamily="Arial, Helvetica, sans-serif" fontSize="16" fill="#e6dde2">DL73</text>
      <rect x="166" y="46" width="72" height="16" rx="8" fill="#c8ccd1" />
      {Array.from({ length: 8 }, (_, i) => <rect key={i} x={174 + i * 7.5} y={51} width={4} height={6} rx={1} fill="#4b4f55" />)}
      <circle cx="262" cy="54" r="6" fill="#2b2b2b" stroke="#8a8f96" strokeWidth={2} />
      <circle cx="320" cy="56" r="24" fill="#cfd3d8" stroke="#6b7078" strokeWidth={2} />
      <circle cx="320" cy="56" r="14" fill="#0d1014" />
      <circle cx="315" cy="51" r="4" fill="rgba(140,170,220,.7)" />
      {/* screen bezel */}
      <rect x="28" y="98" width="359" height="486" rx="16" fill="#0b0b0c" stroke="#3a1020" strokeWidth={3} />
      {/* nav block */}
      <rect x="38" y="652" width="339" height="118" rx="34" fill="url(#n73Silver)" stroke="#3d4148" strokeWidth={4} />
      {/* keypad plate with side keys, keys split by dark grooves */}
      <rect x="8" y="768" width="399" height="218" rx="30" fill="#3d4148" />
      <rect x="12" y="874" width="44" height="106" rx="10" fill="url(#n73Key)" />
      <text x="34" y="930" textAnchor="middle" fontSize="22" fill="#2a2d33" fontFamily="Arial">✎</text>
    </svg>
  );
}

/* ── Cyber phone (2005) ─────────────────────────────────────────────────────────────────────── */
function Cyberphone() {
  return (
    <svg viewBox="0 0 438 1000" className="rp-svg" aria-hidden="true">
      <defs>
        <Shared />
        <linearGradient id="w8Body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2e2e31" />
          <stop offset="0.5" stopColor="#121213" />
          <stop offset="1" stopColor="#1d1d1f" />
        </linearGradient>
        <radialGradient id="w8Chrome" cx="0.45" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#c9cbcf" />
          <stop offset="1" stopColor="#7d8086" />
        </radialGradient>
        <radialGradient id="w8Orange" cx="0.4" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#ffb06a" />
          <stop offset="0.55" stopColor="#e8701c" />
          <stop offset="1" stopColor="#a1450b" />
        </radialGradient>
        <linearGradient id="w8Key" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3b3f" />
          <stop offset="1" stopColor="#111113" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="430" height="992" rx="52" fill="url(#w8Body)" />
      <rect x="9" y="9" width="420" height="982" rx="48" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={2} />
      <rect x="172" y="16" width="94" height="12" rx="6" fill="#d2651c" />
      <text x="219" y="74" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="28" letterSpacing="1" fill="#b9bbbf">DELINEATE</text>
      {/* screen bezel */}
      <rect x="40" y="88" width="358" height="440" rx="20" fill="#050505" stroke="#2c2c2e" strokeWidth={3} />
      <text x="219" y="560" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight={700} fontSize="22" fill="#e8701c">♪ music</text>
      <text x="219" y="988" textAnchor="middle" fontFamily="Arial" fontWeight={700} fontSize="20" fill="#e8701c">♪</text>
    </svg>
  );
}

/* ── Razor flip (2004) ──────────────────────────────────────────────────────────────────────── */
function Flip() {
  return (
    <svg viewBox="0 0 309 1000" className="rp-svg" aria-hidden="true">
      <defs>
        <Shared />
        <linearGradient id="rzMetal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8d939b" />
          <stop offset="0.15" stopColor="#dfe3e8" />
          <stop offset="0.5" stopColor="#c3c8cf" />
          <stop offset="0.85" stopColor="#dfe3e8" />
          <stop offset="1" stopColor="#8d939b" />
        </linearGradient>
        <linearGradient id="rzHinge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4b5058" />
          <stop offset="0.25" stopColor="#a4abb4" />
          <stop offset="0.45" stopColor="#eceef1" />
          <stop offset="0.7" stopColor="#9ba2ab" />
          <stop offset="1" stopColor="#3e434a" />
        </linearGradient>
        <linearGradient id="rzSheet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a424c" />
          <stop offset="1" stopColor="#1e242b" />
        </linearGradient>
      </defs>
      {/* top half */}
      <rect x="10" y="8" width="289" height="440" rx="38" fill="url(#rzMetal)" stroke="rgba(0,0,0,.3)" strokeWidth={1.5} />
      {[24, 285].map((x) => <circle key={x} cx={x} cy="40" r="6" fill="#6e747c" stroke="#e5e8ec" strokeWidth={2} />)}
      {[62, 94, 190, 222].map((x) => <rect key={x} x={x} y="36" width="26" height="7" rx="3.5" fill="#1e2227" />)}
      <circle cx="154" cy="40" r="16" fill="#c3c9d0" stroke="#4b5058" strokeWidth={3} />
      <text x="154" y="47" textAnchor="middle" fontSize="20" fontWeight={700} fill="#4b5058" fontFamily="Georgia, serif">D</text>
      <text x="154" y="80" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight={800} fontSize="17" letterSpacing="2.5" fill="#2e333a">DELINEATE</text>
      <rect x="30" y="94" width="249" height="338" rx="18" fill="#3a3e45" stroke="#d9dde2" strokeWidth={4} />
      <rect x="128" y="438" width="54" height="10" rx="4" fill="#9aa1aa" />
      {/* hinge barrel, wider than the body */}
      <rect x="2" y="450" width="305" height="56" rx="16" fill="url(#rzHinge)" stroke="#3e434a" strokeWidth={1.5} />
      <path d="M60 452 v52 M249 452 v52" stroke="rgba(0,0,0,.35)" strokeWidth={2} />
      {/* lower half and the etched keypad sheet */}
      <path d="M10 508 H299 V940 C299 975 270 995 230 995 H79 C39 995 10 975 10 940 Z" fill="url(#rzMetal)" stroke="rgba(0,0,0,.3)" strokeWidth={1.5} />
      <rect x="28" y="532" width="253" height="388" rx="20" fill="url(#rzSheet)" stroke="#e3e6ea" strokeWidth={5} />
      {/* chin with the speaker grille */}
      <path d="M40 935 C80 925 229 925 269 935" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth={2} />
      {Array.from({ length: 8 }, (_, i) => <rect key={i} x={124 + i * 8} y={950} width={4} height={18} rx={2} fill="#3e434a" />)}
    </svg>
  );
}

export const PHONE_ART: Record<string, () => ReactNode> = { oval: Oval, candybar: Candybar, cyberphone: Cyberphone, flip: Flip };

import type { JItem, PaperKind } from '../types';
import { uid } from './utils';

/** A decoration is an SVG (or emoji) drawn from a colour. Same markup is used on screen and in the PDF. */
export type Deco = { id: string; name: string; cat: string; w: number; h: number; color: string; svg: (c: string) => string };

const svg = (vb: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="none">${body}</svg>`;

const star = (n: number, outer: number, inner: number, cx = 50, cy = 50) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / n - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

const washi = (pattern: (c: string) => string) => (c: string) =>
  svg(
    '0 0 200 44',
    `<defs><clipPath id="t"><path d="M4 2 L196 0 L194 8 L199 15 L195 24 L200 33 L196 44 L3 42 L6 34 L0 26 L5 17 L1 8 Z"/></clipPath></defs>
     <g clip-path="url(#t)" opacity="0.86"><rect width="200" height="44" fill="${c}"/>${pattern(c)}</g>`,
  );

const emoji = (ch: string, name: string): Deco => ({
  id: `emoji-${name}`,
  name,
  cat: 'Stickers',
  w: 70,
  h: 70,
  color: '#000000',
  svg: () => svg('0 0 100 100', `<text x="50" y="80" font-size="80" text-anchor="middle">${ch}</text>`),
});

export const DECOS: Deco[] = [
  // Tape
  { id: 'tape-plain', name: 'Masking tape', cat: 'Tape', w: 160, h: 36, color: '#e8d9b0', svg: washi(() => '') },
  { id: 'tape-dots', name: 'Polka washi', cat: 'Tape', w: 160, h: 36, color: '#f3b6c4',
    svg: washi(() => Array.from({ length: 20 }, (_, i) => `<circle cx="${(i % 10) * 20 + 10 + (i > 9 ? 10 : 0)}" cy="${i > 9 ? 32 : 12}" r="4" fill="#fff" opacity=".8"/>`).join('')) },
  { id: 'tape-stripe', name: 'Stripe washi', cat: 'Tape', w: 160, h: 36, color: '#9fc8e8',
    svg: washi(() => Array.from({ length: 14 }, (_, i) => `<rect x="${i * 16 - 10}" y="-5" width="7" height="60" fill="#fff" opacity=".6" transform="skewX(-30)"/>`).join('')) },
  { id: 'tape-grid', name: 'Grid washi', cat: 'Tape', w: 160, h: 36, color: '#c9e4b8',
    svg: washi(() => Array.from({ length: 20 }, (_, i) => `<line x1="${i * 10}" y1="0" x2="${i * 10}" y2="44" stroke="#fff" stroke-width="1.5"/>`).join('') + '<line x1="0" y1="15" x2="200" y2="15" stroke="#fff" stroke-width="1.5"/><line x1="0" y1="30" x2="200" y2="30" stroke="#fff" stroke-width="1.5"/>') },
  { id: 'tape-hearts', name: 'Heart washi', cat: 'Tape', w: 160, h: 36, color: '#fbd3d3',
    svg: washi(() => Array.from({ length: 8 }, (_, i) => `<text x="${i * 26 + 6}" y="30" font-size="20" fill="#e2566e">♥</text>`).join('')) },
  { id: 'tape-gold', name: 'Gold foil tape', cat: 'Tape', w: 160, h: 36, color: '#d9b45a',
    svg: washi(() => '<rect width="200" height="44" fill="url(#g)"/><defs><linearGradient id="g"><stop offset="0" stop-color="#f6e3a1"/><stop offset=".5" stop-color="#b98a2c"/><stop offset="1" stop-color="#f6e3a1"/></linearGradient></defs>') },
  { id: 'tape-check', name: 'Gingham tape', cat: 'Tape', w: 160, h: 36, color: '#f2a65a',
    svg: washi(() => Array.from({ length: 10 }, (_, i) => `<rect x="${i * 20}" y="0" width="10" height="44" fill="#fff" opacity=".35"/>`).join('') + '<rect y="11" width="200" height="11" fill="#fff" opacity=".35"/><rect y="33" width="200" height="11" fill="#fff" opacity=".35"/>') },

  // Shapes
  { id: 'star', name: 'Star', cat: 'Shapes', w: 70, h: 70, color: '#f2c14e', svg: (c) => svg('0 0 100 100', `<polygon points="${star(5, 46, 20)}" fill="${c}" stroke="#00000022" stroke-width="2"/>`) },
  { id: 'sparkle', name: 'Sparkle', cat: 'Shapes', w: 60, h: 60, color: '#f5d76e', svg: (c) => svg('0 0 100 100', `<path d="M50 2 C54 38 62 46 98 50 C62 54 54 62 50 98 C46 62 38 54 2 50 C38 46 46 38 50 2Z" fill="${c}"/>`) },
  { id: 'heart', name: 'Heart', cat: 'Shapes', w: 70, h: 64, color: '#e2566e', svg: (c) => svg('0 0 100 90', `<path d="M50 88 C10 60 0 38 6 22 C14 2 40 2 50 22 C60 2 86 2 94 22 C100 38 90 60 50 88Z" fill="${c}"/>`) },
  { id: 'circle', name: 'Dot', cat: 'Shapes', w: 50, h: 50, color: '#5b8bd9', svg: (c) => svg('0 0 100 100', `<circle cx="50" cy="50" r="46" fill="${c}"/>`) },
  { id: 'burst', name: 'Burst', cat: 'Shapes', w: 90, h: 90, color: '#ff7a45', svg: (c) => svg('0 0 100 100', `<polygon points="${star(14, 48, 36)}" fill="${c}"/>`) },
  { id: 'flower-shape', name: 'Daisy', cat: 'Shapes', w: 70, h: 70, color: '#ffffff',
    svg: (c) => svg('0 0 100 100', Array.from({ length: 8 }, (_, i) => `<ellipse cx="50" cy="24" rx="11" ry="22" fill="${c}" stroke="#0002" transform="rotate(${i * 45} 50 50)"/>`).join('') + '<circle cx="50" cy="50" r="13" fill="#f2c14e"/>') },
  { id: 'scallop', name: 'Scallop badge', cat: 'Shapes', w: 90, h: 90, color: '#7fb8a4',
    svg: (c) => svg('0 0 100 100', Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2; return `<circle cx="${50 + 40 * Math.cos(a)}" cy="${50 + 40 * Math.sin(a)}" r="10" fill="${c}"/>`; }).join('') + `<circle cx="50" cy="50" r="40" fill="${c}"/><circle cx="50" cy="50" r="32" fill="none" stroke="#fff" stroke-dasharray="4 4" stroke-width="2"/>`) },
  { id: 'blob', name: 'Blob', cat: 'Shapes', w: 110, h: 90, color: '#f6c6a8', svg: (c) => svg('0 0 120 100', `<path d="M20 30 C30 0 80 -6 104 22 C124 46 106 92 70 96 C30 100 -6 76 20 30Z" fill="${c}"/>`) },

  // Nature
  { id: 'leaf', name: 'Leaf', cat: 'Nature', w: 60, h: 90, color: '#5f8a4e', svg: (c) => svg('0 0 60 100', `<path d="M30 98 C30 70 30 40 30 6 M30 6 C60 30 60 70 30 92 C0 70 0 30 30 6Z" fill="${c}" stroke="#2f4a26" stroke-width="2"/>`) },
  { id: 'branch', name: 'Fern', cat: 'Nature', w: 70, h: 130, color: '#6c8f5a',
    svg: (c) => svg('0 0 60 130', `<path d="M30 128 L30 4" stroke="${c}" stroke-width="3"/>` + Array.from({ length: 8 }, (_, i) => `<ellipse cx="${i % 2 ? 42 : 18}" cy="${16 + i * 14}" rx="13" ry="5" fill="${c}" transform="rotate(${i % 2 ? -30 : 30} ${i % 2 ? 42 : 18} ${16 + i * 14})"/>`).join('')) },
  { id: 'sun', name: 'Sun', cat: 'Nature', w: 90, h: 90, color: '#f5b83d',
    svg: (c) => svg('0 0 100 100', Array.from({ length: 12 }, (_, i) => `<rect x="47" y="2" width="6" height="16" rx="3" fill="${c}" transform="rotate(${i * 30} 50 50)"/>`).join('') + `<circle cx="50" cy="50" r="24" fill="${c}"/>`) },
  { id: 'moon', name: 'Moon', cat: 'Nature', w: 70, h: 70, color: '#f3e3a3', svg: (c) => svg('0 0 100 100', `<path d="M66 6 A46 46 0 1 0 94 70 A38 38 0 1 1 66 6Z" fill="${c}"/>`) },
  { id: 'cloud', name: 'Cloud', cat: 'Nature', w: 110, h: 66, color: '#ffffff', svg: (c) => svg('0 0 120 70', `<path d="M24 66 C4 66 0 40 22 36 C20 14 50 6 60 24 C70 4 104 10 100 36 C122 38 118 66 98 66Z" fill="${c}" stroke="#0002" stroke-width="2"/>`) },
  { id: 'rose', name: 'Rose', cat: 'Nature', w: 70, h: 70, color: '#d84a5f',
    svg: (c) => svg('0 0 100 100', `<circle cx="50" cy="50" r="40" fill="${c}"/><path d="M50 50 m-6 0 a6 6 0 1 1 12 0 a12 12 0 1 1 -24 0 a18 18 0 1 1 36 0 a26 26 0 1 1 -52 0" fill="none" stroke="#0004" stroke-width="3"/>`) },
  { id: 'tulip', name: 'Tulip', cat: 'Nature', w: 50, h: 100, color: '#f07aa0', svg: (c) => svg('0 0 50 100', `<path d="M25 98 L25 40" stroke="#4f7a3a" stroke-width="4"/><path d="M8 10 L16 22 L25 6 L34 22 L42 10 L42 32 C42 46 8 46 8 32Z" fill="${c}"/>`) },
  { id: 'butterfly', name: 'Butterfly', cat: 'Nature', w: 80, h: 64, color: '#7aa6f0', svg: (c) => svg('0 0 100 80', `<ellipse cx="28" cy="28" rx="24" ry="22" fill="${c}"/><ellipse cx="72" cy="28" rx="24" ry="22" fill="${c}"/><ellipse cx="32" cy="60" rx="16" ry="14" fill="${c}" opacity=".8"/><ellipse cx="68" cy="60" rx="16" ry="14" fill="${c}" opacity=".8"/><rect x="47" y="14" width="6" height="58" rx="3" fill="#333"/>`) },
  { id: 'palm', name: 'Palm', cat: 'Nature', w: 80, h: 110, color: '#3f8f5f', svg: (c) => svg('0 0 80 110', `<path d="M40 108 C42 80 38 50 42 30" stroke="#8a5a34" stroke-width="6" fill="none"/>` + [-60, -25, 15, 55, 95, 140].map((a) => `<ellipse cx="42" cy="12" rx="8" ry="26" fill="${c}" transform="rotate(${a} 42 30)"/>`).join('')) },

  // Travel
  { id: 'stamp', name: 'Postage stamp', cat: 'Travel', w: 80, h: 96, color: '#d9634a',
    svg: (c) => svg('0 0 80 96', `<rect width="80" height="96" fill="#fff"/>` + Array.from({ length: 9 }, (_, i) => `<circle cx="${i * 10}" cy="0" r="4" fill="#0000"/>`).join('') + `<rect x="8" y="8" width="64" height="80" fill="${c}"/><circle cx="40" cy="40" r="16" fill="#fff" opacity=".7"/><text x="40" y="80" font-size="14" font-family="monospace" fill="#fff" text-anchor="middle">25¢</text>`) },
  { id: 'postmark', name: 'Postmark', cat: 'Travel', w: 120, h: 70, color: '#2f3e66',
    svg: (c) => svg('0 0 120 70', `<circle cx="35" cy="35" r="30" fill="none" stroke="${c}" stroke-width="3"/><text x="35" y="40" font-size="11" font-family="monospace" fill="${c}" text-anchor="middle">AIR MAIL</text>` + [20, 30, 40, 50].map((y) => `<path d="M66 ${y} q10 -6 20 0 t20 0 t12 0" stroke="${c}" stroke-width="3" fill="none"/>`).join('')) },
  { id: 'ticket', name: 'Ticket stub', cat: 'Travel', w: 150, h: 64, color: '#f2c14e',
    svg: (c) => svg('0 0 150 64', `<path d="M0 0 H150 V24 A8 8 0 0 0 150 40 V64 H0 V40 A8 8 0 0 0 0 24Z" fill="${c}"/><line x1="110" y1="6" x2="110" y2="58" stroke="#0005" stroke-dasharray="4 3" stroke-width="2"/><text x="55" y="30" font-size="14" font-family="monospace" font-weight="700" fill="#3a2a10" text-anchor="middle">ADMIT ONE</text><text x="55" y="48" font-size="9" font-family="monospace" fill="#3a2a10" text-anchor="middle">ROW 7 · SEAT 12</text><text x="130" y="38" font-size="10" font-family="monospace" fill="#3a2a10" text-anchor="middle" transform="rotate(-90 130 34)">No.042</text>`) },
  { id: 'boarding', name: 'Boarding pass', cat: 'Travel', w: 170, h: 70, color: '#4f7ab8',
    svg: (c) => svg('0 0 170 70', `<rect width="170" height="70" rx="6" fill="#fff" stroke="#0002"/><rect width="170" height="18" rx="6" fill="${c}"/><text x="8" y="13" font-size="9" font-family="monospace" fill="#fff">BOARDING PASS</text><text x="14" y="48" font-size="20" font-family="monospace" font-weight="700" fill="#222">BOM</text><text x="100" y="48" font-size="20" font-family="monospace" font-weight="700" fill="#222">LIS</text><text x="72" y="46" font-size="18" fill="${c}">✈</text><text x="14" y="63" font-size="7" font-family="monospace" fill="#555">GATE 22 · SEAT 14A</text>`) },
  { id: 'plane', name: 'Paper plane', cat: 'Travel', w: 80, h: 60, color: '#ffffff', svg: (c) => svg('0 0 100 70', `<path d="M2 34 L98 2 L60 68 L46 42Z" fill="${c}" stroke="#333" stroke-width="2"/><path d="M46 42 L98 2" stroke="#333" stroke-width="2"/>`) },
  { id: 'pin', name: 'Map pin', cat: 'Travel', w: 50, h: 70, color: '#e2463a', svg: (c) => svg('0 0 50 70', `<path d="M25 68 C10 44 2 34 2 23 A23 23 0 0 1 48 23 C48 34 40 44 25 68Z" fill="${c}"/><circle cx="25" cy="23" r="9" fill="#fff"/>`) },
  { id: 'compass', name: 'Compass', cat: 'Travel', w: 80, h: 80, color: '#b07a3a', svg: (c) => svg('0 0 100 100', `<circle cx="50" cy="50" r="46" fill="#f6efe0" stroke="${c}" stroke-width="4"/><polygon points="50,10 58,50 50,90 42,50" fill="${c}"/><polygon points="50,10 58,50 42,50" fill="#c0392b"/><text x="50" y="8" font-size="10" text-anchor="middle" font-family="serif">N</text>`) },
  { id: 'camera', name: 'Camera', cat: 'Travel', w: 90, h: 66, color: '#2b2b2b', svg: (c) => svg('0 0 100 72', `<rect x="2" y="14" width="96" height="56" rx="8" fill="${c}"/><rect x="30" y="4" width="30" height="14" rx="3" fill="${c}"/><circle cx="50" cy="42" r="20" fill="#ddd"/><circle cx="50" cy="42" r="13" fill="#335"/><circle cx="84" cy="24" r="4" fill="#f2c14e"/>`) },

  // Labels & notes
  { id: 'note-yellow', name: 'Sticky note', cat: 'Labels', w: 120, h: 120, color: '#fff27a', svg: (c) => svg('0 0 100 100', `<path d="M0 0 H100 V84 L84 100 H0Z" fill="${c}"/><path d="M84 100 L84 84 H100Z" fill="#0002"/>`) },
  { id: 'banner', name: 'Ribbon banner', cat: 'Labels', w: 200, h: 54, color: '#c65d36', svg: (c) => svg('0 0 200 54', `<path d="M0 12 H24 V44 H0 L10 28Z M200 12 H176 V44 H200 L190 28Z" fill="${c}" opacity=".75"/><rect x="18" y="4" width="164" height="38" fill="${c}"/>`) },
  { id: 'tag', name: 'Gift tag', cat: 'Labels', w: 120, h: 64, color: '#e9dcc0', svg: (c) => svg('0 0 120 64', `<path d="M24 2 H118 V62 H24 L2 32Z" fill="${c}" stroke="#7a6a4a" stroke-width="2"/><circle cx="20" cy="32" r="5" fill="#fff" stroke="#7a6a4a"/>`) },
  { id: 'bubble', name: 'Speech bubble', cat: 'Labels', w: 130, h: 90, color: '#ffffff', svg: (c) => svg('0 0 130 90', `<path d="M10 4 H120 A8 8 0 0 1 128 12 V60 A8 8 0 0 1 120 68 H44 L24 88 L28 68 H10 A8 8 0 0 1 2 60 V12 A8 8 0 0 1 10 4Z" fill="${c}" stroke="#222" stroke-width="2.5"/>`) },
  { id: 'label', name: 'Label strip', cat: 'Labels', w: 160, h: 34, color: '#222222', svg: (c) => svg('0 0 160 34', `<rect width="160" height="34" rx="3" fill="${c}"/>`) },
  { id: 'torn', name: 'Torn paper', cat: 'Labels', w: 180, h: 110, color: '#fbf7ec', svg: (c) => svg('0 0 180 110', `<path d="M0 8 L12 2 L26 9 L40 3 L56 10 L70 2 L86 8 L100 1 L116 9 L130 3 L146 10 L160 2 L180 8 V102 L166 108 L150 101 L136 109 L120 102 L104 108 L88 100 L72 108 L56 101 L40 109 L24 101 L10 108 L0 102Z" fill="${c}" stroke="#0001"/>`) },
  { id: 'lined-card', name: 'Index card', cat: 'Labels', w: 170, h: 110, color: '#ffffff', svg: (c) => svg('0 0 170 110', `<rect width="170" height="110" fill="${c}" stroke="#0002"/><line x1="0" y1="22" x2="170" y2="22" stroke="#e57373" stroke-width="1.5"/>` + [40, 58, 76, 94].map((y) => `<line x1="0" y1="${y}" x2="170" y2="${y}" stroke="#90b4e8" stroke-width="1"/>`).join('')) },
  { id: 'paperclip', name: 'Paperclip', cat: 'Labels', w: 26, h: 76, color: '#9aa3ad', svg: (c) => svg('0 0 30 90', `<path d="M10 20 V70 A8 8 0 0 0 26 70 V12 A11 11 0 0 0 4 12 V74" fill="none" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/>`) },

  // Doodles
  { id: 'arrow', name: 'Arrow', cat: 'Doodles', w: 120, h: 50, color: '#222222', svg: (c) => svg('0 0 120 50', `<path d="M4 34 C30 4 70 46 108 18 M94 10 L110 17 L100 32" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`) },
  { id: 'underline', name: 'Squiggle', cat: 'Doodles', w: 160, h: 24, color: '#c65d36', svg: (c) => svg('0 0 160 24', `<path d="M2 12 q10 -10 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t16 0" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`) },
  { id: 'circle-scribble', name: 'Circle it', cat: 'Doodles', w: 140, h: 90, color: '#e2463a', svg: (c) => svg('0 0 140 90', `<path d="M90 8 C40 0 4 20 6 46 C8 80 110 90 130 52 C146 20 80 2 40 14" fill="none" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/>`) },
  { id: 'twinkles', name: 'Twinkles', cat: 'Doodles', w: 90, h: 70, color: '#222222', svg: (c) => svg('0 0 90 70', [[20, 20, 14], [60, 14, 9], [64, 50, 12]].map(([x, y, r]) => `<path d="M${x} ${y - r} V${y + r} M${x - r} ${y} H${x + r}" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`).join('')) },
  { id: 'hearts-doodle', name: 'Love doodle', cat: 'Doodles', w: 90, h: 70, color: '#e2566e', svg: (c) => svg('0 0 90 70', `<path d="M30 60 C6 42 4 26 12 18 C20 10 30 16 30 24 C30 16 40 10 48 18 C56 26 54 42 30 60Z M68 30 C58 22 58 14 62 11 C66 8 70 11 70 14 C70 11 74 8 78 11 C82 14 82 22 68 30Z" fill="none" stroke="${c}" stroke-width="3"/>`) },
  { id: 'crown', name: 'Crown', cat: 'Doodles', w: 80, h: 56, color: '#d9a93a', svg: (c) => svg('0 0 100 70', `<path d="M6 62 L10 14 L32 40 L50 6 L68 40 L90 14 L94 62Z" fill="none" stroke="${c}" stroke-width="4" stroke-linejoin="round"/>`) },
  { id: 'swirl', name: 'Swirl', cat: 'Doodles', w: 80, h: 80, color: '#5b8bd9', svg: (c) => svg('0 0 100 100', `<path d="M50 50 m0 -4 a4 4 0 1 1 -4 4 a10 10 0 1 1 10 10 a18 18 0 1 1 -18 -18 a28 28 0 1 1 28 28 a38 38 0 1 1 -38 -38" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`) },
  { id: 'confetti', name: 'Confetti', cat: 'Doodles', w: 140, h: 100, color: '#ff7a45',
    svg: () => svg('0 0 140 100', Array.from({ length: 26 }, (_, i) => `<rect x="${(i * 53) % 136}" y="${(i * 37) % 96}" width="6" height="10" fill="${['#ff7a45', '#f2c14e', '#5b8bd9', '#7fb8a4', '#e2566e'][i % 5]}" transform="rotate(${i * 41} ${(i * 53) % 136} ${(i * 37) % 96})"/>`).join('')) },
  { id: 'balloon', name: 'Balloon', cat: 'Doodles', w: 56, h: 110, color: '#e2463a', svg: (c) => svg('0 0 56 110', `<ellipse cx="28" cy="30" rx="26" ry="29" fill="${c}"/><path d="M24 58 L32 58 L28 64Z" fill="${c}"/><path d="M28 64 C20 80 36 92 28 108" stroke="#555" fill="none" stroke-width="1.5"/><ellipse cx="18" cy="20" rx="6" ry="9" fill="#fff" opacity=".4"/>`) },

  // Emoji stickers
  ...[
    ['📸', 'camera-emoji'], ['🎞️', 'film'], ['✈️', 'plane-emoji'], ['🌅', 'sunset'], ['🌸', 'blossom'], ['🌻', 'sunflower'],
    ['🍦', 'icecream'], ['☕', 'coffee'], ['🎂', 'cake'], ['🎉', 'party'], ['💌', 'letter'], ['💖', 'sparkle-heart'],
    ['⭐', 'star-emoji'], ['🌙', 'moon-emoji'], ['🌊', 'wave'], ['🏔️', 'mountain'], ['🗺️', 'map'], ['🎧', 'music'],
    ['📚', 'books'], ['🕯️', 'candle'], ['🍂', 'autumn'], ['❄️', 'snow'], ['🦋', 'butterfly-emoji'], ['🍓', 'strawberry'],
    ['🌈', 'rainbow'], ['🎈', 'balloon-emoji'], ['🐚', 'shell'], ['🌴', 'palm-emoji'], ['🎡', 'ferris'], ['🧳', 'luggage'],
    ['🍕', 'pizza'], ['💫', 'dizzy'], ['🎀', 'bow'], ['🌿', 'herb'], ['🏝️', 'island'], ['🚲', 'bike'],
  ].map(([ch, name]) => emoji(ch, name)),
];

export const DECO_CATS = ['Tape', 'Shapes', 'Nature', 'Travel', 'Labels', 'Doodles', 'Stickers'];
export const getDeco = (id: string) => DECOS.find((d) => d.id === id) ?? DECOS[0];
export const decoUrl = (id: string, color: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(getDeco(id).svg(color))}`;

/* Themes ------------------------------------------------------------------- */

export type JournalTheme = {
  id: string;
  name: string;
  note: string;
  cover: string;
  bg: string;
  paper: PaperKind;
  ink: string;
  font: 'serif' | 'sans' | 'mono' | 'hand';
  accent: string;
  decos: string[];
};

export const THEMES: JournalTheme[] = [
  { id: 'travel', name: 'Travel Diary', note: 'Kraft pages, tickets & stamps', cover: '#7a5a3a', bg: '#d8c3a0', paper: 'kraft', ink: '#3a2a18', font: 'mono', accent: '#d9634a', decos: ['boarding', 'stamp', 'postmark', 'tape-plain', 'pin'] },
  { id: 'summer', name: 'Summer Days', note: 'Sunshine yellow & palm shadows', cover: '#f2b544', bg: '#fff4d6', paper: 'plain', ink: '#5a3a10', font: 'hand', accent: '#ff7a45', decos: ['sun', 'palm', 'emoji-icecream', 'tape-stripe', 'emoji-wave'] },
  { id: 'love', name: 'Love Notes', note: 'Blush pink, hearts & letters', cover: '#d97a8e', bg: '#fde8ec', paper: 'dots', ink: '#7a2a3a', font: 'serif', accent: '#e2566e', decos: ['heart', 'tape-hearts', 'emoji-letter', 'rose', 'hearts-doodle'] },
  { id: 'party', name: 'Birthday Bash', note: 'Confetti, balloons & cake', cover: '#5b5bd9', bg: '#f4f1ff', paper: 'grid', ink: '#2a2a6a', font: 'sans', accent: '#ff7a45', decos: ['confetti', 'balloon', 'emoji-cake', 'banner', 'burst'] },
  { id: 'botanical', name: 'Vintage Botanical', note: 'Pressed leaves on cream', cover: '#4f6a46', bg: '#f3ecd9', paper: 'watercolor', ink: '#2f3a28', font: 'serif', accent: '#9e4327', decos: ['branch', 'leaf', 'tulip', 'tape-plain', 'butterfly'] },
  { id: 'night', name: 'Night Sky', note: 'Midnight blue & silver stars', cover: '#1b2440', bg: '#1f2a4a', paper: 'plain', ink: '#f2ead9', font: 'serif', accent: '#f3e3a3', decos: ['moon', 'star', 'sparkle', 'twinkles', 'tape-gold'] },
  { id: 'school', name: 'School Days', note: 'Notebook lines & doodles', cover: '#2f5d8c', bg: '#ffffff', paper: 'lined', ink: '#1d2a44', font: 'hand', accent: '#e2463a', decos: ['arrow', 'circle-scribble', 'note-yellow', 'paperclip', 'crown'] },
  { id: 'minimal', name: 'Minimal Mono', note: 'Quiet white space', cover: '#20231d', bg: '#f8f6f1', paper: 'plain', ink: '#20231d', font: 'sans', accent: '#20231d', decos: ['label', 'underline', 'tape-plain'] },
];
export const getTheme = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];

/* Page layout recommendations ---------------------------------------------- */

export const PAGE_W = 600;
export const PAGE_H = 800;

type PhotoStyle = Extract<JItem, { type: 'photo' }>['style'];
type Template = { id: string; name: string; note: string; build: (t: JournalTheme) => object[] };

const text = (t: JournalTheme, x: number, y: number, w: number, h: number, value: string, size: number, r = 0, extra: Partial<Extract<JItem, { type: 'text' }>> = {}) =>
  ({ type: 'text' as const, x, y, w, h, r, text: value, font: t.font, size, color: t.ink, align: 'left' as const, label: 'none' as const, ...extra });
const photo = (x: number, y: number, w: number, h: number, r = 0, style: PhotoStyle = 'plain') =>
  ({ type: 'photo' as const, x, y, w, h, r, style, photoId: null });
const deco = (d: string, x: number, y: number, w: number, h: number, r = 0, color?: string) =>
  ({ type: 'deco' as const, deco: d, x, y, w, h, r, color: color ?? getDeco(d).color });

export const TEMPLATES: Template[] = [
  { id: 'hero', name: 'Hero & caption', note: 'One big memory, one sentence.', build: (t) => [
    photo(50, 70, 500, 420, 0, 'plain'), deco('tape-plain', 230, 50, 140, 32, -3),
    text(t, 50, 520, 500, 60, 'A day worth keeping', 40, 0, { font: 'serif' }),
    text(t, 50, 590, 500, 120, 'Write what you remember — the smell, the sound, who was there.', 18),
    deco(t.decos[0] ?? 'star', 470, 690, 80, 80, 8) ] },
  { id: 'grid4', name: 'Grid of four', note: 'A tidy contact sheet.', build: (t) => [
    text(t, 50, 40, 500, 60, 'Moments', 44, 0, { align: 'center', font: 'serif' }),
    photo(50, 120, 240, 240), photo(310, 120, 240, 240), photo(50, 380, 240, 240), photo(310, 380, 240, 240),
    text(t, 50, 650, 500, 80, 'Notes…', 18, 0, { align: 'center' }) ] },
  { id: 'scatter', name: 'Polaroid scatter', note: 'Casual, tilted, taped.', build: (t) => [
    photo(40, 60, 260, 300, -6, 'polaroid'), photo(300, 140, 260, 300, 5, 'polaroid'), photo(110, 430, 260, 300, 3, 'polaroid'),
    deco('tape-dots', 120, 50, 120, 30, -10), deco('tape-stripe', 380, 130, 120, 30, 8),
    deco(t.decos[1] ?? 'heart', 430, 520, 90, 90, -8), text(t, 380, 640, 190, 90, 'us ♥', 34, -4, { font: 'hand' }) ] },
  { id: 'travel', name: 'Travel log', note: 'Ticket, stamp, map pin & notes.', build: (t) => [
    text(t, 40, 40, 520, 54, 'Destination:', 36, 0, { font: 'serif' }), deco('boarding', 330, 110, 230, 92, 4),
    photo(40, 120, 270, 330, -3, 'tape'), deco('stamp', 470, 230, 80, 96, 10), deco('postmark', 340, 280, 130, 76, -8),
    photo(330, 380, 230, 180, 3, 'plain'), deco('pin', 520, 360, 40, 56),
    deco('lined-card', 40, 500, 270, 180, -2), text(t, 60, 535, 230, 140, 'Day 1 —', 18, -2, { font: 'hand' }),
    deco('ticket', 360, 600, 190, 80, -6) ] },
  { id: 'diary', name: 'Diary entry', note: 'Mostly words, one small photo.', build: (t) => [
    text(t, 50, 40, 360, 50, 'Dear diary,', 38, 0, { font: 'hand' }),
    text(t, 50, 110, 500, 380, 'Today…', 20, 0), photo(330, 500, 220, 260, 4, 'polaroid'),
    deco(t.decos[2] ?? 'leaf', 60, 560, 110, 150, -10), deco('paperclip', 520, 480, 28, 80, 8) ] },
  { id: 'strip', name: 'Film strip', note: 'Three frames down the page.', build: (t) => [
    deco('label', 40, 40, 280, 44, -2, '#20231d'), text(t, 56, 46, 260, 34, 'ROLL 01 · SIDE A', 20, -2, { font: 'mono', color: '#f2ead9' }),
    photo(160, 110, 280, 200, 0, 'plain'), photo(160, 330, 280, 200, 0, 'plain'), photo(160, 550, 280, 200, 0, 'plain'),
    text(t, 460, 300, 120, 300, 'frame 1\n\n\n\n\nframe 2\n\n\n\n\nframe 3', 14, 0, { font: 'mono' }) ] },
  { id: 'corner', name: 'Collage corner', note: 'Overlapping layers & stickers.', build: (t) => [
    deco('torn', 30, 40, 400, 240, -3), photo(60, 70, 300, 220, -5, 'plain'), photo(260, 200, 300, 300, 6, 'round'),
    deco('banner', 60, 540, 300, 70, -3, t.accent), text(t, 90, 553, 250, 44, 'best day ever', 26, -3, { color: '#ffffff', align: 'center', font: 'hand' }),
    deco(t.decos[0] ?? 'star', 420, 560, 120, 120, 12), deco('sparkle', 80, 650, 60, 60), deco('sparkle', 160, 700, 40, 40) ] },
];

export function buildTemplate(templateId: string, theme: JournalTheme) {
  const template = TEMPLATES.find((tp) => tp.id === templateId) ?? TEMPLATES[0];
  return template.build(theme).map((item) => ({ ...item, id: uid() }) as unknown as JItem);
}

/** A first page for a new book, styled by its theme. */
export function coverItems(theme: JournalTheme, title: string): JItem[] {
  return [
    { id: uid(), type: 'text', x: 60, y: 260, w: 480, h: 140, r: 0, text: title, font: theme.font === 'mono' ? 'serif' : theme.font, size: 64, color: theme.ink, align: 'center', label: 'none' },
    { id: uid(), type: 'text', x: 60, y: 410, w: 480, h: 40, r: 0, text: new Date().toDateString(), font: 'mono', size: 16, color: theme.ink, align: 'center', label: 'none' },
    ...theme.decos.slice(0, 3).map((d, i): JItem => {
      const def = getDeco(d);
      const scale = 1.3;
      return { id: uid(), type: 'deco', deco: d, color: def.color, x: [70, 400, 240][i], y: [90, 560, 600][i], w: def.w * scale, h: def.h * scale, r: [-8, 10, -3][i] };
    }),
  ];
}

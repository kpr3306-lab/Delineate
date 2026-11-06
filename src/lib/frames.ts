import type { FrameStyle } from '../types';

export const FRAME_STYLES: { id: FrameStyle; label: string; swatch: string }[] = [
  { id: 'none', label: 'None', swatch: 'transparent' },
  { id: 'film35', label: '35mm film', swatch: '#141210' },
  { id: 'polaroid', label: 'Polaroid', swatch: '#f6f2e8' },
  { id: 'instax', label: 'Instax', swatch: '#ffffff' },
  { id: 'medium', label: 'Medium format', swatch: '#0b0b0a' },
  { id: 'mat', label: 'Gallery mat', swatch: '#efe9dc' },
  { id: 'wood', label: 'Walnut', swatch: '#6b4325' },
  { id: 'gold', label: 'Gilded', swatch: '#c9a14a' },
  { id: 'tape', label: 'Scrapbook', swatch: '#e8d9b0' },
];

function make(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  return { canvas, ctx: canvas.getContext('2d')! };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Wrap a rendered image in a physical-looking frame. Returns a new, larger canvas. */
export function applyFrame(src: HTMLCanvasElement, style: FrameStyle, caption = ''): HTMLCanvasElement {
  if (style === 'none') return src;
  const w = src.width;
  const h = src.height;
  const u = Math.min(w, h) / 100; // one "unit" = 1% of the short side

  if (style === 'film35') {
    const pad = u * 12;
    const { canvas, ctx } = make(w + u * 6, h + pad * 2);
    ctx.fillStyle = '#16120e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // orange film base glow at the edges
    const base = ctx.createLinearGradient(0, 0, 0, canvas.height);
    base.addColorStop(0, 'rgba(160, 82, 20, 0.35)');
    base.addColorStop(0.5, 'rgba(0,0,0,0)');
    base.addColorStop(1, 'rgba(160, 82, 20, 0.35)');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const holeW = u * 4.2;
    const holeH = u * 5.6;
    ctx.fillStyle = '#efe7d6';
    for (let x = u * 2; x < canvas.width - holeW; x += holeW * 2.1) {
      roundRect(ctx, x, pad * 0.22, holeW, holeH, u * 0.8);
      ctx.fill();
      roundRect(ctx, x, canvas.height - pad * 0.22 - holeH, holeW, holeH, u * 0.8);
      ctx.fill();
    }
    ctx.drawImage(src, u * 3, pad);
    ctx.fillStyle = '#e8892e';
    ctx.font = `600 ${u * 3}px "DM Mono", monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText('DELINEATE 400  ▸ 12A', u * 6, pad * 0.84);
    ctx.fillText('◂ 13   SAFETY FILM', canvas.width - u * 50, canvas.height - pad * 0.84);
    return canvas;
  }

  if (style === 'polaroid' || style === 'instax' || style === 'tape') {
    const side = style === 'instax' ? u * 6 : u * 7;
    const bottom = style === 'tape' ? side : style === 'instax' ? u * 22 : u * 26;
    const { canvas, ctx } = make(w + side * 2, h + side + bottom);
    ctx.fillStyle = style === 'polaroid' ? '#f6f2e8' : '#fffefb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // paper texture
    for (let i = 0; i < 1400; i += 1) {
      ctx.fillStyle = `rgba(120,100,70,${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2);
    }
    ctx.drawImage(src, side, side);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = Math.max(1, u * 0.2);
    ctx.strokeRect(side, side, w, h);
    if (caption && style !== 'tape') {
      ctx.fillStyle = '#2a2a2a';
      ctx.font = `${u * 7}px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(caption, canvas.width / 2, h + side + bottom / 2, w);
    }
    if (style === 'tape') {
      const tape = (x: number, y: number, angle: number) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillStyle = 'rgba(232, 217, 176, 0.82)';
        ctx.fillRect(-u * 12, -u * 3.6, u * 24, u * 7.2);
        ctx.restore();
      };
      tape(u * 6, u * 4, -0.7);
      tape(canvas.width - u * 6, canvas.height - u * 4, -0.7);
    }
    return canvas;
  }

  if (style === 'medium') {
    const pad = u * 8;
    const { canvas, ctx } = make(w + pad * 2, h + pad * 2);
    ctx.fillStyle = '#0b0b0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, pad, pad);
    // rough emulsion edge
    ctx.fillStyle = '#0b0b0a';
    for (let i = 0; i < 260; i += 1) {
      const t = Math.random();
      const s = u * (0.4 + Math.random() * 1.4);
      ctx.fillRect(pad + t * w, pad - s / 2, s * 2, s);
      ctx.fillRect(pad + t * w, pad + h - s / 2, s * 2, s);
      ctx.fillRect(pad - s / 2, pad + t * h, s, s * 2);
      ctx.fillRect(pad + w - s / 2, pad + t * h, s, s * 2);
    }
    ctx.fillStyle = '#d8d2c4';
    ctx.font = `500 ${u * 2.8}px "DM Mono", monospace`;
    ctx.fillText('120  ·  6×6  ·  DELINEATE', pad, pad * 0.62);
    roundRect(ctx, canvas.width - pad * 1.8, pad * 0.25, pad * 1.1, pad * 0.5, u);
    ctx.fill();
    return canvas;
  }

  if (style === 'mat') {
    const mat = u * 16;
    const rim = u * 2.6;
    const { canvas, ctx } = make(w + (mat + rim) * 2, h + (mat + rim) * 2);
    ctx.fillStyle = '#1d1b18';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#efe9dc';
    ctx.fillRect(rim, rim, canvas.width - rim * 2, canvas.height - rim * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(rim + mat - u * 0.6, rim + mat - u * 0.6, w + u * 1.2, h + u * 1.2);
    ctx.drawImage(src, rim + mat, rim + mat);
    return canvas;
  }

  // wood + gold: bevelled moulding drawn as four trapezoids
  const band = u * (style === 'gold' ? 13 : 10);
  const inner = u * 5;
  const { canvas, ctx } = make(w + (band + inner) * 2, h + (band + inner) * 2);
  const W = canvas.width;
  const H = canvas.height;
  const colors =
    style === 'gold' ? ['#f6dd8e', '#b8862f', '#7a5419', '#e8c46a'] : ['#8a5a34', '#5c3a1f', '#3b2412', '#7a4d2a'];
  const sides: [number, number][][] = [
    [[0, 0], [W, 0], [W - band, band], [band, band]],
    [[W, 0], [W, H], [W - band, H - band], [W - band, band]],
    [[W, H], [0, H], [band, H - band], [W - band, H - band]],
    [[0, H], [0, 0], [band, band], [band, H - band]],
  ];
  sides.forEach((pts, i) => {
    ctx.beginPath();
    pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[3][0], pts[3][1]);
    g.addColorStop(0, colors[i]);
    g.addColorStop(1, colors[(i + 2) % 4]);
    ctx.fillStyle = g;
    ctx.fill();
  });
  if (style === 'wood') {
    ctx.strokeStyle = 'rgba(30,15,5,0.25)';
    for (let i = 0; i < 90; i += 1) {
      const y = Math.random() * H;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(W / 3, y + 6, (2 * W) / 3, y - 6, W, y + 3);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = 'rgba(255,240,190,0.7)';
    ctx.lineWidth = u * 0.8;
    ctx.strokeRect(band * 0.45, band * 0.45, W - band * 0.9, H - band * 0.9);
  }
  ctx.fillStyle = style === 'gold' ? '#f3ecdc' : '#efe7d6';
  ctx.fillRect(band, band, W - band * 2, H - band * 2);
  ctx.drawImage(src, band + inner, band + inner);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(band, band, W - band * 2, u * 0.8);
  return canvas;
}

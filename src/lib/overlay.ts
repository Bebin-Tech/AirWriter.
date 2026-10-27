import { HAND_CONNECTIONS, TIP, type Landmarks } from './tracker';
import { lerp, type Point, type Quad } from './geometry';

export const CORNER_LABELS = ['TL', 'TR', 'BR', 'BL'] as const;

const ACCENT = '#818cf8';
const LIVE = '#34d399';
const DESK = '#fbbf24';

/** Hit-test the four corners in normalized display space. */
export function nearestCorner(quad: Quad, p: Point, tol: number): number {
  let best = -1;
  let bd = tol;
  quad.forEach((q, i) => {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

export function drawQuad(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  quad: Quad,
  { editable = true, penDown = false, hover = -1, rotation = 0 } = {},
) {
  const P = quad.map((p) => ({ x: p.x * w, y: p.y * h }));
  const color = penDown ? LIVE : ACCENT;
  ctx.save();
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(P[0].x, P[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(P[i].x, P[i].y);
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.globalAlpha = 0.07;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = editable ? 10 : 0;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // thirds grid — the quickest way to eyeball whether the perspective fits
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  for (const t of [1 / 3, 2 / 3]) {
    seg(ctx, lerp(P[0], P[1], t), lerp(P[3], P[2], t));
    seg(ctx, lerp(P[0], P[3], t), lerp(P[1], P[2], t));
  }
  ctx.globalAlpha = 1;

  if (editable) {
    P.forEach((p, i) => {
      const active = hover === i;
      ctx.beginPath();
      ctx.arc(p.x, p.y, active ? 10 : 7, 0, Math.PI * 2);
      ctx.fillStyle = active ? color : '#0b0d12';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = active ? '#ffffff' : color;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.font = '600 10px ui-sans-serif, system-ui';
      // the page corner this one maps to, so a rotation is visible at a glance
      const k = (((rotation / 90) % 4) + 4) % 4;
      ctx.fillText(CORNER_LABELS[(i + k) % 4], p.x + 13, p.y - 10);
    });
  }
  ctx.restore();
}

export function drawDeskLine(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  { deskY, downT, upT, active = false }: { deskY: number; downT: number; upT: number; active?: boolean },
) {
  const y = deskY * h;
  ctx.save();
  ctx.fillStyle = 'rgba(52,211,153,.14)';
  ctx.fillRect(0, y - downT * h, w, downT * h);
  ctx.fillStyle = 'rgba(251,191,36,.09)';
  ctx.fillRect(0, y - upT * h, w, (upT - downT) * h);

  ctx.strokeStyle = DESK;
  ctx.lineWidth = active ? 3 : 2;
  seg(ctx, { x: 0, y }, { x: w, y });

  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = LIVE;
  ctx.lineWidth = 1;
  seg(ctx, { x: 0, y: y - downT * h }, { x: w, y: y - downT * h });
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(251,191,36,.85)';
  ctx.font = '600 10px ui-sans-serif, system-ui';
  ctx.fillText('DESK', 8, y - 6);
  ctx.restore();
}

export function drawHand(
  ctx: CanvasRenderingContext2D,
  lm: Landmarks,
  { w, h, mirror, color = ACCENT, dim = false }: { w: number; h: number; mirror: boolean; color?: string; dim?: boolean },
) {
  const px = (p: { x: number; y: number }) => ({ x: (mirror ? 1 - p.x : p.x) * w, y: p.y * h });
  ctx.save();
  ctx.globalAlpha = dim ? 0.45 : 0.8;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    const p = px(lm[a]);
    const q = px(lm[b]);
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function drawFingertip(
  ctx: CanvasRenderingContext2D,
  lm: Landmarks,
  { w, h, mirror, penDown }: { w: number; h: number; mirror: boolean; penDown: boolean },
) {
  const tip = lm[TIP.index];
  const x = (mirror ? 1 - tip.x : tip.x) * w;
  const y = tip.y * h;
  const color = penDown ? LIVE : '#f87171';
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(x, y, penDown ? 9 : 7, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(11,13,18,.9)';
  ctx.stroke();
  ctx.restore();
}

function seg(ctx: CanvasRenderingContext2D, a: Point, b: Point) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/** Sizes a canvas to its CSS box at device pixel ratio. */
export function fitCanvas(canvas: HTMLCanvasElement) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const w = Math.round(r.width * dpr);
  const h = Math.round(r.height * dpr);
  if (w === 0 || h === 0) return null;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  return ctx && { ctx, w, h };
}

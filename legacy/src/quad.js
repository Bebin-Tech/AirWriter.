// Configurable paper box: four draggable corners in display-normalized coords
// (0..1 of the shown, possibly-mirrored video). Order: TL, TR, BR, BL.

const DEFAULT = [
  { x: 0.18, y: 0.16 }, { x: 0.82, y: 0.16 },
  { x: 0.82, y: 0.84 }, { x: 0.18, y: 0.84 },
];
const LABELS = ['TL', 'TR', 'BR', 'BL'];

export class PaperQuad {
  constructor(canvas, { storageKey = 'airnb.quad', onChange } = {}) {
    this.canvas = canvas;
    this.storageKey = storageKey;
    this.onChange = onChange;
    this.points = load(storageKey) ?? DEFAULT.map((p) => ({ ...p }));
    this.active = null;
    this.hover = null;
    this.editable = true;
    this._bind();
  }

  reset() { this.points = DEFAULT.map((p) => ({ ...p })); this._changed(); }

  _bind() {
    const c = this.canvas;
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
    };
    const near = (p) => {
      const r = c.getBoundingClientRect();
      const tol = 22 / Math.min(r.width, r.height);
      let best = -1, bd = tol;
      this.points.forEach((q, i) => {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    };

    c.addEventListener('pointerdown', (e) => {
      if (!this.editable) return;
      const p = pos(e);
      const i = near(p);
      if (i >= 0) { this.active = { kind: 'corner', i }; }
      else if (inside(this.points, p)) {
        this.active = { kind: 'move', from: p, start: this.points.map((q) => ({ ...q })) };
      } else return;
      c.setPointerCapture(e.pointerId);
    });

    c.addEventListener('pointermove', (e) => {
      const p = pos(e);
      this.hover = this.active ? this.hover : near(p);
      if (!this.active) return;
      if (this.active.kind === 'corner') {
        this.points[this.active.i] = p;
      } else {
        const dx = p.x - this.active.from.x, dy = p.y - this.active.from.y;
        this.points = this.active.start.map((q) => ({ x: clamp01(q.x + dx), y: clamp01(q.y + dy) }));
      }
      this._changed();
    });

    const end = () => { if (this.active) { this.active = null; save(this.storageKey, this.points); } };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  _changed() { this.onChange?.(this.points); }

  draw(ctx, w, h, { penDown = false } = {}) {
    const P = this.points.map((p) => ({ x: p.x * w, y: p.y * h }));
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = penDown ? '#37c98b' : '#5b8cff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(P[i].x, P[i].y);
    ctx.closePath();
    ctx.stroke();

    ctx.globalAlpha = 0.08; ctx.fillStyle = ctx.strokeStyle; ctx.fill(); ctx.globalAlpha = 1;

    // thirds grid, to eyeball the perspective fit
    ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
    for (const t of [1 / 3, 2 / 3]) {
      line(ctx, lerp(P[0], P[1], t), lerp(P[3], P[2], t));
      line(ctx, lerp(P[0], P[3], t), lerp(P[1], P[2], t));
    }
    ctx.globalAlpha = 1;

    if (this.editable) {
      P.forEach((p, i) => {
        const r = this.hover === i || this.active?.i === i ? 9 : 6;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#0f1115'; ctx.fill();
        ctx.strokeStyle = '#e7e9ee'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#e7e9ee'; ctx.font = '10px ui-sans-serif';
        ctx.fillText(LABELS[i], p.x + 11, p.y - 9);
      });
    }
    ctx.restore();
  }
}

// Draggable horizontal desk line for the side camera.
export class DeskLine {
  constructor(canvas, { y = 0.7, onChange } = {}) {
    this.canvas = canvas; this.y = y; this.onChange = onChange; this.dragging = false;
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return clamp01((e.clientY - r.top) / r.height);
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (Math.abs(pos(e) - this.y) > 0.06) return;
      this.dragging = true; canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.y = pos(e); this.onChange?.(this.y);
    });
    const end = () => { this.dragging = false; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  draw(ctx, w, h, { downT = 0.03, upT = 0.06, tip = null, mirror = false, penDown = false } = {}) {
    const y = this.y * h;
    ctx.save();
    ctx.fillStyle = 'rgba(55,201,139,.12)';
    ctx.fillRect(0, y - downT * h, w, downT * h);
    ctx.fillStyle = 'rgba(255,209,102,.10)';
    ctx.fillRect(0, y - upT * h, w, (upT - downT) * h);

    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
    line(ctx, { x: 0, y }, { x: w, y });
    ctx.setLineDash([4, 4]); ctx.strokeStyle = '#37c98b'; ctx.lineWidth = 1;
    line(ctx, { x: 0, y: y - downT * h }, { x: w, y: y - downT * h });
    ctx.setLineDash([]);

    if (tip) {
      const tx = (mirror ? 1 - tip.x : tip.x) * w, ty = tip.y * h;
      ctx.beginPath(); ctx.arc(tx, ty, 7, 0, Math.PI * 2);
      ctx.fillStyle = penDown ? '#37c98b' : '#ff6b6b'; ctx.fill();
      ctx.strokeStyle = '#0f1115'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();
  }
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function line(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }

function inside(poly, p) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

function save(key, pts) { try { localStorage.setItem(key, JSON.stringify(pts)); } catch {} }
function load(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null');
    return Array.isArray(v) && v.length === 4 ? v : null;
  } catch { return null; }
}

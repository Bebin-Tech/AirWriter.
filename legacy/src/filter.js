// One Euro filter: kills jitter while standing still, stays responsive when the
// finger moves fast. Much better than a fixed EMA for handwriting.

class LowPass {
  constructor() { this.y = null; }
  next(x, alpha) {
    this.y = this.y === null ? x : alpha * x + (1 - alpha) * this.y;
    return this.y;
  }
}

export class OneEuro {
  constructor({ minCutoff = 1.2, beta = 0.06, dCutoff = 1.0 } = {}) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.xf = new LowPass(); this.dxf = new LowPass();
    this.prev = null; this.prevT = null;
  }
  reset() { this.xf = new LowPass(); this.dxf = new LowPass(); this.prev = null; this.prevT = null; }
  next(x, tSec) {
    if (this.prevT === null) { this.prevT = tSec; this.prev = x; this.xf.next(x, 1); return x; }
    const dt = Math.max(1e-3, tSec - this.prevT);
    const rate = 1 / dt;
    const dx = (x - this.prev) * rate;
    const edx = this.dxf.next(dx, alpha(this.dCutoff, rate));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const out = this.xf.next(x, alpha(cutoff, rate));
    this.prev = x; this.prevT = tSec;
    return out;
  }
}

const alpha = (cutoff, rate) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau * rate);
};

export class Point2Filter {
  constructor(opts) { this.fx = new OneEuro(opts); this.fy = new OneEuro(opts); }
  reset() { this.fx.reset(); this.fy.reset(); }
  next(p, t) { return { x: this.fx.next(p.x, t), y: this.fy.next(p.y, t) }; }
  tune(minCutoff, beta) {
    for (const f of [this.fx, this.fy]) { f.minCutoff = minCutoff; f.beta = beta; }
  }
}

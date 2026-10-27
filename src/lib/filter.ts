import type { Point } from './geometry';

/**
 * One Euro filter. A fixed EMA forces a choice between jittery-but-quick and
 * smooth-but-laggy; this varies its cutoff with speed, so the ink is steady
 * while the finger hovers and still keeps up with a fast pen stroke.
 */
class LowPass {
  private y: number | null = null;
  next(x: number, alpha: number) {
    this.y = this.y === null ? x : alpha * x + (1 - alpha) * this.y;
    return this.y;
  }
}

const alphaFor = (cutoff: number, rate: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau * rate);
};

export class OneEuro {
  minCutoff: number;
  beta: number;
  private dCutoff: number;
  private xf = new LowPass();
  private dxf = new LowPass();
  private prev = 0;
  private prevT: number | null = null;

  constructor(minCutoff = 1.2, beta = 0.06, dCutoff = 1) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
  }

  reset() {
    this.xf = new LowPass(); this.dxf = new LowPass(); this.prevT = null;
  }

  next(x: number, tSec: number) {
    if (this.prevT === null) {
      this.prevT = tSec; this.prev = x; this.xf.next(x, 1);
      return x;
    }
    const rate = 1 / Math.max(1e-3, tSec - this.prevT);
    const edx = this.dxf.next((x - this.prev) * rate, alphaFor(this.dCutoff, rate));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const out = this.xf.next(x, alphaFor(cutoff, rate));
    this.prev = x; this.prevT = tSec;
    return out;
  }
}

export class PointFilter {
  private fx = new OneEuro();
  private fy = new OneEuro();
  reset() { this.fx.reset(); this.fy.reset(); }
  next(p: Point, t: number): Point { return { x: this.fx.next(p.x, t), y: this.fy.next(p.y, t) }; }
  /** `amount` 0 = raw and twitchy, 1 = glassy and laggy. */
  tune(amount: number) {
    for (const f of [this.fx, this.fy]) {
      f.minCutoff = 2.6 - 2.3 * amount;
      f.beta = 0.16 - 0.14 * amount;
    }
  }
}

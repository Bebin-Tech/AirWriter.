import { listVideoDevices, openCamera, attach, stop } from './cameras.js';
import { createTracker, drawHand, TIP } from './tracker.js';
import { solveHomography, applyHomography } from './homography.js';
import { PaperQuad, DeskLine } from './quad.js';
import { Notebook } from './notebook.js';
import { exportPdf } from './pdf.js';
import { Point2Filter } from './filter.js';

const $ = (id) => document.getElementById(id);
const el = {
  status: $('status'), hud: $('hud'), note: $('note'), start: $('start'),
  topVideo: $('topVideo'), topOverlay: $('topOverlay'), topDevice: $('topDevice'), topMirror: $('topMirror'),
  sideVideo: $('sideVideo'), sideOverlay: $('sideOverlay'), sideDevice: $('sideDevice'), sideMirror: $('sideMirror'),
  calibrate: $('calibrate'), resetQuad: $('resetQuad'), setDesk: $('setDesk'),
  deskY: $('deskY'), downT: $('downT'), upT: $('upT'), crop: $('crop'),
  deskOut: $('deskOut'), downOut: $('downOut'), upOut: $('upOut'), cropOut: $('cropOut'),
  pageSize: $('pageSize'), color: $('color'), width: $('width'), widthOut: $('widthOut'),
  smooth: $('smooth'), smoothOut: $('smoothOut'), ruled: $('ruled'),
  conf: $('conf'), confOut: $('confOut'), showSkeleton: $('showSkeleton'),
  page: $('page'), pageLabel: $('pageLabel'),
  prevPage: $('prevPage'), nextPage: $('nextPage'), addPage: $('addPage'),
  undo: $('undo'), clearPage: $('clearPage'), export: $('export'),
};

const cfg = {
  deskY: 0.70, downT: 0.030, upT: 0.060, crop: 0,
  trigger: 'side', spaceHeld: false,
};

const notebook = new Notebook(el.page, { sizeKey: 'a4' });
const quad = new PaperQuad(el.topOverlay);
const desk = new DeskLine(el.sideOverlay, {
  y: cfg.deskY,
  onChange: (y) => { cfg.deskY = y; el.deskY.value = y; syncOutputs(); },
});
const smoother = new Point2Filter({ minCutoff: 1.0, beta: 0.08 });

const state = {
  running: false,
  streams: { top: null, side: null },
  trackers: { top: null, side: null },
  penDown: false,
  lostFrames: 0,
  lift: null,
  fps: 0,
  H: null,
};

/* ---------------------------------------------------------------- controls */

function syncOutputs() {
  el.deskOut.value = cfg.deskY.toFixed(3);
  el.downOut.value = cfg.downT.toFixed(3);
  el.upOut.value = cfg.upT.toFixed(3);
  el.cropOut.value = `${(cfg.crop * 100).toFixed(1)}%`;
  el.widthOut.value = `${(+el.width.value).toFixed(1)} mm`;
  el.smoothOut.value = (+el.smooth.value).toFixed(2);
  el.confOut.value = (+el.conf.value).toFixed(2);
}

el.deskY.value = cfg.deskY; el.downT.value = cfg.downT; el.upT.value = cfg.upT;
el.deskY.oninput = () => { cfg.deskY = +el.deskY.value; desk.y = cfg.deskY; syncOutputs(); };
el.downT.oninput = () => {
  cfg.downT = +el.downT.value;
  if (cfg.upT < cfg.downT * 1.2) { cfg.upT = cfg.downT * 1.2; el.upT.value = cfg.upT; }
  syncOutputs();
};
el.upT.oninput = () => { cfg.upT = Math.max(+el.upT.value, cfg.downT * 1.05); syncOutputs(); };
el.crop.oninput = () => { cfg.crop = +el.crop.value; rebuildH(); syncOutputs(); };
el.width.oninput = syncOutputs;
el.smooth.oninput = () => {
  const s = +el.smooth.value;               // 0 = raw & twitchy, 1 = glassy & laggy
  smoother.tune(2.6 - 2.3 * s, 0.16 - 0.14 * s);
  syncOutputs();
};
el.conf.oninput = () => {
  const c = +el.conf.value;
  state.trackers.top?.setConfidence(c);
  state.trackers.side?.setConfidence(c);
  syncOutputs();
};
el.ruled.onchange = () => { notebook.ruled = el.ruled.checked; notebook.invalidate(); };
el.pageSize.onchange = () => notebook.setSize(el.pageSize.value);
el.topMirror.onchange = () => el.topVideo.classList.toggle('mirror', el.topMirror.checked);
el.sideMirror.onchange = () => el.sideVideo.classList.toggle('mirror', el.sideMirror.checked);
el.topVideo.classList.toggle('mirror', el.topMirror.checked);

for (const r of document.querySelectorAll('input[name=trigger]')) {
  r.onchange = () => { if (r.checked) cfg.trigger = r.value; };
}

el.calibrate.onclick = () => {
  quad.editable = !quad.editable;
  el.calibrate.textContent = quad.editable ? 'Lock box' : 'Fit box to paper';
  el.topOverlay.style.pointerEvents = quad.editable ? 'auto' : 'none';
};
el.resetQuad.onclick = () => { quad.reset(); rebuildH(); };
el.setDesk.onclick = () => {
  if (state.lastSideTipY == null) { note('No finger seen in the side camera yet.'); return; }
  cfg.deskY = state.lastSideTipY; desk.y = cfg.deskY; el.deskY.value = cfg.deskY; syncOutputs();
  note('Desk line set to the current fingertip height.');
};

el.addPage.onclick = () => { notebook.addPage(); updatePageLabel(); };
el.prevPage.onclick = () => { notebook.go(-1); updatePageLabel(); };
el.nextPage.onclick = () => { notebook.go(1); updatePageLabel(); };
el.undo.onclick = () => notebook.undo();
el.clearPage.onclick = () => notebook.clearPage();
el.export.onclick = async () => {
  el.export.disabled = true;
  try {
    await exportPdf(notebook, { ruled: el.ruled.checked });
  } catch (e) {
    note(`PDF export failed: ${e.message}`);
  } finally { el.export.disabled = false; }
};

addEventListener('keydown', (e) => {
  if (e.code === 'Space') { cfg.spaceHeld = true; e.preventDefault(); }
  if (e.key === 'z' && (e.metaKey || e.ctrlKey)) { notebook.undo(); e.preventDefault(); }
});
addEventListener('keyup', (e) => { if (e.code === 'Space') cfg.spaceHeld = false; });

quad.onChange = rebuildH;
syncOutputs();
updatePageLabel();
note('Grant camera access, pick your two cameras, then press Start.');

/* ------------------------------------------------------------- homography */

function rebuildH() {
  const c = cfg.crop;
  const dst = [{ x: c, y: c }, { x: 1 - c, y: c }, { x: 1 - c, y: 1 - c }, { x: c, y: 1 - c }];
  state.H = solveHomography(quad.points, dst);
}
rebuildH();

/* ----------------------------------------------------------------- startup */

async function refreshDevices(selected = {}) {
  const cams = await listVideoDevices();
  for (const [key, sel] of [['top', el.topDevice], ['side', el.sideDevice]]) {
    sel.innerHTML = '';
    sel.append(new Option(key === 'side' ? '— none —' : 'default', ''));
    cams.forEach((d, i) => sel.append(new Option(d.label || `Camera ${i + 1}`, d.deviceId)));
    if (selected[key]) sel.value = selected[key];
  }
  // Sensible default: first camera on top, second (if any) on the side.
  if (!el.topDevice.value && cams[0]) el.topDevice.value = cams[0].deviceId;
  if (!el.sideDevice.value && cams[1]) el.sideDevice.value = cams[1].deviceId;
  return cams;
}

el.start.onclick = async () => {
  el.start.disabled = true;
  try {
    status('starting…');
    // Prime permissions so device labels/ids are visible, then re-enumerate.
    const probe = await openCamera(null);
    stop(probe);
    await refreshDevices({ top: el.topDevice.value, side: el.sideDevice.value });

    stop(state.streams.top); stop(state.streams.side);
    state.streams.top = await openCamera(el.topDevice.value || null);
    await attach(el.topVideo, state.streams.top);

    if (el.sideDevice.value) {
      state.streams.side = await openCamera(el.sideDevice.value);
      await attach(el.sideVideo, state.streams.side);
    } else {
      state.streams.side = null;
      if (cfg.trigger === 'side') {
        cfg.trigger = 'pinch';
        document.querySelector('input[name=trigger][value=pinch]').checked = true;
        note('No side camera selected — falling back to pinch as the pen trigger.');
      }
    }

    status('loading model…');
    const conf = +el.conf.value;
    state.trackers.top ??= await createTracker({ minConfidence: conf });
    if (state.streams.side) state.trackers.side ??= await createTracker({ minConfidence: conf });

    state.running = true;
    status('live', 'live');
    el.start.textContent = 'Restart cameras';
    if (!el.note.textContent) note('Fit the box to your paper, set the desk line, and write.');
    requestAnimationFrame(loop);
  } catch (e) {
    status('error');
    note(`${e.name}: ${e.message}`);
  } finally { el.start.disabled = false; }
};

navigator.mediaDevices?.enumerateDevices && refreshDevices();
navigator.mediaDevices?.addEventListener?.('devicechange', () => refreshDevices({
  top: el.topDevice.value, side: el.sideDevice.value,
}));

/* -------------------------------------------------------------- main loop */

let lastFrame = performance.now();

function loop(now) {
  if (!state.running) return;
  const dt = now - lastFrame; lastFrame = now;
  state.fps = state.fps ? state.fps * 0.9 + (1000 / dt) * 0.1 : 1000 / dt;

  const top = state.trackers.top?.detect(el.topVideo, now) ?? null;
  const side = state.streams.side ? state.trackers.side?.detect(el.sideVideo, now) ?? null : null;

  // ---- side camera: fingertip height above the desk line
  let lift = null;
  if (side) {
    const tip = side.landmarks[TIP.index];
    state.lastSideTipY = tip.y;
    lift = cfg.deskY - tip.y;          // >0 = above the desk (y grows downward)
  }
  state.lift = lift;

  // ---- pen trigger
  let want = state.penDown;
  if (cfg.trigger === 'always') want = !!top;
  else if (cfg.trigger === 'hold') want = !!top && cfg.spaceHeld;
  else if (cfg.trigger === 'pinch') {
    if (!top) want = false;
    else {
      const t = top.landmarks[TIP.thumb], i = top.landmarks[TIP.index];
      const palm = Math.hypot(top.landmarks[0].x - top.landmarks[9].x, top.landmarks[0].y - top.landmarks[9].y);
      const d = Math.hypot(t.x - i.x, t.y - i.y) / (palm || 1);
      want = state.penDown ? d < 0.55 : d < 0.40;   // hysteresis
    }
  } else { // side-camera height, with hysteresis
    if (lift === null) want = false;
    else want = state.penDown ? lift < cfg.upT : lift < cfg.downT;
  }

  // ---- top camera: fingertip -> page coords
  let pagePt = null;
  if (top && state.H) {
    const tip = top.landmarks[TIP.index];
    const dx = el.topMirror.checked ? 1 - tip.x : tip.x;
    const mapped = applyHomography(state.H, dx, tip.y);
    if (mapped) pagePt = mapped;
  }

  const onPaper = pagePt && pagePt.x > -0.02 && pagePt.x < 1.02 && pagePt.y > -0.02 && pagePt.y < 1.02;
  if (!top) { state.lostFrames++; } else state.lostFrames = 0;
  if (state.lostFrames > 4 || !onPaper) want = false;

  // ---- ink
  const tSec = now / 1000;
  let smoothed = null;
  if (pagePt) {
    if (want && !state.penDown) smoother.reset();   // start crisp, no lead-in smear
    smoothed = smoother.next(pagePt, tSec);
  }

  if (want && !state.penDown) {
    notebook.begin(smoothed, { color: el.color.value, width: +el.width.value });
  } else if (want && state.penDown) {
    notebook.extend(smoothed);
  } else if (!want && state.penDown) {
    notebook.end();
  } else if (smoothed) {
    notebook.render(onPaper ? smoothed : null);      // hover cursor
  }
  state.penDown = want;

  drawOverlays(top, side);
  hud();
  requestAnimationFrame(loop);
}

/* --------------------------------------------------------------- overlays */

function fit(canvas) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return { ctx: canvas.getContext('2d'), w, h };
}

function drawOverlays(top, side) {
  {
    const { ctx, w, h } = fit(el.topOverlay);
    ctx.clearRect(0, 0, w, h);
    quad.draw(ctx, w, h, { penDown: state.penDown });
    if (top && el.showSkeleton.checked) {
      drawHand(ctx, top.landmarks, { w, h, mirror: el.topMirror.checked });
      const tip = top.landmarks[TIP.index];
      const x = (el.topMirror.checked ? 1 - tip.x : tip.x) * w;
      ctx.beginPath(); ctx.arc(x, tip.y * h, 8, 0, Math.PI * 2);
      ctx.fillStyle = state.penDown ? '#37c98b' : '#ff6b6b'; ctx.fill();
      ctx.strokeStyle = '#0f1115'; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  {
    const { ctx, w, h } = fit(el.sideOverlay);
    ctx.clearRect(0, 0, w, h);
    desk.draw(ctx, w, h, {
      downT: cfg.downT, upT: cfg.upT, mirror: el.sideMirror.checked,
      tip: side ? side.landmarks[TIP.index] : null, penDown: state.penDown,
    });
    if (side && el.showSkeleton.checked) {
      drawHand(ctx, side.landmarks, { w, h, mirror: el.sideMirror.checked, color: '#7a8aa8' });
    }
  }
}

function hud() {
  const { pages, strokes } = notebook.stats();
  const lift = state.lift === null ? ' — ' : state.lift.toFixed(3).padStart(6);
  el.hud.textContent = `${state.fps.toFixed(0).padStart(2)} fps   lift ${lift}   ${strokes} strokes / ${pages}p`;
  status(state.penDown ? 'writing' : 'live', state.penDown ? 'down' : 'live');
  updatePageLabel();
}

function updatePageLabel() {
  el.pageLabel.textContent = `Page ${notebook.index + 1} / ${notebook.pages.length}`;
  el.prevPage.disabled = notebook.index === 0;
  el.nextPage.disabled = notebook.index === notebook.pages.length - 1;
}

function status(text, cls = '') { el.status.textContent = text; el.status.className = `status ${cls}`; }
function note(text) { el.note.textContent = text; }

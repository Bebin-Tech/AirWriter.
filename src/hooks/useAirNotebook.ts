'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { attach, listVideoDevices, openCamera, stopStream, type CameraDevice } from '@/lib/cameras';
import { applyHomography, solveHomography, type Point, type Quad } from '@/lib/geometry';
import { PointFilter } from '@/lib/filter';
import { Notebook, type PageSizeKey, type Paper } from '@/lib/notebook';
import { createTracker, TIP, type Landmarks, type Tracker } from '@/lib/tracker';
import { drawDeskLine, drawFingertip, drawHand, drawQuad, fitCanvas } from '@/lib/overlay';

export type Trigger = 'height' | 'pinch' | 'hold' | 'always';
export type Phase = 'idle' | 'starting' | 'loading' | 'live' | 'error';

export type Settings = {
  topDevice: string;
  sideDevice: string;
  topMirror: boolean;
  sideMirror: boolean;
  trigger: Trigger;
  deskY: number;
  downT: number;
  upT: number;
  crop: number;
  /** Quarter-turns applied to the box→page corner mapping (0/90/180/270). */
  rotation: number;
  color: string;
  width: number;
  smoothing: number;
  confidence: number;
  showSkeleton: boolean;
  paper: Paper;
  sizeKey: PageSizeKey;
};

const DEFAULT_SETTINGS: Settings = {
  topDevice: '',
  sideDevice: '',
  topMirror: true,
  sideMirror: false,
  trigger: 'height',
  deskY: 0.7,
  downT: 0.03,
  upT: 0.06,
  crop: 0,
  rotation: 0,
  color: '#14161c',
  width: 1.6,
  smoothing: 0.5,
  confidence: 0.4,
  showSkeleton: true,
  paper: 'ruled',
  sizeKey: 'a4',
};

const DEFAULT_QUAD: Quad = [
  { x: 0.18, y: 0.16 }, { x: 0.82, y: 0.16 },
  { x: 0.82, y: 0.84 }, { x: 0.18, y: 0.84 },
];

const KEY = { settings: 'airnb.settings.v1', quad: 'airnb.quad.v1' };

export type Runtime = {
  phase: Phase;
  message: string;
  fps: number;
  lift: number | null;
  penDown: boolean;
  handSeen: boolean;
  onPaper: boolean;
  pageIndex: number;
  pageCount: number;
  strokeCount: number;
};

export function useAirNotebook() {
  const topVideo = useRef<HTMLVideoElement>(null);
  const sideVideo = useRef<HTMLVideoElement>(null);
  const topOverlay = useRef<HTMLCanvasElement>(null);
  const sideOverlay = useRef<HTMLCanvasElement>(null);
  const pageCanvas = useRef<HTMLCanvasElement>(null);

  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [quad, setQuadState] = useState<Quad>(DEFAULT_QUAD);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [editingBox, setEditingBox] = useState(true);
  const [runtime, setRuntime] = useState<Runtime>({
    phase: 'idle',
    message: 'Grant camera access to begin.',
    fps: 0,
    lift: null,
    penDown: false,
    handSeen: false,
    onPaper: false,
    pageIndex: 0,
    pageCount: 1,
    strokeCount: 0,
  });

  // The rAF loop reads through refs so it never closes over stale state.
  const settingsRef = useRef(settings);
  const quadRef = useRef(quad);
  const homographyRef = useRef<number[] | null>(null);
  const notebookRef = useRef<Notebook | null>(null);
  const filterRef = useRef(new PointFilter());
  const streams = useRef<{ top: MediaStream | null; side: MediaStream | null }>({ top: null, side: null });
  const trackers = useRef<{ top: Tracker | null; side: Tracker | null }>({ top: null, side: null });
  const loopRef = useRef<number | null>(null);
  const spaceRef = useRef(false);
  const penRef = useRef(false);
  const lostRef = useRef(0);
  const lastSideTip = useRef<number | null>(null);
  const fpsRef = useRef(0);
  const lastFrame = useRef(0);
  const lastPush = useRef(0);
  const hoverRef = useRef(-1);
  const draggingDeskRef = useRef(false);
  const editingBoxRef = useRef(true);

  settingsRef.current = settings;
  quadRef.current = quad;
  editingBoxRef.current = editingBox;

  /* ---------------------------------------------------------- persistence */

  useEffect(() => {
    try {
      const s = localStorage.getItem(KEY.settings);
      if (s) setSettingsState({ ...DEFAULT_SETTINGS, ...JSON.parse(s) });
      const q = localStorage.getItem(KEY.quad);
      if (q) {
        const parsed = JSON.parse(q);
        if (Array.isArray(parsed) && parsed.length === 4) setQuadState(parsed as Quad);
      }
    } catch {
      /* storage unavailable — defaults are fine */
    }
  }, []);

  const persist = (key: string, value: unknown) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  };

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.downT !== undefined) next.upT = Math.max(next.upT, next.downT * 1.2);
      if (patch.upT !== undefined) next.upT = Math.max(next.upT, next.downT * 1.05);
      persist(KEY.settings, next);
      return next;
    });
  }, []);

  const setQuad = useCallback((next: Quad) => {
    setQuadState(next);
    persist(KEY.quad, next);
  }, []);

  const rotatePage = useCallback(
    (delta: number) => setSettings({ rotation: (((settingsRef.current.rotation + delta) % 360) + 360) % 360 }),
    [setSettings],
  );

  const resetQuad = useCallback(() => setQuad(DEFAULT_QUAD.map((p) => ({ ...p })) as Quad), [setQuad]);

  /* -------------------------------------------------------------- derived */

  const homography = useMemo(() => {
    const c = settings.crop;
    const corners = [
      { x: c, y: c }, { x: 1 - c, y: c },
      { x: 1 - c, y: 1 - c }, { x: c, y: 1 - c },
    ];
    // Rotating which page corner each box corner feeds turns the writing
    // without touching the box you already fitted to the paper.
    const k = (((settings.rotation / 90) % 4) + 4) % 4;
    const dst = corners.map((_, i) => corners[(i + k) % 4]);
    return solveHomography(quad, dst);
  }, [quad, settings.crop, settings.rotation]);
  homographyRef.current = homography;

  useEffect(() => { filterRef.current.tune(settings.smoothing); }, [settings.smoothing]);
  useEffect(() => {
    trackers.current.top?.setConfidence(settings.confidence);
    trackers.current.side?.setConfidence(settings.confidence);
  }, [settings.confidence]);

  /* ------------------------------------------------------------- notebook */

  useEffect(() => {
    if (!pageCanvas.current) return;
    const nb = notebookRef.current ?? new Notebook();
    notebookRef.current = nb;
    nb.attach(pageCanvas.current);
    nb.onChange = () => {
      setRuntime((r) => {
        if (r.pageIndex === nb.index && r.pageCount === nb.pages.length && r.strokeCount === nb.strokeCount) return r;
        return { ...r, pageIndex: nb.index, pageCount: nb.pages.length, strokeCount: nb.strokeCount };
      });
    };
  }, []);

  useEffect(() => { notebookRef.current?.setSize(settings.sizeKey); }, [settings.sizeKey]);
  useEffect(() => { notebookRef.current?.setPaper(settings.paper); }, [settings.paper]);

  /* -------------------------------------------------------------- devices */

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const cams = await listVideoDevices();
    setDevices(cams);
    // Before camera permission is granted the browser reports placeholder
    // entries with blank ids — don't let those clobber a restored choice.
    if (cams.length && cams.every((c) => !c.deviceId)) return cams;
    setSettingsState((prev) => {
      const next = { ...prev };
      if (!cams.some((c) => c.deviceId === prev.topDevice)) next.topDevice = cams[0]?.deviceId ?? '';
      if (prev.sideDevice && !cams.some((c) => c.deviceId === prev.sideDevice)) next.sideDevice = '';
      if (!next.sideDevice && cams[1] && cams[1].deviceId !== next.topDevice) next.sideDevice = cams[1].deviceId;
      if (next.topDevice !== prev.topDevice || next.sideDevice !== prev.sideDevice) persist(KEY.settings, next);
      return next;
    });
    return cams;
  }, []);

  useEffect(() => {
    refreshDevices();
    const md = navigator.mediaDevices;
    md?.addEventListener?.('devicechange', refreshDevices);
    return () => md?.removeEventListener?.('devicechange', refreshDevices);
  }, [refreshDevices]);

  /* ------------------------------------------------------------ keyboard */

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) { spaceRef.current = true; e.preventDefault(); }
      if (e.key.toLowerCase() === 'z' && (e.metaKey || e.ctrlKey)) { notebookRef.current?.undo(); e.preventDefault(); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') spaceRef.current = false; };
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); };
  }, []);

  /* ------------------------------------------------------------ main loop */

  const loop = useCallback((now: number) => {
    loopRef.current = requestAnimationFrame(loop);
    const s = settingsRef.current;
    const nb = notebookRef.current;
    if (!nb || !topVideo.current) return;

    const dt = now - (lastFrame.current || now - 16);
    lastFrame.current = now;
    if (dt > 0) fpsRef.current = fpsRef.current ? fpsRef.current * 0.9 + (1000 / dt) * 0.1 : 1000 / dt;

    const top = trackers.current.top?.detect(topVideo.current, now) ?? null;
    const side =
      streams.current.side && sideVideo.current
        ? trackers.current.side?.detect(sideVideo.current, now) ?? null
        : null;

    // --- side camera: fingertip height above the desk line
    let lift: number | null = null;
    if (side) {
      lastSideTip.current = side[TIP.index].y;
      lift = s.deskY - side[TIP.index].y; // > 0 = above the desk (y grows downward)
    }

    // --- pen trigger
    let want = penRef.current;
    if (s.trigger === 'always') want = !!top;
    else if (s.trigger === 'hold') want = !!top && spaceRef.current;
    else if (s.trigger === 'pinch') want = top ? pinching(top, penRef.current) : false;
    else want = lift === null ? false : lift < (penRef.current ? s.upT : s.downT);

    // --- top camera: fingertip -> page coordinates
    let pagePt: Point | null = null;
    if (top && homographyRef.current) {
      const tip = top[TIP.index];
      pagePt = applyHomography(homographyRef.current, s.topMirror ? 1 - tip.x : tip.x, tip.y);
    }
    const onPaper = !!pagePt && pagePt.x > -0.02 && pagePt.x < 1.02 && pagePt.y > -0.02 && pagePt.y < 1.02;

    lostRef.current = top ? 0 : lostRef.current + 1;
    if (lostRef.current > 4 || !onPaper) want = false;

    // --- ink
    let smoothed: Point | null = null;
    if (pagePt) {
      if (want && !penRef.current) filterRef.current.reset(); // start crisp, no lead-in smear
      smoothed = filterRef.current.next(pagePt, now / 1000);
    }
    if (want && !penRef.current && smoothed) nb.begin(smoothed, { color: s.color, width: s.width });
    else if (want && penRef.current && smoothed) nb.extend(smoothed);
    else if (!want && penRef.current) nb.end();
    else nb.render(onPaper ? smoothed : null);
    penRef.current = want;

    paintOverlays(top, side);

    // Throttle React updates to ~8 Hz; the canvases already run at frame rate.
    if (now - lastPush.current > 120) {
      lastPush.current = now;
      setRuntime((r) => ({
        ...r,
        fps: fpsRef.current,
        lift,
        penDown: want,
        handSeen: !!top,
        onPaper,
      }));
    }
  }, []);

  /** Repaints both camera overlays: paper box, desk line, hand, fingertip. */
  const paintOverlays = useCallback((top: Landmarks | null, side: Landmarks | null) => {
    const s = settingsRef.current;
    const penDown = penRef.current;

    if (topOverlay.current) {
      const fit = fitCanvas(topOverlay.current);
      if (fit) {
        const { ctx, w, h } = fit;
        ctx.clearRect(0, 0, w, h);
        drawQuad(ctx, w, h, quadRef.current, {
          editable: editingBoxRef.current, penDown, hover: hoverRef.current, rotation: s.rotation,
        });
        if (top && s.showSkeleton) drawHand(ctx, top, { w, h, mirror: s.topMirror });
        if (top) drawFingertip(ctx, top, { w, h, mirror: s.topMirror, penDown });
      }
    }

    if (sideOverlay.current) {
      const fit = fitCanvas(sideOverlay.current);
      if (fit) {
        const { ctx, w, h } = fit;
        ctx.clearRect(0, 0, w, h);
        drawDeskLine(ctx, w, h, { deskY: s.deskY, downT: s.downT, upT: s.upT, active: draggingDeskRef.current });
        if (side && s.showSkeleton) drawHand(ctx, side, { w, h, mirror: s.sideMirror, color: '#94a3b8', dim: true });
        if (side) drawFingertip(ctx, side, { w, h, mirror: s.sideMirror, penDown });
      }
    }
  }, []);

  /* --------------------------------------------------------------- actions */

  const start = useCallback(async () => {
    try {
      setRuntime((r) => ({ ...r, phase: 'starting', message: 'Requesting cameras…' }));
      // Prime permissions so labels and stable deviceIds become visible.
      stopStream(await openCamera(null));
      const cams = await refreshDevices();
      const s = settingsRef.current;
      const topId = s.topDevice || cams[0]?.deviceId || null;
      const sideId = s.sideDevice || null;

      stopStream(streams.current.top);
      stopStream(streams.current.side);

      streams.current.top = await openCamera(topId);
      if (topVideo.current) await attach(topVideo.current, streams.current.top);

      if (sideId && sideVideo.current) {
        streams.current.side = await openCamera(sideId);
        await attach(sideVideo.current, streams.current.side);
      } else {
        streams.current.side = null;
        if (s.trigger === 'height') setSettings({ trigger: 'pinch' });
      }

      setRuntime((r) => ({ ...r, phase: 'loading', message: 'Loading hand model…' }));
      trackers.current.top ??= await createTracker(s.confidence);
      if (streams.current.side) trackers.current.side ??= await createTracker(s.confidence);

      setRuntime((r) => ({
        ...r,
        phase: 'live',
        message: streams.current.side
          ? 'Fit the box to your paper, set the desk line, then write.'
          : 'No side camera — using pinch as the pen trigger.',
      }));
      if (loopRef.current === null) loopRef.current = requestAnimationFrame(loop);
    } catch (err) {
      const e = err as Error;
      setRuntime((r) => ({ ...r, phase: 'error', message: `${e.name}: ${e.message}` }));
    }
  }, [loop, refreshDevices, setSettings]);

  const stop = useCallback(() => {
    if (loopRef.current !== null) cancelAnimationFrame(loopRef.current);
    loopRef.current = null;
    stopStream(streams.current.top);
    stopStream(streams.current.side);
    streams.current = { top: null, side: null };
    penRef.current = false;
    setRuntime((r) => ({ ...r, phase: 'idle', message: 'Cameras stopped.', penDown: false, fps: 0 }));
  }, []);

  useEffect(() => () => {
    if (loopRef.current !== null) cancelAnimationFrame(loopRef.current);
    stopStream(streams.current.top);
    stopStream(streams.current.side);
    trackers.current.top?.close();
    trackers.current.side?.close();
  }, []);

  const calibrateDesk = useCallback(() => {
    if (lastSideTip.current === null) {
      setRuntime((r) => ({ ...r, message: 'No finger visible in the side camera yet.' }));
      return;
    }
    setSettings({ deskY: lastSideTip.current });
    setRuntime((r) => ({ ...r, message: 'Desk line set to the current fingertip height.' }));
  }, [setSettings]);

  const notebookActions = useMemo(
    () => ({
      undo: () => notebookRef.current?.undo(),
      clearPage: () => notebookRef.current?.clearPage(),
      addPage: () => notebookRef.current?.addPage(),
      goTo: (i: number) => notebookRef.current?.goTo(i),
      reset: () => notebookRef.current?.reset(),
    }),
    [],
  );

  return {
    refs: { topVideo, sideVideo, topOverlay, sideOverlay, pageCanvas },
    notebookRef,
    settings,
    setSettings,
    quad,
    setQuad,
    resetQuad,
    rotatePage,
    editingBox,
    setEditingBox,
    devices,
    runtime,
    hasSideCamera: !!settings.sideDevice,
    start,
    stop,
    calibrateDesk,
    hoverRef,
    draggingDeskRef,
    ...notebookActions,
  };
}

function pinching(lm: Landmarks, was: boolean) {
  const palm = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 1;
  const d = Math.hypot(lm[TIP.thumb].x - lm[TIP.index].x, lm[TIP.thumb].y - lm[TIP.index].y) / palm;
  return was ? d < 0.55 : d < 0.4; // hysteresis, normalized by palm size
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

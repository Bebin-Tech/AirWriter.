import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { create, act } from 'react-test-renderer';

// Run application TypeScript directly, with only the hardware/vision boundary
// simulated. The real hook, notebook, geometry and PDF code run unchanged.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@mediapipe/tasks-vision') return { url: 'test:vision', shortCircuit: true };
    if (specifier.startsWith('@/')) specifier = new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href;
    try { return next(specifier, context); } catch (error) {
      if (specifier.startsWith('.')) return next(`${specifier}.ts`, context);
      throw error;
    }
  },
  load(url, context, next) {
    if (url === 'test:vision') return { format: 'module', shortCircuit: true, source: `
      export const FilesetResolver = { forVisionTasks: async () => ({}) };
      export const HandLandmarker = { createFromOptions: async (_, options) => globalThis.visionFactory(options) };
    ` };
    if (url.endsWith('.ts')) return { format: 'module', shortCircuit: true,
      source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), 'utf8')) };
    return next(url, context);
  },
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { Notebook } = await import('../src/lib/notebook.ts');
const { createHandwritingPdf, createTextPdf, exportPdf, exportTextPdf } = await import('../src/lib/pdf.ts');
const library = await import('../src/lib/library.ts');
const { solveHomography, applyHomography } = await import('../src/lib/geometry.ts');
const { createTracker } = await import('../src/lib/tracker.ts');
const { useAirNotebook } = await import('../src/hooks/useAirNotebook.ts');

const stroke = { color: '#14161c', width: 1.6, pts: [{ x: 10, y: 10 }, { x: 30, y: 40 }, { x: 50, y: 20 }] };
const storage = new Map();
globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
const events = new EventTarget();
globalThis.addEventListener = events.addEventListener.bind(events);
globalThis.removeEventListener = events.removeEventListener.bind(events);
globalThis.fetch = async () => ({ ok: true });
let frame;
globalThis.requestAnimationFrame = (callback) => { frame = callback; return 1; };
globalThis.cancelAnimationFrame = () => {};
globalThis.visionFactory = async () => ({ detectForVideo: () => ({ landmarks: [] }), setOptions: async () => {}, close() {} });

test('perspective calibration maps all four skewed corners accurately', () => {
  const corners = [{ x: .1, y: .2 }, { x: .9, y: .1 }, { x: .8, y: .9 }, { x: .2, y: .8 }];
  const target = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const matrix = solveHomography(corners, target);
  corners.forEach((p, index) => {
    const actual = applyHomography(matrix, p.x, p.y);
    assert.ok(Math.abs(actual.x - target[index].x) < 1e-9);
    assert.ok(Math.abs(actual.y - target[index].y) < 1e-9);
  });
  assert.equal(solveHomography(Array(4).fill({ x: 0, y: 0 }), target), null);
});

test('notebook commits strokes, drops noise, navigates, undoes and copies safely', () => {
  const nb = new Notebook();
  nb.begin({ x: .1, y: .2 }, stroke); nb.extend({ x: .5, y: .6 }); nb.end();
  assert.equal(nb.strokeCount, 1);
  assert.deepEqual(nb.pages[0][0].pts[0], { x: 21, y: 59.400000000000006 });
  const snapshot = nb.snapshot(); snapshot[0][0].pts[0].x = 999;
  assert.equal(nb.pages[0][0].pts[0].x, 21);
  nb.begin({ x: 0, y: 0 }, stroke); nb.end(); assert.equal(nb.strokeCount, 1);
  nb.addPage(); nb.goTo(0); nb.undo(); assert.equal(nb.strokeCount, 0);
  nb.load([[stroke]]); nb.clearPage(); assert.equal(nb.strokeCount, 0);
  nb.reset(); assert.equal(nb.pages.length, 1);
});

test('actual vector PDFs preserve curves, page count, paper and all page sizes', async () => {
  for (const sizeKey of ['a4', 'a4l', 'letter', 'letterl']) {
    const pdf = await createHandwritingPdf({ sizeKey, pages: [[stroke], [stroke]] }, { paper: 'ruled' });
    assert.equal(pdf.getNumberOfPages(), 2);
    const width = pdf.internal.pageSize.getWidth();
    const height = pdf.internal.pageSize.getHeight();
    assert.equal(width > height, sizeKey.endsWith('l'));
    const output = pdf.output();
    assert.ok(output.startsWith('%PDF-'));
    assert.match(output, / c\n/); // Actual cubic path, not a raster screenshot.
    assert.match(output, /%%EOF/);
  }
});

test('typed PDFs contain selectable text and create continuation pages', async () => {
  const pdf = await createTextPdf([{ index: 0, text: Array(150).fill('Selectable test text').join('\n') }], { sizeKey: 'a4', font: 'helvetica', fontSize: 12 });
  assert.ok(pdf.getNumberOfPages() >= 3);
  assert.match(pdf.output(), /Selectable test text/);
});

test('export actions save valid handwriting and typed PDF files', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'airwrite-export-'));
  const handwriting = join(directory, 'handwriting.pdf');
  const typed = join(directory, 'typed.pdf');
  try {
    await exportPdf({ sizeKey: 'a4', pages: [[stroke]] }, { filename: handwriting });
    await exportTextPdf([{ index: 0, text: 'PDF export verified' }], { sizeKey: 'a4', filename: typed });
    for (const file of [handwriting, typed]) {
      const bytes = readFileSync(file);
      assert.ok(bytes.length > 1000); assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    }
  } finally {
    rmSync(handwriting, { force: true }); rmSync(typed, { force: true }); rmdirSync(directory);
  }
});

test('library saves, reopens, renames, moves and invalidates changed transcripts', () => {
  storage.clear();
  const section = library.createSection('Testing');
  const doc = library.saveDoc({ title: 'Test notebook', sectionId: section.id, sizeKey: 'a4', paper: 'grid', pages: [[stroke], []] });
  assert.equal(doc.pages.length, 1);
  library.requestOpen(doc.id); assert.equal(library.takeOpenRequest().id, doc.id); assert.equal(library.takeOpenRequest(), null);
  library.renameDoc(doc.id, 'Renamed'); library.moveDoc(doc.id, null);
  assert.equal(library.getDoc(doc.id).title, 'Renamed'); assert.equal(library.getDoc(doc.id).sectionId, null);
  library.setTranscript(doc.id, [{ index: 0, text: 'old' }]);
  library.saveDoc({ ...doc, pages: [[{ ...stroke, width: 2 }]] });
  assert.equal(library.getDoc(doc.id).transcript, undefined);
  library.deleteSection(section.id); library.deleteDoc(doc.id); assert.equal(library.readLibrary().docs.length, 0);
  storage.clear(); assert.deepEqual(library.readLibrary(), { sections: [], docs: [] });
});

test('tracker falls back from GPU to CPU and enforces increasing timestamps', async () => {
  const delegates = []; const timestamps = [];
  globalThis.visionFactory = async (options) => {
    delegates.push(options.baseOptions.delegate);
    if (options.baseOptions.delegate === 'GPU') throw new Error('WebGL unavailable');
    return { detectForVideo: (_, ts) => { timestamps.push(ts); return { landmarks: [] }; }, setOptions: async () => {}, close() {} };
  };
  const tracker = await createTracker();
  const video = { videoWidth: 640, readyState: 4 };
  tracker.detect(video, 10); tracker.detect(video, 10); tracker.detect(video, 9);
  assert.deepEqual(delegates, ['GPU', 'CPU']); assert.deepEqual(timestamps, [10, 11, 12]);
  await tracker.setConfidence(.6); tracker.close();
});

test('camera hook releases streams on stop/failure, commits ink, retries and cancels pending startup', async () => {
  storage.clear(); let api; let view; const tracks = []; let failVision = false; let pending;
  const stream = () => { const track = { stopped: false, stop() { this.stopped = true; } }; tracks.push(track); return { getTracks: () => [track] }; };
  const mediaDevices = {
    enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'camera-1', label: 'Camera' }],
    getUserMedia: async () => pending ? await pending : stream(),
    addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices } });
  globalThis.visionFactory = async () => {
    if (failVision) throw new Error('Model unavailable');
    return { detectForVideo: () => ({ landmarks: [] }), setOptions: async () => {}, close() {} };
  };
  function Harness() { api = useAirNotebook(); return React.createElement(React.Fragment, null,
    React.createElement('video', { ref: api.refs.topVideo }), React.createElement('video', { ref: api.refs.sideVideo }), React.createElement('canvas', { ref: api.refs.pageCanvas })); }
  await act(async () => { view = create(React.createElement(Harness), { createNodeMock: (node) => node.type === 'video' ? { videoWidth: 640, readyState: 4, play: async () => {} } : { getContext: () => null } }); });
  failVision = true;
  await act(async () => { await api.start(); });
  assert.equal(api.runtime.phase, 'error'); assert.ok(tracks.every((t) => t.stopped));
  failVision = false;
  await act(async () => { await api.start(); });
  assert.equal(api.runtime.phase, 'live'); assert.equal(api.settings.trigger, 'pinch');
  await act(async () => {
    api.notebookRef.current.begin({ x: .1, y: .1 }, stroke); api.notebookRef.current.extend({ x: .4, y: .4 }); api.stop();
  });
  assert.equal(api.notebookRef.current.isDrawing, false); assert.equal(api.notebookRef.current.strokeCount, 1);
  assert.equal(api.runtime.phase, 'idle'); assert.ok(tracks.every((t) => t.stopped));
  let resolvePending; pending = new Promise((resolve) => { resolvePending = resolve; });
  let startup;
  await act(async () => { startup = api.start(); });
  await act(async () => { api.stop(); resolvePending(stream()); await startup; });
  assert.equal(api.runtime.phase, 'idle'); assert.ok(tracks.every((t) => t.stopped));
  pending = null;
  await act(async () => { await api.start(); }); assert.equal(api.runtime.phase, 'live');
  await act(async () => { api.setSettings({ topDevice: 'different' }); });
  assert.equal(api.runtime.phase, 'idle'); assert.ok(tracks.every((t) => t.stopped));
  await act(async () => { view.unmount(); });
});

test('tracking frames draw with always, pinch, space and side-height triggers', async () => {
  storage.clear(); let api; let view; let topHand = null; let sideHand = null;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {
    enumerateDevices: async () => ['top', 'side'].map((deviceId) => ({ kind: 'videoinput', deviceId, label: deviceId })),
    getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
    addEventListener() {}, removeEventListener() {},
  } } });
  let trackerIndex = 0;
  globalThis.visionFactory = async () => {
    const side = trackerIndex++ === 1;
    return { detectForVideo: () => { const hand = side ? sideHand : topHand; return { landmarks: hand ? [hand] : [] }; }, setOptions: async () => {}, close() {} };
  };
  function Harness() { api = useAirNotebook(); return React.createElement(React.Fragment, null,
    React.createElement('video', { ref: api.refs.topVideo }), React.createElement('video', { ref: api.refs.sideVideo }), React.createElement('canvas', { ref: api.refs.pageCanvas })); }
  await act(async () => { view = create(React.createElement(Harness), { createNodeMock: (node) => node.type === 'video' ? { videoWidth: 640, readyState: 4, play: async () => {} } : { getContext: () => null } }); });
  await act(async () => { api.setSettings({ sideDevice: 'side', topMirror: false }); });
  await act(async () => { await api.start(); });
  assert.equal(api.runtime.phase, 'live');
  const hand = (x, thumb = x + .01) => {
    const lm = Array.from({ length: 21 }, () => ({ x: .5, y: .5, z: 0 }));
    lm[0].y = .8; lm[9].y = .6; lm[8] = { x, y: .5, z: 0 }; lm[4] = { x: thumb, y: .5, z: 0 }; return lm;
  };
  let now = 1000;
  const tick = async () => { await act(async () => { frame(now += 130); }); };
  await act(async () => { api.setSettings({ trigger: 'always' }); });
  topHand = hand(.4); await tick(); topHand = hand(.6); await tick(); topHand = null; await tick();
  assert.equal(api.notebookRef.current.strokeCount, 1); assert.equal(api.notebookRef.current.isDrawing, false);
  await act(async () => { api.setSettings({ trigger: 'pinch' }); });
  topHand = hand(.4); await tick(); topHand = hand(.6); await tick(); topHand = hand(.6, .95); await tick();
  assert.equal(api.notebookRef.current.strokeCount, 2); assert.equal(api.notebookRef.current.isDrawing, false);
  await act(async () => { api.setSettings({ trigger: 'hold' }); });
  const key = (type) => { const event = new Event(type); Object.assign(event, { code: 'Space', key: ' ' }); events.dispatchEvent(event); };
  key('keydown'); topHand = hand(.4); await tick(); topHand = hand(.6); await tick(); key('keyup'); await tick();
  assert.equal(api.notebookRef.current.strokeCount, 3);
  await act(async () => { api.setSettings({ trigger: 'height' }); });
  sideHand = hand(.5); sideHand[8].y = .69;
  topHand = hand(.4); await tick(); topHand = hand(.6); await tick(); sideHand[8].y = .5; await tick();
  assert.equal(api.notebookRef.current.strokeCount, 4); assert.equal(api.notebookRef.current.isDrawing, false);
  // Outside the calibrated box must never ink.
  topHand = hand(.99); await act(async () => { api.setSettings({ trigger: 'always' }); }); await tick();
  assert.equal(api.notebookRef.current.strokeCount, 4);
  await act(async () => { api.stop(); view.unmount(); });
});

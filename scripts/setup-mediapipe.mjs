// Vendors the MediaPipe runtime so the app works offline and doesn't depend on
// a third-party CDN at runtime:
//   - wasm bundle  <- node_modules (copy, no network)
//   - hand model   <- Google storage (download, ~7.5 MB, cached in public/)
// Both steps fail soft; src/lib/tracker.ts falls back to the CDN if a local
// asset is missing.
import { cp, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const exists = (p) => stat(p).then(() => true, () => false);

async function copyWasm() {
  const dest = path.join(root, 'public/mediapipe/wasm');
  if (await exists(path.join(dest, 'vision_wasm_internal.wasm'))) return 'cached';
  const pkg = path.join(root, 'node_modules/@mediapipe/tasks-vision');
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(path.join(pkg, 'wasm'), dest, { recursive: true });
  return 'copied';
}

async function fetchModel() {
  const dest = path.join(root, 'public/models/hand_landmarker.task');
  if (await exists(dest)) return 'cached';
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return 'downloaded';
}

for (const [label, task] of [['wasm', copyWasm], ['model', fetchModel]]) {
  try {
    console.log(`[mediapipe] ${label}: ${await task()}`);
  } catch (err) {
    console.warn(`[mediapipe] ${label} unavailable (${err.message}) — will fall back to the CDN`);
  }
}

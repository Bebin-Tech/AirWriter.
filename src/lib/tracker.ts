import type { HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';

export type Landmarks = NormalizedLandmark[];

export const TIP = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 } as const;

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const LOCAL_WASM = '/mediapipe/wasm';
const LOCAL_MODEL = '/models/hand_landmarker.task';
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const reachable = (url: string) =>
  fetch(url, { method: 'HEAD' }).then((r) => r.ok, () => false);

type Vision = Awaited<ReturnType<typeof loadVision>>;
let visionPromise: Promise<Vision> | null = null;

async function loadVision() {
  const mod = await import('@mediapipe/tasks-vision');
  // Assets are vendored into public/ by scripts/setup-mediapipe.mjs; fall back
  // to the CDN if that step was skipped or failed.
  const wasmBase = (await reachable(`${LOCAL_WASM}/vision_wasm_internal.wasm`))
    ? LOCAL_WASM
    : `${CDN}/wasm`;
  const modelPath = (await reachable(LOCAL_MODEL)) ? LOCAL_MODEL : CDN_MODEL;
  const fileset = await mod.FilesetResolver.forVisionTasks(wasmBase);
  return { mod, fileset, modelPath };
}

export type Tracker = {
  detect(video: HTMLVideoElement, tsMs: number): Landmarks | null;
  setConfidence(c: number): void;
  close(): void;
};

export async function createTracker(minConfidence = 0.4): Promise<Tracker> {
  visionPromise ??= loadVision();
  const { mod, fileset, modelPath } = await visionPromise;

  const landmarker: HandLandmarker = await mod.HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelPath, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: minConfidence,
    minHandPresenceConfidence: minConfidence,
    minTrackingConfidence: minConfidence,
  });

  let lastTs = -1;
  return {
    detect(video, tsMs) {
      if (!video.videoWidth) return null;
      // VIDEO mode rejects non-increasing timestamps; two trackers share a clock.
      const ts = tsMs <= lastTs ? lastTs + 1 : tsMs;
      lastTs = ts;
      return landmarker.detectForVideo(video, ts).landmarks?.[0] ?? null;
    },
    setConfidence(c) {
      landmarker.setOptions({
        minHandDetectionConfidence: c,
        minHandPresenceConfidence: c,
        minTrackingConfidence: c,
      });
    },
    close() { landmarker.close(); },
  };
}

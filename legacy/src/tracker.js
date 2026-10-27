// Thin wrapper over MediaPipe Tasks-Vision HandLandmarker (hand_landmarker_lite,
// ~7MB, GPU delegate). One instance per camera; VIDEO running mode.

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export const TIP = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
export const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17],
];

let visionPromise = null;
function vision() {
  if (!visionPromise) {
    visionPromise = import(`${CDN}/vision_bundle.mjs`).then(async (m) => {
      const fileset = await m.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
      return { m, fileset };
    });
  }
  return visionPromise;
}

export async function createTracker({ minConfidence = 0.4 } = {}) {
  const { m, fileset } = await vision();
  const landmarker = await m.HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: minConfidence,
    minHandPresenceConfidence: minConfidence,
    minTrackingConfidence: minConfidence,
  });

  let lastTs = -1;
  return {
    /** @returns {{landmarks:Array<{x,y,z}>}|null} normalized landmarks, or null */
    detect(video, tsMs) {
      if (!video.videoWidth) return null;
      // MediaPipe requires strictly increasing timestamps in VIDEO mode.
      const ts = tsMs <= lastTs ? lastTs + 1 : tsMs;
      lastTs = ts;
      const res = landmarker.detectForVideo(video, ts);
      const lm = res?.landmarks?.[0];
      return lm ? { landmarks: lm } : null;
    },
    setConfidence(c) {
      landmarker.setOptions({
        minHandDetectionConfidence: c, minHandPresenceConfidence: c, minTrackingConfidence: c,
      });
    },
    close() { landmarker.close(); },
  };
}

export function drawHand(ctx, lm, { w, h, mirror, color = '#5b8cff' }) {
  const px = (p) => ({ x: (mirror ? 1 - p.x : p.x) * w, y: p.y * h });
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
  ctx.beginPath();
  for (const [a, b] of CONNECTIONS) {
    const p = px(lm[a]), q = px(lm[b]);
    ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();
  ctx.restore();
}

// Kör MediaPipes pose-modell i webbläsaren. Bilderna lämnar aldrig enheten:
// modellen laddas ned en gång och all analys sker lokalt (WebAssembly).

import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import type { ImageInput } from "./measure";

const LOCAL_BASE = "/mediapipe";
const CDN_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const CDN_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task";

let landmarker: Promise<PoseLandmarker> | null = null;

async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

async function create(): Promise<PoseLandmarker> {
  const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
  // Filerna ligger normalt hos appen själv; CDN används bara om de saknas.
  const [wasmLocal, modelLocal] = await Promise.all([
    reachable(`${LOCAL_BASE}/wasm/vision_wasm_internal.wasm`),
    reachable(`${LOCAL_BASE}/pose_landmarker.task`),
  ]);
  const vision = await FilesetResolver.forVisionTasks(wasmLocal ? `${LOCAL_BASE}/wasm` : CDN_WASM);
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: modelLocal ? `${LOCAL_BASE}/pose_landmarker.task` : CDN_MODEL,
      delegate: "CPU",
    },
    runningMode: "IMAGE",
    numPoses: 1,
    outputSegmentationMasks: true,
  });
}

/** Laddar modellen (en gång). Kastar om den inte går att hämta. */
export function loadPoseModel(): Promise<PoseLandmarker> {
  if (!landmarker) {
    landmarker = create().catch((err) => {
      landmarker = null;
      throw err;
    });
  }
  return landmarker;
}

/** Hittar kroppen i en bild. Returnerar null om ingen person hittas. */
export async function analyzeCanvas(canvas: HTMLCanvasElement): Promise<ImageInput | null> {
  const model = await loadPoseModel();
  const result = model.detect(canvas);
  try {
    const landmarks = result.landmarks?.[0];
    const mask = result.segmentationMasks?.[0];
    if (!landmarks || !mask) return null;
    return {
      landmarks: landmarks.map((l) => ({ x: l.x, y: l.y, z: l.z, visibility: l.visibility })),
      // Kopiera: maskens minne ägs av MediaPipe och frigörs nedan.
      mask: { data: new Float32Array(mask.getAsFloat32Array()), width: mask.width, height: mask.height },
      imageWidth: canvas.width,
      imageHeight: canvas.height,
    };
  } finally {
    result.segmentationMasks?.forEach((m) => m.close());
  }
}

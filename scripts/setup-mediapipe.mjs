// Kopierar MediaPipes WASM-filer till public/ och hämtar pose-modellen så att
// kroppsskanningen kan köras helt lokalt i webbläsaren (inga bilder skickas någonstans).
// Skriptet får aldrig stoppa en installation: saknas nätverk laddas modellen
// i stället direkt från Googles CDN första gången skanningen används.
import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wasmSrc = path.join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const outDir = path.join(root, "public", "mediapipe");
const modelPath = path.join(outDir, "pose_landmarker.task");
const MODEL_URL =
  process.env.POSE_MODEL_URL ??
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task";

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

try {
  await mkdir(outDir, { recursive: true });
  if (await exists(wasmSrc)) {
    await cp(wasmSrc, path.join(outDir, "wasm"), { recursive: true });
    console.log("[passform] MediaPipe WASM kopierad till public/mediapipe/wasm");
  } else {
    console.warn("[passform] Hittade inte MediaPipe WASM – kör npm install igen.");
  }
  if (!(await exists(modelPath))) {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await writeFile(modelPath, Buffer.from(await res.arrayBuffer()));
    console.log("[passform] Pose-modell nedladdad till public/mediapipe/pose_landmarker.task");
  }
} catch (err) {
  console.warn(`[passform] Kunde inte förbereda MediaPipe lokalt (${err?.message ?? err}). Appen använder CDN som reserv.`);
}

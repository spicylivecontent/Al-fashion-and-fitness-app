// Läser in bilder och filmklipp till canvas-bilder för analys. Allt sker i
// webbläsarens minne; ingenting laddas upp eller sparas.

const MAX_SIDE = 1280;
const MAX_VIDEO_FRAMES = 14;

function toCanvas(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function imageToCanvas(file: File): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Bildformatet kan inte läsas i den här webbläsaren. Prova JPEG eller PNG.");
  }
  try {
    return toCanvas(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

function once(target: EventTarget, event: string, errorEvent = "error"): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error("Filmklippet kunde inte läsas."));
    };
    const cleanup = () => {
      target.removeEventListener(event, ok);
      target.removeEventListener(errorEvent, fail);
    };
    target.addEventListener(event, ok);
    target.addEventListener(errorEvent, fail);
  });
}

/**
 * Plockar ut jämnt fördelade stillbilder ur ett filmklipp. Snurrar man långsamt
 * ett varv framför kameran ger det både fram-, bak- och sidovyer.
 */
export async function* videoFrames(file: File): AsyncGenerator<{ canvas: HTMLCanvasElement; index: number; total: number }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await once(video, "loadeddata");
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const total = Math.max(1, Math.min(MAX_VIDEO_FRAMES, Math.round(duration * 2)));
    for (let i = 0; i < total; i++) {
      const time = duration * ((i + 0.5) / total);
      if (Math.abs(video.currentTime - time) > 0.01) {
        video.currentTime = time;
        await once(video, "seeked");
      }
      yield { canvas: toCanvas(video, video.videoWidth, video.videoHeight), index: i, total };
    }
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

// Automatisk täckning av intima områden i förhandsvisningen av uppladdade bilder.
//
// Originalbilden visas aldrig. Det enda som ritas ut är en liten, suddad kopia
// där könsorgan – och bröst hos kvinnor – är täckta av heltäckande block.
// Hittas ingen kropp i bilden pixlas hela bilden i stället, så att inget
// otäckt kan slinka igenom.

import type { Sex } from "../types";
import { LM, type Landmark } from "./measure";

export interface Box {
  /** Bildpixlar. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Områden som ska täckas, i bildpixlar. Fungerar för både fram-, bak- och sidovy:
 * blocken tar höjd för att kroppen kan vara vriden åt vilket håll som helst.
 */
export function censorBoxes(landmarks: Landmark[], sex: Sex, imageWidth: number, imageHeight: number): Box[] {
  if (landmarks.length < 33) return [];
  const pt = (i: number) => ({ x: landmarks[i].x * imageWidth, y: landmarks[i].y * imageHeight });
  const ls = pt(LM.leftShoulder);
  const rs = pt(LM.rightShoulder);
  const lh = pt(LM.leftHip);
  const rh = pt(LM.rightHip);
  const nose = pt(LM.nose);
  const ankleY = Math.max(pt(LM.leftAnkle).y, pt(LM.rightAnkle).y);

  const shoulderY = (ls.y + rs.y) / 2;
  const hipY = (lh.y + rh.y) / 2;
  const torso = Math.max(hipY - shoulderY, 1);
  // Kroppslängd i pixlar: från benen om de syns, annars från bålen.
  const bodyH = Math.max((ankleY - nose.y) / 0.88, torso / 0.29);

  const boxes: Box[] = [];
  const hipX = (lh.x + rh.x) / 2;
  const pelvisHalf = Math.max(Math.abs(lh.x - rh.x) * 0.85, 0.085 * bodyH);
  boxes.push({
    x: hipX - pelvisHalf,
    y: hipY - 0.05 * bodyH,
    width: pelvisHalf * 2,
    height: 0.16 * bodyH,
  });

  if (sex === "female") {
    const shoulderX = (ls.x + rs.x) / 2;
    const chestHalf = Math.max(Math.abs(ls.x - rs.x) * 0.56, 0.1 * bodyH);
    boxes.push({
      x: shoulderX - chestHalf,
      y: shoulderY + 0.14 * torso,
      width: chestHalf * 2,
      height: 0.46 * torso,
    });
  }
  return boxes;
}

const PREVIEW_HEIGHT = 240;

/**
 * Ritar den täckta förhandsvisningen och returnerar den som data-URL.
 * landmarks = null betyder att ingen kropp hittades: då pixlas allt.
 */
export function renderCensoredPreview(source: HTMLCanvasElement, landmarks: Landmark[] | null, sex: Sex): string {
  const scale = PREVIEW_HEIGHT / source.height;
  const w = Math.max(1, Math.round(source.width * scale));
  const h = PREVIEW_HEIGHT;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;

  // Sudda genom att rita via en mycket liten mellanbild.
  const factor = landmarks ? 3 : 14;
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(w / factor));
  small.height = Math.max(1, Math.round(h / factor));
  small.getContext("2d")!.drawImage(source, 0, 0, small.width, small.height);
  ctx.imageSmoothingEnabled = Boolean(landmarks);
  ctx.drawImage(small, 0, 0, w, h);

  if (landmarks) {
    ctx.fillStyle = "#1f2430";
    for (const box of censorBoxes(landmarks, sex, source.width, source.height)) {
      const x = box.x * scale;
      const y = box.y * scale;
      const bw = box.width * scale;
      const bh = box.height * scale;
      const r = Math.min(bw, bh) * 0.25;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + bw, y, x + bw, y + bh, r);
      ctx.arcTo(x + bw, y + bh, x, y + bh, r);
      ctx.arcTo(x, y + bh, x, y, r);
      ctx.arcTo(x, y, x + bw, y, r);
      ctx.closePath();
      ctx.fill();
    }
  }
  return out.toDataURL("image/jpeg", 0.7);
}

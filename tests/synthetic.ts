// Ritar en syntetisk siluett av kroppsmodellen, sedd framifrån eller från sidan,
// tillsammans med ledpunkter där MediaPipe skulle ha placerat dem. Används för
// att kontrollera att mätningen återskapar de mått som modellen byggdes från.

import { buildBodyModel } from "@/lib/avatar/model";
import type { ImageInput, Landmark } from "@/lib/scan/measure";
import type { BodyMeasurements, Sex } from "@/lib/types";

export function renderSynthetic(m: BodyMeasurements, sex: Sex, view: "front" | "side", pxPerCm = 4): ImageInput {
  const model = buildBodyModel(m, sex);
  const H = m.heightCm;
  const margin = 20;
  const width = Math.round(120 * pxPerCm);
  const height = Math.round(H * pxPerCm) + margin * 2;
  const cx = width / 2;
  const toX = (v: number) => cx + v * pxPerCm;
  const toY = (y: number) => margin + (H - y) * pxPerCm;
  const data = new Float32Array(width * height);

  const [px, py, pz] = model.armPivot;
  const sin = Math.sin(model.armAngle);
  const cos = Math.cos(model.armAngle);
  const L = model.levels;

  const inside = (u: number, y: number): boolean => {
    // u = x framifrån, z från sidan.
    const front = view === "front";
    if (y >= L.torsoBottom && y <= L.neckTop) {
      const r = model.torso(y);
      if (front ? Math.abs(u - r.x) <= r.a : Math.abs(u - r.z) <= r.b) return true;
    }
    if (y >= 0.018 * H && y <= L.hip) {
      const r = model.leg(y);
      if (front ? Math.abs(Math.abs(u) - r.x) <= r.a : Math.abs(u - r.z) <= r.b) return true;
    }
    const ell = (c: number, cy: number, ru: number, ry: number, value = u) =>
      ((value - c) / ru) ** 2 + ((y - cy) / ry) ** 2 <= 1;
    const head = model.head;
    if (front ? ell(head.center[0], head.center[1], head.radii[0], head.radii[1]) : ell(head.center[2], head.center[1], head.radii[2], head.radii[1])) return true;
    const foot = model.foot;
    if (front ? ell(foot.center[0], foot.center[1], foot.radii[0], foot.radii[1], Math.abs(u)) : ell(foot.center[2], foot.center[1], foot.radii[2], foot.radii[1])) return true;
    // Armar.
    const reach = model.armLength + 0.1 * H;
    if (front) {
      const dx = Math.abs(u) - px;
      const dy = y - py;
      const along = dx * sin - dy * cos;
      const across = Math.abs(dx * cos + dy * sin);
      if (along >= -2 && along <= reach && across <= model.armRadius(Math.min(1, Math.max(0, along / model.armLength)))) return true;
    } else {
      const along = (py - y) / cos;
      if (along >= 0 && along <= reach && Math.abs(u - pz) <= model.armRadius(Math.min(1, along / model.armLength))) return true;
    }
    return false;
  };

  for (let iy = 0; iy < height; iy++) {
    const y = H - (iy + 0.5 - margin) / pxPerCm;
    for (let ix = 0; ix < width; ix++) {
      if (inside((ix + 0.5 - cx) / pxPerCm, y)) data[iy * width + ix] = 1;
    }
  }

  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  const set = (i: number, u: number, y: number) => {
    lm[i] = { x: toX(u) / width, y: toY(y) / height, visibility: 1 };
  };
  const front = view === "front";
  const jointX = m.shoulderWidth / 1.12 / 2;
  const legX = model.leg(L.crotch).x;
  const sideU = (xFront: number, z: number) => (front ? xFront : z);
  const head = model.head;
  set(0, sideU(0, head.center[2] + head.radii[2]), 0.925 * H);
  // Ledpunkterna följer skelettet: axelleden sitter en bit innanför axelspetsen,
  // och sträckan axelled–handled är därför något kortare än ärmlängden.
  const armPoint = (t: number): [number, number] => [
    jointX + (sin * t * model.armLength) / 1.04,
    0.8 * H - (cos * t * model.armLength) / 1.04,
  ];
  // Personens vänstra sida (index 11, 13, …) hamnar till höger i en bild tagen framifrån.
  for (const [side, offset] of [[1, 0], [-1, 1]] as const) {
    set(11 + offset, sideU(side * jointX, pz), 0.8 * H);
    const [ex, ey] = armPoint(0.5);
    const [wx, wy] = armPoint(1);
    set(13 + offset, sideU(side * ex, pz), ey);
    set(15 + offset, sideU(side * wx, pz), wy);
    set(23 + offset, sideU(side * legX, model.torso(L.hip).z), L.hip);
    const knee = model.leg(L.knee);
    const ankle = model.leg(L.ankle);
    set(25 + offset, sideU(side * knee.x, knee.z), L.knee);
    set(27 + offset, sideU(side * ankle.x, ankle.z), L.ankle);
    set(29 + offset, sideU(side * ankle.x, ankle.z - 3), 0.012 * H);
    set(31 + offset, sideU(side * ankle.x, ankle.z + 0.1 * H), 0.008 * H);
  }
  return { landmarks: lm, mask: { data, width, height }, imageWidth: width, imageHeight: height };
}

// Mäter kroppen i en enskild bild utifrån siluett (segmenteringsmask) och ledpunkter.
//
// Principen: personens längd är känd, så avståndet hjässa–häl i bilden ger skalan
// (cm per pixel). Framifrån mäts bredder, från sidan mäts djup. Bredd + djup räknas
// sedan om till omkrets i aggregate.ts.
//
// Allt här är rena funktioner utan webbläsarberoenden, så de går att enhetstesta.

export interface Landmark {
  /** Normaliserade bildkoordinater 0–1. */
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface Mask {
  /** Sannolikhet 0–1 (Float32Array) eller 0–255 (Uint8Array) att pixeln tillhör personen. */
  data: Float32Array | Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ImageInput {
  landmarks: Landmark[];
  mask: Mask;
  imageWidth: number;
  imageHeight: number;
}

export type View = "front" | "back" | "side" | "oblique";

export type WidthKey = "chest" | "waist" | "hip" | "thigh" | "calf" | "bicep";
export type DepthKey = "chest" | "waist" | "hip" | "thigh" | "calf";
export type LengthKey = "shoulderWidth" | "inseam" | "armLength";

export interface ImageMeasurement {
  ok: boolean;
  view: View;
  cmPerPx: number;
  /** Problem med bilden, formulerade för användaren. */
  issues: string[];
  /** Armarna ligger mot kroppen så att bål och armar inte går att skilja åt. */
  armsMerged: boolean;
  widths: Partial<Record<WidthKey, number>>;
  depths: Partial<Record<DepthKey, number>>;
  lengths: Partial<Record<LengthKey, number>>;
  /** Hjässa och häl i normaliserade koordinater – används bl.a. för att täcka bilden. */
  topY: number;
  bottomY: number;
}

// Index i MediaPipes 33-punktsmodell.
export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFoot: 31,
  rightFoot: 32,
} as const;

interface Pt {
  x: number;
  y: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const midPt = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export function median(values: number[]): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
}

function smooth(values: number[], radius = 2): number[] {
  return values.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j++) {
      sum += values[j];
      n++;
    }
    return sum / n;
  });
}

const THRESHOLD = 0.5;

/** Samplar masken med bilinjär interpolation, i bildens pixelkoordinater. */
function makeSampler(mask: Mask, imageWidth: number, imageHeight: number) {
  const { data, width, height } = mask;
  const scale = data instanceof Float32Array ? 1 : 1 / 255;
  const kx = width / imageWidth;
  const ky = height / imageHeight;
  const at = (ix: number, iy: number) => {
    if (ix < 0 || iy < 0 || ix >= width || iy >= height) return 0;
    return data[iy * width + ix] * scale;
  };
  return (x: number, y: number): number => {
    const fx = x * kx - 0.5;
    const fy = y * ky - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    return (
      at(x0, y0) * (1 - tx) * (1 - ty) +
      at(x0 + 1, y0) * tx * (1 - ty) +
      at(x0, y0 + 1) * (1 - tx) * ty +
      at(x0 + 1, y0 + 1) * tx * ty
    );
  };
}

type Sampler = ReturnType<typeof makeSampler>;

/**
 * Går från (x0, y0) i riktningen (dx, dy) tills siluetten tar slut.
 * Returnerar avståndet till kanten med delpixelprecision, eller null om
 * startpunkten ligger utanför siluetten. hitLimit = ingen kant inom maxDist.
 */
function scanRay(
  v: Sampler,
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  maxDist: number,
  step = 1,
): { d: number; hitLimit: boolean } | null {
  let prev = v(x0, y0);
  if (prev < THRESHOLD) return null;
  for (let d = step; d <= maxDist; d += step) {
    const cur = v(x0 + dx * d, y0 + dy * d);
    if (cur < THRESHOLD) {
      const frac = prev - cur > 1e-6 ? (prev - THRESHOLD) / (prev - cur) : 0;
      return { d: d - step + step * frac, hitLimit: false };
    }
    prev = cur;
  }
  return { d: maxDist, hitLimit: true };
}

interface Arm {
  /** +1 om armen ligger till höger om kroppens mittlinje i bilden, annars -1. */
  side: number;
  points: Pt[];
}

/** Armens x-läge på bildraden y, eller null om armen inte korsar raden. */
function armXAt(arm: Arm, y: number, centerX: number): number | null {
  let best: number | null = null;
  for (let i = 0; i < arm.points.length - 1; i++) {
    const p = arm.points[i];
    const q = arm.points[i + 1];
    const lo = Math.min(p.y, q.y);
    const hi = Math.max(p.y, q.y);
    if (y < lo || y > hi || hi - lo < 1e-6) continue;
    const x = lerp(p.x, q.x, (y - p.y) / (q.y - p.y));
    if (best === null || Math.abs(x - centerX) < Math.abs(best - centerX)) best = x;
  }
  return best;
}

interface Ctx {
  v: Sampler;
  p: Pt[];
  vis: number[];
  /** Personens höjd i pixlar. */
  H: number;
  cm: number;
  step: number;
  imageHeight: number;
}

function visible(ctx: Ctx, ...idx: number[]): boolean {
  return idx.every((i) => ctx.vis[i] >= 0.5);
}

/** Bredd för en kroppsdel som inte får räkna med armarna (bål och höft). */
function rowWidth(
  ctx: Ctx,
  y: number,
  startLeft: number,
  startRight: number,
  arms: Arm[],
  centerX: number,
): { width: number; merged: boolean } | null {
  const { v, H, step } = ctx;
  const maxDist = 0.3 * H;
  const armHalf = 0.03 * H;
  let merged = false;
  const edges: number[] = [];
  for (const [side, start] of [
    [-1, startLeft],
    [1, startRight],
  ] as const) {
    const run = scanRay(v, start, y, side, 0, maxDist, step);
    if (!run) return null;
    let edge = start + side * run.d;
    for (const arm of arms) {
      if (arm.side !== side) continue;
      const ax = armXAt(arm, y, centerX);
      if (ax === null) continue;
      const cap = ax - side * armHalf;
      // Siluetten fortsätter ut i armen: kapa vid armens insida.
      if ((edge - cap) * side > 0) {
        edge = (cap - centerX) * side > 0.02 * H ? cap : edge;
        merged = true;
      }
    }
    if (run.hitLimit) merged = true;
    edges.push(edge);
  }
  return { width: edges[1] - edges[0], merged };
}

function measureFront(ctx: Ctx, out: ImageMeasurement) {
  const { v, p, H, cm, step } = ctx;
  const sh = midPt(p[LM.leftShoulder], p[LM.rightShoulder]);
  const hp = midPt(p[LM.leftHip], p[LM.rightHip]);
  const L = hp.y - sh.y;
  if (L < 0.15 * H) {
    out.issues.push("Kunde inte hitta överkroppen i bilden.");
    return;
  }

  const arms: Arm[] = (
    [
      [LM.leftShoulder, LM.leftElbow, LM.leftWrist],
      [LM.rightShoulder, LM.rightElbow, LM.rightWrist],
    ] as const
  ).map(([s, e, w]) => {
    const S = p[s];
    const E = p[e];
    const W = p[w];
    const len = dist(E, W) || 1;
    // Förläng underarmen så att även handen räknas till armen.
    const tip = { x: W.x + ((W.x - E.x) / len) * 0.1 * H, y: W.y + ((W.y - E.y) / len) * 0.1 * H };
    return { side: S.x >= sh.x ? 1 : -1, points: [S, E, W, tip] };
  });

  const centerAt = (y: number) => lerp(sh.x, hp.x, clamp01((y - sh.y) / L));
  const torsoRows = (from: number, to: number) => {
    const rows: { t: number; width: number; merged: boolean }[] = [];
    for (let y = sh.y + from * L; y <= sh.y + to * L; y += step) {
      const cx = centerAt(y);
      const r = rowWidth(ctx, y, cx, cx, arms, cx);
      if (r) rows.push({ t: (y - sh.y) / L, ...r });
    }
    return rows;
  };

  // Bröst: medianbredd strax under armhålan.
  const chestRows = torsoRows(0.3, 0.44);
  if (chestRows.length) out.widths.chest = median(chestRows.map((r) => r.width)) * cm;

  // Midja: bålens smalaste ställe.
  const waistRows = torsoRows(0.56, 0.8);
  if (waistRows.length >= 3) {
    out.widths.waist = Math.min(...smooth(waistRows.map((r) => r.width))) * cm;
  }
  const mergedRows = [...chestRows, ...waistRows].filter((r) => r.merged).length;
  const totalRows = chestRows.length + waistRows.length;
  if (totalRows && mergedRows / totalRows > 0.35) {
    out.armsMerged = true;
    out.issues.push("Armarna ligger mot kroppen – håll ut dem en bit från sidorna.");
  }

  // Höft: bredaste stället kring höftleden. Mäts mellan ytterkanterna så att det
  // fungerar även nedanför grenen där benen delar sig.
  const leftIsRightSide = p[LM.leftHip].x >= hp.x;
  const hipL = leftIsRightSide ? p[LM.rightHip] : p[LM.leftHip];
  const hipR = leftIsRightSide ? p[LM.leftHip] : p[LM.rightHip];
  const hipWidths: number[] = [];
  for (let y = sh.y + 0.92 * L; y <= sh.y + 1.22 * L; y += step) {
    const r = rowWidth(ctx, y, hipL.x, hipR.x, arms, hp.x);
    if (r && !r.merged) hipWidths.push(r.width);
  }
  if (hipWidths.length >= 3) out.widths.hip = Math.max(...smooth(hipWidths)) * cm;

  out.lengths.shoulderWidth = dist(p[LM.leftShoulder], p[LM.rightShoulder]) * cm * 1.12;

  // Ben: lår strax under grenen, vad där den är som bredast.
  const kneeMid = midPt(p[LM.leftKnee], p[LM.rightKnee]);
  const ankleMid = midPt(p[LM.leftAnkle], p[LM.rightAnkle]);
  const thighs: number[] = [];
  const calves: number[] = [];
  for (const [h, k, a] of [
    [LM.leftHip, LM.leftKnee, LM.leftAnkle],
    [LM.rightHip, LM.rightKnee, LM.rightAnkle],
  ] as const) {
    if (!visible(ctx, h, k, a)) continue;
    const outer = p[h].x >= hp.x ? 1 : -1;
    const segment = (from: Pt, to: Pt, midFrom: Pt, midTo: Pt, t0: number, t1: number) => {
      const widths: number[] = [];
      for (let t = t0; t <= t1; t += step / Math.max(1, Math.abs(to.y - from.y))) {
        const y = lerp(from.y, to.y, t);
        const x = lerp(from.x, to.x, t);
        const o = scanRay(v, x, y, outer, 0, 0.14 * H, step);
        if (!o || o.hitLimit) continue;
        // Inåt: stanna vid kroppens mittlinje om benen ligger mot varandra.
        const toMid = Math.max(1, Math.abs(x - lerp(midFrom.x, midTo.x, t)));
        const i = scanRay(v, x, y, -outer, 0, toMid, step);
        if (!i) continue;
        widths.push(o.d + i.d);
      }
      return widths;
    };
    const thigh = segment(p[h], p[k], hp, kneeMid, 0.3, 0.4);
    if (thigh.length) thighs.push(median(thigh));
    const calf = segment(p[k], p[a], kneeMid, ankleMid, 0.15, 0.5);
    if (calf.length >= 3) calves.push(Math.max(...smooth(calf)));
  }
  if (thighs.length) out.widths.thigh = (thighs.reduce((s, x) => s + x, 0) / thighs.length) * cm;
  if (calves.length) out.widths.calf = (calves.reduce((s, x) => s + x, 0) / calves.length) * cm;

  // Överarm: bredd vinkelrätt mot armen, mitt emellan axel och armbåge.
  const biceps: number[] = [];
  const armLengths: number[] = [];
  for (const [s, e, w] of [
    [LM.leftShoulder, LM.leftElbow, LM.leftWrist],
    [LM.rightShoulder, LM.rightElbow, LM.rightWrist],
  ] as const) {
    if (!visible(ctx, s, e, w)) continue;
    armLengths.push((dist(p[s], p[e]) + dist(p[e], p[w])) * 1.04);
    const len = dist(p[s], p[e]);
    if (len < 0.05 * H) continue;
    const ux = (p[e].x - p[s].x) / len;
    const uy = (p[e].y - p[s].y) / len;
    const limit = 0.065 * H;
    const samples: number[] = [];
    for (const t of [0.42, 0.5, 0.58]) {
      const x = lerp(p[s].x, p[e].x, t);
      const y = lerp(p[s].y, p[e].y, t);
      const a = scanRay(v, x, y, -uy, ux, limit, step);
      const b = scanRay(v, x, y, uy, -ux, limit, step);
      if (a && b && !a.hitLimit && !b.hitLimit) samples.push(a.d + b.d);
    }
    if (samples.length) biceps.push(median(samples));
  }
  if (biceps.length) out.widths.bicep = (biceps.reduce((s, x) => s + x, 0) / biceps.length) * cm;
  if (armLengths.length) {
    out.lengths.armLength = (armLengths.reduce((s, x) => s + x, 0) / armLengths.length) * cm;
  }

  // Innerben: grenen är högsta punkten på glipan mellan benen.
  let crotch = Infinity;
  for (let x = hp.x - 0.012 * H; x <= hp.x + 0.012 * H; x += step) {
    const r = scanRay(v, x, hp.y, 0, 1, 0.16 * H, step);
    if (r && !r.hitLimit) crotch = Math.min(crotch, hp.y + r.d);
  }
  const drop = (crotch - hp.y) / H;
  if (Number.isFinite(crotch) && drop > 0.015 && drop < 0.13 && v(hp.x, crotch + 0.03 * H) < THRESHOLD) {
    out.lengths.inseam = (out.bottomY * ctx.imageHeight - crotch) * cm;
  } else {
    out.issues.push("Stå med benen lite isär så att innerbenet kan mätas.");
  }
}

function measureSide(ctx: Ctx, out: ImageMeasurement) {
  const { v, p, H, cm, step } = ctx;
  const sh = midPt(p[LM.leftShoulder], p[LM.rightShoulder]);
  const hp = midPt(p[LM.leftHip], p[LM.rightHip]);
  const L = hp.y - sh.y;
  if (L < 0.15 * H) {
    out.issues.push("Kunde inte hitta överkroppen i bilden.");
    return;
  }
  const depthAt = (x: number, y: number): number | null => {
    // Ledpunkterna är osäkrare i profil: leta upp siluetten om mittpunkten hamnat utanför.
    let cx = x;
    if (v(cx, y) < THRESHOLD) {
      let found = false;
      for (let d = step; d <= 0.06 * H && !found; d += step) {
        for (const s of [-1, 1]) {
          if (v(x + s * d, y) >= THRESHOLD) {
            cx = x + s * d;
            found = true;
            break;
          }
        }
      }
      if (!found) return null;
    }
    const a = scanRay(v, cx, y, -1, 0, 0.3 * H, step);
    const b = scanRay(v, cx, y, 1, 0, 0.3 * H, step);
    if (!a || !b || a.hitLimit || b.hitLimit) return null;
    return a.d + b.d;
  };
  const torso = (from: number, to: number) => {
    const depths: number[] = [];
    for (let y = sh.y + from * L; y <= sh.y + to * L; y += step) {
      const d = depthAt(lerp(sh.x, hp.x, clamp01((y - sh.y) / L)), y);
      if (d !== null) depths.push(d);
    }
    return depths;
  };
  const chest = torso(0.28, 0.46);
  if (chest.length) out.depths.chest = percentile(smooth(chest), 0.8) * cm;
  const waist = torso(0.6, 0.76);
  if (waist.length) out.depths.waist = median(waist) * cm;
  const hip = torso(0.92, 1.2);
  if (hip.length >= 3) out.depths.hip = Math.max(...smooth(hip)) * cm;

  const knee = midPt(p[LM.leftKnee], p[LM.rightKnee]);
  const ankle = midPt(p[LM.leftAnkle], p[LM.rightAnkle]);
  const leg = (from: Pt, to: Pt, t0: number, t1: number) => {
    const depths: number[] = [];
    for (let t = t0; t <= t1; t += step / Math.max(1, Math.abs(to.y - from.y))) {
      const d = depthAt(lerp(from.x, to.x, t), lerp(from.y, to.y, t));
      if (d !== null) depths.push(d);
    }
    return depths;
  };
  const thigh = leg(hp, knee, 0.3, 0.4);
  if (thigh.length) out.depths.thigh = median(thigh) * cm;
  const calf = leg(knee, ankle, 0.15, 0.5);
  if (calf.length >= 3) out.depths.calf = Math.max(...smooth(calf)) * cm;
}

/** Rimlighetsgränser som andel av kroppslängden – allt utanför kastas. */
const WIDTH_BOUNDS: Record<WidthKey, [number, number]> = {
  chest: [0.13, 0.34],
  waist: [0.1, 0.36],
  hip: [0.14, 0.36],
  thigh: [0.06, 0.2],
  calf: [0.04, 0.12],
  bicep: [0.035, 0.12],
};
const DEPTH_BOUNDS: Record<DepthKey, [number, number]> = {
  chest: [0.09, 0.28],
  waist: [0.08, 0.34],
  hip: [0.09, 0.3],
  thigh: [0.06, 0.2],
  calf: [0.04, 0.12],
};
const LENGTH_BOUNDS: Record<LengthKey, [number, number]> = {
  shoulderWidth: [0.17, 0.33],
  inseam: [0.38, 0.53],
  armLength: [0.26, 0.4],
};

function prune<K extends string>(
  values: Partial<Record<K, number>>,
  bounds: Record<K, [number, number]>,
  heightCm: number,
) {
  for (const key of Object.keys(values) as K[]) {
    const value = values[key];
    const [lo, hi] = bounds[key];
    if (value === undefined || !Number.isFinite(value) || value < lo * heightCm || value > hi * heightCm) {
      delete values[key];
    }
  }
}

/** Mäter en bild. heightCm är personens verkliga längd. */
export function measureImage(input: ImageInput, heightCm: number): ImageMeasurement {
  const { landmarks, mask, imageWidth, imageHeight } = input;
  const out: ImageMeasurement = {
    ok: false,
    view: "oblique",
    cmPerPx: 0,
    issues: [],
    armsMerged: false,
    widths: {},
    depths: {},
    lengths: {},
    topY: 0,
    bottomY: 1,
  };
  if (landmarks.length < 33) {
    out.issues.push("Ingen person hittades i bilden.");
    return out;
  }
  const p: Pt[] = landmarks.map((l) => ({ x: l.x * imageWidth, y: l.y * imageHeight }));
  const vis = landmarks.map((l) => l.visibility ?? 1);
  const v = makeSampler(mask, imageWidth, imageHeight);
  const step = Math.max(1, imageHeight / mask.height);

  const required = [
    LM.nose,
    LM.leftShoulder,
    LM.rightShoulder,
    LM.leftHip,
    LM.rightHip,
    LM.leftKnee,
    LM.rightKnee,
    LM.leftAnkle,
    LM.rightAnkle,
  ];
  if (required.some((i) => vis[i] < 0.5)) {
    out.issues.push("Hela kroppen måste synas, från huvud till fötter.");
    return out;
  }

  const ankleY = Math.max(p[LM.leftAnkle].y, p[LM.rightAnkle].y);
  const approxH = (ankleY - p[LM.nose].y) / 0.88;
  if (approxH < 0.3 * imageHeight) {
    out.issues.push("Du står för långt bort – fyll bilden på höjden.");
    return out;
  }

  // Hjässan: första raden med siluett ovanför näsan.
  let top = -1;
  const headHalf = 0.07 * approxH;
  for (let y = Math.max(0, p[LM.nose].y - 0.2 * approxH); y < p[LM.nose].y && top < 0; y += step) {
    for (let x = p[LM.nose].x - headHalf; x <= p[LM.nose].x + headHalf; x += step) {
      if (v(x, y) >= THRESHOLD) {
        top = y;
        break;
      }
    }
  }
  if (top < 0) top = p[LM.nose].y - 0.08 * approxH;
  if (top <= step * 1.5) out.issues.push("Huvudet är avklippt i överkant.");

  // Golvet: hälarna (tårna pekar mot kameran och hamnar lägre i bilden).
  const heelsVisible = vis[LM.leftHeel] >= 0.4 && vis[LM.rightHeel] >= 0.4;
  let bottom = heelsVisible
    ? Math.max(p[LM.leftHeel].y, p[LM.rightHeel].y) + 0.012 * approxH
    : ankleY + 0.045 * approxH;
  if (bottom >= imageHeight - 1) {
    out.issues.push("Fötterna är avklippta i nederkant.");
    bottom = imageHeight - 1;
  }

  const H = bottom - top;
  const cm = heightCm / H;
  out.cmPerPx = cm;
  out.topY = top / imageHeight;
  out.bottomY = bottom / imageHeight;

  // Vy: avståndet mellan axlarna respektive höfterna avslöjar hur personen är vriden.
  const shoulderSpan = Math.abs(p[LM.leftShoulder].x - p[LM.rightShoulder].x) / H;
  const hipSpan = Math.abs(p[LM.leftHip].x - p[LM.rightHip].x) / H;
  if (shoulderSpan >= 0.16 && hipSpan >= 0.07) {
    // Framifrån hamnar personens vänstra axel till höger i bilden.
    out.view = p[LM.leftShoulder].x > p[LM.rightShoulder].x ? "front" : "back";
  } else if (shoulderSpan <= 0.08 && hipSpan <= 0.05) {
    out.view = "side";
  } else {
    out.view = "oblique";
    out.issues.push("Vinkeln är varken rakt framifrån eller rakt från sidan.");
    return out;
  }

  const ctx: Ctx = { v, p, vis, H, cm, step, imageHeight };
  if (out.view === "side") measureSide(ctx, out);
  else measureFront(ctx, out);

  prune(out.widths, WIDTH_BOUNDS, heightCm);
  prune(out.depths, DEPTH_BOUNDS, heightCm);
  prune(out.lengths, LENGTH_BOUNDS, heightCm);
  out.ok =
    Object.keys(out.widths).length + Object.keys(out.depths).length + Object.keys(out.lengths).length > 0;
  return out;
}

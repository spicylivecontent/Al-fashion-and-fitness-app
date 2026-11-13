// Parametrisk kroppsmodell. Kroppen beskrivs som tvärsnitt (ringar) längs bål, ben
// och armar, härledda ur kroppsmåtten. Samma ringar används för 3D-avataren och
// för plaggen (som är samma ringar plus rörelsevidd), så att ett plagg alltid
// ritas i rätt förhållande till kroppen.
//
// Modellen är en neutral skyltdocka: den har inga anatomiska detaljer alls, och
// den bär alltid underkläder. Inga foton används som textur.
//
// Koordinater i centimeter: y uppåt från golvet, x åt personens vänster, z framåt.

import { SECTION_EXPONENT, superellipsePerimeter } from "../body/superellipse";
import type { BodyMeasurements, Sex } from "../types";

export interface Ring {
  x: number;
  y: number;
  z: number;
  /** Halv bredd (x-led). */
  a: number;
  /** Halvt djup (z-led). */
  b: number;
  /** Superellipsens exponent. */
  n: number;
}

/** Monoton kubisk interpolation (PCHIP) – mjuka kurvor utan översläng. */
export function pchip(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  const h: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    d.push((ys[i + 1] - ys[i]) / h[i]);
  }
  const m = new Array<number>(n).fill(0);
  if (n === 2) {
    m[0] = m[1] = d[0];
  } else {
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) {
        m[i] = 0;
      } else {
        const w1 = 2 * h[i] + h[i - 1];
        const w2 = h[i] + 2 * h[i - 1];
        m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
      }
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i];
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h[i] * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h[i] * m[i + 1]
    );
  };
}

interface Key {
  y: number;
  a: number;
  b: number;
  z: number;
  n: number;
  x?: number;
}

function profile(keys: Key[]): (y: number) => Ring {
  const sorted = [...keys].sort((p, q) => p.y - q.y);
  const ys = sorted.map((k) => k.y);
  const fa = pchip(ys, sorted.map((k) => k.a));
  const fb = pchip(ys, sorted.map((k) => k.b));
  const fz = pchip(ys, sorted.map((k) => k.z));
  const fn = pchip(ys, sorted.map((k) => k.n));
  const fx = pchip(ys, sorted.map((k) => k.x ?? 0));
  return (y: number) => ({ x: fx(y), y, z: fz(y), a: fa(y), b: fb(y), n: fn(y) });
}

export interface Ellipsoid {
  center: [number, number, number];
  radii: [number, number, number];
}

export interface BodyModel {
  H: number;
  sex: Sex;
  levels: {
    floor: number;
    ankle: number;
    knee: number;
    crotch: number;
    torsoBottom: number;
    hip: number;
    waist: number;
    chest: number;
    armpit: number;
    shoulder: number;
    neckBase: number;
    neckTop: number;
  };
  /** Bålens tvärsnitt på höjden y (torsoBottom … neckTop). */
  torso: (y: number) => Ring;
  /** Vänster bens tvärsnitt på höjden y (ankle … hip). Höger ben är spegelvänt i x. */
  leg: (y: number) => Ring;
  /** Armens radie vid t = 0 (axel) … 1 (handled). */
  armRadius: (t: number) => number;
  armLength: number;
  /** Vänster arms fäste. Höger arm är spegelvänd i x. */
  armPivot: [number, number, number];
  /** Armens vinkel ut från kroppen, radianer. */
  armAngle: number;
  head: Ellipsoid;
  /** Vänster hand i armens lokala koordinater (y pekar längs armen, nedåt negativt). */
  hand: Ellipsoid;
  /** Vänster fot. */
  foot: Ellipsoid;
}

const TWO_PI = Math.PI * 2;

/** Halvt djup för en ellips med halv bredd a och given omkrets (Ramanujans närmevärde, intervallhalvering). */
function ellipseDepthFor(a: number, circumference: number): number {
  const perimeter = (b: number) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  let lo = a * 0.2;
  let hi = a * 5;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (perimeter(mid) < circumference) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function buildBodyModel(m: BodyMeasurements, sex: Sex): BodyModel {
  const H = m.heightCm;
  const female = sex === "female";

  // Nivåer. Höft och midja följer innerbenslängden så att långa ben ger kortare bål.
  const crotch = Math.min(Math.max(m.inseam, 0.4 * H), 0.52 * H);
  const hip = crotch + 0.055 * H;
  const chest = (female ? 0.715 : 0.72) * H;
  const waist = Math.min(hip + (female ? 0.115 : 0.105) * H, chest - 0.05 * H);
  const armpit = 0.755 * H;
  const shoulder = 0.812 * H;
  const neckBase = 0.848 * H;
  const neckTop = 0.885 * H;
  const knee = crotch * 0.61;
  const ankle = 0.045 * H;
  const torsoBottom = crotch - 0.02 * H;

  const neckR = m.neck / TWO_PI;
  const thighR = m.thigh / TWO_PI;
  const calfR = m.calf / TWO_PI;
  const bicepR = m.bicep / TWO_PI;

  const chestA = m.chestWidth / 2;
  const chestB = m.chestDepth / 2;
  const waistA = m.waistWidth / 2;
  const waistB = m.waistDepth / 2;
  const hipA = m.hipWidth / 2;
  const hipB = m.hipDepth / 2;
  const shoulderA = m.shoulderWidth / 2;

  // Rygglinjen ligger fast; byst och mage byggs framåt, stussen bakåt.
  const ribB = chestB * (female ? 0.86 : 1);
  const back = -ribB;
  const chestZ = back + chestB;
  const waistZ = back + 0.01 * H + waistB;
  const hipZ = back - 0.012 * H + hipB;

  const torsoKeys: Key[] = [
    { y: torsoBottom, a: hipA * 0.5, b: hipB * 0.55, z: hipZ * 0.5, n: 2.2 },
    { y: crotch, a: hipA * 0.94, b: hipB * 0.9, z: hipZ * 0.8, n: 2.4 },
    { y: hip, a: hipA, b: hipB, z: hipZ, n: SECTION_EXPONENT.hip },
    { y: waist, a: waistA, b: waistB, z: waistZ, n: SECTION_EXPONENT.waist },
    { y: chest, a: chestA, b: chestB, z: chestZ, n: SECTION_EXPONENT.chest },
    { y: armpit, a: Math.max(chestA * 0.99, shoulderA * 0.8), b: ribB * 0.94, z: back + ribB * 0.94, n: 2.7 },
    { y: shoulder, a: shoulderA * 0.9, b: ribB * 0.62, z: back + ribB * 0.72, n: 2.8 },
    { y: 0.836 * H, a: neckR + (shoulderA - neckR) * 0.4, b: ribB * 0.46, z: back + ribB * 0.72, n: 2.4 },
    { y: neckBase, a: neckR * 1.22, b: neckR * 1.18, z: back + ribB * 0.78, n: 2 },
    { y: 0.864 * H, a: neckR, b: neckR, z: back + ribB * 0.82, n: 2 },
    { y: neckTop, a: neckR * 0.98, b: neckR * 0.98, z: back + ribB * 0.9, n: 2 },
  ];
  if (female) {
    // Revbenen under bysten är smalare och grundare än bystmåttet.
    const t = 0.72;
    torsoKeys.push({
      y: chest - 0.04 * H,
      a: waistA + (chestA - waistA) * t,
      b: Math.max(waistB, ribB * 0.97),
      z: back + Math.max(waistB, ribB * 0.97),
      n: 2.4,
    });
  }
  const torso = profile(torsoKeys);

  // Benen står så att lårens utsida möter höftbredden. Får två runda lår inte
  // plats i bredd trycks de ihop mot varandra och blir djupare i stället, med
  // bibehållen omkrets – precis som på en riktig kropp.
  const thighA = Math.min(thighR, hipA * 0.49);
  const thighB = thighA < thighR ? ellipseDepthFor(thighA, m.thigh) : thighR * 1.04;
  const legX = hipA * 0.98 - thighA;
  const legKeys: Key[] = [
    { y: hip, x: legX, a: thighA, b: Math.max(hipB * 0.8, thighB * 0.9), z: hipZ, n: 2 },
    { y: crotch, x: legX, a: thighA, b: thighB, z: hipZ * 0.6, n: 2 },
    { y: crotch - 0.1 * H, x: legX * 0.98, a: Math.min(thighA, thighR * 0.87), b: thighR * 0.9, z: hipZ * 0.3, n: 2 },
    { y: knee + 0.035 * H, x: legX * 0.96, a: calfR * 1.07, b: calfR * 1.1, z: 0.3, n: 2 },
    { y: knee, x: legX * 0.95, a: calfR * 1.0, b: calfR * 1.04, z: 0.3, n: 2 },
    { y: knee - 0.035 * H, x: legX * 0.95, a: calfR * 0.93, b: calfR * 0.96, z: -0.2, n: 2 },
    { y: crotch * 0.43, x: legX * 0.94, a: calfR, b: calfR * 1.04, z: -1, n: 2 },
    { y: crotch * 0.25, x: legX * 0.93, a: calfR * 0.76, b: calfR * 0.8, z: -0.8, n: 2 },
    { y: ankle, x: legX * 0.92, a: calfR * 0.6, b: calfR * 0.66, z: -0.5, n: 2 },
    { y: 0.018 * H, x: legX * 0.92, a: calfR * 0.62, b: calfR * 0.7, z: -0.3, n: 2 },
  ];
  const leg = profile(legKeys);

  const armRadius = pchip(
    [0, 0.1, 0.27, 0.5, 0.6, 0.8, 1],
    [1.1, 1.12, 1, 0.82, 0.84, 0.66, 0.53].map((k) => k * bicepR),
  );

  const shoulderRing = torso(shoulder);
  const ankleRing = leg(ankle);

  return {
    H,
    sex,
    levels: { floor: 0, ankle, knee, crotch, torsoBottom, hip, waist, chest, armpit, shoulder, neckBase, neckTop },
    torso,
    leg,
    armRadius,
    armLength: m.armLength,
    armPivot: [shoulderA - bicepR * 0.55, shoulder - bicepR * 0.7, shoulderRing.z],
    armAngle: (16 * Math.PI) / 180,
    head: {
      center: [0, 0.936 * H, back + ribB * 0.9 + 0.012 * H],
      radii: [0.043 * H, 0.066 * H, 0.054 * H],
    },
    hand: {
      center: [0, -(m.armLength + 0.048 * H), 0],
      radii: [0.013 * H, 0.054 * H, 0.025 * H],
    },
    foot: {
      center: [ankleRing.x, 0.022 * H, ankleRing.z + 0.04 * H],
      radii: [0.027 * H, 0.022 * H, 0.072 * H],
    },
  };
}

/** Omkretsen av ett tvärsnitt. */
export function ringPerimeter(r: Ring): number {
  return superellipsePerimeter(r.a, r.b, r.n);
}

/** Jämnt fördelade värden från start till end, inklusive ändpunkterna. */
export function range(start: number, end: number, maxStep: number): number[] {
  const n = Math.max(1, Math.ceil(Math.abs(end - start) / maxStep));
  return Array.from({ length: n + 1 }, (_, i) => start + ((end - start) * i) / n);
}

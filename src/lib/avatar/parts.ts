// Bygger de geometriska delarna för avataren och för plaggen den provar.
// Ett plagg är kroppens tvärsnitt plus rörelsevidd: vidden räknas fram ur
// plaggets mått i vald storlek minus kroppens mått på samma nivå. Därför syns
// det direkt i 3D om en storlek är för liten eller för stor.
//
// Det här är en geometrisk provning, inte en tygsimulering: plagget visar
// längd, vidd och passform – inte veck eller hur tyget faller.

import { evaluateFit, garmentDimensions, recommendSize, type FitStatus, type GarmentDimensions } from "../sizing";
import type { BodyMeasurements, GarmentFit, GarmentKind, Sex } from "../types";
import { slotOf } from "../types";
import { range, type BodyModel, type Ellipsoid, type Ring } from "./model";

export type Frame = "world" | "armL" | "armR";
export type Rgb = [number, number, number];

interface PartBase {
  frame: Frame;
  /** Hex-färg. */
  color: string;
  /** Spegla i x-led (höger kroppshalva). */
  mirror?: boolean;
  role: "body" | "underwear" | "garment";
}

export interface LoftPart extends PartBase {
  type: "loft";
  rings: Ring[];
  capStart: boolean;
  capEnd: boolean;
  /** Färg per ring – används av passformskartan. */
  ringColors?: Rgb[];
}

export interface EllipsoidPart extends PartBase, Ellipsoid {
  type: "ellipsoid";
}

export type Part = LoftPart | EllipsoidPart;

export interface WornGarment {
  kind: GarmentKind;
  fit: GarmentFit;
  colorHex: string;
  /** null = använd rekommenderad storlek. */
  size: string | null;
}

export const SKIN_COLOR = "#cdb8a6";
const UNDERWEAR_COLOR = "#3b4252";

const TWO_PI = Math.PI * 2;
const STEP = 1.5;

const FIT_COLORS: Record<FitStatus, Rgb> = {
  tight: [0.84, 0.27, 0.27],
  snug: [0.9, 0.64, 0.24],
  good: [0.26, 0.66, 0.44],
  loose: [0.31, 0.53, 0.85],
};

type Offset = (y: number) => number;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Styckvis linjär funktion genom punkterna, konstant utanför. */
function piecewise(points: [number, number][]): Offset {
  const pts = [...points].sort((p, q) => p[0] - q[0]);
  return (y) => {
    if (y <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      if (y <= pts[i + 1][0]) {
        return lerp(pts[i][1], pts[i + 1][1], (y - pts[i][0]) / (pts[i + 1][0] - pts[i][0]));
      }
    }
    return pts[pts.length - 1][1];
  };
}

/** Ärmens tvärsnitt från t0 till t1 (0 = axel, 1 = handled) med radien radius(t). */
function armRings(model: BodyModel, t0: number, t1: number, radius: (t: number) => number): Ring[] {
  return range(t0, t1, 0.04).map((t) => {
    const r = radius(t);
    return { x: 0, y: -t * model.armLength, z: 0, a: r, b: r, n: 2 };
  });
}

/** Bålens tvärsnitt plus vidd. Under höften hänger plagget rakt ned (kjol, rock, skjortskört). */
function torsoShell(model: BodyModel, yBottom: number, yTop: number, offset: Offset, flare = 0): Ring[] {
  const { hip, ankle } = model.levels;
  const hipRing = model.torso(hip);
  return range(yBottom, yTop, STEP).map((y) => {
    if (y >= hip) {
      const r = model.torso(y);
      const d = offset(y);
      return { ...r, a: r.a + d, b: r.b + d };
    }
    const d = offset(hip);
    const drop = hip - y;
    const leg = model.leg(Math.max(y, ankle));
    return {
      x: 0,
      y,
      z: hipRing.z,
      a: Math.max(hipRing.a + d + flare * drop, leg.x + leg.a + 0.5),
      b: Math.max(hipRing.b + d + flare * drop * 0.8, Math.abs(leg.z - hipRing.z) + leg.b + 0.5),
      n: hipRing.n,
    };
  });
}

/** Bålens tvärsnitt plus vidd hela vägen ned i grenen (byxor, underkläder). */
function pelvisShell(model: BodyModel, yTop: number, offset: Offset): Ring[] {
  return range(model.levels.torsoBottom - 0.4, yTop, STEP).map((y) => {
    const r = model.torso(Math.max(y, model.levels.torsoBottom));
    const d = offset(y);
    return { ...r, y, a: r.a + d, b: r.b + d };
  });
}

function legShell(model: BodyModel, yBottom: number, yTop: number, radius: (y: number, body: Ring) => number): Ring[] {
  return range(yBottom, yTop, STEP).map((y) => {
    const r = model.leg(y);
    const d = radius(y, r) - r.a;
    return { ...r, a: r.a + d, b: r.b + d };
  });
}

function both(part: Part): Part[] {
  return [part, { ...part, mirror: true, frame: part.frame === "armL" ? "armR" : part.frame }];
}

/** Själva kroppen: skyltdocka med underkläder. */
export function buildBodyParts(model: BodyModel): Part[] {
  const { levels: L, H } = model;
  const body = { role: "body" as const, color: SKIN_COLOR };
  const parts: Part[] = [
    {
      ...body,
      type: "loft",
      frame: "world",
      rings: range(L.torsoBottom, L.neckTop, STEP).map(model.torso),
      capStart: true,
      capEnd: true,
    },
    { ...body, type: "ellipsoid", frame: "world", ...model.head },
    ...both({
      ...body,
      type: "loft",
      frame: "world",
      rings: range(0.018 * H, L.hip, STEP).map(model.leg),
      capStart: true,
      capEnd: true,
    }),
    ...both({ ...body, type: "ellipsoid", frame: "world", ...model.foot }),
    ...both({ ...body, type: "loft", frame: "armL", rings: armRings(model, 0, 1, model.armRadius), capStart: true, capEnd: true }),
    ...both({
      ...body,
      type: "ellipsoid",
      frame: "armL",
      center: [0, 0, 0],
      radii: [model.armRadius(0), model.armRadius(0), model.armRadius(0)],
    }),
    ...both({ ...body, type: "ellipsoid", frame: "armL", ...model.hand }),
  ];

  // Underkläder sitter alltid på – avataren kan inte visas utan dem.
  const under = { role: "underwear" as const, color: UNDERWEAR_COLOR };
  const snug: Offset = () => 0.28;
  parts.push(
    { ...under, type: "loft", frame: "world", rings: pelvisShell(model, L.hip + 0.04 * H, snug), capStart: true, capEnd: false },
    ...both({
      ...under,
      type: "loft",
      frame: "world",
      rings: legShell(model, L.crotch - 0.04 * H, L.crotch + 0.03 * H, (_, r) => r.a + 0.28),
      capStart: false,
      capEnd: false,
    }),
  );
  if (model.sex === "female") {
    parts.push({
      ...under,
      type: "loft",
      frame: "world",
      rings: torsoShell(model, L.chest - 0.05 * H, L.armpit + 0.014 * H, snug),
      capStart: false,
      capEnd: false,
    });
  }
  return parts;
}

const SLEEVE_EASE: Record<GarmentFit, number> = { slim: 0.5, regular: 1, relaxed: 1.8, oversized: 3 };
const LEG_EASE: Record<GarmentFit, number> = { slim: 0.5, regular: 1.4, relaxed: 2.6, oversized: 4.2 };
/** Benslutets radie i cm. */
const HEM_RADIUS: Record<GarmentFit, number> = { slim: 5.4, regular: 6.3, relaxed: 7.2, oversized: 8.6 };
const SKIRT_FLARE: Record<GarmentFit, number> = { slim: 0, regular: 0.14, relaxed: 0.26, oversized: 0.4 };

interface TopStyle {
  /** Fållens höjd relativt höften, som andel av kroppslängden (negativt = längre). */
  hem: number;
  sleeveTo: number;
  extraEase: number;
  collar: boolean;
  hood: boolean;
}

const TOP_STYLE: Record<"tshirt" | "shirt" | "sweater" | "hoodie" | "jacket" | "coat", TopStyle> = {
  tshirt: { hem: 0.0, sleeveTo: 0.3, extraEase: 0, collar: false, hood: false },
  shirt: { hem: -0.025, sleeveTo: 0.98, extraEase: 0, collar: true, hood: false },
  sweater: { hem: 0.01, sleeveTo: 0.98, extraEase: 0.3, collar: false, hood: false },
  hoodie: { hem: 0.0, sleeveTo: 0.98, extraEase: 0.5, collar: false, hood: true },
  jacket: { hem: -0.01, sleeveTo: 0.99, extraEase: 0.7, collar: true, hood: false },
  coat: { hem: -0.2, sleeveTo: 0.99, extraEase: 1, collar: true, hood: false },
};

export interface GarmentFitInfo {
  kind: GarmentKind;
  size: string | null;
  recommended: string | null;
  dims: GarmentDimensions | null;
}

interface Layers {
  /** Yttersta lagrets vidd på bålen respektive armarna, så att nästa lager hamnar utanpå. */
  torso: Offset;
  /** Yttersta ärmens radie vid t (0 = axel, 1 = handled); 0 där ingen ärm finns. */
  sleeve: (t: number) => number;
}

function zoneColors(
  model: BodyModel,
  m: BodyMeasurements,
  dims: GarmentDimensions | null,
  kind: GarmentKind,
): ((y: number) => Rgb) | null {
  if (!dims) return null;
  const zones = evaluateFit(m, dims, kind);
  if (!zones.length) return null;
  const { hip, waist, chest } = model.levels;
  const levelOf = { hip, waist, chest } as const;
  const pts = zones.map((z) => ({ y: levelOf[z.zone], c: FIT_COLORS[z.status] })).sort((p, q) => p.y - q.y);
  return (y) => {
    if (y <= pts[0].y) return pts[0].c;
    for (let i = 0; i < pts.length - 1; i++) {
      if (y <= pts[i + 1].y) {
        const t = (y - pts[i].y) / (pts[i + 1].y - pts[i].y);
        return [0, 1, 2].map((k) => lerp(pts[i].c[k], pts[i + 1].c[k], t)) as Rgb;
      }
    }
    return pts[pts.length - 1].c;
  };
}

/**
 * Delarna för en hel klädsel. Ordningen (underdel → överdel → ytterplagg) avgör
 * vad som hamnar utanpå vad. Med showFit färgas plaggen efter hur de sitter.
 */
export function buildOutfitParts(
  model: BodyModel,
  m: BodyMeasurements,
  sex: Sex,
  garments: WornGarment[],
  showFit = false,
): { parts: Part[]; info: GarmentFitInfo[] } {
  const { levels: L, H } = model;
  const parts: Part[] = [];
  const info: GarmentFitInfo[] = [];
  const layers: Layers = { torso: () => 0.28, sleeve: () => 0 };

  const order = { bottom: 0, onepiece: 0, top: 1, layer: 2, shoes: 3 } as const;
  const sorted = [...garments].sort((a, b) => order[slotOf(a.kind)] - order[slotOf(b.kind)]);

  for (const g of sorted) {
    const slot = slotOf(g.kind);
    const rec = recommendSize(sex, m, g.kind, g.fit);
    const size = g.size ?? rec?.size ?? null;
    const dims = size ? garmentDimensions(sex, g.kind, g.fit, size) : null;
    info.push({ kind: g.kind, size, recommended: rec?.size ?? null, dims });
    const base = { role: "garment" as const, color: g.colorHex };
    const colorAt = showFit ? zoneColors(model, m, dims, g.kind) : null;
    const colorsFor = (rings: Ring[], fixedY?: number) => (colorAt ? rings.map((r) => colorAt(fixedY ?? r.y)) : undefined);
    const ease = (zone: "chest" | "waist" | "hip", fallback: number) =>
      dims?.[zone] !== undefined ? (dims[zone]! - m[zone]) / TWO_PI : fallback;

    if (slot === "shoes") {
      const f = model.foot;
      parts.push(
        ...both({
          ...base,
          type: "ellipsoid",
          frame: "world",
          center: [f.center[0], f.center[1] + 0.2, f.center[2]],
          radii: [f.radii[0] * 1.16, f.radii[1] * 1.22, f.radii[2] * 1.1],
        }),
      );
      continue;
    }

    if (slot === "bottom" && g.kind !== "skirt") {
      const under = layers.torso;
      const own = piecewise([
        [L.hip, ease("hip", 0.8)],
        [L.waist, ease("waist", 0.3)],
      ]);
      const offset: Offset = (y) => Math.max(own(y), under(y) + 0.2, 0.45);
      const waistband = L.waist - 0.03 * H;
      const pelvis = pelvisShell(model, waistband, offset);
      parts.push({ ...base, type: "loft", frame: "world", rings: pelvis, capStart: true, capEnd: false, ringColors: colorsFor(pelvis) });

      const hem = g.kind === "shorts" ? L.knee + 0.04 * H : 0.035 * H;
      const legEase = Math.max(LEG_EASE[g.fit], ease("hip", 0.8) * 0.8);
      const hemR = HEM_RADIUS[g.fit];
      const kneeR = model.leg(L.knee).a + legEase;
      const radius = (y: number, body: Ring) => {
        if (g.kind === "shorts" || y >= L.knee) return body.a + legEase;
        // Under knät faller benet rakt mot bensluten.
        return Math.max(body.a + 0.45, lerp(hemR, kneeR, (y - hem) / (L.knee - hem)));
      };
      const legs = legShell(model, hem, L.crotch + 0.035 * H, radius);
      parts.push(
        ...both({ ...base, type: "loft", frame: "world", rings: legs, capStart: false, capEnd: false, ringColors: colorsFor(legs, L.hip) }),
      );
      layers.torso = (y) => (y <= waistband ? Math.max(under(y), offset(y)) : under(y));
      continue;
    }

    if (g.kind === "skirt") {
      const under = layers.torso;
      const own = piecewise([
        [L.hip, ease("hip", 1)],
        [L.waist, ease("waist", 0.3)],
      ]);
      const offset: Offset = (y) => Math.max(own(y), under(y) + 0.2, 0.45);
      const top = L.waist - 0.01 * H;
      const rings = torsoShell(model, L.knee + 0.02 * H, top, offset, SKIRT_FLARE[g.fit]);
      parts.push({ ...base, type: "loft", frame: "world", rings, capStart: false, capEnd: false, ringColors: colorsFor(rings) });
      layers.torso = (y) => (y <= top ? Math.max(under(y), offset(y)) : under(y));
      continue;
    }

    // Överdelar, ytterplagg och klänningar täcker bålen upp till halsen.
    const style: TopStyle =
      g.kind === "dress"
        ? { hem: 0, sleeveTo: 0.22, extraEase: 0, collar: false, hood: false }
        : TOP_STYLE[g.kind as keyof typeof TOP_STYLE];
    const under = layers.torso;
    const chestEase = ease("chest", 1.3);
    const own = piecewise([
      [L.hip, ease("hip", 1.5)],
      [L.waist, ease("waist", 1.5)],
      [L.chest, chestEase],
      [L.neckBase, Math.max(0.5, chestEase * 0.45)],
    ]);
    const gap = slot === "layer" ? 0.5 : 0.3;
    const offset: Offset = (y) => Math.max(own(y) + style.extraEase, under(y) + gap, 0.5);
    const hemY = g.kind === "dress" ? L.knee : L.hip + style.hem * H;
    const flare = g.kind === "dress" ? SKIRT_FLARE[g.fit] : g.kind === "coat" ? 0.05 : 0;
    const neckline = g.kind === "dress" ? L.shoulder + 0.012 * H : L.neckBase - 0.004 * H;
    const rings = torsoShell(model, hemY, neckline, offset, flare);
    parts.push({ ...base, type: "loft", frame: "world", rings, capStart: false, capEnd: false, ringColors: colorsFor(rings) });

    // Ärmar.
    const sleeveEase = SLEEVE_EASE[g.fit] + style.extraEase;
    const short = style.sleeveTo < 0.5;
    const flareTo = short ? model.armRadius(0.27) + sleeveEase + 0.6 : 0;
    const underSleeve = layers.sleeve;
    // Ärmen följer armen, men hamnar alltid utanpå ärmen på plagget under.
    const sleeveRadius = (t: number) => {
      const under = underSleeve(t);
      return Math.max(model.armRadius(t) + sleeveEase, flareTo, under > 0 ? under + 0.4 : 0);
    };
    const sleeve = armRings(model, 0, style.sleeveTo, sleeveRadius);
    const sleeveColors = colorsFor(sleeve, L.chest);
    const r0 = sleeve[0].a;
    parts.push(
      ...both({ ...base, type: "loft", frame: "armL", rings: sleeve, capStart: false, capEnd: false, ringColors: sleeveColors }),
      ...both({ ...base, type: "ellipsoid", frame: "armL", center: [0, 0, 0], radii: [r0, r0, r0] }),
    );
    if (sleeveColors && colorAt) {
      // Axelkulan ska ha samma färg som ärmen i passformskartan.
      const c = colorAt(L.chest);
      const hex = `#${c.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
      for (const p of parts.slice(-2)) p.color = hex;
    }

    const neck = model.torso(L.neckBase);
    if (style.collar) {
      const r = neck.a + 1.1;
      const collar = range(L.neckBase - 0.012 * H, L.neckBase + 0.02 * H, STEP).map((y) => ({ ...neck, y, a: r, b: r }));
      parts.push({ ...base, type: "loft", frame: "world", rings: collar, capStart: false, capEnd: false, ringColors: colorsFor(collar, L.chest) });
    }
    if (style.hood) {
      parts.push({
        ...base,
        type: "ellipsoid",
        frame: "world",
        center: [0, L.neckBase - 0.005 * H, neck.z - neck.b * 1.5],
        radii: [neck.a * 1.7, 0.05 * H, neck.b * 1.2],
      });
    }

    layers.torso = (y) => (y >= hemY && y <= neckline ? Math.max(under(y), offset(y)) : under(y));
    const sleeveTo = style.sleeveTo;
    // Räkna ärmen som lite längre än den är, så att ytterärmen inte hinner smalna
    // av förrän den passerat fållen (ringarna ligger 0,04 isär längs armen).
    layers.sleeve = (t) =>
      t <= sleeveTo + 0.06 ? Math.max(underSleeve(t), sleeveRadius(Math.min(t, sleeveTo))) : underSleeve(t);
  }

  return { parts, info };
}

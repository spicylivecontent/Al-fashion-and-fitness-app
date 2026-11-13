// Storleksguide: jämför kroppens mått med plaggets mått i varje storlek och
// väljer den storlek som hamnar närmast den passform plagget är tänkt att ha.
//
// Tabellerna är generiska EU-storlekar. Enskilda märken avviker – när en butik
// har en egen måttabell bör den användas i stället (se README, "Nästa steg").

import type { BodyMeasurements, GarmentFit, GarmentKind, Sex } from "../types";
import { slotOf } from "../types";

type Range = [number, number];

interface SizeRow {
  label: string;
  /** Kroppsmått storleken är gjord för. */
  chest: Range;
  waist: Range;
  hip: Range;
}

const ALPHA: Record<Sex, SizeRow[]> = {
  male: [
    { label: "XS", chest: [80, 88], waist: [66, 74], hip: [84, 90] },
    { label: "S", chest: [88, 96], waist: [74, 82], hip: [90, 96] },
    { label: "M", chest: [96, 104], waist: [82, 90], hip: [96, 102] },
    { label: "L", chest: [104, 112], waist: [90, 98], hip: [102, 108] },
    { label: "XL", chest: [112, 120], waist: [98, 108], hip: [108, 114] },
    { label: "XXL", chest: [120, 128], waist: [108, 118], hip: [114, 120] },
    { label: "3XL", chest: [128, 138], waist: [118, 130], hip: [120, 128] },
  ],
  female: [
    { label: "XS", chest: [76, 84], waist: [58, 66], hip: [84, 92] },
    { label: "S", chest: [84, 92], waist: [66, 74], hip: [92, 100] },
    { label: "M", chest: [92, 100], waist: [74, 82], hip: [100, 108] },
    { label: "L", chest: [100, 110], waist: [82, 92], hip: [108, 117] },
    { label: "XL", chest: [110, 122], waist: [92, 104], hip: [117, 127] },
    { label: "XXL", chest: [122, 134], waist: [104, 116], hip: [127, 137] },
  ],
};

const JEANS_WAISTS: Record<Sex, number[]> = {
  male: [28, 29, 30, 31, 32, 33, 34, 36, 38, 40, 42, 44],
  female: [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 36, 38],
};
const JEANS_LENGTHS = [28, 30, 32, 34, 36];
/** Hur mycket större höften typiskt är än midjan i jeansstorlekar. */
const JEANS_HIP_OFFSET: Record<Sex, number> = { male: 16, female: 26 };

export const SHOE_SIZES = ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47"];

const mid = (r: Range) => (r[0] + r[1]) / 2;

function jeansRows(sex: Sex): SizeRow[] {
  return JEANS_WAISTS[sex].map((w) => {
    const waist = w * 2.54;
    const hip = waist + JEANS_HIP_OFFSET[sex];
    return {
      label: `W${w}`,
      chest: [0, 0] as Range,
      waist: [waist - 1.5, waist + 1.5] as Range,
      hip: [hip - 2.5, hip + 2.5] as Range,
    };
  });
}

function rowsFor(sex: Sex, kind: GarmentKind): SizeRow[] {
  return kind === "jeans" ? jeansRows(sex) : ALPHA[sex];
}

/** Storlekar som går att välja för ett plagg. Jeans får benlängden som passar innerbenet. */
export function sizeLabels(sex: Sex, kind: GarmentKind, inseamCm?: number): string[] {
  if (kind === "shoes") return SHOE_SIZES;
  const suffix = kind === "jeans" && inseamCm ? `/L${jeansLength(inseamCm)}` : "";
  return rowsFor(sex, kind).map((r) => `${r.label}${suffix}`);
}

// Rörelsevidd (cm) som plagget är tänkt att ha över bröstet vid normal passform.
const CHEST_EASE: Partial<Record<GarmentKind, number>> = {
  tshirt: 8,
  shirt: 10,
  sweater: 12,
  hoodie: 16,
  jacket: 16,
  coat: 20,
  dress: 5,
};
const FIT_EASE: Record<GarmentFit, number> = { slim: -5, regular: 0, relaxed: 6, oversized: 16 };
const TOP_TAPER: Record<GarmentFit, number> = { slim: 8, regular: 4, relaxed: 2, oversized: 0 };
const HIP_EASE: Record<GarmentFit, number> = { slim: 2, regular: 5, relaxed: 9, oversized: 14 };

export interface GarmentDimensions {
  /** Plaggets omkrets i cm vid respektive nivå. undefined = plagget täcker inte nivån. */
  chest?: number;
  waist?: number;
  hip?: number;
  /** Vidd som plagget är tänkt att ha (plagg minus kropp) – facit för "bra passform". */
  intended: { chest?: number; waist?: number; hip?: number };
}

function dimensionsForRow(row: SizeRow, kind: GarmentKind, fit: GarmentFit): GarmentDimensions {
  const slot = slotOf(kind);
  if (slot === "bottom") {
    const hipEase = HIP_EASE[fit] + (kind === "skirt" ? 2 : 0);
    return {
      waist: mid(row.waist) + 1,
      hip: mid(row.hip) + hipEase,
      intended: { waist: 1, hip: hipEase },
    };
  }
  const chestEase = Math.max(2, (CHEST_EASE[kind] ?? 10) + FIT_EASE[fit]);
  const chest = mid(row.chest) + chestEase;
  if (slot === "onepiece") {
    const waistEase = chestEase + 2;
    const hipEase = chestEase + 4;
    return {
      chest,
      waist: mid(row.waist) + waistEase,
      hip: mid(row.hip) + hipEase,
      intended: { chest: chestEase, waist: waistEase, hip: hipEase },
    };
  }
  // Överdelar: rak eller lätt insvängd från bröstet och ned.
  const waist = Math.max(mid(row.waist) + chestEase, chest - TOP_TAPER[fit]);
  const hip = Math.max(mid(row.hip) + chestEase * 0.6, chest - 2);
  return {
    chest,
    waist,
    hip,
    intended: { chest: chestEase, waist: waist - mid(row.waist), hip: hip - mid(row.hip) },
  };
}

/** Plaggets mått i en viss storlek. Returnerar null för okända storlekar och för skor. */
export function garmentDimensions(sex: Sex, kind: GarmentKind, fit: GarmentFit, size: string): GarmentDimensions | null {
  if (kind === "shoes") return null;
  const label = size.split("/")[0];
  const row = rowsFor(sex, kind).find((r) => r.label === label);
  return row ? dimensionsForRow(row, kind, fit) : null;
}

export type FitStatus = "tight" | "snug" | "good" | "loose";
export type FitZoneName = "chest" | "waist" | "hip";

export interface FitZone {
  zone: FitZoneName;
  label: string;
  status: FitStatus;
  /** Plaggets omkrets minus kroppens, i cm. */
  easeCm: number;
}

const ZONE_LABELS: Record<FitZoneName, string> = { chest: "Bröst", waist: "Midja", hip: "Höft" };
export const STATUS_LABELS: Record<FitStatus, string> = {
  tight: "För trångt",
  snug: "Tajt",
  good: "Bra",
  loose: "Löst",
};

function statusFor(zone: FitZoneName, ease: number, intended: number, kind: GarmentKind): FitStatus {
  const waistband = slotOf(kind) === "bottom" && zone === "waist";
  if (waistband) {
    // En linning får sitta åt lite, men glappar snabbt om den är för stor.
    if (ease < -3) return "tight";
    if (ease < -1) return "snug";
    if (ease > 5) return "loose";
    return "good";
  }
  if (ease < 0) return "tight";
  if (ease < Math.min(3, intended * 0.5)) return "snug";
  if (ease > intended + 9) return "loose";
  return "good";
}

/** Bedömer hur ett plagg med givna mått sitter på kroppen, nivå för nivå. */
export function evaluateFit(m: BodyMeasurements, dims: GarmentDimensions, kind: GarmentKind): FitZone[] {
  const zones: FitZone[] = [];
  for (const zone of ["chest", "waist", "hip"] as FitZoneName[]) {
    const g = dims[zone];
    if (g === undefined) continue;
    const ease = g - m[zone];
    zones.push({
      zone,
      label: ZONE_LABELS[zone],
      status: statusFor(zone, ease, dims.intended[zone] ?? 0, kind),
      easeCm: Math.round(ease * 10) / 10,
    });
  }
  return zones;
}

const ZONE_WEIGHT: Record<"top" | "bottom" | "onepiece", Record<FitZoneName, number>> = {
  top: { chest: 1, waist: 0.5, hip: 0.3 },
  bottom: { chest: 0, waist: 1, hip: 1 },
  onepiece: { chest: 1, waist: 0.8, hip: 0.8 },
};

function penalty(m: BodyMeasurements, dims: GarmentDimensions, kind: GarmentKind): number {
  const slot = slotOf(kind);
  const weights = ZONE_WEIGHT[slot === "layer" ? "top" : (slot as "top" | "bottom" | "onepiece")];
  let total = 0;
  for (const zone of ["chest", "waist", "hip"] as FitZoneName[]) {
    const g = dims[zone];
    if (g === undefined) continue;
    const deviation = g - m[zone] - (dims.intended[zone] ?? 0);
    // För litet är värre än för stort: ett trångt plagg går inte att bära.
    total += weights[zone] * (deviation < 0 ? -deviation * 2.5 : deviation);
  }
  return total;
}

export interface SizeRecommendation {
  size: string;
  /** Näst bästa storlek om valet är jämnt, annars null. */
  alternative: string | null;
  zones: FitZone[];
  note: string;
}

function jeansLength(inseamCm: number): number {
  const inches = inseamCm / 2.54;
  return JEANS_LENGTHS.reduce((best, l) => (Math.abs(l - inches) < Math.abs(best - inches) ? l : best));
}

export function recommendSize(
  sex: Sex,
  m: BodyMeasurements,
  kind: GarmentKind,
  fit: GarmentFit,
): SizeRecommendation | null {
  if (kind === "shoes") return null;
  const rows = rowsFor(sex, kind);
  const scored = rows
    .map((row) => {
      const dims = dimensionsForRow(row, kind, fit);
      return { row, dims, score: penalty(m, dims, kind) };
    })
    .sort((a, b) => a.score - b.score);
  const best = scored[0];
  const second = scored[1];
  const zones = evaluateFit(m, best.dims, kind);
  const close = second && second.score - best.score < 2.5;

  const suffix = kind === "jeans" ? `/L${jeansLength(m.inseam)}` : "";
  const notes: string[] = [];
  const tight = zones.filter((z) => z.status === "tight").map((z) => z.label.toLowerCase());
  const loose = zones.filter((z) => z.status === "loose").map((z) => z.label.toLowerCase());
  if (tight.length) notes.push(`Kan strama över ${tight.join(" och ")}.`);
  if (loose.length) notes.push(`Blir löst över ${loose.join(" och ")}.`);
  if (close) notes.push(`Du ligger mellan ${best.row.label} och ${second.row.label} – välj efter hur du vill att plagget ska sitta.`);
  const atEdge = best.row === rows[0] || best.row === rows[rows.length - 1];
  if (atEdge && zones.some((z) => z.status === "tight" || z.status === "loose")) {
    notes.push("Dina mått ligger utanför standardtabellen – kontrollera butikens måttabell.");
  }
  if (kind === "trousers") {
    notes.push(`Innerben ${Math.round(m.inseam)} cm motsvarar längd ${jeansLength(m.inseam)}.`);
  }
  if (!notes.length) notes.push("Bör sitta som plagget är tänkt.");

  return {
    size: `${best.row.label}${suffix}`,
    alternative: close ? `${second.row.label}${suffix}` : null,
    zones,
    note: notes.join(" "),
  };
}

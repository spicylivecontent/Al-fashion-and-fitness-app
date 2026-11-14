// Väger samman mätningar från flera bilder till en uppsättning kroppsmått.
//
// Varje mått vägs mot den statistiska uppskattningen (längd/vikt/kön). Ju fler
// bilder som bekräftar ett mått, desto mer litar vi på skanningen och desto
// mindre på schablonen – det är därför fler bilder ger bättre resultat.

import { estimateMeasurements } from "../body/estimate";
import { SECTION_EXPONENT, circumferenceFromWidthDepth } from "../body/superellipse";
import type { BodyMeasurements, EditableKey, MeasurementSource, Sex } from "../types";
import { median, type DepthKey, type ImageMeasurement, type LengthKey, type WidthKey } from "./measure";

export type ConfidenceLevel = "none" | "low" | "medium" | "high";

export interface ScanSummary {
  measurements: BodyMeasurements;
  sources: Record<EditableKey, MeasurementSource>;
  frontCount: number;
  sideCount: number;
  /** 0–1. */
  confidence: number;
  level: ConfidenceLevel;
  /** Vad användaren kan göra för att få bättre precision. */
  advice: string[];
}

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  none: "Ingen skanning",
  low: "Låg precision",
  medium: "Medelgod precision",
  high: "Hög precision",
};

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Hur mycket vi litar på ett skannat värde, beroende på hur många bilder som gav det. */
function trust(count: number, penalty = 1): number {
  if (count <= 0) return 0;
  return Math.min(0.92, 0.6 + 0.1 * (count - 1)) * penalty;
}

function collect<K extends string>(images: ImageMeasurement[], pick: (m: ImageMeasurement) => Partial<Record<K, number>>, key: K) {
  return images.map((m) => pick(m)[key]).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
}

export function aggregateScan(
  sex: Sex,
  heightCm: number,
  weightKg: number,
  images: ImageMeasurement[],
): ScanSummary {
  const prior = estimateMeasurements(sex, heightCm, weightKg);
  const usable = images.filter((m) => m.ok);
  // Rutor ur ett filmklipp är ofta lite vridna. Behåll bara de som är närmast rakt
  // framifrån (bredast axelavstånd) respektive rakt från sidan (smalast axelavstånd).
  const frontalAll = usable.filter((m) => m.view === "front" || m.view === "back");
  const sideAll = usable.filter((m) => m.view === "side");
  const widest = Math.max(0, ...frontalAll.map((m) => m.shoulderSpan));
  const narrowest = Math.min(Infinity, ...sideAll.map((m) => m.shoulderSpan));
  const frontal = frontalAll.filter((m) => m.shoulderSpan >= 0.92 * widest);
  const side = sideAll.filter((m) => m.shoulderSpan <= narrowest + 0.03 * heightCm);

  const sources = {} as Record<EditableKey, MeasurementSource>;
  const m: BodyMeasurements = { ...prior };

  const widthOf = (key: WidthKey) => collect(frontal, (i) => i.widths, key);
  const depthOf = (key: DepthKey) => collect(side, (i) => i.depths, key);
  const lengthOf = (key: LengthKey) => collect(frontal, (i) => i.lengths, key);
  const blend = (priorValue: number, values: number[], penalty = 1) =>
    values.length ? priorValue + trust(values.length, penalty) * (median(values) - priorValue) : priorValue;

  const mergedShare = frontal.length ? frontal.filter((i) => i.armsMerged).length / frontal.length : 0;
  const armPenalty = mergedShare > 0.5 ? 0.7 : 1;

  for (const section of ["chest", "waist", "hip"] as const) {
    const widths = widthOf(section);
    const depths = depthOf(section);
    const priorW = prior[`${section}Width`];
    const priorD = prior[`${section}Depth`];
    const width = blend(priorW, widths, section === "hip" ? 1 : armPenalty);
    let depth: number;
    if (depths.length) {
      depth = blend(priorD, depths);
    } else if (widths.length) {
      // Utan sidobild: vikten är känd, så en bredare kropp är oftast något grundare
      // (och tvärtom). Kompensera försiktigt – sambandet är svagt.
      depth = priorD * (priorW / width) ** 0.25;
    } else {
      depth = priorD;
    }
    m[`${section}Width`] = round1(width);
    m[`${section}Depth`] = round1(depth);
    m[section] = round1(circumferenceFromWidthDepth(width, depth, SECTION_EXPONENT[section]));
    sources[section] = widths.length || depths.length ? "scan" : "estimate";
  }

  // Lemmar: ungefär elliptiska tvärsnitt.
  const limb = (key: "thigh" | "calf", depthFactor: number) => {
    const widths = widthOf(key);
    const depths = depthOf(key);
    const values: number[] = [];
    if (widths.length && depths.length) {
      const w = median(widths);
      const d = median(depths);
      values.push(Math.PI * Math.sqrt((w * w + d * d) / 2));
    } else if (widths.length) {
      values.push(Math.PI * median(widths) * (1 + depthFactor) * 0.5);
    } else if (depths.length) {
      values.push((Math.PI * median(depths) * (1 + 1 / depthFactor)) * 0.5);
    }
    const count = Math.max(widths.length, depths.length);
    m[key] = round1(values.length ? prior[key] + trust(count) * (values[0] - prior[key]) : prior[key]);
    sources[key] = values.length ? "scan" : "estimate";
  };
  limb("thigh", 1.08);
  limb("calf", 1.04);

  const biceps = widthOf("bicep");
  m.bicep = round1(blend(prior.bicep, biceps.map((w) => Math.PI * w)));
  sources.bicep = biceps.length ? "scan" : "estimate";

  for (const key of ["shoulderWidth", "inseam", "armLength"] as const) {
    const values = lengthOf(key);
    m[key] = round1(blend(prior[key], values));
    sources[key] = values.length ? "scan" : "estimate";
  }

  // Halsen mäts inte i bild – låt den följa bröstmåttets avvikelse från schablonen.
  m.neck = round1(prior.neck * (1 + 0.5 * (m.chest / prior.chest - 1)));
  sources.neck = "estimate";

  const confidence = Math.min(
    1,
    (frontal.length ? 0.4 : 0) +
      (side.length ? 0.25 : 0) +
      0.07 * Math.min(5, Math.max(0, frontal.length - 1) + Math.max(0, side.length - 1)),
  ) * (armPenalty < 1 ? 0.85 : 1);
  const level: ConfidenceLevel =
    confidence === 0 ? "none" : confidence < 0.5 ? "low" : confidence < 0.78 ? "medium" : "high";

  const advice: string[] = [];
  if (!frontal.length) advice.push("Lägg till en bild rakt framifrån.");
  if (!side.length) advice.push("Lägg till en bild rakt från sidan – då kan djupet mätas i stället för att uppskattas.");
  if (armPenalty < 1) advice.push("Håll armarna en bit ut från kroppen (A-form) på bilderna framifrån.");
  if (frontal.length && sources.inseam === "estimate") advice.push("Stå med fötterna axelbrett isär så att innerbenet syns.");
  if (frontal.length && side.length && level !== "high") {
    advice.push("Fler bilder eller ett filmklipp där du snurrar långsamt jämnar ut mätfelen.");
  }

  return { measurements: m, sources, frontCount: frontal.length, sideCount: side.length, confidence, level, advice };
}

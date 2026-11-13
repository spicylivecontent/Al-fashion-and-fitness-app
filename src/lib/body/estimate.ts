// Statistisk uppskattning av kroppsmått utifrån kön, längd och vikt.
// Används som startvärde innan man skannat sig, och som "förankring" som
// skanningens värden vägs mot så att en enstaka dålig bild inte ger orimliga mått.
//
// Referensvärdena motsvarar ungefär genomsnittliga vuxna i Nordeuropa; lutningarna
// anger hur många centimeter måttet ändras per BMI-enhet. Det här är schabloner –
// två personer med samma längd och vikt kan skilja flera centimeter.

import type { BodyMeasurements, Sex } from "../types";
import { SECTION_EXPONENT, circumferenceFromWidthDepth, widthDepthFromCircumference } from "./superellipse";

interface Reference {
  height: number;
  bmi: number;
  /** [värde vid referens-BMI, cm per BMI-enhet] */
  neck: [number, number];
  chest: [number, number];
  waist: [number, number];
  hip: [number, number];
  thigh: [number, number];
  calf: [number, number];
  bicep: [number, number];
  shoulderPerHeight: number;
  shoulderPerBmi: number;
  inseamPerHeight: number;
  armPerHeight: number;
  /** djup/bredd: [värde vid referens-BMI, ändring per BMI-enhet] */
  chestRatio: [number, number];
  waistRatio: [number, number];
  hipRatio: [number, number];
}

const REFERENCE: Record<Sex, Reference> = {
  male: {
    height: 178,
    bmi: 24.5,
    neck: [38.5, 0.55],
    chest: [100, 2.0],
    waist: [87, 2.7],
    hip: [99, 1.6],
    thigh: [57, 1.3],
    calf: [38, 0.6],
    bicep: [32, 0.8],
    shoulderPerHeight: 0.232,
    shoulderPerBmi: 0.15,
    inseamPerHeight: 0.455,
    armPerHeight: 0.335,
    chestRatio: [0.7, 0.008],
    waistRatio: [0.76, 0.012],
    hipRatio: [0.72, 0.006],
  },
  female: {
    height: 165,
    bmi: 23.5,
    neck: [33, 0.4],
    chest: [93, 2.0],
    waist: [76, 2.3],
    hip: [100, 2.1],
    thigh: [57, 1.4],
    calf: [36, 0.6],
    bicep: [28, 0.8],
    shoulderPerHeight: 0.224,
    shoulderPerBmi: 0.12,
    inseamPerHeight: 0.455,
    armPerHeight: 0.33,
    chestRatio: [0.74, 0.008],
    waistRatio: [0.72, 0.012],
    hipRatio: [0.68, 0.006],
  },
};

export function bmiOf(heightCm: number, weightKg: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Förhållandet djup/bredd för bröst, midja och höft vid givet BMI. */
export function sectionRatios(sex: Sex, bmi: number) {
  const ref = REFERENCE[sex];
  const d = clamp(bmi, 15, 45) - ref.bmi;
  return {
    chest: clamp(ref.chestRatio[0] + ref.chestRatio[1] * d, 0.55, 0.95),
    waist: clamp(ref.waistRatio[0] + ref.waistRatio[1] * d, 0.58, 1.05),
    hip: clamp(ref.hipRatio[0] + ref.hipRatio[1] * d, 0.55, 0.95),
  };
}

export function estimateMeasurements(sex: Sex, heightCm: number, weightKg: number): BodyMeasurements {
  const ref = REFERENCE[sex];
  const bmi = clamp(bmiOf(heightCm, weightKg), 15, 45);
  const d = bmi - ref.bmi;
  // Vid oförändrat BMI växer tvärsnittsytan linjärt med längden, alltså omkretsen med roten ur längden.
  const scale = Math.sqrt(heightCm / ref.height);
  const girth = ([base, slope]: [number, number]) => (base + slope * d) * scale;

  const chest = girth(ref.chest);
  const waist = girth(ref.waist);
  const hip = girth(ref.hip);
  const ratios = sectionRatios(sex, bmi);
  const chestWD = widthDepthFromCircumference(chest, ratios.chest, SECTION_EXPONENT.chest);
  const waistWD = widthDepthFromCircumference(waist, ratios.waist, SECTION_EXPONENT.waist);
  const hipWD = widthDepthFromCircumference(hip, ratios.hip, SECTION_EXPONENT.hip);

  return {
    heightCm,
    neck: round1(girth(ref.neck)),
    shoulderWidth: round1(ref.shoulderPerHeight * heightCm + ref.shoulderPerBmi * d),
    chest: round1(chest),
    chestWidth: round1(chestWD.width),
    chestDepth: round1(chestWD.depth),
    waist: round1(waist),
    waistWidth: round1(waistWD.width),
    waistDepth: round1(waistWD.depth),
    hip: round1(hip),
    hipWidth: round1(hipWD.width),
    hipDepth: round1(hipWD.depth),
    thigh: round1(girth(ref.thigh)),
    calf: round1(girth(ref.calf)),
    bicep: round1(girth(ref.bicep)),
    inseam: round1(ref.inseamPerHeight * heightCm),
    armLength: round1(ref.armPerHeight * heightCm),
  };
}

type Section = "chest" | "waist" | "hip";
const SECTIONS: Section[] = ["chest", "waist", "hip"];

/**
 * Sätter en ny omkrets för bröst/midja/höft och skalar om bredd och djup så att
 * tvärsnittet behåller sin form. Används när användaren justerar ett mått för hand.
 */
export function withCircumference(m: BodyMeasurements, section: Section, circumference: number): BodyMeasurements {
  const width = m[`${section}Width`];
  const depth = m[`${section}Depth`];
  const wd = widthDepthFromCircumference(circumference, depth / width, SECTION_EXPONENT[section]);
  return {
    ...m,
    [section]: round1(circumference),
    [`${section}Width`]: round1(wd.width),
    [`${section}Depth`]: round1(wd.depth),
  };
}

/** Räknar om omkretsarna från bredd och djup (används efter skanning). */
export function withDerivedCircumferences(m: BodyMeasurements): BodyMeasurements {
  const out = { ...m };
  for (const s of SECTIONS) {
    out[s] = round1(circumferenceFromWidthDepth(m[`${s}Width`], m[`${s}Depth`], SECTION_EXPONENT[s]));
  }
  return out;
}

/** Rimliga gränser för manuell inmatning, så att 3D-modellen inte kan gå sönder. */
export const LIMITS: Record<string, [number, number]> = {
  neck: [25, 60],
  shoulderWidth: [28, 60],
  chest: [60, 180],
  waist: [45, 190],
  hip: [60, 190],
  thigh: [30, 110],
  calf: [22, 65],
  bicep: [17, 65],
  inseam: [55, 105],
  armLength: [40, 80],
};

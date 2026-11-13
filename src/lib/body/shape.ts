// Kroppsform och proportioner – underlag för stilråden.

import type { BodyMeasurements, Sex } from "../types";

export type BodyShape =
  | "hourglass"
  | "pear"
  | "inverted_triangle"
  | "rectangle"
  | "apple"
  | "trapezoid"
  | "triangle"
  | "oval";

export type LegProportion = "short_legs" | "balanced" | "long_legs";

export interface ShapeAnalysis {
  shape: BodyShape;
  label: string;
  description: string;
  legProportion: LegProportion;
  legLabel: string;
  /** Nyckeltal som visas för användaren. */
  ratios: { label: string; value: string }[];
  tips: string[];
}

const LABELS: Record<BodyShape, string> = {
  hourglass: "Timglas",
  pear: "Päron",
  inverted_triangle: "Inverterad triangel (V-form)",
  rectangle: "Rektangel",
  apple: "Äpple",
  trapezoid: "Trapets",
  triangle: "Triangel",
  oval: "Oval",
};

const DESCRIPTIONS: Record<BodyShape, string> = {
  hourglass: "Bröst och höft är ungefär lika breda och midjan är tydligt markerad.",
  pear: "Höften är bredare än överkroppen och midjan är markerad.",
  inverted_triangle: "Axlar och bröst är tydligt bredare än midja och höft.",
  rectangle: "Bröst, midja och höft har ungefär samma mått – en rak, jämn linje.",
  apple: "Tyngdpunkten ligger kring midjan, medan ben och armar ofta är smalare.",
  trapezoid: "Breda axlar och bröst som smalnar lagom mot midjan – de flesta snitt fungerar.",
  triangle: "Midja och höft är bredare än bröst och axlar.",
  oval: "Midjan är det bredaste måttet på överkroppen.",
};

const TIPS: Record<BodyShape, string[]> = {
  hourglass: [
    "Välj plagg som följer midjan: omlott, skärp i midjan och figurnära stickat.",
    "Hög midja på byxor och kjolar framhäver proportionerna.",
    "Undvik raka, boxiga snitt som döljer midjan.",
  ],
  pear: [
    "Dra blicken uppåt med ljusa färger, mönster eller detaljer på överdelen.",
    "Strukturerade axlar, båtringning och vida kragar balanserar höften.",
    "Mörka, raka eller lätt utställda byxor och A-linjeformade kjolar smickrar.",
  ],
  inverted_triangle: [
    "Lägg volymen nedtill: raka eller vida byxor, ljusare färg på underdelen.",
    "V-ringning och enkla, släta överdelar tonar ner axelpartiet.",
    "Undvik axelvaddar och breda horisontella ränder över bröstet.",
  ],
  rectangle: [
    "Skapa form med lager på lager, skärp och plagg med struktur.",
    "Kontrast mellan över- och underdel bryter upp den raka linjen.",
    "Kavajer och jackor med markerad midja eller axel ger mer siluett.",
  ],
  apple: [
    "Raka, fallande tyger som inte klänger över magen ger en lång linje.",
    "V-ringning och öppna lager (kavaj, lång kofta) förlänger överkroppen.",
    "Visa benen: smalare byxor eller kjol till knät balanserar helheten.",
  ],
  trapezoid: [
    "Välsittande plagg i rätt storlek räcker långt – undvik för stora snitt.",
    "Normal eller smal passform framhäver axlarna utan att strama.",
    "Du kan bära både ränder, mönster och enfärgat.",
  ],
  triangle: [
    "Bygg upp axelpartiet: strukturerade jackor, skjortor med ok, lager på lager.",
    "Mörkare, raka byxor och ljusare överdelar balanserar proportionerna.",
    "Undvik tajta överdelar ihop med ljusa, vida byxor.",
  ],
  oval: [
    "Raka snitt i tyger med lite tyngd faller snyggt utan att strama.",
    "Enfärgat eller ton i ton, gärna mörkare, ger en sammanhållen lång linje.",
    "Öppen skjorta eller overshirt över t-shirt skapar lodräta linjer.",
  ],
};

const LEG_LABELS: Record<LegProportion, string> = {
  short_legs: "Längre överkropp, kortare ben",
  balanced: "Balanserade proportioner",
  long_legs: "Längre ben, kortare överkropp",
};

const LEG_TIPS: Record<LegProportion, string> = {
  short_legs: "Hög midja och samma färg på byxor och skor får benen att se längre ut.",
  balanced: "Dina proportioner mellan ben och överkropp är jämna – de flesta plagglängder fungerar.",
  long_legs: "Längre överdelar, låg till normal midja och lager på lager balanserar långa ben.",
};

function classify(sex: Sex, m: BodyMeasurements): BodyShape {
  const { chest, waist, hip } = m;
  if (sex === "female") {
    if (waist >= 0.9 * chest && waist >= 0.86 * hip) return "apple";
    const defined = waist <= 0.78 * Math.min(chest, hip);
    if (hip >= 1.06 * chest) return defined || waist <= 0.8 * hip ? "pear" : "rectangle";
    if (chest >= 1.06 * hip) return "inverted_triangle";
    return defined ? "hourglass" : "rectangle";
  }
  if (waist >= 0.99 * chest) return "oval";
  if (hip >= 1.04 * chest) return "triangle";
  const drop = chest / waist;
  if (drop >= 1.22) return "inverted_triangle";
  if (drop >= 1.1) return "trapezoid";
  return "rectangle";
}

export function analyzeShape(sex: Sex, m: BodyMeasurements): ShapeAnalysis {
  const shape = classify(sex, m);
  const legRatio = m.inseam / m.heightCm;
  const legProportion: LegProportion = legRatio < 0.44 ? "short_legs" : legRatio > 0.472 ? "long_legs" : "balanced";
  const fmt = (v: number) => v.toFixed(2).replace(".", ",");
  return {
    shape,
    label: LABELS[shape],
    description: DESCRIPTIONS[shape],
    legProportion,
    legLabel: LEG_LABELS[legProportion],
    ratios: [
      { label: "Midja / höft", value: fmt(m.waist / m.hip) },
      { label: "Bröst / midja", value: fmt(m.chest / m.waist) },
      { label: "Innerben / längd", value: fmt(legRatio) },
    ],
    tips: [...TIPS[shape], LEG_TIPS[legProportion]],
  };
}

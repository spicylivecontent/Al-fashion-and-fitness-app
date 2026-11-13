// Energibehov och makromål. Räknas alltid ut här – även i AI-läget – så att
// säkerhetsgränserna gäller oavsett vem som sedan sätter ihop måltiderna.

import { bmiOf } from "../body/estimate";
import type { Goal, NutritionTargets, Profile } from "../types";

const ACTIVITY: Record<number, number> = { 1: 1.35, 2: 1.4, 3: 1.5, 4: 1.55, 5: 1.65, 6: 1.725 };

/** Lägsta dagliga energiintag planen får föreslå. */
const KCAL_FLOOR = { male: 1600, female: 1300 } as const;

export const GOAL_LABELS: Record<Goal, string> = {
  lose_fat: "Gå ner i fettvikt",
  build_muscle: "Bygga muskler",
  maintain: "Behålla vikten och bli starkare",
};

export interface TargetResult {
  targets: NutritionTargets;
  /** Målet som faktiskt används – kan skilja sig från det valda av säkerhetsskäl. */
  effectiveGoal: Goal;
  warnings: string[];
}

export function computeTargets(profile: Profile): TargetResult {
  const { sex, heightCm, weightKg, age } = profile;
  const days = Math.min(6, Math.max(1, Math.round(profile.trainingDaysPerWeek)));
  const bmi = bmiOf(heightCm, weightKg);
  const warnings: string[] = [];

  let goal = profile.goal;
  if (goal === "lose_fat" && bmi < 20) {
    goal = "maintain";
    warnings.push(
      "Ditt BMI ligger redan lågt, så planen är inställd på att behålla vikten och bygga styrka i stället för viktnedgång.",
    );
  }
  if (bmi < 18.5) {
    warnings.push("Ditt BMI räknas som undervikt. Prata gärna med vården innan du ändrar kost eller träning.");
  }
  if (bmi >= 35) {
    warnings.push("Vid kraftig övervikt är det klokt att stämma av med vården innan du börjar träna hårt.");
  }

  // Mifflin–St Jeor.
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
  const tdee = bmr * ACTIVITY[days];
  let kcal = tdee;
  if (goal === "lose_fat") kcal = tdee - Math.min(500, tdee * 0.2);
  if (goal === "build_muscle") kcal = tdee + Math.min(300, tdee * 0.1);
  const floor = KCAL_FLOOR[sex];
  if (kcal < floor) {
    kcal = floor;
    warnings.push(`Energiintaget är satt till lägst ${floor} kcal per dag – lägre än så rekommenderas inte utan stöd från vården.`);
  }

  // Protein räknas på en vikt motsvarande högst BMI 27, annars blir mängden orimlig vid övervikt.
  const leanReference = Math.min(weightKg, 27 * (heightCm / 100) ** 2);
  const proteinPerKg = goal === "lose_fat" ? 2 : goal === "build_muscle" ? 1.8 : 1.6;
  const proteinG = proteinPerKg * leanReference;
  const fatG = Math.max(0.8 * leanReference, (kcal * 0.25) / 9);
  const carbsG = Math.max(0, (kcal - proteinG * 4 - fatG * 9) / 4);

  return {
    effectiveGoal: goal,
    warnings,
    targets: {
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      kcal: Math.round(kcal / 10) * 10,
      proteinG: Math.round(proteinG),
      fatG: Math.round(fatG),
      carbsG: Math.round(carbsG),
    },
  };
}

export const PLAN_DISCLAIMER =
  "Planen är allmän vägledning och ersätter inte råd från läkare, dietist eller fysioterapeut. Avbryt och sök vård om du får ont eller mår dåligt.";

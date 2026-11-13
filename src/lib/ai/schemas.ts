// Validering av det webbläsaren skickar till API:t.

import { z } from "zod";
import { EDITABLE_KEYS } from "../types";

export const ProfileSchema = z.object({
  sex: z.enum(["male", "female"]),
  heightCm: z.number().min(130).max(230),
  weightKg: z.number().min(35).max(250),
  age: z.number().int().min(18).max(100),
  adultConfirmed: z.literal(true),
  hasGym: z.boolean(),
  goal: z.enum(["lose_fat", "build_muscle", "maintain"]),
  trainingDaysPerWeek: z.number().int().min(1).max(6),
  clothingBudgetSek: z.number().min(100).max(100000),
  foodBudgetSekPerWeek: z.number().min(100).max(10000),
  styles: z.array(z.string().max(40)).max(8),
  shoeSize: z.string().max(4),
  diet: z.enum(["omnivore", "pescetarian", "vegetarian", "vegan"]),
  allergies: z.string().max(200),
});

const cm = z.number().min(10).max(260);
export const MeasurementsSchema = z.object({
  heightCm: cm,
  chestWidth: cm,
  chestDepth: cm,
  waistWidth: cm,
  waistDepth: cm,
  hipWidth: cm,
  hipDepth: cm,
  ...Object.fromEntries(EDITABLE_KEYS.map((key) => [key, cm])),
} as Record<"heightCm" | "chestWidth" | "chestDepth" | "waistWidth" | "waistDepth" | "hipWidth" | "hipDepth" | (typeof EDITABLE_KEYS)[number], typeof cm>);

export const StylistRequestSchema = z.object({ profile: ProfileSchema, measurements: MeasurementsSchema });
export const PlanRequestSchema = z.object({ profile: ProfileSchema });

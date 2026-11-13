// Gemensamma typer för hela appen.

export type Sex = "male" | "female";
export type Goal = "lose_fat" | "build_muscle" | "maintain";
export type Diet = "omnivore" | "pescetarian" | "vegetarian" | "vegan";

export interface Profile {
  sex: Sex;
  heightCm: number;
  weightKg: number;
  age: number;
  /** Användaren har intygat att hen är minst 18 år och att bilderna föreställer hen själv. */
  adultConfirmed: boolean;
  hasGym: boolean;
  goal: Goal;
  trainingDaysPerWeek: number;
  /** Maxpris för en komplett outfit, i kronor. */
  clothingBudgetSek: number;
  foodBudgetSekPerWeek: number;
  styles: string[];
  /** EU-storlek, tom sträng om den inte är angiven. */
  shoeSize: string;
  diet: Diet;
  allergies: string;
}

/** Alla mått i centimeter. Omkrets om inget annat anges. */
export interface BodyMeasurements {
  heightCm: number;
  neck: number;
  /** Rak axelbredd, axelspets till axelspets. */
  shoulderWidth: number;
  chest: number;
  chestWidth: number;
  chestDepth: number;
  waist: number;
  waistWidth: number;
  waistDepth: number;
  hip: number;
  hipWidth: number;
  hipDepth: number;
  thigh: number;
  calf: number;
  bicep: number;
  /** Innerbenslängd, gren till golv. */
  inseam: number;
  /** Axelspets till handled. */
  armLength: number;
}

/** De mått användaren kan se och justera för hand. */
export const EDITABLE_KEYS = [
  "neck",
  "shoulderWidth",
  "chest",
  "waist",
  "hip",
  "thigh",
  "calf",
  "bicep",
  "inseam",
  "armLength",
] as const;
export type EditableKey = (typeof EDITABLE_KEYS)[number];

export type MeasurementSource = "estimate" | "scan" | "manual";

export const MEASUREMENT_LABELS: Record<EditableKey, string> = {
  neck: "Hals",
  shoulderWidth: "Axelbredd",
  chest: "Bröst",
  waist: "Midja",
  hip: "Höft",
  thigh: "Lår",
  calf: "Vad",
  bicep: "Överarm",
  inseam: "Innerben",
  armLength: "Ärmlängd",
};

export type GarmentKind =
  | "tshirt"
  | "shirt"
  | "sweater"
  | "hoodie"
  | "jacket"
  | "coat"
  | "trousers"
  | "jeans"
  | "shorts"
  | "skirt"
  | "dress"
  | "shoes";

export const GARMENT_KINDS: GarmentKind[] = [
  "tshirt",
  "shirt",
  "sweater",
  "hoodie",
  "jacket",
  "coat",
  "trousers",
  "jeans",
  "shorts",
  "skirt",
  "dress",
  "shoes",
];

export const GARMENT_LABELS: Record<GarmentKind, string> = {
  tshirt: "T-shirt",
  shirt: "Skjorta",
  sweater: "Tröja",
  hoodie: "Hoodie",
  jacket: "Jacka",
  coat: "Kappa/rock",
  trousers: "Byxor",
  jeans: "Jeans",
  shorts: "Shorts",
  skirt: "Kjol",
  dress: "Klänning",
  shoes: "Skor",
};

export type GarmentFit = "slim" | "regular" | "relaxed" | "oversized";

export const FIT_LABELS: Record<GarmentFit, string> = {
  slim: "Smal",
  regular: "Normal",
  relaxed: "Ledig",
  oversized: "Oversize",
};

/** Var på kroppen plagget sitter – styr lager i 3D-vyn och vilka plagg som kan kombineras. */
export type GarmentSlot = "top" | "layer" | "bottom" | "onepiece" | "shoes";

export function slotOf(kind: GarmentKind): GarmentSlot {
  switch (kind) {
    case "tshirt":
    case "shirt":
    case "sweater":
    case "hoodie":
      return "top";
    case "jacket":
    case "coat":
      return "layer";
    case "trousers":
    case "jeans":
    case "shorts":
    case "skirt":
      return "bottom";
    case "dress":
      return "onepiece";
    case "shoes":
      return "shoes";
  }
}

export interface Product {
  id: string;
  title: string;
  brand: string;
  retailer: string;
  /** Produktsida hos butiken. Saknas för demoprodukter. */
  url: string | null;
  priceSek: number;
  kind: GarmentKind;
  fit: GarmentFit;
  colorName: string;
  colorHex: string;
  /** Kort motivering till varför plagget passar just den här kroppen. */
  why?: string;
  /** true = påhittad exempelprodukt, false = hittad på nätet av AI-stylisten. */
  demo: boolean;
}

export interface Outfit {
  id: string;
  name: string;
  occasion: string;
  description: string;
  items: Product[];
}

export interface StylistResult {
  source: "ai" | "demo";
  /** När förslagen togs fram (ISO-datum). Priser från nätet gäller per det datumet. */
  generatedAt?: string;
  summary: string;
  tips: string[];
  outfits: Outfit[];
}

export interface CartLine {
  product: Product;
  size: string;
  quantity: number;
}

export interface Address {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  email: string;
}

export type OrderStatus = "awaiting_purchase" | "purchased";

export interface Order {
  id: string;
  createdAt: string;
  lines: CartLine[];
  address: Address;
  totalSek: number;
  status: OrderStatus;
}

// ---- Träning & kost ----

export interface Exercise {
  name: string;
  sets: string;
  note?: string;
}

export interface TrainingDay {
  day: string;
  title: string;
  focus: string;
  exercises: Exercise[];
}

export interface TrainingPlan {
  summary: string;
  location: "gym" | "home";
  days: TrainingDay[];
  progression: string[];
}

export interface Meal {
  name: string;
  items: string[];
  kcal: number;
  proteinG: number;
}

export interface ShoppingItem {
  name: string;
  amount: string;
  priceSek: number;
  /** Butik där priset hittades (endast AI-läge). */
  store?: string;
}

export interface NutritionTargets {
  bmr: number;
  tdee: number;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

export interface NutritionPlan {
  targets: NutritionTargets;
  meals: Meal[];
  shoppingList: ShoppingItem[];
  weeklyCostSek: number;
  /** true om priserna är hämtade från nätet, false om de är schabloner. */
  pricesVerified: boolean;
  notes: string[];
}

export interface HealthPlan {
  source: "ai" | "demo";
  generatedAt?: string;
  training: TrainingPlan;
  nutrition: NutritionPlan;
  warnings: string[];
}

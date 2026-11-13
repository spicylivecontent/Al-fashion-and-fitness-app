// Regelbaserad tränings- och kostplan som används när ingen AI-nyckel finns.
// Livsmedelspriserna här är SCHABLONER (ungefärliga svenska butikspriser) och
// visas som uppskattningar. Aktuella priser hämtas i AI-läget.

import type {
  Diet,
  Exercise,
  Goal,
  HealthPlan,
  Meal,
  NutritionPlan,
  NutritionTargets,
  Profile,
  ShoppingItem,
  TrainingDay,
  TrainingPlan,
} from "../types";
import { PLAN_DISCLAIMER, computeTargets } from "./targets";

// ---------- Kost ----------

interface Food {
  name: string;
  /** Per 100 g. */
  kcal: number;
  protein: number;
  /** Uppskattat pris per kilo, kronor. */
  pricePerKg: number;
  unit?: { name: string; grams: number };
}

const FOODS = {
  oats: { name: "havregryn", kcal: 370, protein: 13, pricePerKg: 20 },
  milk: { name: "mellanmjölk", kcal: 46, protein: 3.5, pricePerKg: 14 },
  oatDrink: { name: "havredryck", kcal: 45, protein: 1, pricePerKg: 20 },
  egg: { name: "ägg", kcal: 140, protein: 12.5, pricePerKg: 58, unit: { name: "st", grams: 60 } },
  banana: { name: "banan", kcal: 90, protein: 1.1, pricePerKg: 28, unit: { name: "st", grams: 120 } },
  apple: { name: "äpple", kcal: 52, protein: 0.3, pricePerKg: 30, unit: { name: "st", grams: 150 } },
  quark: { name: "naturell kvarg", kcal: 60, protein: 11, pricePerKg: 44 },
  soyYoghurt: { name: "sojayoghurt", kcal: 50, protein: 4, pricePerKg: 30 },
  chicken: { name: "kycklingfilé", kcal: 110, protein: 23, pricePerKg: 95 },
  mince: { name: "nötfärs", kcal: 190, protein: 19, pricePerKg: 110 },
  salmon: { name: "laxfilé", kcal: 190, protein: 20, pricePerKg: 180 },
  tuna: { name: "tonfisk i vatten", kcal: 110, protein: 25, pricePerKg: 120 },
  lentils: { name: "röda linser (torra)", kcal: 340, protein: 24, pricePerKg: 40 },
  beans: { name: "kokta bönor", kcal: 120, protein: 7.5, pricePerKg: 28 },
  tofu: { name: "tofu", kcal: 130, protein: 14, pricePerKg: 75 },
  soyMince: { name: "sojafärs", kcal: 150, protein: 18, pricePerKg: 75 },
  rice: { name: "ris (torrt)", kcal: 355, protein: 7, pricePerKg: 25 },
  pasta: { name: "pasta (torr)", kcal: 355, protein: 12, pricePerKg: 20 },
  potato: { name: "potatis", kcal: 80, protein: 2, pricePerKg: 12 },
  crispbread: { name: "knäckebröd", kcal: 340, protein: 10, pricePerKg: 45 },
  peanutButter: { name: "jordnötssmör", kcal: 600, protein: 25, pricePerKg: 80 },
  vegetables: { name: "frysta grönsaker", kcal: 35, protein: 2.5, pricePerKg: 30 },
  tomatoes: { name: "krossade tomater", kcal: 25, protein: 1.2, pricePerKg: 25 },
  oil: { name: "rapsolja", kcal: 880, protein: 0, pricePerKg: 35 },
} satisfies Record<string, Food>;

type FoodKey = keyof typeof FOODS;
type Role = "protein" | "carb" | "fixed";
type Ingredient = [FoodKey, number, Role];

interface MealTemplate {
  name: string;
  ingredients: Ingredient[];
}

const BREAKFAST: MealTemplate = {
  name: "Frukost: havregrynsgröt med banan och ägg",
  ingredients: [
    ["oats", 80, "carb"],
    ["milk", 250, "fixed"],
    ["banana", 120, "fixed"],
    ["egg", 120, "protein"],
  ],
};
const SNACK: MealTemplate = {
  name: "Mellanmål: kvarg, knäckebröd och frukt",
  ingredients: [
    ["quark", 250, "protein"],
    ["crispbread", 30, "carb"],
    ["peanutButter", 20, "fixed"],
    ["apple", 150, "fixed"],
  ],
};

/** Två nivåer per kosthållning: standard och en billigare variant. */
const MENUS: Record<Diet, { standard: MealTemplate[]; budget: MealTemplate[] }> = {
  omnivore: {
    standard: [
      BREAKFAST,
      { name: "Lunch: kyckling med ris och grönsaker", ingredients: [["chicken", 150, "protein"], ["rice", 80, "carb"], ["vegetables", 150, "fixed"], ["oil", 10, "fixed"]] },
      { name: "Middag: pasta med köttfärssås", ingredients: [["mince", 120, "protein"], ["pasta", 90, "carb"], ["tomatoes", 200, "fixed"], ["vegetables", 100, "fixed"]] },
      SNACK,
    ],
    budget: [
      BREAKFAST,
      { name: "Lunch: linsgryta med ris", ingredients: [["lentils", 80, "protein"], ["rice", 70, "carb"], ["tomatoes", 200, "fixed"], ["vegetables", 150, "fixed"], ["oil", 10, "fixed"]] },
      { name: "Middag: kycklingpasta med tomatsås", ingredients: [["chicken", 120, "protein"], ["pasta", 90, "carb"], ["tomatoes", 200, "fixed"], ["vegetables", 100, "fixed"]] },
      SNACK,
    ],
  },
  pescetarian: {
    standard: [
      BREAKFAST,
      { name: "Lunch: tonfisksallad med ris", ingredients: [["tuna", 150, "protein"], ["rice", 80, "carb"], ["vegetables", 150, "fixed"], ["oil", 10, "fixed"]] },
      { name: "Middag: lax med potatis och grönsaker", ingredients: [["salmon", 140, "protein"], ["potato", 350, "carb"], ["vegetables", 150, "fixed"]] },
      SNACK,
    ],
    budget: [
      BREAKFAST,
      { name: "Lunch: linsgryta med ris", ingredients: [["lentils", 80, "protein"], ["rice", 70, "carb"], ["tomatoes", 200, "fixed"], ["vegetables", 150, "fixed"], ["oil", 10, "fixed"]] },
      { name: "Middag: pasta med tonfisk och tomat", ingredients: [["tuna", 150, "protein"], ["pasta", 90, "carb"], ["tomatoes", 200, "fixed"], ["vegetables", 100, "fixed"]] },
      SNACK,
    ],
  },
  vegetarian: {
    standard: [
      BREAKFAST,
      { name: "Lunch: linsgryta med ris", ingredients: [["lentils", 90, "protein"], ["rice", 70, "carb"], ["tomatoes", 200, "fixed"], ["vegetables", 150, "fixed"], ["oil", 10, "fixed"]] },
      { name: "Middag: pasta med sojafärssås", ingredients: [["soyMince", 150, "protein"], ["pasta", 90, "carb"], ["tomatoes", 200, "fixed"], ["vegetables", 100, "fixed"]] },
      SNACK,
    ],
    budget: [
      BREAKFAST,
      { name: "Lunch: linsgryta med ris", ingredients: [["lentils", 90, "protein"], ["rice", 70, "carb"], ["tomatoes", 200, "fixed"], ["vegetables", 150, "fixed"], ["oil", 10, "fixed"]] },
      { name: "Middag: bönchili med ris", ingredients: [["beans", 300, "protein"], ["rice", 80, "carb"], ["tomatoes", 200, "fixed"], ["oil", 10, "fixed"]] },
      SNACK,
    ],
  },
  vegan: {
    standard: [
      { name: "Frukost: havregrynsgröt med banan och jordnötssmör", ingredients: [["oats", 90, "carb"], ["oatDrink", 250, "fixed"], ["banana", 120, "fixed"], ["peanutButter", 30, "fixed"]] },
      { name: "Lunch: linsgryta med ris", ingredients: [["lentils", 100, "protein"], ["rice", 70, "carb"], ["tomatoes", 200, "fixed"], ["vegetables", 150, "fixed"], ["oil", 10, "fixed"]] },
      { name: "Middag: tofu med pasta och tomatsås", ingredients: [["tofu", 200, "protein"], ["pasta", 90, "carb"], ["tomatoes", 200, "fixed"], ["vegetables", 100, "fixed"]] },
      { name: "Mellanmål: sojayoghurt, knäckebröd och frukt", ingredients: [["soyYoghurt", 300, "protein"], ["crispbread", 30, "carb"], ["peanutButter", 20, "fixed"], ["apple", 150, "fixed"]] },
    ],
    budget: [
      { name: "Frukost: havregrynsgröt med banan och jordnötssmör", ingredients: [["oats", 90, "carb"], ["oatDrink", 250, "fixed"], ["banana", 120, "fixed"], ["peanutButter", 30, "fixed"]] },
      { name: "Lunch: linsgryta med ris", ingredients: [["lentils", 100, "protein"], ["rice", 70, "carb"], ["tomatoes", 200, "fixed"], ["vegetables", 150, "fixed"], ["oil", 10, "fixed"]] },
      { name: "Middag: bönchili med ris", ingredients: [["beans", 350, "protein"], ["rice", 80, "carb"], ["tomatoes", 200, "fixed"], ["oil", 10, "fixed"]] },
      { name: "Mellanmål: sojayoghurt, knäckebröd och frukt", ingredients: [["soyYoghurt", 300, "protein"], ["crispbread", 30, "carb"], ["peanutButter", 20, "fixed"], ["apple", 150, "fixed"]] },
    ],
  },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function totals(meals: MealTemplate[], kP: number, kC: number) {
  const sum = { kcal: 0, protein: 0, kcalCarb: 0, kcalOther: 0, proteinScalable: 0, proteinOther: 0 };
  for (const meal of meals) {
    for (const [key, grams, role] of meal.ingredients) {
      const f: Food = FOODS[key];
      const k = role === "protein" ? kP : role === "carb" ? kC : 1;
      const kcal = (f.kcal * grams * k) / 100;
      const protein = (f.protein * grams * k) / 100;
      sum.kcal += kcal;
      sum.protein += protein;
      if (role === "carb") sum.kcalCarb += kcal;
      else sum.kcalOther += kcal;
      if (role === "protein") sum.proteinScalable += protein;
      else sum.proteinOther += protein;
    }
  }
  return sum;
}

/** Skalar portionerna: proteinkällorna mot proteinmålet, kolhydratkällorna mot energimålet. */
function scale(meals: MealTemplate[], targets: NutritionTargets): { kP: number; kC: number } {
  let kP = 1;
  let kC = 1;
  for (let i = 0; i < 4; i++) {
    const t = totals(meals, kP, kC);
    kP = clamp((kP * (targets.proteinG - t.proteinOther)) / t.proteinScalable, 0.6, 2.2);
    const t2 = totals(meals, kP, kC);
    kC = clamp((kC * (targets.kcal - t2.kcalOther)) / t2.kcalCarb, 0.3, 3);
  }
  return { kP, kC };
}

function roundGrams(grams: number, food: Food): number {
  if (food.unit) return Math.max(1, Math.round(grams / food.unit.grams)) * food.unit.grams;
  return Math.max(5, Math.round(grams / 5) * 5);
}

function describe(grams: number, food: Food): string {
  if (food.unit) return `${Math.round(grams / food.unit.grams)} ${food.unit.name} ${food.name}`;
  if (food === FOODS.milk || food === FOODS.oatDrink) return `${Math.round(grams / 10)} dl ${food.name}`;
  return `${grams} g ${food.name}`;
}

function amountLabel(grams: number, food: Food): string {
  if (food.unit) return `${Math.round(grams / food.unit.grams)} ${food.unit.name}`;
  if (food === FOODS.milk || food === FOODS.oatDrink || food === FOODS.oil) {
    return `${(grams / 1000).toFixed(1).replace(".", ",")} l`;
  }
  return grams >= 1000 ? `${(grams / 1000).toFixed(1).replace(".", ",")} kg` : `${Math.round(grams / 10) * 10} g`;
}

function buildMenu(templates: MealTemplate[], targets: NutritionTargets) {
  const { kP, kC } = scale(templates, targets);
  const weekly = new Map<FoodKey, number>();
  const meals: Meal[] = templates.map((template) => {
    let kcal = 0;
    let protein = 0;
    const items = template.ingredients.map(([key, grams, role]) => {
      const food: Food = FOODS[key];
      const g = roundGrams(grams * (role === "protein" ? kP : role === "carb" ? kC : 1), food);
      kcal += (food.kcal * g) / 100;
      protein += (food.protein * g) / 100;
      weekly.set(key, (weekly.get(key) ?? 0) + g * 7);
      return describe(g, food);
    });
    return { name: template.name, items, kcal: Math.round(kcal / 10) * 10, proteinG: Math.round(protein) };
  });
  const shoppingList: ShoppingItem[] = [...weekly.entries()]
    .map(([key, grams]) => {
      const food: Food = FOODS[key];
      return { name: food.name, amount: amountLabel(grams, food), priceSek: Math.round((grams / 1000) * food.pricePerKg) };
    })
    .sort((a, b) => b.priceSek - a.priceSek);
  const weeklyCostSek = shoppingList.reduce((sum, i) => sum + i.priceSek, 0);
  return { meals, shoppingList, weeklyCostSek };
}

export function localNutrition(profile: Profile, targets: NutritionTargets): NutritionPlan {
  const menus = MENUS[profile.diet];
  const built = [buildMenu(menus.standard, targets), buildMenu(menus.budget, targets)];
  const standard = built[0];
  // Portionerna skalas efter målen, så räkna efter vilken meny som faktiskt blir billigast.
  const budget = built[1].weeklyCostSek <= built[0].weeklyCostSek ? built[1] : built[0];
  const notes: string[] = [];
  let chosen = standard;
  if (standard.weeklyCostSek > profile.foodBudgetSekPerWeek) {
    chosen = budget;
    if (budget.weeklyCostSek > profile.foodBudgetSekPerWeek) {
      notes.push(
        `Den billigaste menyn landar på cirka ${budget.weeklyCostSek} kr i veckan, vilket är mer än din budget på ${profile.foodBudgetSekPerWeek} kr. Storpack, frysvaror och extrapriser kan pressa kostnaden ytterligare.`,
      );
    } else {
      notes.push("Menyn är anpassad med billigare proteinkällor för att rymmas i din budget.");
    }
  }
  notes.push("Priserna är schabloner, inte dagspriser. Variera gärna grönsaker och frukt efter säsong och extrapriser.");
  if (profile.diet === "vegan") notes.push("Som vegan behöver du tillskott av vitamin B12.");
  if (profile.allergies.trim()) {
    notes.push(`Demoplanen tar inte hänsyn till allergier (${profile.allergies.trim()}) – kontrollera ingredienserna själv.`);
  }
  return { targets, ...chosen, pricesVerified: false, notes };
}

// ---------- Träning ----------

const ex = (name: string, sets: string, note?: string): Exercise => ({ name, sets, note });

const GYM = {
  fullA: { title: "Helkropp A", focus: "Knäböj och press", exercises: [ex("Knäböj", "3 × 6–8"), ex("Bänkpress", "3 × 6–8"), ex("Sittande kabelrodd", "3 × 8–10"), ex("Axelpress med hantlar", "2 × 8–10"), ex("Rumänska marklyft", "2 × 8–10"), ex("Plankan", "3 × 45 s")] },
  fullB: { title: "Helkropp B", focus: "Marklyft och drag", exercises: [ex("Marklyft", "3 × 5"), ex("Latsdrag eller chins", "3 × 8–10"), ex("Lutande hantelpress", "3 × 8–10"), ex("Utfallssteg", "2 × 10 per ben"), ex("Face pulls", "2 × 12–15"), ex("Hängande benlyft", "3 × 10")] },
  fullC: { title: "Helkropp C", focus: "Ben och axlar", exercises: [ex("Benpress", "3 × 10"), ex("Militärpress", "3 × 6–8"), ex("Hantelrodd", "3 × 8–10 per arm"), ex("Höftlyft med skivstång", "3 × 8–10"), ex("Dips eller armhävningar", "2 × så många du klarar"), ex("Bicepscurl", "2 × 12")] },
  upperA: { title: "Överkropp A", focus: "Tung press och rodd", exercises: [ex("Bänkpress", "4 × 5–7"), ex("Skivstångsrodd", "4 × 6–8"), ex("Axelpress med hantlar", "3 × 8–10"), ex("Latsdrag", "3 × 8–10"), ex("Triceps i kabel", "2 × 12"), ex("Bicepscurl", "2 × 12")] },
  upperB: { title: "Överkropp B", focus: "Volym för bröst, rygg och axlar", exercises: [ex("Lutande hantelpress", "3 × 8–10"), ex("Chins eller latsdrag", "3 × 6–10"), ex("Sittande kabelrodd", "3 × 10"), ex("Sidolyft", "3 × 12–15"), ex("Face pulls", "3 × 12–15"), ex("Dips", "2 × så många du klarar")] },
  lowerA: { title: "Underkropp A", focus: "Tung knäböj", exercises: [ex("Knäböj", "4 × 5–7"), ex("Rumänska marklyft", "3 × 8"), ex("Benpress", "3 × 10"), ex("Vadpress", "3 × 12–15"), ex("Hängande benlyft", "3 × 10")] },
  lowerB: { title: "Underkropp B", focus: "Marklyft och säte", exercises: [ex("Marklyft", "3 × 5"), ex("Bulgariska utfall", "3 × 8–10 per ben"), ex("Höftlyft med skivstång", "3 × 8–10"), ex("Lårcurl", "3 × 10–12"), ex("Plankan", "3 × 60 s")] },
  push: { title: "Press", focus: "Bröst, axlar, triceps", exercises: [ex("Bänkpress", "4 × 6–8"), ex("Militärpress", "3 × 6–8"), ex("Lutande hantelpress", "3 × 8–10"), ex("Sidolyft", "3 × 12–15"), ex("Triceps i kabel", "3 × 10–12")] },
  pull: { title: "Drag", focus: "Rygg, biceps", exercises: [ex("Marklyft", "3 × 5"), ex("Chins eller latsdrag", "4 × 6–10"), ex("Sittande kabelrodd", "3 × 8–10"), ex("Face pulls", "3 × 12–15"), ex("Bicepscurl", "3 × 10–12")] },
  legs: { title: "Ben", focus: "Lår, säte, vader", exercises: [ex("Knäböj", "4 × 6–8"), ex("Rumänska marklyft", "3 × 8–10"), ex("Benpress", "3 × 10–12"), ex("Lårcurl", "3 × 10–12"), ex("Vadpress", "4 × 12–15")] },
};

const HOME = {
  a: { title: "Helkropp A", focus: "Press och knäböj med kroppsvikt", exercises: [ex("Armhävningar", "4 × 8–15", "På knä om det behövs"), ex("Knäböj", "4 × 12–20", "Bär en packad ryggsäck för mer motstånd"), ex("Rodd under ett stadigt bord", "4 × 8–12"), ex("Utfallssteg", "3 × 10 per ben"), ex("Plankan", "3 × 45 s")] },
  b: { title: "Helkropp B", focus: "Axlar, säte och rygg", exercises: [ex("Pike-armhävningar", "3 × 6–12"), ex("Bulgariska utfall", "3 × 8–12 per ben", "Bakre foten på en stol"), ex("Ryggsäcksrodd", "4 × 10–15 per arm"), ex("Höftlyft på ett ben", "3 × 10–15 per ben"), ex("Dips mellan två stolar", "3 × 8–12"), ex("Liggande benlyft", "3 × 12")] },
  c: { title: "Helkropp C", focus: "Uthållig styrka", exercises: [ex("Smala armhävningar", "3 × 8–12"), ex("Step-ups på stol", "3 × 12 per ben"), ex("Rygglyft på golvet", "3 × 15"), ex("Vadpress i trappa", "3 × 15–20"), ex("Sidoplanka", "3 × 30 s per sida"), ex("Burpees", "3 × 10")] },
  cardio: { title: "Kondition", focus: "Puls och förbränning", exercises: [ex("Rask promenad eller lätt jogg", "10 min uppvärmning"), ex("Intervaller: 1 min snabbt, 1 min lugnt", "8–10 varv", "Löpning, trappor eller cykel"), ex("Lugn nedvarvning", "5–10 min")] },
};

type Session = { title: string; focus: string; exercises: Exercise[] };

const SCHEDULE: Record<number, string[]> = {
  1: ["Onsdag"],
  2: ["Måndag", "Torsdag"],
  3: ["Måndag", "Onsdag", "Fredag"],
  4: ["Måndag", "Tisdag", "Torsdag", "Fredag"],
  5: ["Måndag", "Tisdag", "Onsdag", "Fredag", "Lördag"],
  6: ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"],
};

function sessions(hasGym: boolean, days: number): Session[] {
  if (hasGym) {
    const g = GYM;
    switch (days) {
      case 1: return [g.fullA];
      case 2: return [g.fullA, g.fullB];
      case 3: return [g.fullA, g.fullB, g.fullC];
      case 4: return [g.upperA, g.lowerA, g.upperB, g.lowerB];
      case 5: return [g.upperA, g.lowerA, g.push, g.pull, g.legs];
      default: return [g.push, g.pull, g.legs, g.push, g.pull, g.legs];
    }
  }
  const h = HOME;
  switch (days) {
    case 1: return [h.a];
    case 2: return [h.a, h.b];
    case 3: return [h.a, h.b, h.c];
    case 4: return [h.a, h.cardio, h.b, h.c];
    case 5: return [h.a, h.cardio, h.b, h.c, h.cardio];
    default: return [h.a, h.cardio, h.b, h.cardio, h.c, h.cardio];
  }
}

export function localTraining(profile: Profile, goal: Goal): TrainingPlan {
  const days = Math.min(6, Math.max(1, Math.round(profile.trainingDaysPerWeek)));
  const plan = sessions(profile.hasGym, days);
  const trainingDays: TrainingDay[] = plan.map((s, i) => {
    const exercises = [...s.exercises];
    if (goal === "lose_fat" && s !== HOME.cardio) {
      exercises.push(ex("Avslutande kondition", "10–15 min", profile.hasGym ? "Roddmaskin, crosstrainer eller löpband i rask takt" : "Rask promenad, jogg eller trappor"));
    }
    return { day: SCHEDULE[days][i], title: s.title, focus: s.focus, exercises };
  });

  const where = profile.hasGym ? "på gymmet" : "hemma utan utrustning";
  const goalText: Record<Goal, string> = {
    lose_fat: "Styrkan behåller musklerna medan underskottet i kosten tar fettet.",
    build_muscle: "Tunga basövningar med stegvis ökad belastning bygger muskler.",
    maintain: "Regelbunden styrketräning håller dig stark och rörlig.",
  };
  const progression = profile.hasGym
    ? ["Börja med en vikt där du klarar den lägre repsgränsen med god teknik.", "När du klarar den övre repsgränsen i alla set: öka vikten 2,5–5 kg nästa pass.", "Vila 2–3 minuter mellan tunga set och 1–2 minuter mellan lättare."]
    : ["Lägg till repetitioner tills du når den övre gränsen i alla set.", "Gör sedan övningen tyngre: långsammare tempo, ett ben eller en arm i taget, eller en tyngre ryggsäck.", "Ett par hantlar eller ett gummiband (cirka 150–400 kr) ger fler alternativ, men behövs inte."];
  if (goal === "lose_fat") progression.push("Sikta på 8 000–10 000 steg om dagen utöver passen.");
  progression.push("Var fjärde till sjätte vecka: ta en lugnare vecka med ungefär hälften så många set.");

  return {
    summary: `${days} pass i veckan ${where}. ${goalText[goal]}`,
    location: profile.hasGym ? "gym" : "home",
    days: trainingDays,
    progression,
  };
}

export function localPlan(profile: Profile): HealthPlan {
  const { targets, effectiveGoal, warnings } = computeTargets(profile);
  return {
    source: "demo",
    training: localTraining(profile, effectiveGoal),
    nutrition: localNutrition(profile, targets),
    warnings: [...warnings, PLAN_DISCLAIMER],
  };
}

// AI-planen: träningsschema och kostplan med aktuella matpriser.
//
// Energi- och proteinmålen räknas ut i vår egen kod (plan/targets.ts), inte av
// modellen, så säkerhetsgränserna gäller alltid. Modellen fyller i innehållet:
// övningar, måltider och en inköpslista med priser den slagit upp på nätet.

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { GOAL_LABELS, PLAN_DISCLAIMER, computeTargets } from "../plan/targets";
import type { HealthPlan, Profile } from "../types";
import { AiError, MODEL, getClient, researchWithWebSearch } from "./client";

const PlanSchema = z.object({
  training: z.object({
    summary: z.string(),
    days: z.array(
      z.object({
        day: z.string(),
        title: z.string(),
        focus: z.string(),
        exercises: z.array(z.object({ name: z.string(), sets: z.string(), note: z.string() })),
      }),
    ),
    progression: z.array(z.string()),
  }),
  nutrition: z.object({
    meals: z.array(z.object({ name: z.string(), items: z.array(z.string()), kcal: z.number(), proteinG: z.number() })),
    shoppingList: z.array(z.object({ name: z.string(), amount: z.string(), priceSek: z.number(), store: z.string() })),
    notes: z.array(z.string()),
  }),
});

const DIET_LABELS = { omnivore: "allätare", pescetarian: "pescetarian", vegetarian: "vegetarian", vegan: "vegan" } as const;

const SYSTEM = `Du är tränare och kostrådgivare i en svensk app. Du tar fram ett träningsschema och en kostplan som användaren faktiskt kan följa med den utrustning och den matbudget hen har.

Energi- och proteinmålen är redan uträknade och får inte ändras – de innehåller säkerhetsmarginaler. Din uppgift är att fylla dem med innehåll: effektiva pass, enkla måltider och en inköpslista.

Matpriserna ska vara verkliga. Använd webbsökningen för att slå upp vad varorna kostar just nu i svenska matbutiker (till exempel Willys, Lidl, ICA, Coop eller Hemköp) och ange vilken butik priset kommer från. Hittar du inget aktuellt pris för en vara, säg det i stället för att gissa.

Ge inga medicinska råd, föreslå inga kosttillskott utöver B12 för veganer och rekommendera aldrig ett lägre energiintag än det angivna. Skriv på svenska.`;

function prompt(profile: Profile): { text: string; warnings: string[]; targets: ReturnType<typeof computeTargets>["targets"] } {
  const { targets, effectiveGoal, warnings } = computeTargets(profile);
  const text = `Användaren:
Kön: ${profile.sex === "male" ? "man" : "kvinna"}, ${profile.age} år, ${profile.heightCm} cm, ${profile.weightKg} kg
Mål: ${GOAL_LABELS[effectiveGoal]}
Träning: ${profile.trainingDaysPerWeek} pass i veckan, ${profile.hasGym ? "har gymkort" : "har inget gymkort – träna hemma eller ute utan utrustning som kostar pengar"}
Kost: ${DIET_LABELS[profile.diet]}${profile.allergies.trim() ? `, undvik: ${profile.allergies.trim()}` : ""}
Matbudget: högst ${profile.foodBudgetSekPerWeek} kr per vecka

Dagliga mål som ska hållas: ${targets.kcal} kcal, ${targets.proteinG} g protein, ${targets.fatG} g fett, ${targets.carbsG} g kolhydrater.

Ta fram:
1. Ett veckoschema med ${profile.trainingDaysPerWeek} pass: veckodag, passets namn och fokus, övningar med set och repetitioner, och hur man ökar belastningen över tid.
2. En dagsmeny (frukost, lunch, middag och mellanmål) som landar på målen, med mängder i gram eller styck samt kcal och protein per måltid.
3. En inköpslista för en vecka med mängd, aktuellt pris och butik för varje vara. Summan ska rymmas i matbudgeten; går det inte, visa den billigaste rimliga lösningen och säg vad den kostar.`;
  return { text, warnings, targets };
}

function structurePrompt(research: string): string {
  return `Nedan finns ett träningsschema och en kostplan. Gör om det till det efterfrågade formatet utan att lägga till, ändra eller gissa några uppgifter.

- note på en övning: kort teknik- eller utförandetips, tom sträng om inget anges.
- priceSek: varans pris i kronor för den mängd som ska köpas, som ett tal. Varor utan angivet pris tas inte med i inköpslistan; nämn dem i notes i stället.
- store: butiken priset kommer från.
- notes: övriga kommentarer om kosten, en per rad.

<plan>
${research}
</plan>`;
}

export async function aiPlan(profile: Profile): Promise<HealthPlan> {
  const { text, warnings, targets } = prompt(profile);
  const research = await researchWithWebSearch(SYSTEM, text, 12);

  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { format: zodOutputFormat(PlanSchema), effort: "low" },
    messages: [{ role: "user", content: structurePrompt(research.text) }],
  });
  const parsed = response.parsed_output;
  if (!parsed || !parsed.training.days.length || !parsed.nutrition.meals.length) {
    throw new AiError("AI-tjänstens svar gick inte att tolka.");
  }

  const shoppingList = parsed.nutrition.shoppingList
    .filter((i) => i.priceSek > 0)
    .map((i) => ({ name: i.name, amount: i.amount, priceSek: Math.round(i.priceSek), store: i.store || undefined }));
  const weeklyCostSek = shoppingList.reduce((sum, i) => sum + i.priceSek, 0);
  const notes = [...parsed.nutrition.notes];
  if (weeklyCostSek > profile.foodBudgetSekPerWeek) {
    notes.unshift(`Inköpslistan landar på ${weeklyCostSek} kr, vilket är över din veckobudget på ${profile.foodBudgetSekPerWeek} kr.`);
  }

  return {
    source: "ai",
    generatedAt: new Date().toISOString(),
    training: {
      summary: parsed.training.summary,
      location: profile.hasGym ? "gym" : "home",
      days: parsed.training.days.map((d) => ({
        day: d.day,
        title: d.title,
        focus: d.focus,
        exercises: d.exercises.map((e) => ({ name: e.name, sets: e.sets, note: e.note || undefined })),
      })),
      progression: parsed.training.progression,
    },
    nutrition: {
      targets,
      meals: parsed.nutrition.meals.map((meal) => ({ ...meal, kcal: Math.round(meal.kcal), proteinG: Math.round(meal.proteinG) })),
      shoppingList,
      weeklyCostSek,
      pricesVerified: true,
      notes,
    },
    warnings: [...warnings, PLAN_DISCLAIMER],
  };
}

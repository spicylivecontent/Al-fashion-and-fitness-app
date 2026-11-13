// Regelbaserad stylist som används när ingen AI-nyckel är konfigurerad.
// Den sätter ihop outfits ur demokatalogen utifrån kroppsform, stilval och budget.

import type { ShapeAnalysis } from "../body/shape";
import { DEMO_CATALOG, type CatalogItem, type Occasion } from "../catalog/demo";
import type { GarmentSlot, Outfit, Product, Profile, StylistResult } from "../types";
import { slotOf } from "../types";

const OCCASIONS: { key: Occasion; name: string; description: string }[] = [
  { key: "vardag", name: "Vardag", description: "Bekvämt och avslappnat för en vanlig dag." },
  { key: "jobb", name: "Jobb & smart casual", description: "Prydligt utan att vara uppklätt." },
  { key: "fest", name: "Utgång & fest", description: "Lite mer uppklätt för middag eller fest." },
];

function score(item: CatalogItem, profile: Profile, shape: ShapeAnalysis, occasion: Occasion): number {
  let s = 0;
  if (item.occasions.includes(occasion)) s += 3;
  else s -= 4;
  s += item.styles.filter((style) => profile.styles.includes(style)).length * 2;
  if (item.flatters.includes(shape.shape)) s += 3;
  else if (item.flatters.length === 0) s += 1;
  return s;
}

function toProduct(item: CatalogItem, shape: ShapeAnalysis): Product {
  const why = item.flatters.includes(shape.shape)
    ? `Snittet smickrar kroppsformen ${shape.label.toLowerCase()}.`
    : "Basplagg som fungerar till det mesta.";
  return {
    id: `demo-${item.id}`,
    title: item.title,
    brand: "Demo",
    retailer: "Demobutiken",
    url: null,
    priceSek: item.priceSek,
    kind: item.kind,
    fit: item.fit,
    colorName: item.colorName,
    colorHex: item.colorHex,
    why,
    demo: true,
  };
}

function build(
  profile: Profile,
  shape: ShapeAnalysis,
  occasion: Occasion,
  used: Set<string>,
): { items: CatalogItem[]; total: number } | null {
  const pool = DEMO_CATALOG.filter((i) => i.sex === "unisex" || i.sex === profile.sex);
  const bySlot = (slot: GarmentSlot) => pool.filter((i) => slotOf(i.kind) === slot);
  const cheapest = (slot: GarmentSlot) => Math.min(...bySlot(slot).map((i) => i.priceSek));
  const budget = profile.clothingBudgetSek;

  // Klänning om den vinner på poäng (finns bara i damsortimentet).
  const dresses = bySlot("onepiece").filter((i) => i.occasions.includes(occasion));
  const useDress =
    dresses.length > 0 &&
    occasion !== "vardag" &&
    Math.max(...dresses.map((d) => score(d, profile, shape, occasion))) >= 6;

  const required: GarmentSlot[] = useDress ? ["onepiece"] : ["bottom", "top"];
  const optional: GarmentSlot[] = occasion === "vardag" ? ["shoes", "layer"] : ["layer", "shoes"];
  if (required.reduce((sum, slot) => sum + cheapest(slot), 0) > budget) return null;

  const chosen: CatalogItem[] = [];
  let remaining = budget;
  const pick = (slot: GarmentSlot, reserve: number) => {
    const candidates = bySlot(slot)
      .filter((i) => i.priceSek <= remaining - reserve)
      .map((i) => ({ i, s: score(i, profile, shape, occasion) - (used.has(i.id) ? 5 : 0) - (i.priceSek / budget) * 2 }))
      .sort((a, b) => b.s - a.s);
    const best = candidates[0];
    if (!best || best.s < 0) return;
    chosen.push(best.i);
    remaining -= best.i.priceSek;
  };

  required.forEach((slot, index) => {
    const reserve = required.slice(index + 1).reduce((sum, s) => sum + cheapest(s), 0);
    pick(slot, reserve);
  });
  if (chosen.length < required.length) return null;
  for (const slot of optional) pick(slot, 0);

  chosen.forEach((i) => used.add(i.id));
  return { items: chosen, total: budget - remaining };
}

export function localStylist(profile: Profile, shape: ShapeAnalysis): StylistResult {
  const used = new Set<string>();
  const outfits: Outfit[] = [];
  for (const occasion of OCCASIONS) {
    const result = build(profile, shape, occasion.key, used);
    if (!result) continue;
    outfits.push({
      id: `demo-${occasion.key}`,
      name: occasion.name,
      occasion: occasion.name,
      description: occasion.description,
      items: result.items.map((i) => toProduct(i, shape)),
    });
  }
  const summary = outfits.length
    ? `Kroppsform: ${shape.label}. ${shape.description} Förslagen nedan är valda för att framhäva det – och håller sig inom ${profile.clothingBudgetSek} kr per outfit.`
    : `Budgeten på ${profile.clothingBudgetSek} kr räcker inte till en komplett outfit ur demokatalogen. Höj budgeten under Profil.`;
  return { source: "demo", summary, tips: shape.tips, outfits };
}

export function outfitTotal(outfit: Outfit): number {
  return outfit.items.reduce((sum, i) => sum + i.priceSek, 0);
}

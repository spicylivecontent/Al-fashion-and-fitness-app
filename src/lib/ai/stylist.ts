// AI-stylisten: söker upp riktiga plagg med aktuella priser och sätter ihop
// outfits som passar kroppsform, stil och budget.
//
// Två steg: först får modellen söka fritt på nätet och redovisa vad den hittat,
// sedan struktureras resultatet till JSON. Efteråt kontrollerar vi själva att
// länkarna pekar på sidor som faktiskt fanns i sökresultaten och att varje
// outfit håller budgeten – modellen får inte sista ordet om det.

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { analyzeShape } from "../body/shape";
import type { BodyMeasurements, Outfit, Product, Profile, StylistResult } from "../types";
import { GARMENT_KINDS, slotOf } from "../types";
import { AiError, MODEL, getClient, researchWithWebSearch } from "./client";

const ItemSchema = z.object({
  kind: z.enum(GARMENT_KINDS as [string, ...string[]]),
  title: z.string(),
  brand: z.string(),
  retailer: z.string(),
  url: z.string(),
  priceSek: z.number(),
  colorName: z.string(),
  colorHex: z.string(),
  fit: z.enum(["slim", "regular", "relaxed", "oversized"]),
  why: z.string(),
});

const ResultSchema = z.object({
  summary: z.string(),
  tips: z.array(z.string()),
  outfits: z.array(
    z.object({
      name: z.string(),
      occasion: z.string(),
      description: z.string(),
      items: z.array(ItemSchema),
    }),
  ),
});

const SYSTEM = `Du är personlig stylist i en svensk app. Användaren har skannat sin kropp och vill ha kompletta outfits som får hen att se så bra ut som möjligt, med plagg som går att beställa i dag.

Det du föreslår visas på en 3D-avatar av användaren och läggs i en varukorg. Därför måste varje plagg vara en verklig produkt som just nu säljs av en nätbutik som levererar till Sverige, med pris i svenska kronor och länk till produktsidan. Använd webbsökningen för att hitta produkterna och priserna. Ta bara med plagg vars pris och produktsida du faktiskt har sett i sökresultaten – hitta aldrig på produkter, priser eller länkar. Om du inte hittar något som passar för en del av en outfit är det bättre att utelämna den delen och säga det.

Motivera valen utifrån användarens kroppsform och proportioner: vad snittet, längden och färgen gör för helheten. Skriv på svenska.`;

function describe(profile: Profile, m: BodyMeasurements): string {
  const shape = analyzeShape(profile.sex, m);
  return [
    `Kön: ${profile.sex === "male" ? "man" : "kvinna"}`,
    `Längd ${m.heightCm} cm, vikt ${profile.weightKg} kg`,
    `Mått (cm): bröst ${m.chest}, midja ${m.waist}, höft ${m.hip}, axelbredd ${m.shoulderWidth}, innerben ${m.inseam}, ärmlängd ${m.armLength}, lår ${m.thigh}`,
    `Kroppsform: ${shape.label} – ${shape.description}`,
    `Proportioner: ${shape.legLabel}`,
    `Stil: ${profile.styles.length ? profile.styles.join(", ") : "inga särskilda önskemål"}`,
    `Budget: högst ${profile.clothingBudgetSek} kr per komplett outfit`,
  ].join("\n");
}

function researchPrompt(profile: Profile, m: BodyMeasurements): string {
  return `${describe(profile, m)}

Ta fram tre kompletta outfits: en för vardag, en för jobb eller smart casual och en för fest eller utgång. En komplett outfit är överdel och underdel (eller klänning), gärna ett ytterplagg och skor om budgeten räcker. Summan för varje outfit ska rymmas i budgeten.

Redovisa för varje plagg: plaggtyp, exakt produktnamn, märke, butik, pris i kronor, adressen till produktsidan, färg, passform (smal, normal, ledig eller oversize) och varför det passar den här kroppen. Avsluta med några korta stilråd som gäller just den här kroppsformen.`;
}

function structurePrompt(research: string, budget: number): string {
  return `Nedan finns en stylists förslag på outfits. Gör om det till det efterfrågade formatet utan att lägga till, ändra eller gissa några uppgifter.

- kind: plaggtypen. Välj det närmaste av de tillåtna värdena (kavaj räknas som jacket, kofta och stickat som sweater, kappa och rock som coat, chinos och kostymbyxor som trousers).
- url: produktsidans adress exakt som den står. Tom sträng om adress saknas.
- priceSek: priset i kronor som ett tal.
- colorHex: en hexkod (#rrggbb) som motsvarar plaggets färg.
- fit: slim, regular, relaxed eller oversized.
- why: stylistens motivering, en eller två meningar.
- summary: två eller tre meningar om vad som klär den här kroppen.
- tips: stylistens allmänna stilråd, ett råd per rad.

Varje outfit får kosta högst ${budget} kr.

<forslag>
${research}
</forslag>`;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Länken godkänns bara om den pekar på en sida som fanns bland sökresultaten. */
function verifiedUrl(raw: string, hosts: Set<string>): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.replace(/^www\./, "");
    for (const known of hosts) {
      if (host === known || host.endsWith(`.${known}`) || known.endsWith(`.${host}`)) return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

/** Plockar bort det dyraste tillvalet tills outfiten ryms i budgeten; null om det inte går. */
function fitBudget(items: Product[], budget: number): Product[] | null {
  const kept = [...items];
  const total = () => kept.reduce((sum, i) => sum + i.priceSek, 0);
  while (total() > budget) {
    const optional = kept
      .filter((i) => slotOf(i.kind) === "layer" || slotOf(i.kind) === "shoes")
      .sort((a, b) => b.priceSek - a.priceSek)[0];
    if (!optional) return null;
    kept.splice(kept.indexOf(optional), 1);
  }
  const slots = new Set(kept.map((i) => slotOf(i.kind)));
  const complete = slots.has("onepiece") || (slots.has("top") && slots.has("bottom"));
  return complete ? kept : null;
}

export async function aiStylist(profile: Profile, m: BodyMeasurements): Promise<StylistResult> {
  const research = await researchWithWebSearch(SYSTEM, researchPrompt(profile, m), 14);

  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { format: zodOutputFormat(ResultSchema), effort: "low" },
    messages: [{ role: "user", content: structurePrompt(research.text, profile.clothingBudgetSek) }],
  });
  const parsed = response.parsed_output;
  if (!parsed) throw new AiError("AI-tjänstens svar gick inte att tolka.");

  const outfits: Outfit[] = [];
  parsed.outfits.forEach((outfit, oi) => {
    const items: Product[] = [];
    outfit.items.forEach((item, ii) => {
      const url = verifiedUrl(item.url, research.hosts);
      // Utan verifierad länk och rimligt pris går plagget inte att beställa: ta inte med det.
      if (!url || !(item.priceSek > 0)) return;
      items.push({
        id: `ai-${oi}-${ii}-${Math.abs(hash(url))}`,
        title: item.title,
        brand: item.brand,
        retailer: item.retailer,
        url,
        priceSek: Math.round(item.priceSek),
        kind: item.kind as Product["kind"],
        fit: item.fit,
        colorName: item.colorName,
        colorHex: HEX.test(item.colorHex) ? item.colorHex : "#8a8d93",
        why: item.why,
        demo: false,
      });
    });
    const withinBudget = fitBudget(items, profile.clothingBudgetSek);
    if (!withinBudget) return;
    outfits.push({
      id: `ai-${oi}`,
      name: outfit.name,
      occasion: outfit.occasion,
      description: outfit.description,
      items: withinBudget,
    });
  });

  if (!outfits.length) {
    throw new AiError("AI-stylisten hittade inga kompletta outfits med verifierade länkar inom budgeten. Försök igen eller höj budgeten.", 422);
  }
  return {
    source: "ai",
    generatedAt: new Date().toISOString(),
    summary: parsed.summary,
    tips: parsed.tips.slice(0, 8),
    outfits,
  };
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h;
}

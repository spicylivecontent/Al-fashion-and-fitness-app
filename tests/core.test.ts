import { describe, expect, it } from "vitest";
import { buildBodyModel, ringPerimeter } from "@/lib/avatar/model";
import { buildBodyParts, buildOutfitParts } from "@/lib/avatar/parts";
import { estimateMeasurements, withCircumference } from "@/lib/body/estimate";
import { analyzeShape } from "@/lib/body/shape";
import { circumferenceFromWidthDepth, superellipsePerimeter, widthDepthFromCircumference } from "@/lib/body/superellipse";
import { localPlan } from "@/lib/plan/local";
import { computeTargets } from "@/lib/plan/targets";
import { aggregateScan } from "@/lib/scan/aggregate";
import { censorBoxes } from "@/lib/scan/censor";
import { measureImage } from "@/lib/scan/measure";
import { evaluateFit, garmentDimensions, recommendSize } from "@/lib/sizing";
import { localStylist, outfitTotal } from "@/lib/stylist/local";
import type { Profile } from "@/lib/types";
import { renderSynthetic } from "./synthetic";

const profile: Profile = {
  sex: "male",
  heightCm: 180,
  weightKg: 80,
  age: 30,
  adultConfirmed: true,
  hasGym: true,
  goal: "build_muscle",
  trainingDaysPerWeek: 3,
  clothingBudgetSek: 2000,
  foodBudgetSekPerWeek: 700,
  styles: ["Minimalistisk"],
  shoeSize: "43",
  diet: "omnivore",
  allergies: "",
};

describe("superellips", () => {
  it("ger cirkelns omkrets för n = 2 och lika axlar", () => {
    expect(superellipsePerimeter(10, 10, 2)).toBeCloseTo(2 * Math.PI * 10, 1);
  });
  it("är omvändbar mellan omkrets och bredd/djup", () => {
    const { width, depth } = widthDepthFromCircumference(100, 0.7, 2.6);
    expect(depth / width).toBeCloseTo(0.7, 5);
    expect(circumferenceFromWidthDepth(width, depth, 2.6)).toBeCloseTo(100, 3);
  });
});

describe("uppskattade mått", () => {
  it("ger rimliga värden för en genomsnittlig man och kvinna", () => {
    const man = estimateMeasurements("male", 178, 78);
    expect(man.chest).toBeGreaterThan(95);
    expect(man.chest).toBeLessThan(105);
    expect(man.waist).toBeGreaterThan(82);
    expect(man.waist).toBeLessThan(92);
    const woman = estimateMeasurements("female", 165, 64);
    expect(woman.hip).toBeGreaterThan(woman.chest);
    expect(woman.waist).toBeLessThan(woman.chest);
  });
  it("ökar omkretsarna med vikten", () => {
    const light = estimateMeasurements("male", 180, 65);
    const heavy = estimateMeasurements("male", 180, 105);
    for (const key of ["chest", "waist", "hip", "thigh", "neck"] as const) {
      expect(heavy[key]).toBeGreaterThan(light[key]);
    }
  });
  it("behåller tvärsnittets form när ett mått ändras för hand", () => {
    const m = estimateMeasurements("male", 180, 80);
    const changed = withCircumference(m, "waist", m.waist + 10);
    expect(changed.waist).toBeCloseTo(m.waist + 10, 1);
    expect(changed.waistDepth / changed.waistWidth).toBeCloseTo(m.waistDepth / m.waistWidth, 2);
  });
});

describe("kroppsmodell", () => {
  it("har samma omkrets som måtten på bröst-, midje- och höftnivå", () => {
    for (const sex of ["male", "female"] as const) {
      const m = estimateMeasurements(sex, 172, 70);
      const model = buildBodyModel(m, sex);
      expect(ringPerimeter(model.torso(model.levels.chest))).toBeCloseTo(m.chest, 0);
      expect(ringPerimeter(model.torso(model.levels.waist))).toBeCloseTo(m.waist, 0);
      expect(ringPerimeter(model.torso(model.levels.hip))).toBeCloseTo(m.hip, 0);
    }
  });
  it("bär alltid underkläder", () => {
    for (const sex of ["male", "female"] as const) {
      const model = buildBodyModel(estimateMeasurements(sex, 172, 70), sex);
      const under = buildBodyParts(model).filter((p) => p.role === "underwear");
      // Kvinnor får även överdel.
      expect(under.length).toBe(sex === "female" ? 4 : 3);
    }
  });
  it("lägger plagg utanpå kroppen och ytterplagg utanpå överdelar", () => {
    const m = estimateMeasurements("male", 180, 80);
    const model = buildBodyModel(m, "male");
    const { parts } = buildOutfitParts(model, m, "male", [
      { kind: "jacket", fit: "regular", colorHex: "#000000", size: null },
      { kind: "tshirt", fit: "regular", colorHex: "#ffffff", size: null },
      { kind: "jeans", fit: "regular", colorHex: "#223355", size: null },
    ]);
    const lofts = parts.filter((p) => p.type === "loft" && p.frame === "world");
    const widthAt = (color: string, y: number) => {
      const loft = lofts.find((p) => p.color === color && p.type === "loft" && p.rings.some((r) => Math.abs(r.x) < 1));
      if (!loft || loft.type !== "loft") throw new Error("saknas");
      return loft.rings.reduce((best, r) => (Math.abs(r.y - y) < Math.abs(best.y - y) ? r : best)).a;
    };
    const y = model.levels.chest;
    const body = model.torso(y).a;
    expect(widthAt("#ffffff", y)).toBeGreaterThan(body);
    expect(widthAt("#000000", y)).toBeGreaterThan(widthAt("#ffffff", y));
  });
});

describe("storleksguide", () => {
  it("rekommenderar M i t-shirt för en man med 100 cm bröst", () => {
    const m = estimateMeasurements("male", 178, 78);
    const rec = recommendSize("male", m, "tshirt", "regular");
    expect(rec?.size).toBe("M");
  });
  it("går upp i storlek när kroppen blir större", () => {
    const sizes = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
    const small = recommendSize("male", estimateMeasurements("male", 178, 62), "shirt", "regular")!;
    const large = recommendSize("male", estimateMeasurements("male", 178, 105), "shirt", "regular")!;
    expect(sizes.indexOf(large.size)).toBeGreaterThan(sizes.indexOf(small.size));
  });
  it("ger jeans i W/L och markerar för liten storlek som trång", () => {
    const m = estimateMeasurements("male", 180, 80);
    const rec = recommendSize("male", m, "jeans", "regular")!;
    expect(rec.size).toMatch(/^W\d+\/L\d+$/);
    const tooSmall = garmentDimensions("male", "jeans", "regular", "W28/L32")!;
    expect(evaluateFit(m, tooSmall, "jeans").some((z) => z.status === "tight")).toBe(true);
  });
});

describe("kroppsform och stil", () => {
  it("klassar tydliga former", () => {
    const base = estimateMeasurements("female", 168, 62);
    const pear = { ...base, chest: 86, waist: 68, hip: 104 };
    expect(analyzeShape("female", pear).shape).toBe("pear");
    const hourglass = { ...base, chest: 96, waist: 68, hip: 97 };
    expect(analyzeShape("female", hourglass).shape).toBe("hourglass");
    const man = estimateMeasurements("male", 180, 80);
    expect(analyzeShape("male", { ...man, chest: 110, waist: 82 }).shape).toBe("inverted_triangle");
    expect(analyzeShape("male", { ...man, chest: 100, waist: 108 }).shape).toBe("oval");
  });
  it("håller varje outfit inom budget", () => {
    for (const budget of [900, 2000, 5000]) {
      for (const sex of ["male", "female"] as const) {
        const p = { ...profile, sex, clothingBudgetSek: budget };
        const m = estimateMeasurements(sex, p.heightCm, p.weightKg);
        const result = localStylist(p, analyzeShape(sex, m));
        expect(result.outfits.length).toBeGreaterThan(0);
        for (const outfit of result.outfits) expect(outfitTotal(outfit)).toBeLessThanOrEqual(budget);
      }
    }
  });
  it("säger ifrån när budgeten inte räcker", () => {
    const m = estimateMeasurements("male", 180, 80);
    const result = localStylist({ ...profile, clothingBudgetSek: 100 }, analyzeShape("male", m));
    expect(result.outfits).toHaveLength(0);
    expect(result.summary).toContain("räcker inte");
  });
});

describe("tränings- och kostplan", () => {
  it("träffar energi- och proteinmålen", () => {
    for (const diet of ["omnivore", "pescetarian", "vegetarian", "vegan"] as const) {
      const plan = localPlan({ ...profile, diet });
      const { targets, meals } = plan.nutrition;
      const kcal = meals.reduce((s, x) => s + x.kcal, 0);
      const protein = meals.reduce((s, x) => s + x.proteinG, 0);
      expect(Math.abs(kcal - targets.kcal) / targets.kcal).toBeLessThan(0.08);
      expect(protein).toBeGreaterThan(targets.proteinG * 0.8);
    }
  });
  it("ger rätt antal pass och anpassar efter gymkort", () => {
    const gym = localPlan({ ...profile, trainingDaysPerWeek: 4, hasGym: true });
    expect(gym.training.days).toHaveLength(4);
    expect(gym.training.location).toBe("gym");
    const home = localPlan({ ...profile, trainingDaysPerWeek: 3, hasGym: false });
    expect(home.training.location).toBe("home");
    expect(JSON.stringify(home.training)).not.toContain("Bänkpress");
  });
  it("föreslår aldrig viktnedgång vid lågt BMI och håller sig över energigolvet", () => {
    const thin = computeTargets({ ...profile, sex: "female", heightCm: 170, weightKg: 50, goal: "lose_fat" });
    expect(thin.effectiveGoal).toBe("maintain");
    expect(thin.warnings.length).toBeGreaterThan(0);
    const small = computeTargets({ ...profile, sex: "female", heightCm: 150, weightKg: 62, age: 60, trainingDaysPerWeek: 1, goal: "lose_fat" });
    expect(small.targets.kcal).toBeGreaterThanOrEqual(1300);
  });
  it("väljer billigare meny när budgeten är låg", () => {
    const rich = localPlan({ ...profile, foodBudgetSekPerWeek: 2000 });
    const poor = localPlan({ ...profile, foodBudgetSekPerWeek: 350 });
    expect(poor.nutrition.weeklyCostSek).toBeLessThan(rich.nutrition.weeklyCostSek);
  });
});

describe("bildmätning", () => {
  const truth = estimateMeasurements("male", 180, 92);

  it("känner igen vy och återskapar bredder och djup", () => {
    const front = measureImage(renderSynthetic(truth, "male", "front"), 180);
    expect(front.view).toBe("front");
    expect(front.issues).toEqual([]);
    expect(front.widths.chest).toBeCloseTo(truth.chestWidth, 0);
    expect(front.widths.waist).toBeCloseTo(truth.waistWidth, 0);
    expect(front.widths.hip).toBeCloseTo(truth.hipWidth, 0);
    expect(Math.abs(front.lengths.inseam! - truth.inseam)).toBeLessThan(2);
    expect(Math.abs(front.lengths.armLength! - truth.armLength)).toBeLessThan(1.5);
    expect(front.lengths.shoulderWidth).toBeCloseTo(truth.shoulderWidth, 0);

    const side = measureImage(renderSynthetic(truth, "male", "side"), 180);
    expect(side.view).toBe("side");
    expect(Math.abs(side.depths.waist! - truth.waistDepth)).toBeLessThan(1.5);
    expect(Math.abs(side.depths.hip! - truth.hipDepth)).toBeLessThan(1.5);
    expect(Math.abs(side.depths.chest! - truth.chestDepth)).toBeLessThan(1.5);
  });

  it("närmar sig de verkliga måtten ju fler bilder som läggs till", () => {
    // Profilen uppger 72 kg, men kroppen i bilderna motsvarar 92 kg.
    const front = measureImage(renderSynthetic(truth, "male", "front"), 180);
    const side = measureImage(renderSynthetic(truth, "male", "side"), 180);
    const none = aggregateScan("male", 180, 72, []);
    const one = aggregateScan("male", 180, 72, [front]);
    const two = aggregateScan("male", 180, 72, [front, side]);
    const many = aggregateScan("male", 180, 72, [front, side, front, side, front, side]);
    const error = (s: typeof one) => Math.abs(s.measurements.waist - truth.waist);
    expect(none.level).toBe("none");
    expect(error(one)).toBeLessThan(error(none));
    expect(error(two)).toBeLessThan(error(one));
    expect(error(many)).toBeLessThan(error(two));
    expect(error(many)).toBeLessThan(4.5);
    expect(many.confidence).toBeGreaterThan(two.confidence);
    expect(two.confidence).toBeGreaterThan(one.confidence);
    expect(many.sources.waist).toBe("scan");
  });

  it("godtar profilbilder där den bortre kroppshalvan är skymd", () => {
    const input = renderSynthetic(truth, "male", "side");
    for (const i of [12, 14, 16, 24, 26, 28, 30, 32]) input.landmarks[i].visibility = 0.02;
    const result = measureImage(input, 180);
    expect(result.view).toBe("side");
    expect(result.depths.waist).toBeDefined();
  });

  it("avvisar ställningar som inte går att mäta", () => {
    const input = renderSynthetic(truth, "male", "front");
    // Armarna rakt ut åt sidorna.
    input.landmarks[15] = { ...input.landmarks[15], y: input.landmarks[11].y };
    input.landmarks[16] = { ...input.landmarks[16], y: input.landmarks[12].y };
    const result = measureImage(input, 180);
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toContain("armarna");
  });

  it("avvisar bilder där hela kroppen inte syns", () => {
    const input = renderSynthetic(truth, "male", "front");
    input.landmarks[27].visibility = 0.1;
    input.landmarks[28].visibility = 0.1;
    const result = measureImage(input, 180);
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toContain("Hela kroppen");
  });
});

describe("täckning av bilder", () => {
  const input = renderSynthetic(estimateMeasurements("female", 168, 62), "female", "front");
  const model = buildBodyModel(estimateMeasurements("female", 168, 62), "female");
  const yPx = (y: number) => 20 + (168 - y) * 4;

  it("täcker underlivet hos alla och bröstet hos kvinnor", () => {
    const male = censorBoxes(input.landmarks, "male", input.imageWidth, input.imageHeight);
    const female = censorBoxes(input.landmarks, "female", input.imageWidth, input.imageHeight);
    expect(male).toHaveLength(1);
    expect(female).toHaveLength(2);
    const covers = (box: (typeof female)[number], y: number) => box.y <= yPx(y) && box.y + box.height >= yPx(y);
    // Grenen och hela området upp till höftleden ska ligga under blocket.
    expect(covers(female[0], model.levels.crotch)).toBe(true);
    expect(covers(female[0], model.levels.hip)).toBe(true);
    expect(covers(female[1], model.levels.chest)).toBe(true);
    // Blocket ska vara minst lika brett som bålen på bröstnivå.
    expect(female[1].width / 4).toBeGreaterThanOrEqual(model.torso(model.levels.chest).a * 2 * 0.95);
  });

  it("ger inga block utan ledpunkter, så att anroparen pixlar hela bilden", () => {
    expect(censorBoxes([], "female", 100, 100)).toEqual([]);
  });
});

describe("3D-geometri", () => {
  it("vänder alla ytor utåt, även på spegelvända delar", async () => {
    const { loftGeometry } = await import("@/lib/avatar/three");
    const rings = [0, 10, 20].map((y) => ({ x: 8, y, z: 0, a: 5, b: 4, n: 2 }));
    for (const mirror of [false, true]) {
      for (const order of [rings, [...rings].reverse()]) {
        const geometry = loftGeometry(order, false, false, mirror);
        const pos = geometry.getAttribute("position");
        const normal = geometry.getAttribute("normal");
        const cx = mirror ? -8 : 8;
        let outward = 0;
        for (let i = 0; i < pos.count; i++) {
          outward += (pos.getX(i) - cx) * normal.getX(i) + pos.getZ(i) * normal.getZ(i);
        }
        expect(outward).toBeGreaterThan(0);
      }
    }
  });

  it("lägger ytterplaggets ärm utanpå en vid t-shirtärm", () => {
    const m = estimateMeasurements("female", 168, 62);
    const model = buildBodyModel(m, "female");
    const { parts } = buildOutfitParts(model, m, "female", [
      { kind: "tshirt", fit: "oversized", colorHex: "#111111", size: null },
      { kind: "jacket", fit: "slim", colorHex: "#222222", size: null },
    ]);
    const sleeve = (color: string) => {
      const part = parts.find((p) => p.type === "loft" && p.frame === "armL" && p.color === color);
      if (!part || part.type !== "loft") throw new Error("saknas");
      return part.rings;
    };
    const tee = sleeve("#111111");
    const jacket = sleeve("#222222");
    // Jackärmens yta mellan två ringar är linjär: kontrollera den exakt på varje t-shirtring.
    const jacketAt = (y: number) => {
      for (let i = 0; i < jacket.length - 1; i++) {
        const [p, q] = [jacket[i], jacket[i + 1]];
        if (y <= p.y && y >= q.y) return p.a + ((q.a - p.a) * (y - p.y)) / (q.y - p.y);
      }
      throw new Error("utanför ärmen");
    };
    for (const ring of tee) expect(jacketAt(ring.y)).toBeGreaterThan(ring.a);
  });
});

describe("filmklipp", () => {
  it("bortser från rutor där kroppen är snett vriden", () => {
    const truth = estimateMeasurements("male", 180, 80);
    const front = measureImage(renderSynthetic(truth, "male", "front"), 180);
    const side = measureImage(renderSynthetic(truth, "male", "side"), 180);
    // En vriden ruta: smalare axelavstånd och kraftigt överskattade mått.
    const twisted = { ...front, shoulderSpan: front.shoulderSpan * 0.8, widths: { ...front.widths, waist: front.widths.waist! * 1.4 } };
    const clean = aggregateScan("male", 180, 80, [front, side]);
    const noisy = aggregateScan("male", 180, 80, [front, side, twisted, twisted, twisted]);
    expect(noisy.measurements.waist).toBeCloseTo(clean.measurements.waist, 0);
  });
});

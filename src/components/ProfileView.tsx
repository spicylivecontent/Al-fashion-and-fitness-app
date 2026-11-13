"use client";

import { useState, type FormEvent } from "react";
import { STYLE_OPTIONS } from "@/lib/catalog/demo";
import { GOAL_LABELS } from "@/lib/plan/targets";
import { SHOE_SIZES } from "@/lib/sizing";
import { useStore } from "@/lib/store";
import type { Diet, Goal, Profile, Sex } from "@/lib/types";

const DIETS: { value: Diet; label: string }[] = [
  { value: "omnivore", label: "Äter allt" },
  { value: "pescetarian", label: "Pescetarian" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
];

export function ProfileView({ onDone }: { onDone: () => void }) {
  const store = useStore();
  const [form, setForm] = useState<Profile>(store.profile);
  // Kön väljs aktivt första gången, i stället för att vara förvalt.
  const [sexChosen, setSexChosen] = useState(store.profileDone);
  const [error, setError] = useState("");

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setForm((f) => ({ ...f, [key]: value }));
  const number = (key: "heightCm" | "weightKg" | "age" | "clothingBudgetSek" | "foodBudgetSekPerWeek") => ({
    value: Number.isFinite(form[key]) ? form[key] : "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value === "" ? NaN : Number(e.target.value)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problems: string[] = [];
    if (!sexChosen) problems.push("Välj man eller kvinna.");
    if (!(form.heightCm >= 130 && form.heightCm <= 230)) problems.push("Ange längd mellan 130 och 230 cm.");
    if (!(form.weightKg >= 35 && form.weightKg <= 250)) problems.push("Ange vikt mellan 35 och 250 kg.");
    if (!(form.age >= 18 && form.age <= 100)) problems.push("Appen är för dig som är minst 18 år.");
    if (!form.adultConfirmed) problems.push("Du behöver intyga att du är minst 18 år.");
    if (!(form.clothingBudgetSek >= 100)) problems.push("Ange en klädbudget på minst 100 kr.");
    if (!(form.foodBudgetSekPerWeek >= 100)) problems.push("Ange en matbudget på minst 100 kr per vecka.");
    if (problems.length) {
      setError(problems.join(" "));
      return;
    }
    setError("");
    store.saveProfile({ ...form, age: Math.round(form.age) });
    onDone();
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <header className="page-head">
        <h1>Din profil</h1>
        <p>Uppgifterna används för att räkna ut dina mått, välja kläder och lägga upp träning och kost.</p>
      </header>

      <section className="card">
        <h2>Kropp</h2>
        <div className="field">
          <span className="label" id="sex-label">Kön</span>
          <div className="segmented" role="radiogroup" aria-labelledby="sex-label">
            {(["female", "male"] as Sex[]).map((sex) => (
              <button
                key={sex}
                type="button"
                role="radio"
                aria-checked={sexChosen && form.sex === sex}
                className={sexChosen && form.sex === sex ? "on" : ""}
                onClick={() => {
                  set("sex", sex);
                  setSexChosen(true);
                }}
              >
                {sex === "female" ? "Kvinna" : "Man"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid-3">
          <label className="field">
            <span className="label">Längd (cm)</span>
            <input type="number" inputMode="decimal" min={130} max={230} {...number("heightCm")} />
          </label>
          <label className="field">
            <span className="label">Vikt (kg)</span>
            <input type="number" inputMode="decimal" min={35} max={250} step="0.1" {...number("weightKg")} />
          </label>
          <label className="field">
            <span className="label">Ålder</span>
            <input type="number" inputMode="numeric" min={18} max={100} {...number("age")} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={form.adultConfirmed} onChange={(e) => set("adultConfirmed", e.target.checked)} />
          <span>Jag är minst 18 år, och de bilder och filmklipp jag använder i appen föreställer mig själv.</span>
        </label>
      </section>

      <section className="card">
        <h2>Kläder</h2>
        <div className="grid-2">
          <label className="field">
            <span className="label">Budget per komplett outfit (kr)</span>
            <input type="number" inputMode="numeric" min={100} step={50} {...number("clothingBudgetSek")} />
          </label>
          <label className="field">
            <span className="label">Skostorlek (valfritt)</span>
            <select value={form.shoeSize} onChange={(e) => set("shoeSize", e.target.value)}>
              <option value="">Inte angiven</option>
              {SHOE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field">
          <span className="label">Stil du gillar (valfritt)</span>
          <div className="chips">
            {STYLE_OPTIONS.map((style) => {
              const on = form.styles.includes(style);
              return (
                <button
                  key={style}
                  type="button"
                  aria-pressed={on}
                  className={`chip ${on ? "on" : ""}`}
                  onClick={() => set("styles", on ? form.styles.filter((s) => s !== style) : [...form.styles, style])}
                >
                  {style}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Träning och kost</h2>
        <label className="field">
          <span className="label">Mål</span>
          <select value={form.goal} onChange={(e) => set("goal", e.target.value as Goal)}>
            {(Object.keys(GOAL_LABELS) as Goal[]).map((goal) => (
              <option key={goal} value={goal}>
                {GOAL_LABELS[goal]}
              </option>
            ))}
          </select>
        </label>
        <div className="grid-2">
          <div className="field">
            <span className="label" id="gym-label">Gymkort</span>
            <div className="segmented" role="radiogroup" aria-labelledby="gym-label">
              {[true, false].map((gym) => (
                <button
                  key={String(gym)}
                  type="button"
                  role="radio"
                  aria-checked={form.hasGym === gym}
                  className={form.hasGym === gym ? "on" : ""}
                  onClick={() => set("hasGym", gym)}
                >
                  {gym ? "Ja" : "Nej"}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span className="label">Pass per vecka</span>
            <select value={form.trainingDaysPerWeek} onChange={(e) => set("trainingDaysPerWeek", Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            <span className="label">Kost</span>
            <select value={form.diet} onChange={(e) => set("diet", e.target.value as Diet)}>
              {DIETS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Matbudget per vecka (kr)</span>
            <input type="number" inputMode="numeric" min={100} step={50} {...number("foodBudgetSekPerWeek")} />
          </label>
        </div>
        <label className="field">
          <span className="label">Allergier eller sådant du inte äter (valfritt)</span>
          <input type="text" maxLength={200} value={form.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="t.ex. nötter, laktos" />
        </label>
      </section>

      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="btn primary">
          Spara och fortsätt
        </button>
      </div>
    </form>
  );
}

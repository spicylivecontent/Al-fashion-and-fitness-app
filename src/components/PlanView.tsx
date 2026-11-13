"use client";

import { useEffect, useState } from "react";
import { localPlan } from "@/lib/plan/local";
import { formatSek, useStore } from "@/lib/store";
import type { HealthPlan } from "@/lib/types";

export function PlanView({ aiAvailable }: { aiAvailable: boolean }) {
  const store = useStore();
  const { profile, plan } = store;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!plan) store.setPlan(localPlan(profile));
  }, [plan, profile, store]);

  const askAi = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI-tjänsten kunde inte nås.");
      store.setPlan(data as HealthPlan);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI-tjänsten kunde inte nås.");
    } finally {
      setLoading(false);
    }
  };

  if (!plan) return null;
  const { training, nutrition } = plan;
  const t = nutrition.targets;
  const overBudget = nutrition.weeklyCostSek > profile.foodBudgetSekPerWeek;

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Träning och kost</h1>
        <p>
          Ett schema för {profile.hasGym ? "gymmet" : "träning hemma utan gymkort"} och en kostplan för högst {formatSek(profile.foodBudgetSekPerWeek)} i veckan.
        </p>
      </header>

      {plan.warnings.length > 0 && (
        <section className="card caution">
          <ul className="plain">
            {plan.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Dagliga mål</h2>
        <dl className="tiles">
          <div>
            <dt>Energi</dt>
            <dd>{t.kcal} kcal</dd>
          </div>
          <div>
            <dt>Protein</dt>
            <dd>{t.proteinG} g</dd>
          </div>
          <div>
            <dt>Kolhydrater</dt>
            <dd>{t.carbsG} g</dd>
          </div>
          <div>
            <dt>Fett</dt>
            <dd>{t.fatG} g</dd>
          </div>
        </dl>
        <p className="muted">
          Beräknat på en förbränning i vila på {t.bmr} kcal och en total förbrukning på cirka {t.tdee} kcal per dag.
        </p>
        {plan.source === "demo" ? (
          <p className="notice">
            Planen är framtagen med inbyggda mallar och schablonpriser.{" "}
            {aiAvailable ? "AI-läget skräddarsyr planen och slår upp aktuella matpriser." : "Med en AI-nyckel skräddarsys planen och aktuella matpriser slås upp (se README)."}
          </p>
        ) : (
          plan.generatedAt && <p className="notice">Planen och matpriserna togs fram {new Date(plan.generatedAt).toLocaleDateString("sv-SE")}. Priser varierar mellan butiker och veckor.</p>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {aiAvailable && (
          <div className="actions">
            <button type="button" className="btn primary" disabled={loading} onClick={askAi}>
              {loading ? "Tar fram plan … (kan ta ett par minuter)" : plan.source === "ai" ? "Ta fram en ny plan" : "Skräddarsy med AI och aktuella priser"}
            </button>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Träningsschema</h2>
        <p>{training.summary}</p>
        <div className="days">
          {training.days.map((day) => (
            <article key={`${day.day}-${day.title}`} className="day">
              <header>
                <span className="day-name">{day.day}</span>
                <h3>{day.title}</h3>
                <span className="muted">{day.focus}</span>
              </header>
              <ul>
                {day.exercises.map((e) => (
                  <li key={e.name}>
                    <span>
                      {e.name}
                      {e.note && <small className="muted"> – {e.note}</small>}
                    </span>
                    <span className="sets">{e.sets}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <h3>Så går du framåt</h3>
        <ul className="plain">
          {training.progression.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Dagsmeny</h2>
        <div className="meals">
          {nutrition.meals.map((meal) => (
            <article key={meal.name} className="meal">
              <header>
                <h3>{meal.name}</h3>
                <span className="muted">
                  {meal.kcal} kcal · {meal.proteinG} g protein
                </span>
              </header>
              <ul className="plain">
                {meal.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Inköpslista för en vecka</h2>
        <table className="shopping">
          <thead>
            <tr>
              <th scope="col">Vara</th>
              <th scope="col">Mängd</th>
              {nutrition.pricesVerified && <th scope="col">Butik</th>}
              <th scope="col" className="num">
                {nutrition.pricesVerified ? "Pris" : "Ungefärligt pris"}
              </th>
            </tr>
          </thead>
          <tbody>
            {nutrition.shoppingList.map((item) => (
              <tr key={item.name}>
                <td>{item.name}</td>
                <td>{item.amount}</td>
                {nutrition.pricesVerified && <td>{item.store ?? "–"}</td>}
                <td className="num">{formatSek(item.priceSek)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={nutrition.pricesVerified ? 3 : 2}>
                Summa per vecka
              </th>
              <td className={`num ${overBudget ? "over" : ""}`}>{formatSek(nutrition.weeklyCostSek)}</td>
            </tr>
          </tfoot>
        </table>
        <ul className="plain">
          {nutrition.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

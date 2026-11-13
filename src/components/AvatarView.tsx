"use client";

import { useState } from "react";
import { LIMITS } from "@/lib/body/estimate";
import { analyzeShape } from "@/lib/body/shape";
import { CONFIDENCE_LABELS } from "@/lib/scan/aggregate";
import { useStore } from "@/lib/store";
import { EDITABLE_KEYS, MEASUREMENT_LABELS, type EditableKey, type MeasurementSource } from "@/lib/types";
import { AvatarCanvas } from "./AvatarCanvas";

const SOURCE_LABELS: Record<MeasurementSource, string> = {
  scan: "Skannat",
  estimate: "Uppskattat",
  manual: "Eget mått",
};

function MeasurementRow({ name }: { name: EditableKey }) {
  const store = useStore();
  const value = store.measurements[name];
  const source = store.sources[name];
  const [draft, setDraft] = useState<string | null>(null);
  const [lo, hi] = LIMITS[name];

  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft.replace(",", "."));
    setDraft(null);
    if (!Number.isFinite(parsed) || Math.abs(parsed - value) < 0.05) return;
    store.setManual(name, Math.min(hi, Math.max(lo, Math.round(parsed * 10) / 10)));
  };

  return (
    <tr>
      <th scope="row">{MEASUREMENT_LABELS[name]}</th>
      <td>
        <input
          className="measure-input"
          type="text"
          inputMode="decimal"
          aria-label={`${MEASUREMENT_LABELS[name]} i centimeter`}
          value={draft ?? value.toFixed(1).replace(".", ",")}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <span className="unit">cm</span>
      </td>
      <td>
        <span className={`badge ${source}`}>{SOURCE_LABELS[source]}</span>
        {source === "manual" && (
          <button type="button" className="link" onClick={() => store.setManual(name, null)}>
            Återställ
          </button>
        )}
      </td>
    </tr>
  );
}

export function AvatarView({ onScan, onStyle }: { onScan: () => void; onStyle: () => void }) {
  const store = useStore();
  const [rotate, setRotate] = useState(true);
  const shape = analyzeShape(store.profile.sex, store.measurements);
  const level = store.scan?.level ?? "none";

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Din avatar</h1>
        <p>En 3D-modell byggd av dina mått. Dra för att rotera, nyp eller scrolla för att zooma.</p>
      </header>

      <div className="split">
        <section className="card stage">
          <AvatarCanvas measurements={store.measurements} sex={store.profile.sex} autoRotate={rotate} onStopRotate={() => setRotate(false)} />
          <div className="stage-bar">
            <label className="check inline">
              <input type="checkbox" checked={rotate} onChange={(e) => setRotate(e.target.checked)} />
              <span>Rotera automatiskt</span>
            </label>
            <span className="muted">Avataren bär alltid underkläder.</span>
          </div>
        </section>

        <div className="stack">
          <section className="card">
            <h2>Mått</h2>
            <p className="muted">
              {level === "none"
                ? "Måtten är uppskattade från längd och vikt. Skanna dig för bättre precision, eller skriv in egna mått."
                : `${CONFIDENCE_LABELS[level]}. Du kan rätta ett mått genom att skriva in ditt eget.`}
            </p>
            <table className="measure-table">
              <tbody>
                {EDITABLE_KEYS.map((key) => (
                  <MeasurementRow key={key} name={key} />
                ))}
              </tbody>
            </table>
            <div className="actions">
              <button type="button" className="btn ghost" onClick={onScan}>
                {level === "none" ? "Skanna kroppen" : "Lägg till fler bilder"}
              </button>
            </div>
          </section>

          <section className="card">
            <h2>Kroppsform: {shape.label}</h2>
            <p>{shape.description}</p>
            <dl className="ratios">
              {shape.ratios.map((r) => (
                <div key={r.label}>
                  <dt>{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
            </dl>
            <p className="muted">{shape.legLabel}.</p>
            <div className="actions">
              <button type="button" className="btn primary" onClick={onStyle}>
                Hitta kläder som passar mig
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

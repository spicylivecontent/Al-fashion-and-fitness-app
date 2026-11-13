"use client";

import { useEffect, useMemo, useState } from "react";
import type { WornGarment } from "@/lib/avatar/parts";
import { analyzeShape } from "@/lib/body/shape";
import { STATUS_LABELS, evaluateFit, garmentDimensions, recommendSize, sizeLabels } from "@/lib/sizing";
import { formatSek, useStore } from "@/lib/store";
import { localStylist, outfitTotal } from "@/lib/stylist/local";
import { FIT_LABELS, GARMENT_LABELS, type Outfit, type Product, type StylistResult } from "@/lib/types";
import { AvatarCanvas } from "./AvatarCanvas";

interface Props {
  aiAvailable: boolean;
  onCart: () => void;
}

export function StyleView({ aiAvailable, onCart }: Props) {
  const store = useStore();
  const { profile, measurements, stylist } = store;
  const shape = useMemo(() => analyzeShape(profile.sex, measurements), [profile.sex, measurements]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const [showFit, setShowFit] = useState(false);
  const [rotate, setRotate] = useState(true);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  // Utan sparade förslag: visa direkt outfits ur demokatalogen.
  useEffect(() => {
    if (!stylist) store.setStylist(localStylist(profile, shape));
  }, [stylist, profile, shape, store]);

  const outfits = stylist?.outfits ?? [];
  const selected = outfits.find((o) => o.id === selectedId) ?? outfits[0] ?? null;

  const sizeFor = (item: Product) =>
    sizes[item.id] ??
    (item.kind === "shoes" ? profile.shoeSize : recommendSize(profile.sex, measurements, item.kind, item.fit)?.size) ??
    "";

  const garments: WornGarment[] = useMemo(
    () =>
      (selected?.items ?? []).map((item) => ({
        kind: item.kind,
        fit: item.fit,
        colorHex: item.colorHex,
        size: sizes[item.id] ?? null,
      })),
    [selected, sizes],
  );

  const askAi = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/stylist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, measurements }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI-stylisten kunde inte nås.");
      store.setStylist(data as StylistResult);
      setSelectedId(null);
      setSizes({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI-stylisten kunde inte nås.");
    } finally {
      setLoading(false);
    }
  };

  const add = (items: Product[]) => {
    const missing = items.find((i) => !sizeFor(i));
    if (missing) {
      setToast({ text: `Välj storlek på ${GARMENT_LABELS[missing.kind].toLowerCase()} först.`, ok: false });
      return;
    }
    items.forEach((i) => store.addToCart(i, sizeFor(i)));
    setToast({ text: items.length === 1 ? "Plagget ligger i varukorgen." : `${items.length} plagg ligger i varukorgen.`, ok: true });
  };

  const renderItem = (item: Product) => {
    const rec = recommendSize(profile.sex, measurements, item.kind, item.fit);
    const chosen = sizeFor(item);
    const dims = chosen ? garmentDimensions(profile.sex, item.kind, item.fit, chosen) : null;
    const zones = dims ? evaluateFit(measurements, dims, item.kind) : [];
    return (
      <li key={item.id} className="item">
        <span className="swatch" style={{ background: item.colorHex }} aria-hidden />
        <div className="item-main">
          <div className="item-title">
            <strong>{item.title}</strong>
            <span className="price">{formatSek(item.priceSek)}</span>
          </div>
          <span className="muted">
            {GARMENT_LABELS[item.kind]} · {item.colorName} · {FIT_LABELS[item.fit]} passform ·{" "}
            {item.demo ? (
              <span className="badge demo">Demo</span>
            ) : (
              <a href={item.url ?? "#"} target="_blank" rel="noopener noreferrer">
                {item.brand ? `${item.brand} hos ${item.retailer}` : item.retailer}
              </a>
            )}
          </span>
          {item.why && <p className="why">{item.why}</p>}
          <div className="item-size">
            <label>
              <span className="label">Storlek</span>
              <select value={chosen} onChange={(e) => setSizes((s) => ({ ...s, [item.id]: e.target.value }))}>
                {!chosen && <option value="">Välj</option>}
                {sizeLabels(profile.sex, item.kind, measurements.inseam).map((s) => (
                  <option key={s} value={s}>
                    {s}
                    {rec?.size === s ? " – rekommenderad" : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="zones">
              {zones.map((z) => (
                <span key={z.zone} className={`zone ${z.status}`} title={`${z.easeCm > 0 ? "+" : ""}${z.easeCm} cm vidd`}>
                  {z.label}: {STATUS_LABELS[z.status].toLowerCase()}
                </span>
              ))}
            </div>
            <button type="button" className="btn ghost small" onClick={() => add([item])}>
              Lägg i varukorg
            </button>
          </div>
          {rec && chosen === rec.size && <p className="muted note">{rec.note}</p>}
        </div>
      </li>
    );
  };

  const renderOutfit = (outfit: Outfit) => {
    const total = outfitTotal(outfit);
    const active = outfit.id === selected?.id;
    return (
      <section key={outfit.id} className={`card outfit ${active ? "active" : ""}`}>
        <div className="outfit-head">
          <div>
            <h2>{outfit.name}</h2>
            <p className="muted">{outfit.description}</p>
          </div>
          <div className="outfit-total">
            <strong>{formatSek(total)}</strong>
            <span className="muted">av {formatSek(profile.clothingBudgetSek)}</span>
          </div>
        </div>
        <ul className="items">{outfit.items.map(renderItem)}</ul>
        <div className="actions">
          <button type="button" className="btn ghost" aria-pressed={active} onClick={() => setSelectedId(outfit.id)}>
            {active ? "Visas på avataren" : "Prova på avataren"}
          </button>
          <button type="button" className="btn primary" onClick={() => add(outfit.items)}>
            Lägg hela outfiten i varukorgen
          </button>
        </div>
      </section>
    );
  };

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Stil och outfits</h1>
        <p>Kompletta outfits valda efter din kroppsform och budget. Prova dem på avataren och se vilken storlek som passar.</p>
      </header>

      <div className="split">
        <section className="card stage sticky">
          <AvatarCanvas measurements={measurements} sex={profile.sex} garments={garments} showFit={showFit} autoRotate={rotate} onStopRotate={() => setRotate(false)} />
          <div className="stage-bar">
            <label className="check inline">
              <input type="checkbox" checked={showFit} onChange={(e) => setShowFit(e.target.checked)} />
              <span>Visa passform</span>
            </label>
            <label className="check inline">
              <input type="checkbox" checked={rotate} onChange={(e) => setRotate(e.target.checked)} />
              <span>Rotera</span>
            </label>
          </div>
          {showFit && (
            <div className="legend" aria-label="Färgförklaring">
              <span className="zone tight">För trångt</span>
              <span className="zone snug">Tajt</span>
              <span className="zone good">Bra</span>
              <span className="zone loose">Löst</span>
            </div>
          )}
          <p className="muted small-print">Provningen visar längd, vidd och passform för vald storlek – inte hur tyget faller.</p>
        </section>

        <div className="stack">
          <section className="card">
            <h2>Det här klär dig</h2>
            {stylist && <p>{stylist.summary}</p>}
            <ul className="plain">
              {(stylist?.tips ?? shape.tips).map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
            {stylist?.source === "demo" ? (
              <p className="notice">
                Plaggen nedan är exempel ur en demokatalog – de går inte att beställa.{" "}
                {aiAvailable ? "Låt AI-stylisten söka upp riktiga plagg med aktuella priser." : "Med en AI-nyckel söker stylisten upp riktiga plagg med aktuella priser (se README)."}
              </p>
            ) : (
              stylist?.generatedAt && (
                <p className="notice">
                  Plagg och priser hämtades från nätet {new Date(stylist.generatedAt).toLocaleDateString("sv-SE")}. Kontrollera pris och lagerstatus hos butiken innan du köper.
                </p>
              )
            )}
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            {aiAvailable && (
              <div className="actions">
                <button type="button" className="btn primary" disabled={loading} onClick={askAi}>
                  {loading ? "Letar efter plagg … (kan ta ett par minuter)" : stylist?.source === "ai" ? "Sök nya plagg" : "Hitta riktiga plagg med AI"}
                </button>
              </div>
            )}
          </section>

          {outfits.map(renderOutfit)}

          {toast && (
            <p className={`notice toast ${toast.ok ? "" : "error"}`} role="status">
              {toast.text}{" "}
              {toast.ok && (
                <button type="button" className="link" onClick={onCart}>
                  Visa varukorgen
                </button>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { CONFIDENCE_LABELS, aggregateScan, type ScanSummary } from "@/lib/scan/aggregate";
import { renderCensoredPreview } from "@/lib/scan/censor";
import { imageToCanvas, videoFrames } from "@/lib/scan/media";
import { measureImage, type ImageMeasurement, type View } from "@/lib/scan/measure";
import { analyzeCanvas, loadPoseModel } from "@/lib/scan/pose";
import { useStore } from "@/lib/store";

export interface ScanItem {
  id: string;
  label: string;
  /** Liten, suddad och täckt kopia. Originalbilden behålls aldrig. */
  preview: string;
  result: ImageMeasurement | null;
}

const VIEW_LABELS: Record<View, string> = {
  front: "Framifrån",
  back: "Bakifrån",
  side: "Från sidan",
  oblique: "Sned vinkel",
};

function statusLabel(result: ImageMeasurement | null): string {
  if (!result) return "Ingen kropp hittades";
  if (result.view === "oblique" && result.cmPerPx > 0) return VIEW_LABELS.oblique;
  return result.ok ? VIEW_LABELS[result.view] : "Kan inte användas";
}

interface Props {
  items: ScanItem[];
  setItems: Dispatch<SetStateAction<ScanItem[]>>;
  onDone: () => void;
}

let nextId = 0;

export function ScanView({ items, setItems, onDone }: Props) {
  const store = useStore();
  const { profile } = store;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [skipped, setSkipped] = useState(0);
  const [advice, setAdvice] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const publish = (next: ScanItem[]) => {
    const results = next.map((i) => i.result).filter((r): r is ImageMeasurement => r !== null);
    const summary: ScanSummary = aggregateScan(profile.sex, profile.heightCm, profile.weightKg, results);
    setAdvice(summary.advice);
    if (summary.level === "none") {
      store.setScan(null);
    } else {
      const { measurements, sources, level, confidence, frontCount, sideCount } = summary;
      store.setScan({ measurements, sources, level, confidence, frontCount, sideCount });
    }
  };

  const handleFiles = async (files: File[]) => {
    if (!files.length || busy) return;
    setError("");
    setSkipped(0);
    setBusy("Laddar analysmodellen (cirka 30 MB första gången) …");
    try {
      await loadPoseModel();
    } catch {
      setBusy("");
      setError("Analysmodellen kunde inte laddas. Kontrollera uppkopplingen och försök igen – eller fortsätt med uppskattade mått.");
      return;
    }

    const added: ScanItem[] = [];
    let dropped = 0;
    const analyze = async (canvas: HTMLCanvasElement, label: string, keepUnusable: boolean) => {
      const analysis = await analyzeCanvas(canvas);
      const result = analysis ? measureImage(analysis, profile.heightCm) : null;
      const usable = result?.ok && result.view !== "oblique";
      if (usable || keepUnusable) {
        added.push({
          id: `scan-${nextId++}`,
          label,
          preview: renderCensoredPreview(canvas, analysis?.landmarks ?? null, profile.sex),
          result,
        });
      } else {
        dropped++;
      }
      // Släpp bildminnet direkt; bara mätvärdena och den täckta miniatyren finns kvar.
      canvas.width = 0;
      canvas.height = 0;
      await new Promise((resolve) => setTimeout(resolve, 0));
    };

    for (const [index, file] of files.entries()) {
      const prefix = files.length > 1 ? `${index + 1}/${files.length}: ` : "";
      try {
        if (file.type.startsWith("video/")) {
          for await (const frame of videoFrames(file)) {
            setBusy(`${prefix}Analyserar filmklipp, ruta ${frame.index + 1} av ${frame.total} …`);
            await analyze(frame.canvas, `${file.name} · ruta ${frame.index + 1}`, false);
          }
        } else {
          setBusy(`${prefix}Analyserar ${file.name} …`);
          await analyze(await imageToCanvas(file), file.name, true);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Filen kunde inte läsas.");
      }
    }

    const next = [...items, ...added];
    setItems(next);
    publish(next);
    setSkipped(dropped);
    setBusy("");
  };

  const remove = (id: string) => {
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    publish(next);
  };

  const clear = () => {
    setItems([]);
    setAdvice([]);
    store.setScan(null);
  };

  const scan = store.scan;
  const percent = scan ? Math.round(scan.confidence * 100) : 0;

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Skanna kroppen</h1>
        <p>Ladda upp bilder eller filmklipp på dig själv, så räknas dina mått fram och din 3D-avatar byggs.</p>
      </header>

      <section className="card privacy">
        <h2>Dina bilder stannar hos dig</h2>
        <ul className="plain">
          <li>Bilderna analyseras här i webbläsaren. De skickas aldrig till någon server och sparas inte.</li>
          <li>Miniatyrerna nedan är suddade, och intima områden täcks automatiskt.</li>
          <li>Avataren är en neutral docka med underkläder – den byggs av dina mått, inte av dina bilder.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Så tar du bra bilder</h2>
        <ol className="steps">
          <li>Ha åtsittande kläder eller underkläder – ju närmare kroppen, desto bättre mått.</li>
          <li>Hela kroppen ska synas, från hjässa till fötter. Ställ kameran i höfthöjd, 2–3 meter bort.</li>
          <li>Framifrån: fötterna axelbrett isär och armarna en bit ut från kroppen.</li>
          <li>Från sidan: stå rak med armarna längs sidorna.</li>
          <li>Filmklipp: snurra långsamt ett varv. Fler bilder ger högre precision.</li>
        </ol>

        <div
          className={`dropzone ${dragging ? "over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handleFiles([...e.dataTransfer.files]);
          }}
        >
          <input
            ref={inputRef}
            id="scan-files"
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(e) => {
              void handleFiles([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <button type="button" className="btn primary" disabled={Boolean(busy)} onClick={() => inputRef.current?.click()}>
            Välj bilder eller filmklipp
          </button>
          <p className="muted">eller dra och släpp filer här</p>
        </div>

        {busy && (
          <p className="notice" role="status">
            <span className="spinner" aria-hidden /> {busy}
          </p>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {skipped > 0 && <p className="muted">{skipped} filmrutor hoppades över eftersom vinkeln varken var rakt framifrån eller rakt från sidan.</p>}
      </section>

      {items.length > 0 && (
        <section className="card">
          <h2>Analyserade bilder</h2>
          <ul className="scan-list">
            {items.map((item) => {
              const r = item.result;
              const usable = r?.ok && r.view !== "oblique";
              return (
                <li key={item.id} className="scan-item">
                  <img src={item.preview} alt="Täckt miniatyr" />
                  <div>
                    <strong className={usable ? "ok" : "bad"}>{statusLabel(r)}</strong>
                    <span className="muted file">{item.label}</span>
                    {r?.issues.map((issue) => (
                      <span key={issue} className="issue">
                        {issue}
                      </span>
                    ))}
                  </div>
                  <button type="button" className="btn ghost small" onClick={() => remove(item.id)} aria-label={`Ta bort ${item.label}`}>
                    Ta bort
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Precision</h2>
        {scan ? (
          <>
            <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Precision">
              <div className={`meter-fill ${scan.level}`} style={{ width: `${percent}%` }} />
            </div>
            <p>
              <strong>{CONFIDENCE_LABELS[scan.level]}</strong> – {scan.frontCount} {scan.frontCount === 1 ? "bild" : "bilder"} framifrån eller bakifrån, {scan.sideCount} från sidan.
              {items.length === 0 && " Bilderna från den skanningen finns inte kvar – bara måtten sparades."}
            </p>
            {advice.length > 0 && (
              <ul className="plain">
                {advice.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="muted">
            Ingen skanning ännu. Du kan hoppa över steget – då används mått uppskattade från din längd och vikt, och du kan justera dem för hand.
          </p>
        )}
        <div className="actions">
          {scan && (
            <button type="button" className="btn ghost" onClick={clear}>
              Rensa skanningen
            </button>
          )}
          <button type="button" className="btn primary" onClick={onDone}>
            {scan ? "Visa min avatar" : "Fortsätt med uppskattade mått"}
          </button>
        </div>
      </section>
    </div>
  );
}

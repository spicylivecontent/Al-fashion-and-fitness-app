"use client";

import { useEffect, useState } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import { AvatarView } from "./AvatarView";
import { CartView } from "./CartView";
import { PlanView } from "./PlanView";
import { ProfileView } from "./ProfileView";
import { ScanView, type ScanItem } from "./ScanView";
import { StyleView } from "./StyleView";

type Tab = "profile" | "scan" | "avatar" | "style" | "plan" | "cart";

const TABS: { id: Tab; label: string }[] = [
  { id: "profile", label: "Profil" },
  { id: "scan", label: "Skanna" },
  { id: "avatar", label: "Avatar" },
  { id: "style", label: "Stil" },
  { id: "plan", label: "Träning & kost" },
  { id: "cart", label: "Varukorg" },
];

function Shell() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>("profile");
  const [aiAvailable, setAiAvailable] = useState(false);
  // Skannade miniatyrer finns bara i minnet under sessionen – de sparas aldrig.
  const [scanItems, setScanItems] = useState<ScanItem[]>([]);

  useEffect(() => {
    fetch("/api/status")
      .then((res) => res.json())
      .then((data: { ai?: boolean }) => setAiAvailable(Boolean(data.ai)))
      .catch(() => setAiAvailable(false));
  }, []);

  // Återkommande användare hamnar direkt på sin avatar.
  useEffect(() => {
    if (store.hydrated && store.profileDone) setTab("avatar");
  }, [store.hydrated]);

  const go = (next: Tab) => {
    setTab(next);
    window.scrollTo({ top: 0 });
  };
  const cartCount = store.cart.reduce((sum, l) => sum + l.quantity, 0);

  const eraseAll = () => {
    if (!window.confirm("Radera profil, mått, förslag, varukorg och beställningar från den här enheten?")) return;
    setScanItems([]);
    store.resetAll();
    go("profile");
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            P
          </span>
          <div>
            <strong>Passform</strong>
            <span className="tagline">Kläder och hälsa efter din kropp</span>
          </div>
        </div>
        <nav aria-label="Huvudmeny">
          {TABS.map((t) => {
            const locked = t.id !== "profile" && !store.profileDone;
            return (
              <button
                key={t.id}
                type="button"
                className={tab === t.id ? "on" : ""}
                aria-current={tab === t.id ? "page" : undefined}
                disabled={locked}
                onClick={() => go(t.id)}
              >
                {t.label}
                {t.id === "cart" && cartCount > 0 && <span className="count">{cartCount}</span>}
              </button>
            );
          })}
        </nav>
      </header>

      <main>
        {!store.hydrated ? (
          <p className="muted">Laddar …</p>
        ) : (
          <>
            {tab === "profile" && <ProfileView onDone={() => go("scan")} />}
            {tab === "scan" && <ScanView items={scanItems} setItems={setScanItems} onDone={() => go("avatar")} />}
            {tab === "avatar" && <AvatarView onScan={() => go("scan")} onStyle={() => go("style")} />}
            {tab === "style" && <StyleView aiAvailable={aiAvailable} onCart={() => go("cart")} />}
            {tab === "plan" && <PlanView aiAvailable={aiAvailable} />}
            {tab === "cart" && <CartView onStyle={() => go("style")} />}
          </>
        )}
      </main>

      <footer className="footer">
        <p>
          Bilder analyseras i din webbläsare och lämnar aldrig enheten. Profil och mått sparas bara lokalt här.{" "}
          {aiAvailable ? "I AI-läget skickas mått och önskemål – aldrig bilder – till AI-tjänsten." : "Appen kör i demoläge utan AI-tjänst."}
        </p>
        <button type="button" className="link" onClick={eraseAll}>
          Radera all min data
        </button>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

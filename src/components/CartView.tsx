"use client";

import { useState, type FormEvent } from "react";
import { formatSek, useStore } from "@/lib/store";
import { GARMENT_LABELS, type Address, type CartLine, type Order } from "@/lib/types";

const EMPTY: Address = { name: "", street: "", postalCode: "", city: "", email: "" };

function byRetailer(lines: CartLine[]): [string, CartLine[]][] {
  const groups = new Map<string, CartLine[]>();
  for (const line of lines) {
    const key = line.product.retailer;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  return [...groups.entries()];
}

function OrderCard({ order }: { order: Order }) {
  const store = useStore();
  const orderable = order.lines.some((l) => !l.product.demo);
  return (
    <article className="card order">
      <header className="outfit-head">
        <div>
          <h3>Beställning {order.id}</h3>
          <span className="muted">
            {new Date(order.createdAt).toLocaleDateString("sv-SE")} · {order.address.name}, {order.address.postalCode} {order.address.city}
          </span>
        </div>
        <div className="outfit-total">
          <strong>{formatSek(order.totalSek)}</strong>
          <span className={`badge ${order.status === "purchased" ? "scan" : "estimate"}`}>
            {order.status === "purchased" ? "Köpt" : orderable ? "Väntar på köp hos butik" : "Demobeställning"}
          </span>
        </div>
      </header>
      {byRetailer(order.lines).map(([retailer, lines]) => (
        <div key={retailer} className="retailer">
          <h4>{retailer}</h4>
          <ul className="plain">
            {lines.map((line) => (
              <li key={`${line.product.id}-${line.size}`}>
                {line.quantity} × {line.product.title}, storlek {line.size} – {formatSek(line.product.priceSek * line.quantity)}{" "}
                {line.product.url ? (
                  <a href={line.product.url} target="_blank" rel="noopener noreferrer">
                    Öppna hos butiken
                  </a>
                ) : (
                  <span className="muted">(demoprodukt, kan inte köpas)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {orderable && order.status !== "purchased" && (
        <div className="actions">
          <button type="button" className="btn ghost" onClick={() => store.markPurchased(order.id)}>
            Markera som köpt
          </button>
        </div>
      )}
    </article>
  );
}

export function CartView({ onStyle }: { onStyle: () => void }) {
  const store = useStore();
  const { cart, orders } = store;
  const [address, setAddress] = useState<Address>(EMPTY);
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState<string | null>(null);

  const total = cart.reduce((sum, l) => sum + l.product.priceSek * l.quantity, 0);
  const onlyDemo = cart.length > 0 && cart.every((l) => l.product.demo);
  const field = (key: keyof Address) => ({
    value: address[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setAddress((a) => ({ ...a, [key]: e.target.value })),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!address.name.trim() || !address.street.trim() || !address.city.trim()) {
      setError("Fyll i namn, adress och ort.");
      return;
    }
    if (!/^\d{3}\s?\d{2}$/.test(address.postalCode.trim())) {
      setError("Ange ett postnummer med fem siffror.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(address.email.trim())) {
      setError("Ange en giltig e-postadress.");
      return;
    }
    setError("");
    const order = store.placeOrder(address);
    setPlaced(order.id);
  };

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Varukorg</h1>
        <p>Samla plaggen du vill ha, i rätt storlek, och gör en beställning.</p>
      </header>

      {placed && (
        <p className="notice" role="status">
          Beställning {placed} är sparad. Slutför köpen via länkarna nedan.
        </p>
      )}

      {cart.length === 0 ? (
        <section className="card">
          <p className="muted">Varukorgen är tom.</p>
          <div className="actions">
            <button type="button" className="btn primary" onClick={onStyle}>
              Välj plagg
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="card">
            <ul className="items">
              {cart.map((line, index) => (
                <li key={`${line.product.id}-${line.size}`} className="item">
                  <span className="swatch" style={{ background: line.product.colorHex }} aria-hidden />
                  <div className="item-main">
                    <div className="item-title">
                      <strong>{line.product.title}</strong>
                      <span className="price">{formatSek(line.product.priceSek * line.quantity)}</span>
                    </div>
                    <span className="muted">
                      {GARMENT_LABELS[line.product.kind]} · storlek {line.size} · {line.product.demo ? <span className="badge demo">Demo</span> : line.product.retailer}
                    </span>
                    <div className="qty">
                      <button type="button" className="btn ghost small" aria-label="Minska antal" onClick={() => store.setQuantity(index, line.quantity - 1)}>
                        −
                      </button>
                      <span aria-label="Antal">{line.quantity}</span>
                      <button type="button" className="btn ghost small" aria-label="Öka antal" onClick={() => store.setQuantity(index, line.quantity + 1)}>
                        +
                      </button>
                      <button type="button" className="link" onClick={() => store.setQuantity(index, 0)}>
                        Ta bort
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="total">
              <span>Summa</span>
              <strong>{formatSek(total)}</strong>
            </p>
          </section>

          <form className="card" onSubmit={submit} noValidate>
            <h2>Leveransuppgifter</h2>
            <p className="notice">
              Så fungerar beställningen i den här versionen: appen sparar dina plagg och storlekar och länkar dig till varje butiks produktsida, där du slutför köpet. Ingen betalning tas i appen, och appen lägger inga köp åt dig.
              {onlyDemo && " Varukorgen innehåller bara demoprodukter, så beställningen blir ett exempel."}
            </p>
            <div className="grid-2">
              <label className="field">
                <span className="label">Namn</span>
                <input type="text" autoComplete="name" {...field("name")} />
              </label>
              <label className="field">
                <span className="label">E-post</span>
                <input type="email" autoComplete="email" {...field("email")} />
              </label>
            </div>
            <label className="field">
              <span className="label">Gatuadress</span>
              <input type="text" autoComplete="street-address" {...field("street")} />
            </label>
            <div className="grid-2">
              <label className="field">
                <span className="label">Postnummer</span>
                <input type="text" inputMode="numeric" autoComplete="postal-code" {...field("postalCode")} />
              </label>
              <label className="field">
                <span className="label">Ort</span>
                <input type="text" autoComplete="address-level2" {...field("city")} />
              </label>
            </div>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <div className="actions">
              <button type="submit" className="btn primary">
                Skapa beställning
              </button>
            </div>
          </form>
        </>
      )}

      {orders.length > 0 && (
        <section className="stack">
          <h2>Dina beställningar</h2>
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </section>
      )}
    </div>
  );
}

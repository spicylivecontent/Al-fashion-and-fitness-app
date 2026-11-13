"use client";

// Appens tillstånd. Sparas i webbläsarens localStorage – det finns inga konton
// och ingen databas. Bilder sparas aldrig, varken här eller någon annanstans:
// bara de uträknade måtten.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { estimateMeasurements, withCircumference } from "./body/estimate";
import type { ConfidenceLevel } from "./scan/aggregate";
import type {
  Address,
  BodyMeasurements,
  CartLine,
  EditableKey,
  HealthPlan,
  MeasurementSource,
  Order,
  Product,
  Profile,
  StylistResult,
} from "./types";
import { EDITABLE_KEYS } from "./types";

export interface ScanResult {
  measurements: BodyMeasurements;
  sources: Record<EditableKey, MeasurementSource>;
  level: ConfidenceLevel;
  confidence: number;
  frontCount: number;
  sideCount: number;
}

interface Persisted {
  profile: Profile;
  profileDone: boolean;
  scan: ScanResult | null;
  manual: Partial<Record<EditableKey, number>>;
  stylist: StylistResult | null;
  plan: HealthPlan | null;
  cart: CartLine[];
  orders: Order[];
}

export const DEFAULT_PROFILE: Profile = {
  sex: "female",
  heightCm: 170,
  weightKg: 68,
  age: 30,
  adultConfirmed: false,
  hasGym: false,
  goal: "maintain",
  trainingDaysPerWeek: 3,
  clothingBudgetSek: 2000,
  foodBudgetSekPerWeek: 700,
  styles: [],
  shoeSize: "",
  diet: "omnivore",
  allergies: "",
};

const INITIAL: Persisted = {
  profile: DEFAULT_PROFILE,
  profileDone: false,
  scan: null,
  manual: {},
  stylist: null,
  plan: null,
  cart: [],
  orders: [],
};

const STORAGE_KEY = "passform:v1";

interface Store extends Persisted {
  hydrated: boolean;
  /** Måtten som används överallt: skanning eller uppskattning, plus manuella justeringar. */
  measurements: BodyMeasurements;
  sources: Record<EditableKey, MeasurementSource>;
  saveProfile: (profile: Profile) => void;
  setScan: (scan: ScanResult | null) => void;
  setManual: (key: EditableKey, value: number | null) => void;
  setStylist: (result: StylistResult | null) => void;
  setPlan: (plan: HealthPlan | null) => void;
  addToCart: (product: Product, size: string) => void;
  setQuantity: (index: number, quantity: number) => void;
  placeOrder: (address: Address) => Order;
  markPurchased: (orderId: string) => void;
  resetAll: () => void;
}

const StoreContext = createContext<Store | null>(null);

function load(): Persisted {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return { ...INITIAL, ...parsed, profile: { ...DEFAULT_PROFILE, ...parsed.profile } };
  } catch {
    return INITIAL;
  }
}

function applyManual(base: BodyMeasurements, manual: Partial<Record<EditableKey, number>>): BodyMeasurements {
  let m = base;
  for (const key of EDITABLE_KEYS) {
    const value = manual[key];
    if (value === undefined) continue;
    m = key === "chest" || key === "waist" || key === "hip" ? withCircumference(m, key, value) : { ...m, [key]: value };
  }
  return m;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(INITIAL);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Lagringen kan vara full eller avstängd; appen fungerar ändå under sessionen.
    }
  }, [state, hydrated]);

  const saveProfile = useCallback((profile: Profile) => {
    setState((s) => {
      const bodyChanged =
        profile.sex !== s.profile.sex || profile.heightCm !== s.profile.heightCm || profile.weightKg !== s.profile.weightKg;
      return {
        ...s,
        profile,
        profileDone: true,
        // Nya kroppsuppgifter gör gamla mått och förslag inaktuella.
        scan: bodyChanged ? null : s.scan,
        manual: bodyChanged ? {} : s.manual,
        stylist: null,
        plan: null,
      };
    });
  }, []);

  const setScan = useCallback((scan: ScanResult | null) => setState((s) => ({ ...s, scan, stylist: null })), []);
  const setManual = useCallback((key: EditableKey, value: number | null) => {
    setState((s) => {
      const manual = { ...s.manual };
      if (value === null) delete manual[key];
      else manual[key] = value;
      return { ...s, manual, stylist: null };
    });
  }, []);
  const setStylist = useCallback((stylist: StylistResult | null) => setState((s) => ({ ...s, stylist })), []);
  const setPlan = useCallback((plan: HealthPlan | null) => setState((s) => ({ ...s, plan })), []);

  const addToCart = useCallback((product: Product, size: string) => {
    setState((s) => {
      const index = s.cart.findIndex((l) => l.product.id === product.id && l.size === size);
      const cart =
        index >= 0
          ? s.cart.map((l, i) => (i === index ? { ...l, quantity: l.quantity + 1 } : l))
          : [...s.cart, { product, size, quantity: 1 }];
      return { ...s, cart };
    });
  }, []);
  const setQuantity = useCallback((index: number, quantity: number) => {
    setState((s) => ({
      ...s,
      cart: quantity <= 0 ? s.cart.filter((_, i) => i !== index) : s.cart.map((l, i) => (i === index ? { ...l, quantity } : l)),
    }));
  }, []);

  const placeOrder = useCallback(
    (address: Address): Order => {
      const order: Order = {
        id: `PF-${Date.now().toString(36).toUpperCase()}`,
        createdAt: new Date().toISOString(),
        lines: state.cart,
        address,
        totalSek: state.cart.reduce((sum, l) => sum + l.product.priceSek * l.quantity, 0),
        status: "awaiting_purchase",
      };
      setState((s) => ({ ...s, cart: [], orders: [order, ...s.orders] }));
      return order;
    },
    [state.cart],
  );
  const markPurchased = useCallback((orderId: string) => {
    setState((s) => ({ ...s, orders: s.orders.map((o) => (o.id === orderId ? { ...o, status: "purchased" as const } : o)) }));
  }, []);

  const resetAll = useCallback(() => setState(INITIAL), []);

  const { profile, scan, manual } = state;
  const measurements = useMemo(
    () => applyManual(scan?.measurements ?? estimateMeasurements(profile.sex, profile.heightCm, profile.weightKg), manual),
    [scan, manual, profile.sex, profile.heightCm, profile.weightKg],
  );
  const sources = useMemo(() => {
    const out = {} as Record<EditableKey, MeasurementSource>;
    for (const key of EDITABLE_KEYS) out[key] = manual[key] !== undefined ? "manual" : (scan?.sources[key] ?? "estimate");
    return out;
  }, [scan, manual]);

  const value: Store = {
    ...state,
    hydrated,
    measurements,
    sources,
    saveProfile,
    setScan,
    setManual,
    setStylist,
    setPlan,
    addToCart,
    setQuantity,
    placeOrder,
    markPurchased,
    resetAll,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore måste användas inom StoreProvider");
  return store;
}

export const formatSek = (value: number) => `${Math.round(value).toLocaleString("sv-SE")} kr`;

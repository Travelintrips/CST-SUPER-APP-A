import { useState, useEffect, useRef } from "react";

export interface CartItem {
  cartId: string;
  category: string;
  serviceName: string;
  calculatorType: string;
  inputData: Record<string, unknown>;
  calculationResult: Record<string, unknown>;
  subtotal: number;
}

export const CART_KEY = "logistic_cart";

function readFromStorage(): CartItem[] {
  try {
    const stored = localStorage.getItem(CART_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>(readFromStorage);
  const instanceId = useRef(Math.random().toString(36).slice(2));

  // Persist to localStorage and notify other instances
  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    window.dispatchEvent(
      new CustomEvent("logistic-cart-change", { detail: { source: instanceId.current } })
    );
  }, [items]);

  // Sync from localStorage when another instance changes the cart
  useEffect(() => {
    function handleExternalChange(e: Event) {
      const ce = e as CustomEvent<{ source: string }>;
      if (ce.detail?.source === instanceId.current) return;
      setItems((prev) => {
        const next = readFromStorage();
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
    }
    window.addEventListener("logistic-cart-change", handleExternalChange);
    return () => window.removeEventListener("logistic-cart-change", handleExternalChange);
  }, []);

  function addItem(item: Omit<CartItem, "cartId">) {
    setItems((prev) => [...prev, { ...item, cartId: crypto.randomUUID() }]);
  }

  function removeItem(cartId: string) {
    setItems((prev) => prev.filter((i) => i.cartId !== cartId));
  }

  function updateItem(cartId: string, updates: Partial<Omit<CartItem, "cartId">>) {
    setItems((prev) =>
      prev.map((i) => (i.cartId === cartId ? { ...i, ...updates } : i))
    );
  }

  function clearCart() {
    setItems([]);
  }

  const hasFreightService = items.some((i) =>
    ["air_freight", "sea_fcl", "sea_lcl", "trucking"].includes(i.calculatorType)
  );
  const taxRate = 0.11;
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const grandTotal = subtotal + tax;

  return { items, addItem, removeItem, updateItem, clearCart, subtotal, tax, grandTotal, taxRate, hasFreightService };
}

import { useState, useEffect } from "react";

export interface CartItem {
  cartId: string;
  category: string;
  serviceName: string;
  calculatorType: string;
  inputData: Record<string, unknown>;
  calculationResult: Record<string, unknown>;
  subtotal: number;
}

const CART_KEY = "logistic_cart";

export function useCart() {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const stored = localStorage.getItem(CART_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items]);

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

  const hasAirFreight = items.some((i) => i.calculatorType === "air_freight");
  const taxRate = hasAirFreight ? 0.011 : 0.11;
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const tax = subtotal * taxRate;
  const grandTotal = subtotal + tax;

  return { items, addItem, removeItem, updateItem, clearCart, subtotal, tax, grandTotal, taxRate, hasAirFreight };
}

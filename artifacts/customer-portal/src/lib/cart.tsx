import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface CartItem {
  productId: number;
  name: string;
  unitPrice: number;
  quantity: number;
  itemType: "jasa" | "barang";
}

interface CartContextValue {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">) => void;
  addItemSilent: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (productId: number) => void;
  updateQty: (productId: number, qty: number) => void;
  updatePrice: (productId: number, price: number) => void;
  clearCart: () => void;
  total: number;
  count: number;
  isOpen: boolean;
  openCart: () => void;
  openCheckout: () => void;
  closeCart: () => void;
  pendingCheckout: boolean;
  clearPendingCheckout: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState(false);

  const addItem = useCallback((item: Omit<CartItem, "quantity">) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === item.productId);
      if (existing) {
        return prev.map((i) =>
          i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
    setIsOpen(true);
  }, []);

  const addItemSilent = useCallback((item: Omit<CartItem, "quantity">) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === item.productId);
      if (existing) {
        return prev.map((i) =>
          i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const removeItem = useCallback((productId: number) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const updateQty = useCallback((productId: number, qty: number) => {
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.productId !== productId));
    } else {
      setItems((prev) =>
        prev.map((i) => (i.productId === productId ? { ...i, quantity: qty } : i))
      );
    }
  }, []);

  const updatePrice = useCallback((productId: number, price: number) => {
    setItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, unitPrice: price } : i))
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);
  const openCart = useCallback(() => setIsOpen(true), []);
  const openCheckout = useCallback(() => {
    setIsOpen(true);
    setPendingCheckout(true);
  }, []);
  const closeCart = useCallback(() => {
    setIsOpen(false);
    setPendingCheckout(false);
  }, []);
  const clearPendingCheckout = useCallback(() => setPendingCheckout(false), []);

  const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items, addItem, addItemSilent, removeItem, updateQty, updatePrice, clearCart,
        total, count, isOpen, openCart, openCheckout, closeCart,
        pendingCheckout, clearPendingCheckout,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

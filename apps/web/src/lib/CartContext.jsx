import React, { createContext, useContext, useEffect, useState } from "react";

const EMPTY = { store: null, items: [] };
const SAFE = { cart: EMPTY, add: () => {}, setQty: () => {}, clear: () => {}, count: 0, subtotal: 0 };
const CartContext = createContext(SAFE);

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => JSON.parse(localStorage.getItem("perto_cart") || "null") || EMPTY);

  useEffect(() => {
    localStorage.setItem("perto_cart", JSON.stringify(cart));
  }, [cart]);

  const add = (store, product) =>
    setCart((c) => {
      const base = c.store?.id === store.id ? c : {
        store: { id: store.id, name: store.name, delivery_fee: store.delivery_fee || 0, min_order: store.min_order || 0, delivery_modes: store.delivery_modes || ["loja"] },
        items: [],
      };
      const exists = base.items.find((i) => i.product_id === product.id);
      const items = exists
        ? base.items.map((i) => (i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i))
        : [...base.items, { product_id: product.id, name: product.name, price: product.price, quantity: 1 }];
      return { ...base, items };
    });

  const setQty = (productId, quantity) =>
    setCart((c) => {
      const items = quantity <= 0
        ? c.items.filter((i) => i.product_id !== productId)
        : c.items.map((i) => (i.product_id === productId ? { ...i, quantity } : i));
      return items.length ? { ...c, items } : EMPTY;
    });

  const clear = () => setCart(EMPTY);
  const count = cart.items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = cart.items.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <CartContext.Provider value={{ cart, add, setQty, clear, count, subtotal }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
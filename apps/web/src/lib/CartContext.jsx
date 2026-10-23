import React, { createContext, useContext, useEffect, useState } from "react";

// Carrinho de uma loja por vez. Cada linha é uma combinação de produto + tamanho + adicionais,
// identificada por "key". O preço aqui é só para mostrar: o valor cobrado é calculado no servidor.
const EMPTY = { store: null, items: [] };
const SAFE = { cart: EMPTY, add: () => {}, setQty: () => {}, clear: () => {}, reprice: () => {}, count: 0, subtotal: 0, qtyOfProduct: () => 0 };
const CartContext = createContext(SAFE);

export const lineKey = (productId, variantId, addonIds = []) =>
  [productId, variantId || "", [...addonIds].sort().join(",")].join("|");

function load() {
  try {
    const c = JSON.parse(localStorage.getItem("perto_cart") || "null");
    if (!c || !Array.isArray(c.items)) return EMPTY;
    // carrinhos antigos (sem "key") continuam funcionando
    return { ...c, items: c.items.map((i) => ({ addon_ids: [], addon_names: [], ...i, key: i.key || lineKey(i.product_id, i.variant_id, i.addon_ids) })) };
  } catch {
    return EMPTY;
  }
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState(load);

  useEffect(() => {
    try { localStorage.setItem("perto_cart", JSON.stringify(cart)); } catch { /* armazenamento indisponível */ }
  }, [cart]);

  // option = { variant?: {id, name, price}, addons?: [{id, name, price}], quantity? }
  const add = (store, product, option = {}) =>
    setCart((c) => {
      const base = c.store?.id === store.id ? c : {
        store: { id: store.id, name: store.name, delivery_fee: store.delivery_fee || 0, min_order: store.min_order || 0, delivery_modes: store.delivery_modes || ["loja"] },
        items: [],
      };
      const addons = option.addons || [];
      const addonIds = addons.map((a) => a.id);
      const key = lineKey(product.id, option.variant?.id, addonIds);
      const unit = (option.variant ? option.variant.price : product.price) + addons.reduce((s, a) => s + a.price, 0);
      const qty = option.quantity || 1;
      const exists = base.items.find((i) => i.key === key);
      const items = exists
        ? base.items.map((i) => (i.key === key ? { ...i, quantity: i.quantity + qty } : i))
        : [...base.items, {
            key, product_id: product.id, name: product.name, price: unit, quantity: qty,
            variant_id: option.variant?.id || null, variant_name: option.variant?.name || null,
            addon_ids: addonIds, addon_names: addons.map((a) => a.name),
          }];
      return { ...base, items };
    });

  const setQty = (key, quantity) =>
    setCart((c) => {
      const items = quantity <= 0 ? c.items.filter((i) => i.key !== key) : c.items.map((i) => (i.key === key ? { ...i, quantity } : i));
      return items.length ? { ...c, items } : EMPTY;
    });

  const clear = () => setCart(EMPTY);
  // Atualiza os preços com os valores que o servidor devolveu (o preço mudou depois que o item entrou no carrinho).
  // lines: [{product_id, variant_id, addon_ids, unit}]; fee: taxa de entrega padrão da loja, quando não é por bairro.
  const reprice = (lines = [], fee) =>
    setCart((c) => {
      const map = new Map(lines.map((l) => [lineKey(l.product_id, l.variant_id, l.addon_ids || []), Number(l.unit)]));
      return {
        ...c,
        store: c.store && fee != null ? { ...c.store, delivery_fee: Number(fee) } : c.store,
        items: c.items.map((i) => (map.has(i.key) ? { ...i, price: map.get(i.key) } : i)),
      };
    });
  const count = cart.items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = cart.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const qtyOfProduct = (storeId, productId) =>
    cart.store?.id === storeId ? cart.items.filter((i) => i.product_id === productId).reduce((s, i) => s + i.quantity, 0) : 0;

  return (
    <CartContext.Provider value={{ cart, add, setQty, clear, reprice, count, subtotal, qtyOfProduct }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);

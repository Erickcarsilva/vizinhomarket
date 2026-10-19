import React from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useCart } from "@/lib/CartContext";
import { brl } from "@/lib/constants";

export default function CartBar({ storeId }) {
  const { cart, count, subtotal } = useCart();
  const show = cart.store?.id === storeId && count > 0;
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="fixed bottom-5 inset-x-0 z-30 px-5">
          <Link to="/carrinho" className="max-w-md mx-auto flex items-center justify-between h-14 px-6 rounded-full bg-primary text-primary-foreground shadow-2xl">
            <span className="text-sm font-semibold">{count} {count === 1 ? "item" : "itens"}</span>
            <span className="text-sm font-semibold">Ver carrinho · {brl(subtotal)}</span>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
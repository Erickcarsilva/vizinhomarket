import React from "react";
import { Link } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useCart } from "@/lib/CartContext";
import { brl } from "@/lib/constants";

export default function CartBar({ storeId }) {
  const { cart, count, subtotal } = useCart();
  const show = cart.store?.id === storeId && count > 0;
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="fixed bottom-[4.5rem] sm:bottom-5 inset-x-0 z-30 px-4 sm:px-6">
          <Link to="/carrinho" className="max-w-md mx-auto flex items-center gap-3 h-14 px-4 rounded-lg bg-primary text-primary-foreground flutuante hover:bg-[#8F4527] transition-colors">
            <span className="relative">
              <ShoppingBag className="w-5 h-5" aria-hidden="true" />
              <span className="absolute -top-2 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-primary text-[11px] font-bold leading-[18px] text-center">{count}</span>
            </span>
            <span className="flex-1 text-[15px] font-semibold">Ver sacola<span className="sr-only">, {count} {count === 1 ? "item" : "itens"}</span></span>
            <span className="text-[15px] font-bold">{brl(subtotal)}</span>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

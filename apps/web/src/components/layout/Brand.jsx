import React from "react";
import { cn } from "@/lib/utils";

const SIZES = { sm: { text: "text-[21px]", mark: 26 }, md: { text: "text-2xl", mark: 30 }, lg: { text: "text-3xl", mark: 36 } };

// Selo da marca: a fachada de uma loja com toldo (borda ondulada amarela) e porta. O mesmo desenho do ícone do app.
export function BrandMark({ size = 28, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={cn("shrink-0", className)}>
      <rect width="32" height="32" rx="8" fill="#0B6B43" />
      <path d="M6 9h20v4H6z" fill="#FFC21A" />
      <path d="M6 13c0 1.7 1.1 3 2.5 3S11 14.7 11 13c0 1.7 1.1 3 2.5 3S16 14.7 16 13c0 1.7 1.1 3 2.5 3s2.5-1.3 2.5-3c0 1.7 1.1 3 2.5 3S26 14.7 26 13" fill="#FFC21A" />
      <rect x="13" y="19" width="6" height="8" rx="1" fill="#FFFFFF" />
      <path d="M8 18v8M24 18v8" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// Logotipo: selo + "Vizinho" em tinta + "Market" em verde, na letra de letreiro da marca.
export default function Brand({ size = "md", className, mark = true, onDark = false }) {
  const s = SIZES[size] || SIZES.md;
  return (
    <span className={cn("inline-flex items-center gap-2 font-display leading-none", s.text, className)}>
      {mark && <BrandMark size={s.mark} />}
      <span className="tracking-tight">
        <span className={onDark ? "text-white" : "text-foreground"}>Vizinho</span>
        <span className={onDark ? "text-[#FFC21A]" : "text-marca"}>Market</span>
      </span>
    </span>
  );
}

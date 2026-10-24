import React from "react";
import { cn } from "@/lib/utils";

const SIZES = { sm: "text-lg", md: "text-2xl", lg: "text-3xl" };

// Logotipo em texto. Cores pelas variáveis --marca e --marca-destaque (iguais às de antes nos painéis).
export default function Brand({ size = "md", className }) {
  return (
    <span className={cn("font-display tracking-tight text-marca", SIZES[size], className)}>
      Vizinho<span className="text-[hsl(var(--marca-destaque))]">Market</span>
    </span>
  );
}

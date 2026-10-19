import React from "react";
import { cn } from "@/lib/utils";

const SIZES = { sm: "text-lg", md: "text-2xl", lg: "text-3xl" };

export default function Brand({ size = "md", className }) {
  return (
    <span className={cn("font-display tracking-tight text-primary", SIZES[size], className)}>
      Vizinho<span className="text-accent">Market</span>
    </span>
  );
}
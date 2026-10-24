import React from "react";
import { Check } from "lucide-react";
import { STATUS, flowFor } from "@/lib/constants";

const hora = (at) => new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
export const statusLabel = (s, fulfillment) => (s === "DELIVERED" && fulfillment === "retirada" ? "Retirado" : s === "DELIVERED" ? "Entregue" : STATUS[s].label);

// Etapas do pedido: verde nas que já passaram, anel na atual.
export default function StatusTimeline({ order }) {
  if (order.status === "CANCELLED") return null;
  const flow = flowFor(order.fulfillment);
  const current = flow.indexOf(order.status);
  const timeOf = (s) => (order.status_history || []).find((h) => h.status === s)?.at;
  return (
    <ol aria-label="Etapas do pedido">
      {flow.map((s, i) => {
        const done = i <= current;
        const at = timeOf(s);
        return (
          <li key={s} className="flex gap-3.5" aria-current={i === current ? "step" : undefined}>
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors duration-500 ${done ? "bg-marca text-white" : "bg-card border-2 border-border text-muted-foreground"} ${i === current ? "ring-4 ring-marca/15" : ""}`}>
                {done ? <Check className="w-4 h-4" strokeWidth={2.6} aria-hidden="true" /> : <span className="text-xs font-semibold">{i + 1}</span>}
              </div>
              {i < flow.length - 1 && <div className={`w-0.5 flex-1 min-h-6 ${i < current ? "bg-marca" : "bg-border"}`} />}
            </div>
            <div className="pb-5 min-w-0">
              <p className={`text-[15px] leading-7 ${i === current ? "font-bold text-marca" : done ? "font-medium" : "text-muted-foreground"}`}>
                {statusLabel(s, order.fulfillment)}{!done && <span className="sr-only"> (ainda não)</span>}
              </p>
              {at && <p className="text-[13px] text-muted-foreground">{hora(at)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

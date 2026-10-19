import React from "react";
import { Check } from "lucide-react";
import { STATUS, flowFor } from "@/lib/constants";

export default function StatusTimeline({ order }) {
  if (order.status === "CANCELLED") {
    return <div className="rounded-2xl bg-red-50 text-red-700 p-6 font-medium">Este pedido foi cancelado pela loja.</div>;
  }
  const flow = flowFor(order.fulfillment);
  const current = flow.indexOf(order.status);
  const timeOf = (s) => (order.status_history || []).find((h) => h.status === s)?.at;
  return (
    <ol className="space-y-0">
      {flow.map((s, i) => {
        const done = i <= current;
        const at = timeOf(s);
        const label = s === "DELIVERED" && order.fulfillment === "retirada" ? "Retirado" : s === "DELIVERED" ? "Entregue" : STATUS[s].label;
        return (
          <li key={s} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-500 ${done ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"} ${i === current ? "ring-4 ring-primary/15" : ""}`}>
                {done ? <Check className="w-4 h-4" /> : <span className="text-xs">{i + 1}</span>}
              </div>
              {i < flow.length - 1 && <div className={`w-px flex-1 min-h-8 ${i < current ? "bg-primary" : "bg-border"}`} />}
            </div>
            <div className="pb-6">
              <p className={`font-medium ${done ? "" : "text-muted-foreground"}`}>{label}</p>
              {at && <p className="text-xs text-muted-foreground">{new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
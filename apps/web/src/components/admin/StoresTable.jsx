import React from "react";
import { base44 } from "@/api/base44Client";
import { categoryLabel } from "@/lib/constants";

const STATUS = { pending: ["Aguardando", "bg-amber-100 text-amber-800"], approved: ["Aprovada", "bg-emerald-100 text-emerald-800"], suspended: ["Suspensa", "bg-red-100 text-red-700"] };

export default function StoresTable({ stores, onChanged }) {
  const update = async (s, data) => { await base44.entities.Store.update(s.id, data); onChanged(); };
  const approve = (s) => update(s, { status: "approved" });
  const btn = "h-8 px-3 rounded-full text-xs font-semibold border border-border hover:bg-secondary transition";

  return (
    <div className="bg-card border border-border rounded-2xl divide-y divide-border">
      {stores.map((s) => {
        return (
          <div key={s.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{s.name}</p>
              <p className="text-xs text-muted-foreground">
                {categoryLabel(s.category)} · {s.opening_hours || "Sem horário cadastrado"}
              </p>
            </div>
            <span className={`text-xs font-semibold px-3 py-1 rounded-full w-fit ${STATUS[s.status][1]}`}>{STATUS[s.status][0]}</span>
            <div className="flex gap-2">
              {s.status !== "approved" && <button onClick={() => approve(s)} className={btn}>Aprovar</button>}
              {s.status === "approved" && <button onClick={() => update(s, { status: "suspended" })} className={btn}>Suspender</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
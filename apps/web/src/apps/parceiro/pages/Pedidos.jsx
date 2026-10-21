import React from "react";
import { useOutletContext } from "react-router-dom";
import { useStoreOrders, useTodayFinished } from "@/lib/useStoreOrders";
import OrdersBoard from "@/components/partner/OrdersBoard";
import TrialCard from "@/components/partner/TrialCard";

export default function Pedidos() {
  const { store } = useOutletContext();
  const { orders: active, refresh, isLoading } = useStoreOrders(store?.id);
  const finishedToday = useTodayFinished(store?.id);
  if (!store) return null;
  const waiting = active.filter((o) => o.status === "CREATED").length;
  return (
    <div className="max-w-6xl mx-auto px-5 py-8 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Pedidos</p>
          <h1 className="font-display text-4xl mt-2">{store.name}</h1>
        </div>
        <p className={`text-sm font-semibold px-4 py-2 rounded-full ${waiting ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"}`}>
          {waiting ? `${waiting} esperando aceite` : "Nenhum pedido esperando"}
        </p>
      </div>
      {isLoading ? <div className="h-40 rounded-2xl bg-muted animate-pulse" /> : <OrdersBoard orders={active.concat(finishedToday.slice(0, 10))} onChanged={refresh} />}
      <TrialCard store={store} />
    </div>
  );
}

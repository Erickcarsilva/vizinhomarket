import React from "react";
import { useOutletContext } from "react-router-dom";
import { useStoreOrders, useTodayFinished } from "@/lib/useStoreOrders";
import OrderCard from "@/components/partner/OrderCard";

const Col = ({ title, hint, list, onChanged }) => (
  <section className="space-y-3">
    <div className="flex items-baseline justify-between">
      <h2 className="font-display text-2xl">{title}</h2>
      <span className="text-sm text-muted-foreground">{list.length}</span>
    </div>
    {hint && <p className="text-xs text-muted-foreground -mt-2">{hint}</p>}
    {list.length === 0 ? <p className="text-sm text-muted-foreground rounded-2xl border border-dashed border-border p-6 text-center">Nada por aqui.</p>
      : list.map((o) => <OrderCard key={o.id} order={o} onChanged={onChanged} />)}
  </section>
);

// Entregas feitas pela loja (ou pela plataforma): o que está pronto, o que saiu e o que foi entregue hoje.
export default function Entregas() {
  const { store } = useOutletContext();
  const { orders, refresh } = useStoreOrders(store?.id);
  const finishedToday = useTodayFinished(store?.id);
  if (!store) return null;
  const delivery = orders.filter((o) => o.fulfillment !== "retirada");
  const deliveredToday = finishedToday.filter((o) => o.status === "DELIVERED" && o.fulfillment !== "retirada");
  const pickups = orders.filter((o) => o.fulfillment === "retirada" && o.status === "READY");
  return (
    <div className="max-w-6xl mx-auto px-5 py-8 space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Entregas</p>
        <h1 className="font-display text-4xl mt-2">Saídas e entregas</h1>
        <p className="text-sm text-muted-foreground mt-2">Para concluir, peça ao cliente o código de 4 números que aparece no app dele.</p>
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <Col title="Prontos para sair" list={delivery.filter((o) => o.status === "READY")} onChanged={refresh} />
        <Col title="A caminho" hint="Confirme com o código quando o cliente receber." list={delivery.filter((o) => o.status === "IN_TRANSIT")} onChanged={refresh} />
        <Col title="Entregues hoje" list={deliveredToday} onChanged={refresh} />
      </div>
      {pickups.length > 0 && <Col title="Esperando retirada no balcão" list={pickups} onChanged={refresh} />}
    </div>
  );
}

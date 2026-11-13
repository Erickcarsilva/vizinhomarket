import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, Chip, Btn, Empty, ErrorLine, useAction, fmtDate } from "./ui";

const ALERT = { pronto_sem_entregador: ["Pronto e sem entregador", "bad"], entregador_sem_sinal: ["Entregador sem sinal", "bad"], entrega_demorada: ["Entrega demorando", "warn"] };
const ST = { ACCEPTED: "Aceito", PREPARING: "Em preparo", READY: "Pronto", IN_TRANSIT: "Em rota" };

// Monitor das entregas da plataforma, com reatribuição (exige justificativa; fica na auditoria).
export default function DeliveriesAdmin() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["admin-deliveries"], queryFn: () => base44.admin.deliveryMonitor(), refetchInterval: 30000 });
  const { data: couriers = [] } = useQuery({ queryKey: ["admin-couriers"], queryFn: () => base44.admin.listCouriers() });
  const { busy, error, run } = useAction(() => qc.invalidateQueries({ queryKey: ["admin-deliveries"] }));
  const approved = couriers.filter((c) => c.status === "approved");
  const reassign = (o, courierId) => {
    const reason = window.prompt(courierId ? "Motivo para passar a corrida para outro entregador" : "Motivo para devolver a corrida à fila");
    if (reason) run(o.order_id, () => base44.admin.reassign(o.order_id, courierId, reason));
  };
  return (
    <div className="space-y-4">
      <ErrorLine error={error} />
      {isLoading ? null : data.length === 0 ? <Empty>Nenhuma entrega da plataforma em andamento.</Empty> : (
        <Card className="divide-y divide-border">
          {data.map((o) => (
            <div key={o.order_id} className="p-4 flex flex-wrap items-center gap-3 text-sm">
              <div className="flex-1 min-w-[14rem]">
                <p className="font-semibold">{o.code} · {o.store_name}</p>
                <p className="text-xs text-muted-foreground">{ST[o.status]} há {o.minutes_in_status} min · {o.courier_name ? `${o.courier_name} (${o.courier_online ? "online" : "offline"}, sinal ${fmtDate(o.last_signal)})` : "sem entregador"}</p>
              </div>
              {o.alert && <Chip tone={ALERT[o.alert][1]}>{ALERT[o.alert][0]}</Chip>}
              <select defaultValue="" onChange={(e) => { if (e.target.value) reassign(o, e.target.value); e.target.value = ""; }} className="h-9 rounded-full border border-border bg-card px-3 text-xs" aria-label="Passar para">
                <option value="">Passar para…</option>
                {approved.map((c) => <option key={c.user_id} value={c.user_id}>{c.full_name || c.email}</option>)}
              </select>
              {o.courier_name && <Btn busy={busy === o.order_id} onClick={() => reassign(o, null)}>Devolver à fila</Btn>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

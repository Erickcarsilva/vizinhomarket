import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Card, Chip, Btn, Empty, ErrorLine, useAction, fmtDate, waLink } from "./ui";

const ST = { pending: ["Aguardando", "warn"], approved: ["Aprovado", "ok"], suspended: ["Suspenso", "bad"] };
const VEH = { moto: "Moto", bike: "Bicicleta", carro: "Carro", a_pe: "A pé" };

export default function CouriersAdmin() {
  const qc = useQueryClient();
  const { data: list = [], isLoading } = useQuery({ queryKey: ["admin-couriers"], queryFn: () => base44.admin.listCouriers() });
  const { busy, error, run } = useAction(() => Promise.all([qc.invalidateQueries({ queryKey: ["admin-couriers"] }), qc.invalidateQueries({ queryKey: ["admin-overview"] })]));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">No piloto, as próprias lojas entregam. Esta lista recebe os cadastros do app do entregador (próxima etapa).</p>
      <ErrorLine error={error} />
      {isLoading ? <Empty>Carregando…</Empty> : list.length === 0 ? <Empty>Nenhum entregador cadastrado ainda.</Empty> : (
        <Card className="divide-y divide-border">
          {list.map((c) => {
            const wa = waLink(c.phone, `Olá ${c.full_name || ""}, aqui é do VizinhoMarket sobre o seu cadastro de entregador.`);
            return (
              <div key={c.user_id} className="p-4 space-y-2">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{c.full_name || c.email}</p>
                    <p className="text-xs text-muted-foreground">{VEH[c.vehicle] || c.vehicle}{c.plate ? ` · placa ${c.plate}` : ""} · CPF {c.document || "—"} · {c.deliveries} entrega(s)</p>
                    <p className="text-xs text-muted-foreground">{c.is_online ? "Online agora" : `Visto ${fmtDate(c.last_seen)}`} · cadastro {fmtDate(c.created_at)}</p>
                  </div>
                  <Chip tone={ST[c.status][1]}>{ST[c.status][0]}</Chip>
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.status !== "approved" && <Btn variant="primary" busy={busy === c.user_id} onClick={() => run(c.user_id, () => base44.admin.setCourierStatus(c.user_id, "approved"))}>{c.status === "suspended" ? "Reativar" : "Aprovar"}</Btn>}
                  {c.status === "approved" && <Btn variant="danger" busy={busy === c.user_id} onClick={() => run(c.user_id, () => base44.admin.setCourierStatus(c.user_id, "suspended"), "Suspender este entregador?")}>Suspender</Btn>}
                  {wa && <a href={wa} target="_blank" rel="noreferrer" className="h-9 px-4 rounded-full text-xs font-semibold border border-border hover:bg-secondary flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" />WhatsApp</a>}
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

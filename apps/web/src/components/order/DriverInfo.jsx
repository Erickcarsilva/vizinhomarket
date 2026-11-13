import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Bike, MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";

const ago = (iso) => {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  return s < 60 ? "agora" : `há ${Math.round(s / 60)} min`;
};
const VEH = { moto: "de moto", bike: "de bicicleta", carro: "de carro", a_pe: "a pé" };

// Quem está entregando e a última posição (só enquanto o pedido está a caminho; nada de mapa pago: abre no app de mapas).
export default function DriverInfo({ order }) {
  const enabled = ["ACCEPTED", "PREPARING", "READY", "IN_TRANSIT"].includes(order.status) && order.fulfillment !== "retirada";
  const { data } = useQuery({ queryKey: ["driver", order.id], queryFn: () => base44.entities.Order.driverPosition(order.id), enabled, refetchInterval: order.status === "IN_TRANSIT" ? 20000 : 60000 });
  if (!enabled || !data) return null;
  const hasPos = data.lat != null && data.lng != null;
  if (!data.driver_first_name && !data.eta_min) return null;
  return (
    <div className="rounded-lg bg-card border border-border p-4 flex gap-3 items-start">
      <span className="w-10 h-10 rounded-full bg-[#EAF6EF] text-marca flex items-center justify-center shrink-0"><Bike className="w-5 h-5" aria-hidden="true" /></span>
      <div className="text-sm space-y-1 min-w-0">
        {data.driver_first_name ? (
          <p className="text-[15px] font-semibold">{data.driver_first_name} {VEH[data.vehicle] || ""} {order.status === "IN_TRANSIT" ? "está levando seu pedido" : "vai buscar seu pedido"}</p>
        ) : <p className="text-[15px] font-semibold">Procurando quem entregue seu pedido</p>}
        {data.eta_min ? <p className="text-muted-foreground">Previsão informada pela loja: cerca de {data.eta_min} min desde o pedido.</p> : null}
        {hasPos && (
          <a className="inline-flex items-center gap-1 font-semibold text-marca underline underline-offset-2" target="_blank" rel="noreferrer"
            href={`https://www.google.com/maps/search/?api=1&query=${data.lat},${data.lng}`}>
            <MapPin className="w-4 h-4" aria-hidden="true" />Ver onde está ({ago(data.recorded_at)})
          </a>
        )}
      </div>
    </div>
  );
}

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

// Pedidos em andamento da loja (os que precisam de ação), sempre atualizados:
// tempo real + conferência a cada 20 s. Concluídos e totais vêm de consultas próprias (paginadas ou no servidor).
export function useStoreOrders(storeId) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["orders", storeId, "active"],
    queryFn: () => base44.partner.activeOrders(storeId),
    enabled: !!storeId,
    refetchInterval: 20000,
    refetchIntervalInBackground: true,
  });
  useEffect(() => base44.entities.Order.subscribe((e) => {
    if (e.data?.store_id === storeId) qc.invalidateQueries({ queryKey: ["orders", storeId] });
  }), [storeId, qc]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["orders", storeId] });
  return { orders: query.data || [], ready: query.isSuccess, isLoading: query.isLoading, refresh };
}

// Concluídos e cancelados de hoje (quadro de pedidos e "Entregues hoje").
export function useTodayFinished(storeId) {
  const query = useQuery({
    queryKey: ["orders", storeId, "today-finished"],
    queryFn: () => base44.partner.finishedSince(storeId, startOfToday()),
    enabled: !!storeId,
    refetchInterval: 60000,
  });
  return query.data || [];
}

// Totais do período calculados no servidor.
export function useStoreSummary(storeId, from, to) {
  return useQuery({
    queryKey: ["orders", storeId, "summary", from, to],
    queryFn: () => base44.partner.summary(storeId, from, to),
    enabled: !!storeId,
    refetchInterval: 60000,
  });
}

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Pedidos da loja escolhida, sempre atualizados: tempo real + conferência a cada 20 s (internet instável).
export function useStoreOrders(storeId) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["orders", storeId],
    queryFn: () => base44.entities.Order.filter({ store_id: storeId }, "-created_date", 500),
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

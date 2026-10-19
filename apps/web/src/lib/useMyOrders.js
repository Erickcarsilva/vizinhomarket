import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

// Pedidos do cliente logado, direto do servidor (funciona em qualquer aparelho).
export function useMyOrders() {
  const { user } = useAuth();
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["my-orders", user?.id],
    queryFn: () => base44.entities.Order.filter({ customer_id: user.id }, "-created_date", 200),
    enabled: !!user,
  });
  return { orders, isLoading, ids: orders.map((o) => o.id) };
}

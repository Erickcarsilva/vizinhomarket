import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

// Lojas que o usuário administra (dono ou atendente). O admin vê todas.
export function usePartnerStore() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [storeId, setStoreId] = useState(localStorage.getItem("perto_partner_store") || "");
  const { data: stores = [], isLoading } = useQuery({
    queryKey: ["stores", "mine", user?.id, isAdmin],
    queryFn: () => (isAdmin ? base44.entities.Store.list("name", 500) : base44.entities.Store.filter({ created_by_id: user.id }, "name", 50)),
    enabled: !!user,
  });
  const store = stores.find((s) => s.id === storeId) || stores[0];
  const pickStore = (id) => { setStoreId(id); localStorage.setItem("perto_partner_store", id); };
  return { stores, store, pickStore, isLoading, isAdmin };
}

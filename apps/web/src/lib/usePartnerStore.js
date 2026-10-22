import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const KEY = "perto_partner_store";
const readKey = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };

// Lojas que a pessoa usa no painel: como dona ou como atendente. O admin vê todas (como dono).
// isOwner: dono (ou admin) pode mexer em dados da loja, taxas, faturas e equipe; atendente cuida de pedidos e cardápio.
export function usePartnerStore() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [storeId, setStoreId] = useState(readKey);
  const { data: stores = [], isLoading } = useQuery({
    queryKey: ["stores", "mine", user?.id, isAdmin],
    queryFn: async () => (isAdmin
      ? (await base44.entities.Store.list("name", 500)).map((s) => ({ ...s, my_role: "owner" }))
      : base44.partner.myStores()),
    enabled: !!user,
  });
  const store = stores.find((s) => s.id === storeId) || stores[0];
  const pickStore = (id) => { setStoreId(id); try { localStorage.setItem(KEY, id); } catch { /* sem armazenamento */ } };
  const isOwner = isAdmin || store?.my_role === "owner";
  return { stores, store, pickStore, isLoading, isAdmin, isOwner };
}

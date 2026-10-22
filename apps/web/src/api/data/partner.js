// Painel do comerciante.
import { supabase } from "@/api/supabase";
import { ORDER_SELECT, orderFromRow, storeZones } from "./orders";
import { fail } from "./shared";
import { STORE_SELECT, storeFromRow } from "./stores";

const ACTIVE = "(DELIVERED,CANCELLED)";
export const partner = {
  // Lojas em que a pessoa é dona ou atendente, com o papel dela em cada uma.
  async myStores() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase.from("store_members").select(`role, store:stores(${STORE_SELECT})`).eq("user_id", user.id);
    fail(error);
    return data.filter((m) => m.store).map((m) => ({ ...storeFromRow(m.store), my_role: m.role }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  },
  async members(storeId) {
    const { data, error } = await supabase.rpc("store_list_members", { p_store_id: storeId });
    fail(error);
    return data;
  },
  async addStaff(storeId, email) { fail((await supabase.rpc("store_add_staff", { p_store_id: storeId, p_email: email })).error); },
  async removeStaff(storeId, userId) { fail((await supabase.rpc("store_remove_staff", { p_store_id: storeId, p_user_id: userId })).error); },
  zones: (storeId) => storeZones(storeId),
  async setZones(storeId, zones) {
    const { data, error } = await supabase.rpc("store_set_delivery_zones", { p_store_id: storeId, p_zones: zones });
    fail(error);
    return data;
  },
  // Totais calculados no servidor (corretos para qualquer quantidade de pedidos)
  summary: async (storeId, from, to) => {
    const { data, error } = await supabase.rpc("store_summary", { p_store_id: storeId, p_from: from, p_to: to });
    fail(error);
    const n = (k) => Number(data?.[k] || 0);
    return { orders: n("orders"), delivered: n("delivered"), cancelled: n("cancelled"), auto_cancelled: n("auto_cancelled"), open: n("open"),
      sales: n("sales"), total: n("total"), commission: n("commission"), avg_ticket: n("avg_ticket"), avg_accept_min: data?.avg_accept_min == null ? null : Number(data.avg_accept_min) };
  },
  async daily(storeId, from, to) {
    const { data, error } = await supabase.rpc("store_daily", { p_store_id: storeId, p_from: from, p_to: to });
    fail(error);
    return data.map((d) => ({ day: d.day, delivered: Number(d.delivered), total: Number(d.total), commission: Number(d.commission) }));
  },
  async topProducts(storeId, from, to, limit = 5) {
    const { data, error } = await supabase.rpc("store_top_products", { p_store_id: storeId, p_from: from, p_to: to, p_limit: limit });
    fail(error);
    return data.map((r) => ({ name: r.name, quantity: Number(r.quantity), revenue: Number(r.revenue) }));
  },
  // Pedidos em andamento (os que exigem ação): poucos por natureza, sem corte de histórico.
  async activeOrders(storeId) {
    const { data, error } = await supabase.from("orders").select(ORDER_SELECT).eq("store_id", storeId).not("status", "in", ACTIVE).order("created_at", { ascending: false }).limit(500);
    fail(error);
    return data.map(orderFromRow);
  },
  // Concluídos/cancelados desde uma data (ex.: hoje), mais recentes primeiro.
  async finishedSince(storeId, since, limit = 300) {
    const { data, error } = await supabase.from("orders").select(ORDER_SELECT).eq("store_id", storeId).in("status", ["DELIVERED", "CANCELLED"])
      .or(`created_at.gte.${since},delivered_at.gte.${since},cancelled_at.gte.${since}`).order("created_at", { ascending: false }).limit(limit);
    fail(error);
    return data.map(orderFromRow);
  },
  // Histórico paginado. Entregues filtram pela data da entrega (igual aos totais e à fatura).
  async listPage({ storeId, status, from, to, page = 0, pageSize = 50 }) {
    const dateCol = status === "DELIVERED" ? "delivered_at" : "created_at";
    let q = supabase.from("orders").select(ORDER_SELECT).eq("store_id", storeId).eq("status", status);
    if (from) q = q.gte(dateCol, from);
    if (to) q = q.lt(dateCol, to);
    const { data, error } = await q.order(dateCol, { ascending: false }).range(page * pageSize, page * pageSize + pageSize);
    fail(error);
    return { rows: data.slice(0, pageSize).map(orderFromRow), hasMore: data.length > pageSize };
  },
  async listInvoices(storeId) {
    const { data, error } = await supabase.from("invoices").select("id, period_start, period_end, orders_count, gross_amount, commission_total, status, paid_at").eq("store_id", storeId).order("period_start", { ascending: false });
    fail(error);
    return data.map((r) => ({ ...r, gross_amount: Number(r.gross_amount), commission_total: Number(r.commission_total) }));
  },
};

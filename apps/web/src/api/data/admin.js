// Painel administrativo (funções que conferem se quem chama é admin).
import { supabase } from "@/api/supabase";
import { ORDER_SELECT, orderFromRow } from "./orders";
import { defaultCity, fail } from "./shared";

const rpc = async (fn, args = {}) => { const { data, error } = await supabase.rpc(fn, args); fail(error); return data; };
export const admin = {
  async listNeighborhoods() {
    const city = await defaultCity();
    const { data, error } = await supabase.from("neighborhoods").select("id, name, active").eq("city_id", city.id).order("name");
    fail(error);
    return data;
  },
  async addNeighborhoods(names) {
    const city = await defaultCity();
    const { data, error } = await supabase.rpc("admin_add_neighborhoods", { p_city_id: city.id, p_names: names });
    fail(error);
    return data;
  },
  async setNeighborhoodActive(id, active) { fail((await supabase.rpc("admin_set_neighborhood_active", { p_id: id, p_active: active })).error); },
  overview: (from, to) => rpc("admin_overview", { p_from: from, p_to: to }),
  listUsers: (search) => rpc("admin_list_users", { p_search: search || null, p_limit: 300 }),
  setBanned: (userId, banned, reason) => rpc("admin_set_user_banned", { p_user_id: userId, p_banned: banned, p_reason: reason || null }),
  setAdmin: (userId, isAdmin) => rpc("admin_set_admin", { p_user_id: userId, p_is_admin: isAdmin }),
  listCouriers: () => rpc("admin_list_couriers"),
  setCourierStatus: (userId, status) => rpc("admin_set_courier_status", { p_user_id: userId, p_status: status, p_reason: null }),
  storeRates: async () => Object.fromEntries((await rpc("admin_store_rates")).map((r) => [r.store_id, { negotiated: r.negotiated == null ? null : Number(r.negotiated), effective: Number(r.effective) }])),
  setStoreCommission: (storeId, rate) => rpc("admin_set_store_commission", { p_store_id: storeId, p_rate: rate }),
  setStoreStatus: (storeId, status, reason) => rpc("admin_set_store_status", { p_store_id: storeId, p_status: status, p_commission_rate: null, p_reason: reason || null }),
  async storePrivate() {
    const { data, error } = await supabase.from("store_private").select("store_id, legal_name, document, owner_name, owner_phone, pix_key");
    fail(error);
    return Object.fromEntries(data.map((r) => [r.store_id, r]));
  },
  async listOrders({ status, storeId, from, page = 0, pageSize = 50 } = {}) {
    let q = supabase.from("orders").select(ORDER_SELECT);
    if (status === "open") q = q.not("status", "in", "(DELIVERED,CANCELLED)");
    else if (status) q = q.eq("status", status);
    if (storeId) q = q.eq("store_id", storeId);
    if (from) q = q.gte("created_at", from);
    const { data, error } = await q.order("created_at", { ascending: false }).range(page * pageSize, page * pageSize + pageSize);
    fail(error);
    return { rows: data.slice(0, pageSize).map(orderFromRow), hasMore: data.length > pageSize };
  },
  cancelOrder: (orderId, reason) => rpc("cancel_order", { p_order_id: orderId, p_reason: reason }),
  generateInvoices: (start, end) => rpc("admin_generate_invoices", { p_period_start: start, p_period_end: end }),
  async listInvoices(start, end) {
    let q = supabase.from("invoices").select("id, store_id, period_start, period_end, orders_count, gross_amount, commission_total, status, paid_at, created_at, store:stores(name)");
    if (start) q = q.eq("period_start", start);
    if (end) q = q.eq("period_end", end);
    const { data, error } = await q.order("commission_total", { ascending: false });
    fail(error);
    return data.map((r) => ({ ...r, store_name: r.store?.name || "", gross_amount: Number(r.gross_amount), commission_total: Number(r.commission_total) }));
  },
  setInvoiceStatus: (id, status) => rpc("admin_set_invoice_status", { p_invoice_id: id, p_status: status }),
  async getSettings() {
    const { data, error } = await supabase.from("platform_settings").select("key, value");
    fail(error);
    return Object.fromEntries(data.map((r) => [r.key, r.value]));
  },
  setSetting: (key, value) => rpc("admin_set_setting", { p_key: key, p_value: value }),
  async listCategories() {
    const { data, error } = await supabase.from("categories").select("id, slug, name").order("name");
    fail(error);
    const rules = await supabase.from("commission_rules").select("category_id, rate");
    fail(rules.error);
    const byCat = Object.fromEntries(rules.data.map((r) => [r.category_id, Number(r.rate)]));
    return data.map((c) => ({ ...c, rate: byCat[c.id] ?? null }));
  },
  setCategoryRate: (categoryId, rate) => rpc("admin_set_commission_rule", { p_category_id: categoryId, p_rate: rate }),
  async listAudit(limit = 50) {
    const { data, error } = await supabase.from("audit_log").select("id, action, entity, entity_id, data, created_at").order("created_at", { ascending: false }).limit(limit);
    fail(error);
    return data;
  },
  async listErrors(limit = 30) {
    const { data, error } = await supabase.from("client_errors").select("id, message, url, user_agent, app_version, created_at").order("created_at", { ascending: false }).limit(limit);
    fail(error);
    return data;
  },
};

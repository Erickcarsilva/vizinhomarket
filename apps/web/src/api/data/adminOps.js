// Painel administrativo: financeiro, conciliação, estornos, atendimento, cupons, entregas e categorias.
// Toda função do banco confere se quem chama é admin e registra na auditoria.
import { supabase } from "@/api/supabase";
import { fail } from "./shared";

const rpc = async (fn, args = {}) => { const { data, error } = await supabase.rpc(fn, args); fail(error); return data; };

export const adminOps = {
  async payments({ status, limit = 100 } = {}) {
    let q = supabase.from("payments").select("id, provider, method, amount, status, paid_amount, refunded_amount, failure_reason, created_at, paid_at, order:orders(code, store:stores(name))");
    if (status) q = q.eq("status", status);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
    fail(error);
    return data;
  },
  reconciliation: (from, to) => rpc("admin_reconciliation", { p_from: from, p_to: to }),
  importSettlement: (provider, batch, lines) => rpc("admin_import_settlement", { p_provider: provider, p_batch: batch, p_lines: lines }),
  balances: () => rpc("admin_balances"),
  recordPayout: (kind, partyId, amount, method, reference, note) => rpc("admin_record_payout", { p_party_kind: kind, p_party_id: partyId, p_amount: amount, p_method: method, p_reference: reference, p_note: note || null }),
  adjust: (account, partyId, amount, reason) => rpc("admin_ledger_adjustment", { p_account: account, p_party_id: partyId, p_amount: amount, p_reason: reason }),
  async refunds(status) {
    let q = supabase.from("refunds").select("id, mode, amount, reason, status, charged_to, decision_note, failure_reason, created_at, decided_at, completed_at, order:orders(id, code, total, payment_mode, store:stores(name))");
    if (status) q = q.eq("status", status);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
    fail(error);
    return data;
  },
  decideRefund: (id, approve, amount, chargedTo, note) => rpc("admin_decide_refund", { p_refund_id: id, p_approve: approve, p_amount: amount ?? null, p_charged_to: chargedTo, p_note: note }),
  async tickets(status) {
    let q = supabase.from("support_tickets").select("id, kind, subject, status, created_at, updated_at, order:orders(code), store:stores(name)");
    if (status === "open") q = q.in("status", ["open", "waiting_store"]); else if (status) q = q.eq("status", status);
    const { data, error } = await q.order("updated_at", { ascending: false }).limit(200);
    fail(error);
    return data;
  },
  async ticketMessages(id) {
    const { data, error } = await supabase.from("support_messages").select("id, author_kind, body, created_at").eq("ticket_id", id).order("id");
    fail(error);
    return data;
  },
  setTicket: (id, status, message) => rpc("admin_set_ticket_status", { p_ticket_id: id, p_status: status, p_message: message || null }),
  async coupons() {
    const { data, error } = await supabase.from("coupons").select("id, code, description, store_id, kind, value, max_discount, min_subtotal, starts_at, ends_at, max_redemptions, per_user_limit, first_order_only, funded_by, active, redemptions, store:stores(name)")
      .order("created_at", { ascending: false });
    fail(error);
    return data;
  },
  saveCoupon: (c) => rpc("upsert_coupon", { p: c }),
  deliveryMonitor: () => rpc("admin_delivery_monitor"),
  reassign: (orderId, courierId, reason) => rpc("admin_reassign_delivery", { p_order_id: orderId, p_courier: courierId || null, p_reason: reason }),
  async categoriesFull() {
    const { data, error } = await supabase.from("categories").select("id, slug, name, icon, sort, active, age_restricted, needs_review, kind, attributes_schema").order("sort");
    fail(error);
    return data;
  },
  saveCategory: (c) => rpc("admin_upsert_category", { p: c }),
  async setStoreOnlinePayment(storeId, enabled, provider = null, recipientId = null) {
    const { error } = await supabase.rpc("admin_set_store_online_payment", { p_store_id: storeId, p_enabled: enabled, p_provider: provider, p_recipient_id: recipientId });
    fail(error);
  },
};

// Atendimento (cliente, loja, entregador), configuração pública e direitos do titular (LGPD).
import { supabase } from "@/api/supabase";
import { fail } from "./shared";

const rpc = async (fn, args = {}) => { const { data, error } = await supabase.rpc(fn, args); fail(error); return data; };

let configCache = null;
export const support = {
  async config() {
    if (configCache) return configCache;
    try { configCache = await rpc("public_config"); } catch { configCache = { online_payments_enabled: false, platform_delivery_enabled: false, payment_sandbox: true, refund_window_days: 7 }; }
    return configCache;
  },
  async myTickets() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("support_tickets").select("id, kind, subject, status, created_at, updated_at, order:orders(code)")
      .eq("user_id", user.id).order("updated_at", { ascending: false }).limit(50);
    fail(error);
    return data;
  },
  async ticket(id) {
    const [{ data: t, error: e1 }, { data: m, error: e2 }] = await Promise.all([
      supabase.from("support_tickets").select("id, kind, subject, status, created_at, order:orders(code)").eq("id", id).maybeSingle(),
      supabase.from("support_messages").select("id, author_kind, body, created_at").eq("ticket_id", id).order("id"),
    ]);
    fail(e1); fail(e2);
    return t ? { ...t, messages: m } : null;
  },
  open: (kind, subject, message, orderId) => rpc("open_ticket", { p_kind: kind, p_subject: subject, p_message: message, p_order_id: orderId || null }),
  reply: (id, body) => rpc("post_ticket_message", { p_ticket_id: id, p_body: body }),
  exportMyData: () => rpc("export_my_data"),
  consent: (kind, version, granted) => rpc("record_consent", { p_kind: kind, p_version: version, p_granted: granted }),
};

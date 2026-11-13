// Serviços profissionais: orçamento → proposta → aceite → agendamento → conclusão. Regras no servidor.
import { supabase } from "@/api/supabase";
import { fail } from "./shared";

const rpc = async (fn, args = {}) => { const { data, error } = await supabase.rpc(fn, args); fail(error); return data; };
const REQ = "id, code, store_id, offering_id, customer_id, customer_name, description, preferred_window, status, quote_amount, quote_notes, quote_valid_until, " +
  "scheduled_at, cancel_reason, rating, rating_comment, created_at, quoted_at, accepted_at, completed_at, store:stores(name, phone_public), offering:service_offerings(name)";

export const services = {
  async offerings(storeId) {
    const { data, error } = await supabase.from("service_offerings").select("id, name, description, price_from, price_unit, duration_min, active, sort")
      .eq("store_id", storeId).is("deleted_at", null).order("sort").order("name");
    fail(error);
    return data;
  },
  async saveOffering(storeId, o) {
    const row = { name: o.name, description: o.description || null, price_from: o.price_from === "" || o.price_from == null ? null : Number(o.price_from),
      price_unit: o.price_unit || "a_combinar", duration_min: o.duration_min ? Number(o.duration_min) : null, active: o.active !== false };
    const res = o.id ? await supabase.from("service_offerings").update(row).eq("id", o.id)
      : await supabase.from("service_offerings").insert({ ...row, store_id: storeId });
    fail(res.error);
  },
  async removeOffering(id) { fail((await supabase.from("service_offerings").update({ deleted_at: new Date().toISOString() }).eq("id", id)).error); },
  request: ({ storeId, offeringId, description, window, name, phone, addressId }) => rpc("request_service", {
    p_store_id: storeId, p_offering_id: offeringId || null, p_description: description, p_preferred_window: window || null,
    p_customer_name: name, p_customer_phone: phone, p_address_id: addressId || null }),
  async mine() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("service_requests").select(REQ).eq("customer_id", user.id).order("created_at", { ascending: false }).limit(100);
    fail(error);
    return data;
  },
  async forStore(storeId, open = true) {
    let q = supabase.from("service_requests").select(REQ).eq("store_id", storeId);
    q = open ? q.in("status", ["REQUESTED", "QUOTED", "ACCEPTED", "SCHEDULED"]) : q.in("status", ["COMPLETED", "DECLINED", "CANCELLED", "EXPIRED"]);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
    fail(error);
    return data;
  },
  async get(id) {
    const { data, error } = await supabase.from("service_requests").select(REQ).eq("id", id).maybeSingle();
    fail(error);
    return data;
  },
  async messages(id) {
    const { data, error } = await supabase.from("service_messages").select("id, author_id, author_kind, body, created_at").eq("request_id", id).order("id");
    fail(error);
    return data;
  },
  send: (id, body) => rpc("service_message", { p_request_id: id, p_body: body }),
  accept: (id) => rpc("service_accept_quote", { p_request_id: id }),
  cancel: (id, reason) => rpc("service_cancel", { p_request_id: id, p_reason: reason }),
  rate: (id, rating, comment) => rpc("service_rate", { p_request_id: id, p_rating: rating, p_comment: comment || null }),
  quote: (id, amount, notes, days) => rpc("service_quote", { p_request_id: id, p_amount: Number(amount), p_notes: notes || null, p_valid_days: Number(days) || 7 }),
  decline: (id, reason) => rpc("service_decline", { p_request_id: id, p_reason: reason }),
  schedule: (id, at) => rpc("service_schedule", { p_request_id: id, p_at: new Date(at).toISOString() }),
  complete: (id) => rpc("service_complete", { p_request_id: id }),
  contact: (id) => rpc("service_customer_contact", { p_request_id: id }),
};

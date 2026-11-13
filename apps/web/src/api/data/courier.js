// App do Entregador: toda regra (online, aceite, retirada, código, posição) é conferida no servidor.
import { supabase } from "@/api/supabase";
import { defaultCity, fail } from "./shared";

const rpc = async (fn, args = {}) => { const { data, error } = await supabase.rpc(fn, args); fail(error); return data; };

export const courier = {
  async me() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase.from("couriers").select("user_id, status, vehicle, plate, is_online, last_seen, created_at").eq("user_id", user.id).maybeSingle();
    fail(error);
    return data;
  },
  async apply({ vehicle, plate, document }) {
    const city = await defaultCity();
    return rpc("apply_as_courier", { p_city_id: city.id, p_vehicle: vehicle, p_plate: plate || null, p_document: document });
  },
  setOnline: (online) => rpc("courier_set_online", { p_online: online }),
  offers: () => rpc("list_available_deliveries"),
  claim: (orderId) => rpc("claim_delivery", { p_order_id: orderId }),
  decline: (orderId) => rpc("decline_delivery", { p_order_id: orderId }),
  pickup: (orderId) => rpc("confirm_pickup", { p_order_id: orderId }),
  release: (orderId, reason) => rpc("release_delivery", { p_order_id: orderId, p_reason: reason }),
  problem: (orderId, reason) => rpc("report_delivery_problem", { p_order_id: orderId, p_reason: reason }),
  confirm: (orderId, code, ageChecked = false) => rpc("confirm_delivery", { p_order_id: orderId, p_code: code, p_age_checked: ageChecked }),
  sendLocation: (lat, lng, accuracy) => rpc("delivery_update_location", { p_lat: lat, p_lng: lng, p_accuracy: accuracy ?? null }),
  earnings: (from, to) => rpc("courier_earnings", { p_from: from, p_to: to }),
  // Corridas do entregador (RLS: só as dele). Endereço e telefone do cliente só aparecem depois do aceite.
  async myDeliveries({ active = true, limit = 50 } = {}) {
    const { data: { user } } = await supabase.auth.getUser();
    let q = supabase.from("orders")
      .select("id, code, status, fulfillment, customer_name, customer_phone, address_line, address_reference, notes, payment_method, payment_mode, total, change_for, courier_fee, age_check_required, created_at, accepted_at, ready_at, picked_up_at, delivered_at, store:stores(name, address_line, phone_public, lat, lng), neighborhood:neighborhoods(name), items:order_items(name, variant_name, quantity, unit)")
      .eq("courier_id", user.id);
    q = active ? q.in("status", ["ACCEPTED", "PREPARING", "READY", "IN_TRANSIT"]) : q.in("status", ["DELIVERED", "CANCELLED"]);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
    fail(error);
    return data;
  },
};

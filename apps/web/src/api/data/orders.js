// Pedidos, endereços, bairros e indicações de loja.
import { supabase } from "@/api/supabase";
import { FULF_FROM_DB, FULF_TO_DB, PAY_FROM_DB, PAY_TO_DB, applySort, defaultCity, fail, uuid } from "./shared";

export const ORDER_SELECT = "id, code, city_id, store_id, customer_id, courier_id, status, fulfillment, payment_method, change_for, customer_name, customer_phone, " +
  "address_line, address_reference, notes, age_check_required, subtotal, delivery_fee, total, commission_rate, commission_amount, cancel_reason, created_at, accepted_at, ready_at, picked_up_at, delivered_at, cancelled_at, " +
  "store:stores(name), items:order_items(product_id, name, variant_name, unit_price, quantity, line_total, addons), events:order_events(status, created_at), review:reviews(store_rating, comment)";

export const orderFromRow = (r) => {
  if (!r) return r;
  const review = Array.isArray(r.review) ? r.review[0] : r.review;
  return {
    id: r.id, code: r.code, store_id: r.store_id, store_name: r.store?.name || "", customer_id: r.customer_id, driver_id: r.courier_id,
    status: r.status, fulfillment: FULF_FROM_DB[r.fulfillment], payment_method: PAY_FROM_DB[r.payment_method],
    change_for: r.change_for == null ? undefined : Number(r.change_for),
    customer_name: r.customer_name, customer_phone: r.customer_phone,
    address: [r.address_line, r.address_reference].filter(Boolean).join(" — "), notes: r.notes || "",
    age_check_required: r.age_check_required,
    items: (r.items || []).map((i) => ({
      product_id: i.product_id, name: i.variant_name ? `${i.name} (${i.variant_name})` : i.name,
      addons: (Array.isArray(i.addons) ? i.addons : []).map((a) => a.name).filter(Boolean),
      price: Number(i.unit_price), quantity: Number(i.quantity), line_total: Number(i.line_total),
    })),
    subtotal: Number(r.subtotal), delivery_fee: Number(r.delivery_fee), total: Number(r.total),
    commission_rate: Number(r.commission_rate), commission_amount: Number(r.commission_amount),
    status_history: (r.events || []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at)).map((e) => ({ status: e.status, at: e.created_at })),
    rating: review?.store_rating, review: review?.comment || "",
    cancel_reason: r.cancel_reason, created_date: r.created_at, delivered_at: r.delivered_at,
  };
};

async function ensureAddress(storeId, line, neighborhoodId = null) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Faça login para continuar");
  const { data: st, error: e1 } = await supabase.from("stores").select("city_id").eq("id", storeId).single();
  fail(e1);
  const clean = String(line || "").trim();
  const found = await supabase.from("addresses").select("id, neighborhood_id").eq("user_id", user.id).eq("line", clean).limit(1);
  fail(found.error);
  if (found.data.length) {
    const a = found.data[0];
    if (neighborhoodId && a.neighborhood_id !== neighborhoodId) {
      fail((await supabase.from("addresses").update({ neighborhood_id: neighborhoodId }).eq("id", a.id)).error);
    }
    return a.id;
  }
  const { data, error } = await supabase.from("addresses")
    .insert({ user_id: user.id, line: clean, city_id: st.city_id, neighborhood_id: neighborhoodId || null }).select("id").single();
  fail(error);
  return data.id;
}

// Bairros ativos da cidade (para o cliente escolher e a loja definir a taxa).
export async function neighborhoods(cityId) {
  const city = cityId ? { id: cityId } : await defaultCity();
  const { data, error } = await supabase.from("neighborhoods").select("id, name").eq("city_id", city.id).eq("active", true).order("name");
  fail(error);
  return data;
}
// Bairros atendidos por uma loja, com a taxa de cada um.
export async function storeZones(storeId) {
  const { data, error } = await supabase.from("delivery_zones").select("neighborhood_id, fee, neighborhood:neighborhoods(name)").eq("store_id", storeId);
  fail(error);
  return data.map((z) => ({ neighborhood_id: z.neighborhood_id, fee: Number(z.fee), name: z.neighborhood?.name || "" }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export const Order = {
  async list(sort = "-created_date", limit = 1000) {
    const { data, error } = await applySort(supabase.from("orders").select(ORDER_SELECT), sort, "orders").limit(limit);
    fail(error);
    return data.map(orderFromRow);
  },
  async filter(where = {}, sort = "-created_date", limit = 1000) {
    let q = supabase.from("orders").select(ORDER_SELECT);
    if (where.store_id) q = q.eq("store_id", where.store_id);
    if (where.status) q = q.eq("status", where.status);
    if (where.customer_id) q = q.eq("customer_id", where.customer_id);
    const { data, error } = await applySort(q, sort, "orders").limit(limit);
    fail(error);
    return data.map(orderFromRow);
  },
  async get(id) {
    const { data, error } = await supabase.from("orders").select(ORDER_SELECT).eq("id", id).single();
    fail(error, "Pedido não encontrado");
    return orderFromRow(data);
  },
  // O preço, a taxa e o total são calculados no servidor; aqui só vai o que o cliente escolheu.
  async create(d) {
    const pickup = d.fulfillment === "retirada";
    const addressId = pickup ? null : await ensureAddress(d.store_id, d.address, d.neighborhood_id || null);
    const { data: id, error } = await supabase.rpc("create_order", {
      p_store_id: d.store_id,
      p_items: (d.items || []).map((i) => ({ product_id: i.product_id, variant_id: i.variant_id || null, quantity: i.quantity, addon_ids: i.addon_ids || [] })),
      p_fulfillment: FULF_TO_DB[d.fulfillment] || "store_delivery",
      p_payment_method: PAY_TO_DB[d.payment_method] || "pix",
      p_idempotency_key: d.idempotency_key || uuid(),
      p_customer_name: d.customer_name, p_customer_phone: d.customer_phone,
      p_address_id: addressId, p_notes: d.notes || null,
      p_change_for: d.change_for == null || d.change_for === "" ? null : Number(d.change_for),
      // Total que o cliente viu: se o preço ou a taxa mudaram, o servidor recusa e devolve os valores novos.
      p_expected_total: d.expected_total == null ? null : Math.round(Number(d.expected_total) * 100) / 100,
    });
    fail(error);
    return Order.get(id);
  },
  async update(id, d) {
    if (d.rating !== undefined) {
      const { error } = await supabase.rpc("rate_order", { p_order_id: id, p_store_rating: d.rating, p_courier_rating: d.courier_rating ?? null, p_comment: d.review || null });
      fail(error);
      return Order.get(id);
    }
    if (d.status === "CANCELLED") {
      const { error } = await supabase.rpc("cancel_order", { p_order_id: id, p_reason: d.cancel_reason || null });
      fail(error);
    } else if (d.status === "DELIVERED") {
      if (!d.delivery_code) throw new Error("Peça ao cliente o código de 4 dígitos para confirmar a entrega.");
      const { data, error } = await supabase.rpc("confirm_delivery", { p_order_id: id, p_code: String(d.delivery_code), p_age_checked: !!d.age_checked });
      fail(error);
      if (!data?.ok) throw new Error(`Código incorreto. Restam ${data?.attempts_left ?? 0} tentativas.`);
    } else if (d.status) {
      const { error } = await supabase.rpc("advance_order_status", { p_order_id: id, p_target: d.status, p_note: null });
      fail(error);
    }
    return Order.get(id);
  },
  async paymentInfo(id) {
    const { data, error } = await supabase.rpc("order_payment_info", { p_order_id: id });
    fail(error);
    return data || null;
  },
  async deliveryCode(id) {
    const { data, error } = await supabase.from("order_secrets").select("delivery_code").eq("order_id", id).maybeSingle();
    fail(error);
    return data?.delivery_code || null;
  },
  // Tempo real: devolve a função para cancelar a inscrição (mesmo contrato do SDK antigo).
  subscribe(callback) {
    const channel = supabase.channel(`orders-${uuid()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) =>
        callback({ ...payload, id: payload.new?.id || payload.old?.id, type: payload.eventType, data: payload.new }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  },
};

export const StoreReferral = {
  async create(d) {
    const notes = [d.owner_name && `Responsável: ${d.owner_name}`, d.address && `Endereço: ${d.address}`, d.notes].filter(Boolean).join(" | ");
    const { error } = await supabase.from("store_referrals").insert({ store_name: d.store_name, category: d.category || null, contact: d.contact || null, notes: notes || null });
    fail(error);
  },
};

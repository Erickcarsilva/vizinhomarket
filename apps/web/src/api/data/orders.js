// Pedidos, endereços, bairros e indicações de loja.
import { supabase } from "@/api/supabase";
import { FULF_FROM_DB, FULF_TO_DB, PAY_FROM_DB, PAY_TO_DB, applySort, defaultCity, fail, uuid } from "./shared";

export const ORDER_SELECT = "id, code, city_id, store_id, customer_id, courier_id, status, fulfillment, payment_method, change_for, customer_name, customer_phone, " +
  "address_line, address_reference, notes, age_check_required, subtotal, delivery_fee, total, commission_rate, commission_amount, cancel_reason, created_at, accepted_at, ready_at, picked_up_at, delivered_at, cancelled_at, " +
  "payment_mode, payment_status, paid_at, discount_amount, discount_funded_by, courier_fee, refunded_amount, courier_assigned_at, store_driver_id, " +
  "store:stores(name), items:order_items(product_id, name, variant_name, unit_price, quantity, line_total, addons), events:order_events(status, created_at), review:reviews(store_rating, comment)";

export const orderFromRow = (r) => {
  if (!r) return r;
  const review = Array.isArray(r.review) ? r.review[0] : r.review;
  return {
    id: r.id, code: r.code, store_id: r.store_id, store_name: r.store?.name || "", customer_id: r.customer_id, driver_id: r.courier_id,
    status: r.status, fulfillment: FULF_FROM_DB[r.fulfillment], payment_method: r.payment_method === "card_online" ? "cartao_online" : PAY_FROM_DB[r.payment_method],
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
    // Pagamento separado do pedido: online (pelo app) ou na entrega/direto à loja.
    payment_mode: r.payment_mode || "offline", payment_status: r.payment_status || "pending", paid_at: r.paid_at,
    discount: Number(r.discount_amount) || 0, discount_funded_by: r.discount_funded_by, refunded_amount: Number(r.refunded_amount) || 0,
    courier_fee: Number(r.courier_fee) || 0, courier_assigned_at: r.courier_assigned_at, store_driver_id: r.store_driver_id,
    accepted_at: r.accepted_at, ready_at: r.ready_at, picked_up_at: r.picked_up_at,
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

const itemsForServer = (items) => (items || []).map((i) => ({ product_id: i.product_id, variant_id: i.variant_id || null, quantity: i.quantity, addon_ids: i.addon_ids || [] }));

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
    const online = d.payment_mode === "online";
    const { data: id, error } = await supabase.rpc("create_order", {
      p_store_id: d.store_id,
      p_items: itemsForServer(d.items),
      p_fulfillment: FULF_TO_DB[d.fulfillment] || "store_delivery",
      p_payment_method: online ? (d.payment_method === "cartao_online" ? "card_online" : "pix") : (PAY_TO_DB[d.payment_method] || "pix"),
      p_idempotency_key: d.idempotency_key || uuid(),
      p_customer_name: d.customer_name, p_customer_phone: d.customer_phone,
      p_address_id: addressId, p_notes: d.notes || null,
      p_change_for: d.change_for == null || d.change_for === "" ? null : Number(d.change_for),
      // Total que o cliente viu: se o preço, a taxa ou o cupom mudaram, o servidor recusa e devolve os valores novos.
      p_expected_total: d.expected_total == null ? null : Math.round(Number(d.expected_total) * 100) / 100,
      p_payment_mode: online ? "online" : "offline",
      p_coupon_code: d.coupon_code || null,
    });
    fail(error);
    return Order.get(id);
  },
  // Simula o pedido no servidor (mesma regra que cobra) para mostrar desconto e total. Nada é gravado.
  async quote(d) {
    const pickup = d.fulfillment === "retirada";
    const addressId = pickup || !d.address ? null : await ensureAddress(d.store_id, d.address, d.neighborhood_id || null);
    const online = d.payment_mode === "online";
    const { data, error } = await supabase.rpc("quote_order", {
      p_store_id: d.store_id, p_items: itemsForServer(d.items), p_fulfillment: FULF_TO_DB[d.fulfillment] || "store_delivery",
      p_payment_method: online ? (d.payment_method === "cartao_online" ? "card_online" : "pix") : (PAY_TO_DB[d.payment_method] || "pix"),
      p_address_id: pickup ? null : addressId, p_payment_mode: online ? "online" : "offline", p_coupon_code: d.coupon_code || null,
    });
    fail(error);
    return { subtotal: Number(data.subtotal), fee: Number(data.delivery_fee), discount: Number(data.discount), total: Number(data.total) };
  },
  // Cobrança online (Pix com QR ou link de cartão). O valor vem do pedido, no servidor.
  async startPayment(orderId) {
    const { data, error } = await supabase.functions.invoke("pagamentos", { body: { order_id: orderId } });
    if (error) {
      let msg = "Não foi possível gerar o pagamento agora.";
      try { const body = await error.context?.json?.(); if (body?.error) msg = body.error; } catch { /* sem corpo */ }
      throw new Error(msg);
    }
    return data;
  },
  async driverPosition(orderId) {
    const { data, error } = await supabase.rpc("order_driver_position", { p_order_id: orderId });
    fail(error);
    return data;
  },
  async requestRefund(orderId, amount, reason) {
    const { data, error } = await supabase.rpc("request_refund", { p_order_id: orderId, p_amount: amount, p_reason: reason });
    fail(error);
    return data;
  },
  async refunds(orderId) {
    const { data, error } = await supabase.from("refunds").select("id, amount, status, reason, decision_note, created_at, completed_at").eq("order_id", orderId).order("created_at");
    fail(error);
    return data;
  },
  async confirmOfflinePayment(orderId) { fail((await supabase.rpc("confirm_offline_payment", { p_order_id: orderId })).error); },
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

// Camada de compatibilidade: as telas herdadas do Base44 continuam chamando
// base44.entities.X / base44.auth.Y, mas tudo passa pelo Supabase.
// Regras de dinheiro e de status NUNCA são gravadas direto na tabela: vão para as
// funções do servidor (create_order, advance_order_status, confirm_delivery, ...).
import { supabase } from "@/api/supabase";
import { parseHours, hoursText, isOpenNow } from "@/lib/hours";

// ---------------------------------------------------------------- utilitários
const fail = (error, fallback = "Não foi possível concluir. Tente novamente.") => {
  if (!error) return;
  const msg = error.message || fallback;
  const e = new Error(/permission denied|row-level security|42501/i.test(msg + (error.code || "")) ? "Você não tem permissão para fazer isso." : msg);
  e.status = error.status || (error.code === "42501" ? 403 : 400);
  e.code = error.code;
  throw e;
};
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

const SORT = {
  "-rating": ["rating_avg", false], rating: ["rating_avg", true],
  "-created_date": ["created_at", false], created_date: ["created_at", true],
  name: ["name", true], "-name": ["name", false],
  category: ["section", true],
};
const applySort = (q, sort, table) => {
  let [col, asc] = SORT[sort] || ["created_at", false];
  if (table !== "products" && col === "section") col = "name";
  return q.order(col, { ascending: asc, nullsFirst: false });
};

const FULF_TO_DB = { loja: "store_delivery", plataforma: "platform_delivery", retirada: "pickup" };
const FULF_FROM_DB = Object.fromEntries(Object.entries(FULF_TO_DB).map(([a, b]) => [b, a]));
const PAY_TO_DB = { pix: "pix", cartao: "card_on_delivery", dinheiro: "cash" };
const PAY_FROM_DB = Object.fromEntries(Object.entries(PAY_TO_DB).map(([a, b]) => [b, a]));

let categoryCache = null;
async function categories() {
  if (categoryCache) return categoryCache;
  const { data, error } = await supabase.from("categories").select("id, slug, name");
  fail(error);
  categoryCache = data;
  return data;
}
let cityCache = null;
async function defaultCity() {
  if (cityCache) return cityCache;
  const { data, error } = await supabase.from("cities").select("id, name, timezone").eq("slug", "sidrolandia-ms").single();
  fail(error);
  cityCache = data;
  return data;
}

// ---------------------------------------------------------------- lojas
const STORE_SELECT = "id, city_id, category_id, name, slug, description, logo_url, cover_url, phone_public, address_line, neighborhood_id, " +
  "is_paused, accepts_pickup, accepts_store_delivery, accepts_platform_delivery, delivery_fee_default, min_order, prep_time_min, " +
  "status, rating_avg, rating_count, approved_at, created_by, created_at, updated_at, " +
  "category:categories(slug, name), city:cities(name, timezone), hours:store_hours(weekday, opens, closes)";

const storeFromRow = (r) => r && ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  description: r.description || "",
  logo_url: r.logo_url || "",
  cover_url: r.cover_url || "",
  phone: r.phone_public || "",
  address: r.address_line || "",
  city: r.city?.name || "",
  city_id: r.city_id,
  category: r.category?.slug || "",
  category_id: r.category_id,
  hours: r.hours || [],
  opening_hours: hoursText(r.hours),
  is_paused: r.is_paused,
  is_open: !r.is_paused && isOpenNow(r.hours, r.city?.timezone),
  delivery_fee: Number(r.delivery_fee_default) || 0,
  min_order: Number(r.min_order) || 0,
  delivery_time_min: r.prep_time_min,
  delivery_modes: [r.accepts_store_delivery && "loja", r.accepts_platform_delivery && "plataforma", r.accepts_pickup && "retirada"].filter(Boolean),
  rating: r.rating_avg == null ? null : Number(r.rating_avg),
  rating_count: r.rating_count,
  status: r.status,
  created_by_id: r.created_by,
  created_date: r.created_at,
  updated_date: r.updated_at,
  subscription_status: "ACTIVE", // sem mensalidade: compatibilidade com telas antigas
});

function storeToRow(d) {
  const row = {};
  const map = { name: "name", description: "description", logo_url: "logo_url", cover_url: "cover_url", phone: "phone_public", address: "address_line", min_order: "min_order", delivery_time_min: "prep_time_min" };
  for (const [k, col] of Object.entries(map)) if (d[k] !== undefined) row[col] = d[k] === "" ? null : d[k];
  if (d.name !== undefined) row.name = d.name;
  if (d.delivery_fee !== undefined) row.delivery_fee_default = Number(d.delivery_fee) || 0;
  if (d.is_open !== undefined) row.is_paused = !d.is_open;
  if (d.delivery_modes) {
    row.accepts_store_delivery = d.delivery_modes.includes("loja");
    row.accepts_platform_delivery = d.delivery_modes.includes("plataforma");
    row.accepts_pickup = d.delivery_modes.includes("retirada");
  }
  return row;
}

async function saveHours(storeId, text) {
  const rows = parseHours(text);
  if (rows === null) throw new Error('Horário não reconhecido. Exemplos: "Seg–Sáb, 8h–18h" ou "Seg–Sex, 11h–14h e 18h–23h; Sáb, 18h–0h".');
  const del = await supabase.from("store_hours").delete().eq("store_id", storeId);
  fail(del.error);
  if (rows.length) {
    const ins = await supabase.from("store_hours").insert(rows.map((r) => ({ ...r, store_id: storeId })));
    fail(ins.error);
  }
}

const Store = {
  async list(sort = "name", limit = 500) {
    const { data, error } = await applySort(supabase.from("stores").select(STORE_SELECT), sort, "stores").limit(limit);
    fail(error);
    return data.map(storeFromRow);
  },
  async filter(where = {}, sort = "name", limit = 500) {
    let q = supabase.from("stores").select(STORE_SELECT);
    if (where.status) q = q.eq("status", where.status);
    if (where.id) q = q.eq("id", where.id);
    if (where.category) {
      const cat = (await categories()).find((c) => c.slug === where.category);
      if (!cat) return [];
      q = q.eq("category_id", cat.id);
    }
    if (where.created_by_id) {
      const { data: mem, error } = await supabase.from("store_members").select("store_id").eq("user_id", where.created_by_id);
      fail(error);
      if (!mem.length) return [];
      q = q.in("id", mem.map((m) => m.store_id));
    }
    const { data, error } = await applySort(q, sort, "stores").limit(limit);
    fail(error);
    return data.map(storeFromRow);
  },
  async get(id) {
    const { data, error } = await supabase.from("stores").select(STORE_SELECT).eq("id", id).single();
    fail(error, "Loja não encontrada");
    return storeFromRow(data);
  },
  async create(d) {
    const cat = (await categories()).find((c) => c.slug === d.category) || (await categories())[0];
    const city = await defaultCity();
    const { data: id, error } = await supabase.rpc("register_store", {
      p_name: d.name, p_category_id: cat.id, p_city_id: city.id,
      p_owner_name: d.owner_name, p_owner_phone: d.phone, p_document: d.cnpj_cpf,
      p_legal_name: null, p_description: d.description || null, p_phone_public: d.phone || null,
      p_address_line: d.address || null, p_neighborhood_id: null,
    });
    fail(error);
    const row = storeToRow({ delivery_fee: d.delivery_fee, delivery_modes: d.delivery_modes });
    const up = await supabase.from("stores").update(row).eq("id", id);
    fail(up.error);
    if (d.opening_hours) await saveHours(id, d.opening_hours);
    return Store.get(id);
  },
  async update(id, d) {
    // Aprovação/suspensão é do admin e passa pela função do servidor.
    if (d.status !== undefined) {
      const { error } = await supabase.rpc("admin_set_store_status", { p_store_id: id, p_status: d.status, p_commission_rate: null, p_reason: null });
      fail(error);
    }
    const row = storeToRow(d);
    if (Object.keys(row).length) {
      const { error } = await supabase.from("stores").update(row).eq("id", id);
      fail(error);
    }
    if (d.opening_hours !== undefined) await saveHours(id, d.opening_hours);
    return Store.get(id);
  },
};

// ---------------------------------------------------------------- produtos
const PRODUCT_SELECT = "id, store_id, section, name, description, image_url, price, unit, stock, available, age_restricted, sort, created_at";
const productFromRow = (r) => r && ({
  id: r.id, store_id: r.store_id, name: r.name, description: r.description || "", image_url: r.image_url || "",
  price: Number(r.price), category: r.section || "", unit: r.unit, stock: r.stock == null ? null : Number(r.stock),
  available: r.available, age_restricted: r.age_restricted, created_date: r.created_at,
});
const productToRow = (d) => {
  const row = {};
  for (const k of ["name", "description", "image_url", "available", "unit", "age_restricted"]) if (d[k] !== undefined) row[k] = d[k];
  if (d.price !== undefined) row.price = Number(d.price);
  if (d.category !== undefined) row.section = d.category || null;
  if (d.stock !== undefined) row.stock = d.stock === "" || d.stock == null ? null : Number(d.stock);
  return row;
};

const Product = {
  async filter(where = {}, sort = "-created_date", limit = 1000) {
    let q = supabase.from("products").select(PRODUCT_SELECT).is("deleted_at", null);
    if (where.store_id) q = q.eq("store_id", where.store_id);
    if (where.available !== undefined) q = q.eq("available", where.available);
    const { data, error } = await applySort(q, sort, "products").limit(limit);
    fail(error);
    return data.map(productFromRow);
  },
  async get(id) {
    const { data, error } = await supabase.from("products").select(PRODUCT_SELECT).eq("id", id).single();
    fail(error, "Produto não encontrado");
    return productFromRow(data);
  },
  async create(d) {
    const { data, error } = await supabase.from("products").insert({ ...productToRow(d), store_id: d.store_id }).select(PRODUCT_SELECT).single();
    fail(error);
    return productFromRow(data);
  },
  async update(id, d) {
    const { data, error } = await supabase.from("products").update(productToRow(d)).eq("id", id).select(PRODUCT_SELECT).single();
    fail(error);
    return productFromRow(data);
  },
  async delete(id) {
    // Sem exclusão física: preserva o histórico dos pedidos.
    const { error } = await supabase.from("products").update({ deleted_at: new Date().toISOString(), available: false }).eq("id", id);
    fail(error);
  },
};

// ---------------------------------------------------------------- pedidos
const ORDER_SELECT = "id, code, city_id, store_id, customer_id, courier_id, status, fulfillment, payment_method, change_for, customer_name, customer_phone, " +
  "address_line, address_reference, notes, age_check_required, subtotal, delivery_fee, total, commission_rate, commission_amount, cancel_reason, created_at, accepted_at, ready_at, picked_up_at, delivered_at, cancelled_at, " +
  "store:stores(name), items:order_items(product_id, name, variant_name, unit_price, quantity, line_total, addons), events:order_events(status, created_at), review:reviews(store_rating, comment)";

const orderFromRow = (r) => {
  if (!r) return r;
  const review = Array.isArray(r.review) ? r.review[0] : r.review;
  return {
    id: r.id, code: r.code, store_id: r.store_id, store_name: r.store?.name || "", customer_id: r.customer_id, driver_id: r.courier_id,
    status: r.status, fulfillment: FULF_FROM_DB[r.fulfillment], payment_method: PAY_FROM_DB[r.payment_method],
    change_for: r.change_for == null ? undefined : Number(r.change_for),
    customer_name: r.customer_name, customer_phone: r.customer_phone,
    address: [r.address_line, r.address_reference].filter(Boolean).join(" — "), notes: r.notes || "",
    age_check_required: r.age_check_required,
    items: (r.items || []).map((i) => ({ product_id: i.product_id, name: i.variant_name ? `${i.name} (${i.variant_name})` : i.name, price: Number(i.unit_price), quantity: Number(i.quantity), line_total: Number(i.line_total) })),
    subtotal: Number(r.subtotal), delivery_fee: Number(r.delivery_fee), total: Number(r.total),
    commission_rate: Number(r.commission_rate), commission_amount: Number(r.commission_amount),
    status_history: (r.events || []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at)).map((e) => ({ status: e.status, at: e.created_at })),
    rating: review?.store_rating, review: review?.comment || "",
    cancel_reason: r.cancel_reason, created_date: r.created_at, delivered_at: r.delivered_at,
  };
};

async function ensureAddress(storeId, line) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Faça login para continuar");
  const { data: st, error: e1 } = await supabase.from("stores").select("city_id").eq("id", storeId).single();
  fail(e1);
  const clean = String(line || "").trim();
  const found = await supabase.from("addresses").select("id").eq("user_id", user.id).eq("line", clean).limit(1);
  fail(found.error);
  if (found.data.length) return found.data[0].id;
  const { data, error } = await supabase.from("addresses").insert({ user_id: user.id, line: clean, city_id: st.city_id }).select("id").single();
  fail(error);
  return data.id;
}

const Order = {
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
    const addressId = pickup ? null : await ensureAddress(d.store_id, d.address);
    const { data: id, error } = await supabase.rpc("create_order", {
      p_store_id: d.store_id,
      p_items: (d.items || []).map((i) => ({ product_id: i.product_id, variant_id: i.variant_id || null, quantity: i.quantity, addon_ids: i.addon_ids || [] })),
      p_fulfillment: FULF_TO_DB[d.fulfillment] || "store_delivery",
      p_payment_method: PAY_TO_DB[d.payment_method] || "pix",
      p_idempotency_key: d.idempotency_key || uuid(),
      p_customer_name: d.customer_name, p_customer_phone: d.customer_phone,
      p_address_id: addressId, p_notes: d.notes || null,
      p_change_for: d.change_for == null || d.change_for === "" ? null : Number(d.change_for),
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
      const { data, error } = await supabase.rpc("confirm_delivery", { p_order_id: id, p_code: String(d.delivery_code) });
      fail(error);
      if (!data?.ok) throw new Error(`Código incorreto. Restam ${data?.attempts_left ?? 0} tentativas.`);
    } else if (d.status) {
      const { error } = await supabase.rpc("advance_order_status", { p_order_id: id, p_target: d.status, p_note: null });
      fail(error);
    }
    return Order.get(id);
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

const StoreReferral = {
  async create(d) {
    const notes = [d.owner_name && `Responsável: ${d.owner_name}`, d.address && `Endereço: ${d.address}`, d.notes].filter(Boolean).join(" | ");
    const { error } = await supabase.from("store_referrals").insert({ store_name: d.store_name, category: d.category || null, contact: d.contact || null, notes: notes || null });
    fail(error);
  },
};

// ---------------------------------------------------------------- autenticação
async function me() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) { const e = new Error("Faça login para continuar"); e.status = 401; throw e; }
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, age_confirmed").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);
  const list = (roles || []).map((r) => r.role);
  return {
    id: user.id, email: user.email,
    full_name: profile?.full_name || user.user_metadata?.full_name || "",
    phone: profile?.phone || "", age_confirmed: profile?.age_confirmed || false,
    roles: list, role: list.includes("admin") ? "admin" : "user",
  };
}

const auth = {
  me,
  async isAuthenticated() { const { data } = await supabase.auth.getSession(); return Boolean(data.session); },
  async loginViaEmailPassword(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(/invalid/i.test(error.message) ? "E-mail ou senha inválidos" : error.message);
    return data;
  },
  async loginWithProvider(provider, returnTo = "/") {
    const redirectTo = new URL(returnTo, window.location.origin).toString();
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    fail(error);
  },
  async register({ email, password, full_name, phone }) {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name, phone } } });
    fail(error);
  },
  async verifyOtp({ email, otpCode }) {
    let res = await supabase.auth.verifyOtp({ email, token: otpCode, type: "signup" });
    if (res.error) res = await supabase.auth.verifyOtp({ email, token: otpCode, type: "email" });
    if (res.error) throw new Error("Código inválido ou expirado");
    return { access_token: res.data.session?.access_token };
  },
  async resendOtp(email) { const { error } = await supabase.auth.resend({ type: "signup", email }); fail(error); },
  setToken() { /* sessão é gerenciada pelo Supabase */ },
  async resetPasswordRequest(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    fail(error);
  },
  async resetPassword({ newPassword }) { const { error } = await supabase.auth.updateUser({ password: newPassword }); fail(error); },
  async logout(redirectTo) { await supabase.auth.signOut(); if (redirectTo) window.location.href = "/"; },
  redirectToLogin(from = window.location.href) {
    const path = new URL(from, window.location.origin);
    window.location.href = `/login?returnTo=${encodeURIComponent(path.pathname + path.search)}`;
  },
};

// ---------------------------------------------------------------- arquivos
const integrations = {
  Core: {
    async UploadPublicFile({ file }) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Faça login para enviar imagens");
      if (file.size > 5 * 1024 * 1024) throw new Error("Imagem muito grande (máximo 5 MB)");
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${user.id}/${uuid()}.${ext}`;
      const { error } = await supabase.storage.from("public-images").upload(path, file, { contentType: file.type, upsert: false });
      fail(error);
      return { file_url: supabase.storage.from("public-images").getPublicUrl(path).data.publicUrl };
    },
  },
};

export const base44 = {
  entities: { Store, Product, Order, StoreReferral },
  auth,
  integrations,
  app: { async getPublicSettings() { return {}; } },
};

// Camada de compatibilidade: as telas herdadas do Base44 continuam chamando
// base44.entities.X / base44.auth.Y, mas tudo passa pelo Supabase.
// Regras de dinheiro e de status NUNCA são gravadas direto na tabela: vão para as
// funções do servidor (create_order, advance_order_status, confirm_delivery, ...).
import { supabase } from "@/api/supabase";
import { parseHours, hoursText, isOpenNow } from "@/lib/hours";
import { APP_VERSION } from "@/lib/version";

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
    if (d.pix_key) fail((await supabase.from("store_private").update({ pix_key: d.pix_key.trim() }).eq("store_id", id)).error);
    return Store.get(id);
  },
  // Dados privados (só o dono e o admin conseguem ler: regra do banco)
  async getPrivate(id) {
    const { data, error } = await supabase.from("store_private").select("pix_key, owner_name, legal_name").eq("store_id", id).maybeSingle();
    fail(error);
    return data || {};
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
    if (d.pix_key !== undefined) fail((await supabase.from("store_private").update({ pix_key: d.pix_key?.trim() || null }).eq("store_id", id)).error);
    return Store.get(id);
  },
};

// ---------------------------------------------------------------- produtos
const PRODUCT_SELECT = "id, store_id, section, name, description, image_url, price, unit, stock, available, age_restricted, sort, created_at, " +
  "variants:product_variants(id, name, price, available, sort), " +
  "addon_groups:product_addon_groups(id, name, min_select, max_select, sort, addons:product_addons(id, name, price, available, sort))";
const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0);
const productFromRow = (r) => r && ({
  id: r.id, store_id: r.store_id, name: r.name, description: r.description || "", image_url: r.image_url || "",
  price: Number(r.price), category: r.section || "", unit: r.unit, stock: r.stock == null ? null : Number(r.stock),
  available: r.available, age_restricted: r.age_restricted, created_date: r.created_at,
  // Tamanhos (ex.: P/M/G) e grupos de adicionais (ex.: "Adicionais", mín. 0, máx. 3)
  variants: (r.variants || []).slice().sort(bySort).map((v) => ({ id: v.id, name: v.name, price: Number(v.price), available: v.available })),
  addon_groups: (r.addon_groups || []).slice().sort(bySort).map((g) => ({
    id: g.id, name: g.name, min: g.min_select, max: g.max_select,
    addons: (g.addons || []).slice().sort(bySort).map((a) => ({ id: a.id, name: a.name, price: Number(a.price), available: a.available })),
  })),
});
// Grava tamanhos e adicionais mantendo os ids existentes (carrinhos abertos continuam válidos).
async function syncList(table, parentCol, parentId, items, toRow) {
  const { data: current, error } = await supabase.from(table).select("id").eq(parentCol, parentId);
  fail(error);
  const keep = new Set(items.filter((i) => i.id).map((i) => i.id));
  const gone = (current || []).map((c) => c.id).filter((id) => !keep.has(id));
  if (gone.length) fail((await supabase.from(table).delete().in("id", gone)).error);
  const ids = [];
  for (const [n, it] of items.entries()) {
    const row = { ...toRow(it), sort: n };
    if (it.id) { fail((await supabase.from(table).update(row).eq("id", it.id)).error); ids.push(it.id); }
    else {
      const { data, error: e2 } = await supabase.from(table).insert({ ...row, [parentCol]: parentId }).select("id").single();
      fail(e2); ids.push(data.id);
    }
  }
  return ids;
}
async function saveOptions(productId, d) {
  if (d.variants !== undefined) {
    const list = (d.variants || []).filter((v) => String(v.name || "").trim());
    await syncList("product_variants", "product_id", productId, list, (v) => ({ name: v.name.trim(), price: Number(v.price) || 0, available: v.available !== false }));
  }
  if (d.addon_groups !== undefined) {
    const groups = (d.addon_groups || []).filter((g) => String(g.name || "").trim());
    const ids = await syncList("product_addon_groups", "product_id", productId, groups, (g) => {
      const max = Math.max(1, Number(g.max) || 1);
      return { name: g.name.trim(), min_select: Math.min(Math.max(0, Number(g.min) || 0), max), max_select: max };
    });
    for (const [n, g] of groups.entries()) {
      const addons = (g.addons || []).filter((a) => String(a.name || "").trim());
      await syncList("product_addons", "group_id", ids[n], addons, (a) => ({ name: a.name.trim(), price: Number(a.price) || 0, available: a.available !== false }));
    }
  }
}
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
    const { data, error } = await supabase.from("products").insert({ ...productToRow(d), store_id: d.store_id }).select("id").single();
    fail(error);
    await saveOptions(data.id, d);
    return Product.get(data.id);
  },
  async update(id, d) {
    const row = productToRow(d);
    if (Object.keys(row).length) fail((await supabase.from("products").update(row).eq("id", id)).error);
    await saveOptions(id, d);
    return Product.get(id);
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
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name, phone } } });
    fail(error);
    // Sem confirmação por e-mail (configuração do Supabase), a sessão já vem pronta e não há código a digitar.
    return { needsVerification: !data?.session };
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

// ---------------------------------------------------------------- conta do cliente
const account = {
  async getProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle();
    fail(error);
    return { full_name: data?.full_name || "", phone: data?.phone || "" };
  },
  async updateProfile({ full_name, phone }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Faça login para continuar");
    const { error } = await supabase.from("profiles").update({ full_name: full_name?.trim() || null, phone: phone?.trim() || null }).eq("id", user.id);
    fail(error);
  },
  async listAddresses() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase.from("addresses").select("id, line, reference, is_default, created_at").eq("user_id", user.id).order("created_at");
    fail(error);
    return data;
  },
  async addAddress(line) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Faça login para continuar");
    const city = await defaultCity();
    const { count } = await supabase.from("addresses").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    const { error } = await supabase.from("addresses").insert({ user_id: user.id, line: line.trim(), city_id: city.id, is_default: !count });
    fail(error);
  },
  async removeAddress(id) { fail((await supabase.from("addresses").delete().eq("id", id)).error); },
  async setDefaultAddress(id) {
    const { data: { user } } = await supabase.auth.getUser();
    fail((await supabase.from("addresses").update({ is_default: false }).eq("user_id", user.id)).error);
    fail((await supabase.from("addresses").update({ is_default: true }).eq("id", id)).error);
  },
  async deleteAccount() {
    const { error } = await supabase.rpc("delete_my_account");
    fail(error);
    await supabase.auth.signOut().catch(() => {});
  },
};

// ---------------------------------------------------------------- painel do comerciante
const ACTIVE = "(DELIVERED,CANCELLED)";
const partner = {
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

// ---------------------------------------------------------------- administração
const rpc = async (fn, args = {}) => { const { data, error } = await supabase.rpc(fn, args); fail(error); return data; };
const admin = {
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

// Registro de erros: nunca deixa uma falha no envio virar outro erro na tela.
let lastErrorSent = 0;
export async function reportError(err, extra = {}) {
  try {
    if (Date.now() - lastErrorSent < 3000) return;
    lastErrorSent = Date.now();
    await supabase.rpc("log_client_error", {
      p_message: String(err?.message || err || "erro desconhecido"),
      p_stack: err?.stack ? String(err.stack) : extra.stack || null,
      p_url: typeof location !== "undefined" ? location.pathname : null,
      p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      p_app_version: APP_VERSION.slice(0, 40),
    });
  } catch { /* sem rede ou sem permissão: ignora */ }
}

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
  account,
  partner,
  admin,
  integrations,
  app: { async getPublicSettings() { return {}; } },
};

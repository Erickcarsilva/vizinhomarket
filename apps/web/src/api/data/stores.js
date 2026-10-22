// Lojas.
import { supabase } from "@/api/supabase";
import { parseHours, hoursText, isOpenNow } from "@/lib/hours";
import { applySort, categories, defaultCity, fail } from "./shared";

export const STORE_SELECT = "id, city_id, category_id, name, slug, description, logo_url, cover_url, phone_public, address_line, neighborhood_id, " +
  "is_paused, accepts_pickup, accepts_store_delivery, accepts_platform_delivery, delivery_fee_default, min_order, prep_time_min, " +
  "status, rating_avg, rating_count, approved_at, created_by, created_at, updated_at, " +
  "category:categories(slug, name), city:cities(name, timezone), hours:store_hours(weekday, opens, closes), zones:delivery_zones(fee)";

export const storeFromRow = (r) => r && ({
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
  // Taxa por bairro: se a loja cadastrou bairros, a taxa depende do bairro (mínima e máxima para mostrar na vitrine).
  delivery_zones: (r.zones || []).length,
  delivery_fee_min: (r.zones || []).length ? Math.min(...r.zones.map((z) => Number(z.fee))) : null,
  delivery_fee_max: (r.zones || []).length ? Math.max(...r.zones.map((z) => Number(z.fee))) : null,
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

export const Store = {
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
    const cat = (await categories()).find((c) => c.slug === d.category);
    if (!cat) throw new Error("Escolha uma categoria válida");
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

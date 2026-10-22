// Produtos, tamanhos e adicionais.
import { supabase } from "@/api/supabase";
import { applySort, fail } from "./shared";

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

export const Product = {
  async filter(where = {}, sort = "-created_date", limit = 1000) {
    let q = supabase.from("products").select(PRODUCT_SELECT).is("deleted_at", null);
    if (where.store_id) q = q.eq("store_id", where.store_id);
    if (where.available !== undefined) q = q.eq("available", where.available);
    const { data, error } = await applySort(q, sort, "products").limit(limit);
    fail(error);
    return data.map(productFromRow);
  },
  // Busca no servidor por nome ou descrição (o navegador não baixa mais o catálogo inteiro).
  async search(term, limit = 40) {
    const clean = String(term || "").replace(/[,()*%\\:."']/g, " ").trim().slice(0, 60);
    if (clean.length < 2) return [];
    const like = `*${clean.replace(/\s+/g, "*")}*`;
    const { data, error } = await supabase.from("products").select(PRODUCT_SELECT)
      .is("deleted_at", null).eq("available", true)
      .or(`name.ilike.${like},description.ilike.${like}`)
      .order("name").limit(limit);
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

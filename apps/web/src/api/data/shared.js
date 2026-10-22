// Utilitários comuns da camada de dados.
import { supabase } from "@/api/supabase";

// Camada de compatibilidade: as telas herdadas do Base44 continuam chamando
// base44.entities.X / base44.auth.Y, mas tudo passa pelo Supabase.
// Regras de dinheiro e de status NUNCA são gravadas direto na tabela: vão para as
// funções do servidor (create_order, advance_order_status, confirm_delivery, ...).

export const fail = (error, fallback = "Não foi possível concluir. Tente novamente.") => {
  if (!error) return;
  const msg = error.message || fallback;
  const e = new Error(/permission denied|row-level security|42501/i.test(msg + (error.code || "")) ? "Você não tem permissão para fazer isso." : msg);
  e.status = error.status || (error.code === "42501" ? 403 : 400);
  e.code = error.code;
  throw e;
};
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

const SORT = {
  "-rating": ["rating_avg", false], rating: ["rating_avg", true],
  "-created_date": ["created_at", false], created_date: ["created_at", true],
  name: ["name", true], "-name": ["name", false],
  category: ["section", true],
};
export const applySort = (q, sort, table) => {
  let [col, asc] = SORT[sort] || ["created_at", false];
  if (table !== "products" && col === "section") col = "name";
  return q.order(col, { ascending: asc, nullsFirst: false });
};

export const FULF_TO_DB = { loja: "store_delivery", plataforma: "platform_delivery", retirada: "pickup" };
export const FULF_FROM_DB = Object.fromEntries(Object.entries(FULF_TO_DB).map(([a, b]) => [b, a]));
export const PAY_TO_DB = { pix: "pix", cartao: "card_on_delivery", dinheiro: "cash" };
export const PAY_FROM_DB = Object.fromEntries(Object.entries(PAY_TO_DB).map(([a, b]) => [b, a]));

let categoryCache = null;
export async function categories() {
  if (categoryCache) return categoryCache;
  const { data, error } = await supabase.from("categories").select("id, slug, name");
  fail(error);
  categoryCache = data;
  return data;
}
let cityCache = null;
export async function defaultCity() {
  if (cityCache) return cityCache;
  const { data, error } = await supabase.from("cities").select("id, name, timezone").eq("slug", "sidrolandia-ms").single();
  fail(error);
  cityCache = data;
  return data;
}

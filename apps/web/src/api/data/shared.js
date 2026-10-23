// Utilitários comuns da camada de dados.
import { supabase } from "@/api/supabase";

// Camada de compatibilidade: as telas herdadas do Base44 continuam chamando
// base44.entities.X / base44.auth.Y, mas tudo passa pelo Supabase.
// Regras de dinheiro e de status NUNCA são gravadas direto na tabela: vão para as
// funções do servidor (create_order, advance_order_status, confirm_delivery, ...).

// Mensagens do login (Supabase Auth) vêm em inglês: traduz as que o cliente pode ver.
const AUTH_PT = [
  [/only request this after (\d+) seconds?/i, (m) => `Por segurança, aguarde ${m[1]} segundos para pedir de novo.`],
  [/email rate limit exceeded|over_email_send_rate_limit/i, () => "Muitos e-mails enviados agora. Tente de novo em alguns minutos."],
  [/invalid login credentials/i, () => "E-mail ou senha incorretos."],
  [/email not confirmed/i, () => "Confirme o seu e-mail antes de entrar (veja a caixa de entrada e o spam)."],
  [/user already registered/i, () => "Já existe uma conta com este e-mail. Entre ou use \"Esqueci a senha\"."],
  [/password should be at least (\d+)/i, (m) => `A senha precisa ter pelo menos ${m[1]} caracteres.`],
  [/new password should be different/i, () => "A senha nova precisa ser diferente da atual."],
  [/token has expired|otp_expired|invalid.*otp/i, () => "O código ou link venceu. Peça um novo."],
  [/user is banned|user_banned/i, () => "Esta conta está bloqueada. Fale com o suporte."],
];
export const translateAuth = (msg) => {
  for (const [re, fn] of AUTH_PT) { const m = String(msg || "").match(re); if (m) return fn(m); }
  return msg;
};

export const fail = (error, fallback = "Não foi possível concluir. Tente novamente.") => {
  if (!error) return;
  const msg = translateAuth(error.message || fallback);
  const e = new Error(/permission denied|row-level security|42501/i.test(msg + (error.code || "")) ? "Você não tem permissão para fazer isso." : msg);
  e.status = error.status || (error.code === "42501" ? 403 : 400);
  e.code = error.code;
  e.details = error.details; // ex.: preços novos quando o total mudou (VMPRC)
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

import { supabase } from "@/api/supabase";

// Favoritos: guardados na conta (tabela favorites) e copiados no navegador para a tela responder na hora.
// Sem login, ficam só no navegador; ao entrar, os do navegador são enviados para a conta.
const KEY = "perto_favorites";
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const write = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* navegador sem armazenamento */ } };

async function userId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id || null;
}
async function addRemote(productId) {
  const { error } = await supabase.from("favorites").insert({ product_id: productId });
  if (error && error.code !== "23505") throw error; // 23505 = já estava salvo
}

export const getFavorites = read;
export const isFavorite = (id) => read().includes(id);

export const toggleFavorite = (id) => {
  const list = read();
  const on = !list.includes(id);
  write(on ? [...list, id] : list.filter((x) => x !== id));
  (async () => {
    if (!(await userId())) return;
    if (on) await addRemote(id);
    else await supabase.from("favorites").delete().eq("product_id", id);
  })().catch(() => { /* fica no navegador; sincroniza no próximo login */ });
  return on;
};

// Junta os do navegador com os da conta e devolve a lista final.
export async function syncFavorites() {
  if (!(await userId())) return read();
  const load = async () => {
    const { data, error } = await supabase.from("favorites").select("product_id").order("created_at");
    if (error) throw error;
    return data.map((r) => r.product_id);
  };
  try {
    const remote = await load();
    const missing = read().filter((id) => !remote.includes(id));
    for (const id of missing) await addRemote(id).catch(() => {}); // produto apagado: ignora
    const list = missing.length ? await load() : remote;
    write(list);
    return list;
  } catch {
    return read();
  }
}

// Ao sair da conta, não deixa os favoritos de uma pessoa para a próxima que usar o aparelho.
export const clearLocalFavorites = () => write([]);

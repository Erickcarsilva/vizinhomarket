// Conta do cliente: perfil, endereços, exclusão.
import { supabase } from "@/api/supabase";
import { defaultCity, fail } from "./shared";

export const account = {
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
    const { data, error } = await supabase.from("addresses").select("id, line, reference, is_default, created_at, neighborhood_id").eq("user_id", user.id).order("created_at");
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

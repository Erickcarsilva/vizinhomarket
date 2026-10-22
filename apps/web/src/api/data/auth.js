// Login e conta (Supabase Auth).
import { supabase } from "@/api/supabase";
import { fail, translateAuth } from "./shared";

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

export const auth = {
  me,
  async isAuthenticated() { const { data } = await supabase.auth.getSession(); return Boolean(data.session); },
  async loginViaEmailPassword(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(/invalid login/i.test(error.message) ? "E-mail ou senha inválidos" : translateAuth(error.message));
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

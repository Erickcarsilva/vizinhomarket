import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

if (!isConfigured) {
  console.warn("[VizinhoMarket] VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não configurados (.env.local).");
}

export const supabase = createClient(url || "http://localhost:54321", anonKey || "public-anon-key", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

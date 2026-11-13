// Ligação das regras de pagamento (core.mjs) com o Supabase dentro das Edge Functions (Deno).
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { providerFromEnv } from "./providers.mjs";

export const env = Deno.env.toObject();
export const admin = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// Chama função do banco como service_role. Erros do banco viram exceção com a mensagem em português e o código.
export async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await admin.rpc(fn, args);
  if (error) { const e = new Error(error.message) as Error & { code?: string }; e.code = error.code; throw e; }
  return data;
}

export async function currentProviderName(): Promise<string> {
  const { data } = await admin.from("platform_settings").select("value").eq("key", "payment_provider").maybeSingle();
  return (data?.value as string) || "sandbox";
}
export const providerByName = (name: string) => providerFromEnv(name, env);

// Log estruturado sem dados pessoais (só ids e códigos).
export const log = (event: string, data: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ level: "info", fn: "pagamentos", event, ...data, at: new Date().toISOString() }));

export const cors = {
  "Access-Control-Allow-Origin": env.APP_ORIGINS?.split(",")[0] || "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export function corsFor(req: Request) {
  const allowed = (env.APP_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get("origin") || "";
  return { ...cors, "Access-Control-Allow-Origin": allowed.length === 0 ? "*" : allowed.includes(origin) ? origin : allowed[0], Vary: "Origin" };
}
export const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

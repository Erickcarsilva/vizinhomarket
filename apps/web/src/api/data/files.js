// Envio de arquivos e registro de erros.
import { supabase } from "@/api/supabase";
import { APP_VERSION } from "@/lib/version";
import { fail, uuid } from "./shared";


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

export const integrations = {
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

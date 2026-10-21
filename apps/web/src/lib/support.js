// Contatos de atendimento da plataforma. Só aparecem nas telas quando estiverem configurados
// nas variáveis do site (Netlify): VITE_SUPPORT_WHATSAPP (só números, com DDI e DDD, ex.: 5567999998888),
// VITE_SUPPORT_EMAIL e, opcional, VITE_SUPPORT_HOURS (ex.: "Seg–Sáb, 8h às 18h").
const digits = (v) => (v || "").replace(/\D/g, "");
const wa = digits(import.meta.env.VITE_SUPPORT_WHATSAPP);
const email = (import.meta.env.VITE_SUPPORT_EMAIL || "").trim();

export const SUPPORT = {
  whatsapp: wa.length >= 12 ? wa : null,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
  hours: (import.meta.env.VITE_SUPPORT_HOURS || "").trim() || null,
};
export const hasSupportContact = Boolean(SUPPORT.whatsapp || SUPPORT.email);

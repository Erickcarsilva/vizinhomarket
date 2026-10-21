// Qual dos três produtos está sendo gerado: "cliente" (app), "parceiro" (painel do comerciante) ou "admin" (painel admin).
// Definido na hora de gerar: npm run build:cliente | build:parceiro | build:admin
export const APP = import.meta.env.VITE_APP || "cliente";

export const APP_LABEL = { cliente: "", parceiro: "Painel do comerciante", admin: "Painel administrativo" }[APP];

// Endereços dos três produtos (para links entre eles). Podem ser trocados nas variáveis VITE_URL_*.
const DEV = { cliente: "http://localhost:5173", parceiro: "http://localhost:5174", admin: "http://localhost:5175" };
const PROD = {
  cliente: "https://vizinhomarket-teste.netlify.app",
  parceiro: "https://vizinhomarket-parceiro.netlify.app",
  admin: "https://vizinhomarket-admin.netlify.app",
};
const base = import.meta.env.DEV ? DEV : PROD;
export const URLS = {
  cliente: import.meta.env.VITE_URL_CLIENTE || base.cliente,
  parceiro: import.meta.env.VITE_URL_PARCEIRO || base.parceiro,
  admin: import.meta.env.VITE_URL_ADMIN || base.admin,
};

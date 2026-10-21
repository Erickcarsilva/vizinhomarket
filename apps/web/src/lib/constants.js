import { UtensilsCrossed, ShoppingBasket, PawPrint, Wrench, ShoppingBag, Wine, Smartphone } from "lucide-react";

// Farmácia fica fora do piloto (regras sanitárias). Ver migração 202610210003.
export const CATEGORIES = [
  { id: "alimentacao", label: "Alimentação", icon: UtensilsCrossed },
  { id: "mercado", label: "Mercado", icon: ShoppingBasket },
  { id: "pet", label: "Pet", icon: PawPrint },
  { id: "bebidas", label: "Bebidas", icon: Wine },
  { id: "autopecas", label: "Autopeças", icon: Wrench },
  { id: "eletronicos", label: "Eletrônicos", icon: Smartphone },
  { id: "lojas", label: "Lojas", icon: ShoppingBag },
];
export const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || id;

export const STATUS = {
  CREATED: { label: "Recebido", tone: "bg-amber-100 text-amber-800" },
  ACCEPTED: { label: "Aceito", tone: "bg-sky-100 text-sky-800" },
  PREPARING: { label: "Em preparo", tone: "bg-violet-100 text-violet-800" },
  READY: { label: "Pronto", tone: "bg-emerald-100 text-emerald-800" },
  IN_TRANSIT: { label: "A caminho", tone: "bg-orange-100 text-orange-800" },
  DELIVERED: { label: "Concluído", tone: "bg-stone-200 text-stone-700" },
  CANCELLED: { label: "Cancelado", tone: "bg-red-100 text-red-700" },
};

const FLOW_DELIVERY = ["CREATED", "ACCEPTED", "PREPARING", "READY", "IN_TRANSIT", "DELIVERED"];
const FLOW_PICKUP = ["CREATED", "ACCEPTED", "PREPARING", "READY", "DELIVERED"];
export const flowFor = (fulfillment) => (fulfillment === "retirada" ? FLOW_PICKUP : FLOW_DELIVERY);

export const nextStatus = (order) => {
  const flow = flowFor(order.fulfillment);
  const i = flow.indexOf(order.status);
  return i >= 0 && i < flow.length - 1 ? flow[i + 1] : null;
};

export const nextActionLabel = (order) => {
  const map = {
    CREATED: "Aceitar pedido",
    ACCEPTED: "Iniciar preparo",
    PREPARING: "Marcar como pronto",
    READY: order.fulfillment === "retirada" ? "Confirmar retirada" : "Saiu para entrega",
    IN_TRANSIT: "Confirmar entrega",
  };
  return map[order.status];
};

export const FULFILLMENT = {
  loja: "Entrega pela loja",
  plataforma: "Entrega pela plataforma",
  retirada: "Retirada no local",
};

export const PAYMENT = { pix: "Pix", cartao: "Cartão na maquininha", dinheiro: "Dinheiro" };

export const brl = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const trialDaysLeft = (store) => {
  if (!store?.trial_ends_at) return null;
  return Math.max(0, Math.ceil((new Date(store.trial_ends_at) - new Date()) / 86400000));
};

// Regra única de elegibilidade para a vitrine: lojas suspensas, inadimplentes
// ou com trial vencido não devem aparecer para o cliente. Centralizada para
// evitar divergência entre Home, Vitrine, Busca e Categorias.
export const isStoreListable = (store) =>
  !!store &&
  store.subscription_status !== "CANCELLED" &&
  store.subscription_status !== "PAST_DUE" &&
  !(store.subscription_status === "TRIAL" && trialDaysLeft(store) === 0);

export const MY_ORDERS_KEY = "perto_orders";
export const getMyOrderIds = () => JSON.parse(localStorage.getItem(MY_ORDERS_KEY) || "[]");
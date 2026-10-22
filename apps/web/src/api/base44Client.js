// Camada de compatibilidade: as telas herdadas do Base44 continuam chamando
// base44.entities.X / base44.auth.Y, mas tudo passa pelo Supabase.
// Regras de dinheiro e de status NUNCA são gravadas direto na tabela: vão para as
// funções do servidor (create_order, advance_order_status, confirm_delivery, ...).
//
// O código fica dividido por área em api/data/:
//   shared (utilitários) · stores (lojas) · products (produtos) · orders (pedidos, endereços, bairros)
//   auth (login) · account (conta do cliente) · partner (painel do comerciante) · admin · files (arquivos e erros)
import { Store } from "./data/stores";
import { Product } from "./data/products";
import { Order, StoreReferral, neighborhoods, storeZones } from "./data/orders";
import { auth } from "./data/auth";
import { account } from "./data/account";
import { partner } from "./data/partner";
import { admin } from "./data/admin";
import { integrations, reportError } from "./data/files";

export { reportError };

export const base44 = {
  entities: { Store, Product, Order, StoreReferral },
  geo: { neighborhoods, storeZones },
  auth,
  account,
  partner,
  admin,
  integrations,
  app: { async getPublicSettings() { return {}; } },
};

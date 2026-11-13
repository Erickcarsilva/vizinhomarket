// Sistema de cores e símbolos das categorias — a diversidade do marketplace em um só código visual.
// Regra: cada categoria tem um par (fundo claro, tinta forte) com contraste AA entre si, e um símbolo próprio.
// Todas as categorias têm o MESMO peso visual (mesmo tamanho de bloco, mesma saturação): nenhuma domina a marca.
// Usado em: atalhos de categoria, monograma da loja sem logo, faixa da loja, arte provisória de produto sem foto.
import {
  UtensilsCrossed, ShoppingBasket, PawPrint, Wine, Wrench, Smartphone, ShoppingBag, Store, Shirt, Sofa, Hammer, Sparkles,
  BookOpen, Flower2, Puzzle, Sprout, Briefcase, Pill, LayoutGrid,
} from "lucide-react";

export const CATEGORY_STYLE = {
  alimentacao:  { short: "Comida",       icon: UtensilsCrossed, bg: "#FFE4D6", fg: "#B4380E" },
  mercado:      { short: "Mercado",      icon: ShoppingBasket,  bg: "#DDF3E4", fg: "#0B6B43" },
  farmacia:     { short: "Farmácia",     icon: Pill,            bg: "#DCF1F1", fg: "#0E6B6B" },
  bebidas:      { short: "Bebidas",      icon: Wine,            bg: "#E4E9FF", fg: "#3046B5" },
  conveniencia: { short: "Conveniência", icon: Store,           bg: "#FFF0C2", fg: "#7A5600" },
  pet:          { short: "Pet",          icon: PawPrint,        bg: "#FDE6CF", fg: "#8F4A00" },
  eletronicos:  { short: "Eletrônicos",  icon: Smartphone,      bg: "#E7E4FB", fg: "#4D35B8" },
  moda:         { short: "Moda",         icon: Shirt,           bg: "#F8E1EE", fg: "#9C2462" },
  casa:         { short: "Casa",         icon: Sofa,            bg: "#EDE6DA", fg: "#6A4F27" },
  construcao:   { short: "Construção",   icon: Hammer,          bg: "#FBE3D3", fg: "#99410C" },
  autopecas:    { short: "Automotivo",   icon: Wrench,          bg: "#E3E7EC", fg: "#38434F" },
  beleza:       { short: "Beleza",       icon: Sparkles,        bg: "#F7E2F3", fg: "#8E2A7E" },
  papelaria:    { short: "Papelaria",    icon: BookOpen,        bg: "#DDEBF8", fg: "#1D5C93" },
  flores:       { short: "Presentes",    icon: Flower2,         bg: "#FCE1E7", fg: "#B0254A" },
  brinquedos:   { short: "Brinquedos",   icon: Puzzle,          bg: "#DCF2EF", fg: "#0F6E66" },
  agro:         { short: "Agro",         icon: Sprout,          bg: "#E7F1D6", fg: "#4B6714" },
  lojas:        { short: "Variedades",   icon: ShoppingBag,     bg: "#ECE4F7", fg: "#5E3A99" },
  servicos:     { short: "Serviços",     icon: Briefcase,       bg: "#E2E8F0", fg: "#2E4766" },
};
export const ALL_STYLE = { short: "Tudo", icon: LayoutGrid, bg: "#EEF1EF", fg: "#14201A" };
const FALLBACK = { short: "Loja", icon: Store, bg: "#EEF1EF", fg: "#38433D" };
export const categoryStyle = (slug) => CATEGORY_STYLE[slug] || FALLBACK;

// Grupos da página inicial: as "ruas" do marketplace. Uma seção por grupo que tenha loja.
export const HOME_GROUPS = [
  { id: "comida", title: "Comida", slugs: ["alimentacao"] },
  { id: "mercado", title: "Mercado e conveniência", slugs: ["mercado", "conveniencia", "bebidas"] },
  { id: "saude", title: "Saúde e cuidados", slugs: ["farmacia", "beleza"] },
  { id: "lojas", title: "Lojas da cidade", slugs: ["eletronicos", "moda", "casa", "construcao", "autopecas", "papelaria", "flores", "brinquedos", "agro", "lojas", "pet"] },
  { id: "servicos", title: "Serviços", slugs: ["servicos"] },
];

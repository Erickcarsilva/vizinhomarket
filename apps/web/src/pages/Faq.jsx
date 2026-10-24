import React from "react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

const TOPICS = [
  {
    title: "Para clientes",
    items: [
      { q: "Como faço um pedido?", a: "Navegue pela vitrine ou categorias, escolha a loja, monte o pedido pelo catálogo e finalize no checkout informando endereço e forma de pagamento." },
      { q: "Preciso pagar online?", a: "Não. O pagamento é combinado direto com a loja: Pix, cartão na maquininha ou dinheiro na entrega/retirada." },
      { q: "Posso retirar no local?", a: "Sim. Quando a loja oferece retirada, você escolhe essa opção no checkout e busca o pedido no endereço da loja." },
      { q: "Como acompanho meu pedido?", a: "Após finalizar, você é direcionado à página de acompanhamento. Também fica salvo em 'Meus pedidos' para acessar depois." },
    ],
  },
  {
    title: "Para lojistas",
    items: [
      { q: "Como cadastro minha loja?", a: "Entre no Painel do Comerciante, toque em 'Cadastrar loja', preencha os dados e aguarde a aprovação. Sem mensalidade: você só paga quando vende." },
      { q: "Vocês cobram comissão por venda?", a: "Sim, só sobre os pedidos concluídos pelo app: sem mensalidade e sem taxa de adesão. O percentual é informado na aprovação da loja." },
      { q: "Como adiciono produtos?", a: "No Painel do Comerciante, em 'Cardápio e preços', você cria, edita, muda preços e pausa os itens do seu catálogo." },
      { q: "Como pago a comissão?", a: "A comissão de cada pedido entregue aparece em 'Comissões e faturas'. No fim do período você recebe a fatura com o total." },
    ],
  },
  {
    title: "Pagamentos e entregas",
    items: [
      { q: "Quem faz a entrega?", a: "Depende da loja: entrega feita pela própria loja ou retirada no local. As opções disponíveis aparecem no checkout." },
      { q: "Como recebo os pagamentos?", a: "Direto do cliente, no momento da entrega ou retirada. A plataforma não intermedeia o dinheiro." },
      { q: "Tem pedido mínimo?", a: "Algumas lojas definem um valor mínimo, que aparece no carrinho caso o subtotal seja inferior." },
    ],
  },
  {
    title: "Conta e cadastro",
    items: [
      { q: "Esqueci minha senha, como recupero?", a: "Na página de login, clique em 'Esqueci a senha' e siga as instruções enviadas por e-mail." },
      { q: "Como edito meus dados?", a: "Em 'Minha conta' você atualiza nome, telefone e endereços salvos para agilizar suas compras." },
      { q: "Como favorito um produto?", a: "Toque no coração na linha do produto. Seus favoritos ficam salvos na página 'Favoritos'." },
    ],
  },
];

export default function Faq() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 pb-10">
      <h1 className="font-display text-2xl text-marca mb-6">Dúvidas frequentes</h1>
      <div className="space-y-8">
        {TOPICS.map((topic) => (
          <section key={topic.title}>
            <h2 className="font-display text-xl text-marca mb-1">{topic.title}</h2>
            <Accordion type="single" collapsible>
              {topic.items.map((it, i) => (
                <AccordionItem key={i} value={`${topic.title}-${i}`}>
                  <AccordionTrigger className="text-base font-semibold">{it.q}</AccordionTrigger>
                  <AccordionContent className="text-[15px] text-muted-foreground leading-relaxed">{it.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        ))}
      </div>
    </div>
  );
}
import React from "react";
import { Link } from "react-router-dom";
import { HeartHandshake, Store, Truck, Users } from "lucide-react";

export default function Sobre() {
  const pillars = [
    { icon: Store, title: "Comércio local primeiro", text: "Damos visibilidade às lojas de bairro de Sidrolândia e região — do mercado da esquina ao serviço do seu bairro." },
    { icon: HeartHandshake, title: "Sem comissões abusivas", text: "O lojista paga uma mensalidade fixa e leve. O que ele vende é dele: não cobramos porcentagem sobre cada pedido." },
    { icon: Truck, title: "Pedidos diretos", text: "O cliente pede e a loja entrega, retira ou usa a entrega da plataforma. Tudo combinado direto, sem intermediário." },
    { icon: Users, title: "Feito para a comunidade", text: "Somos um marketplace local: fortalecemos quem mora e trabalha aqui, gerando renda e conveniência no mesmo lugar." },
  ];
  return (
    <div className="max-w-4xl mx-auto px-5 py-16">
      <h1 className="font-display text-4xl mt-2">O comércio de Sidrolândia, a um toque.</h1>
      <p className="text-lg text-muted-foreground mt-6 leading-relaxed">
        O VizinhoMarket nasceu para reaproximar moradores e lojistas do bairro. Enquanto os grandes marketplaces
        cobram comissões altas e afastam o cliente da loja, nós fazemos o oposto: colocamos o comércio local na
        palma da sua mão, com um custo justo para quem vende e mais conveniência para quem compra.
      </p>

      <div className="grid sm:grid-cols-2 gap-6 mt-12">
        {pillars.map((p) => {
          const Icon = p.icon;
          return (
            <div key={p.title} className="rounded-2xl border border-border bg-card p-6">
              <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Icon className="w-5 h-5" />
              </div>
              <h2 className="font-display text-xl mt-4">{p.title}</h2>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{p.text}</p>
            </div>
          );
        })}
      </div>

      <section className="mt-14">
        <h2 className="font-display text-2xl mb-4">Como funcionamos</h2>
        <ol className="space-y-4 text-muted-foreground">
          <li><strong className="text-foreground">1. Lojista se cadastra</strong> e, depois de aprovado, monta o catálogo. Sem mensalidade: paga só uma comissão sobre os pedidos entregues.</li>
          <li><strong className="text-foreground">2. O cliente navega pela vitrine</strong>, escolhe a loja e monta o pedido pelo catálogo.</li>
          <li><strong className="text-foreground">3. A loja recebe e prepara</strong>, e o pedido é entregue pela loja ou retirado no local.</li>
          <li><strong className="text-foreground">4. O pagamento é combinado direto</strong> — Pix, cartão na maquininha ou dinheiro na entrega.</li>
        </ol>
      </section>

      <div className="mt-14 rounded-2xl bg-primary text-primary-foreground p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <h2 className="font-display text-2xl">Faça parte do movimento local</h2>
          <p className="opacity-80 mt-2 text-sm">Tem uma loja? Cadastre-se. Conhece um comércio legal? Indique para a gente.</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Link to="/cadastrar-loja" className="h-11 px-6 rounded-full bg-primary-foreground text-primary font-semibold flex items-center">Cadastrar loja</Link>
          <Link to="/indique-loja" className="h-11 px-6 rounded-full border border-primary-foreground/40 font-semibold flex items-center">Indicar uma loja</Link>
        </div>
      </div>
    </div>
  );
}
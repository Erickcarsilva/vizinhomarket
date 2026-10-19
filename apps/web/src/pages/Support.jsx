import React, { useState } from "react";
import { ChevronDown, MessageCircle, Mail, Clock } from "lucide-react";

const FAQ = [
  { q: "Como cadastro minha loja no VizinhoMarket?", a: "Acesse “Cadastrar loja” no rodapé, preencha nome, responsável, CNPJ/CPF e contato. Sua loja entra em análise e, ao ser aprovada, já aparece no app." },
  { q: "Tem período de teste?", a: "Não precisa: sem mensalidade, você só paga comissão quando vende. Monte o catálogo e comece a receber pedidos." },
  { q: "Quanto custa para vender no VizinhoMarket?", a: "Não tem mensalidade. Você paga uma comissão só sobre os pedidos concluídos pelo app (7,99% na maioria das categorias). Pode sair quando quiser." },
  { q: "Como recebo e acompanho meus pedidos?", a: "No painel do lojista (Área do lojista) você vê cada pedido, aceita, prepara e marca como pronto. Notificamos por alerta no painel." },
  { q: "Como funcionam as entregas?", a: "Você define os modos: entrega pela loja, pela plataforma ou retirada no local. Pedidos prontos para entrega ficam disponíveis para os entregadores no painel de Entregas." },
  { q: "Sou entregador, como começar?", a: "Acesse “Entregas” no topo. Os pedidos prontos aparecem como corridas disponíveis; aceite uma para ver a rota e o endereço do cliente no mapa." },
  { q: "Como gerencio meus pagamentos à plataforma?", a: "Na página Comissões você vê os pedidos concluídos e a comissão de cada um. A fatura do período chega pelo WhatsApp e é paga por Pix." },
];

function FaqItem({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between gap-4">
        <p className="font-medium">{item.q}</p>
        <ChevronDown className={`w-5 h-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </div>
      {open && <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{item.a}</p>}
    </button>
  );
}

export default function Support() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-12 space-y-12">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Central de ajuda</p>
        <h1 className="font-display text-4xl mt-2">Tire suas dúvidas</h1>
        <p className="text-muted-foreground mt-3">Lojistas e entregadores — encontre respostas e fale com a equipe VizinhoMarket.</p>
      </div>

      <section className="space-y-3">
        {FAQ.map((f) => <FaqItem key={f.q} item={f} />)}
      </section>

      <section className="grid sm:grid-cols-3 gap-4">
        <a href="https://wa.me/5506700000000" target="_blank" rel="noreferrer" className="bg-card border border-border rounded-2xl p-5 space-y-3 hover:bg-secondary transition-colors">
          <MessageCircle className="w-6 h-6 text-primary" />
          <p className="font-semibold">WhatsApp</p>
          <p className="text-sm text-muted-foreground">Atendimento de seg. a sáb.</p>
        </a>
        <a href="mailto:suporte@vizinhomarket.com.br" className="bg-card border border-border rounded-2xl p-5 space-y-3 hover:bg-secondary transition-colors">
          <Mail className="w-6 h-6 text-primary" />
          <p className="font-semibold">E-mail</p>
          <p className="text-sm text-muted-foreground">suporte@vizinhomarket.com.br</p>
        </a>
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <Clock className="w-6 h-6 text-primary" />
          <p className="font-semibold">Horário</p>
          <p className="text-sm text-muted-foreground">Seg–Sáb, 8h às 18h</p>
        </div>
      </section>
    </div>
  );
}
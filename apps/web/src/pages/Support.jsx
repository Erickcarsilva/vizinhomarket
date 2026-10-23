import React, { useState } from "react";
import { ChevronDown, MessageCircle, Mail, Clock } from "lucide-react";
import { SUPPORT, hasSupportContact } from "@/lib/support";

const FAQ = [
  { q: "Como cadastro minha loja no VizinhoMarket?", a: "Entre no Painel do Comerciante e toque em “Cadastrar loja”. Preencha nome, responsável, CPF/CNPJ e contato. A loja entra em análise e, depois de aprovada, aparece no app." },
  { q: "Quanto custa para vender no VizinhoMarket?", a: "Não tem mensalidade. Você paga uma comissão só sobre os pedidos concluídos pelo app . O percentual é informado na aprovação da loja. Pode sair quando quiser." },
  { q: "Como recebo e acompanho meus pedidos?", a: "No Painel do Comerciante, em “Pedidos”, você vê cada pedido, aceita, prepara e marca como pronto. Um alarme toca quando chega pedido novo." },
  { q: "Como funcionam as entregas?", a: "Você escolhe como atende: entrega feita pela própria loja ou retirada no local. Acompanhe as entregas em “Entregas”, no Painel do Comerciante." },
  { q: "Sou entregador, como começar?", a: "O app do entregador ainda está em preparação. Por enquanto as entregas são feitas pelas próprias lojas." },
  { q: "Como gerencio meus pagamentos à plataforma?", a: "Em “Comissões e faturas”, no Painel do Comerciante, você vê os pedidos entregues e a comissão de cada um, além das faturas do período." },
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
        <h1 className="font-display text-4xl mt-2">Tire suas dúvidas</h1>
        <p className="text-muted-foreground mt-3">Lojistas e entregadores — encontre respostas e fale com a equipe VizinhoMarket.</p>
      </div>

      <section className="space-y-3">
        {FAQ.map((f) => <FaqItem key={f.q} item={f} />)}
      </section>

      {hasSupportContact ? (
        <section className="grid sm:grid-cols-3 gap-4" data-support="contatos">
          {SUPPORT.whatsapp && (
            <a href={`https://wa.me/${SUPPORT.whatsapp}`} target="_blank" rel="noreferrer" className="bg-card border border-border rounded-2xl p-5 space-y-3 hover:bg-secondary transition-colors">
              <MessageCircle className="w-6 h-6 text-primary" />
              <p className="font-semibold">WhatsApp</p>
              <p className="text-sm text-muted-foreground">Fale com a equipe</p>
            </a>
          )}
          {SUPPORT.email && (
            <a href={`mailto:${SUPPORT.email}`} className="bg-card border border-border rounded-2xl p-5 space-y-3 hover:bg-secondary transition-colors">
              <Mail className="w-6 h-6 text-primary" />
              <p className="font-semibold">E-mail</p>
              <p className="text-sm text-muted-foreground break-all">{SUPPORT.email}</p>
            </a>
          )}
          {SUPPORT.hours && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <Clock className="w-6 h-6 text-primary" />
              <p className="font-semibold">Horário</p>
              <p className="text-sm text-muted-foreground">{SUPPORT.hours}</p>
            </div>
          )}
        </section>
      ) : (
        <section className="bg-card border border-border rounded-2xl p-5 text-sm text-muted-foreground" data-support="sem-contato">
          Os canais de atendimento da plataforma serão divulgados em breve. Dúvidas sobre um pedido podem ser tratadas direto com a loja, pelo telefone que aparece na página dela.
        </section>
      )}
    </div>
  );
}
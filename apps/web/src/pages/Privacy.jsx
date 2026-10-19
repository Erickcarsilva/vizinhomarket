import React from "react";

export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-16">
      <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Legal</p>
      <h1 className="font-display text-4xl mt-2 mb-8">Política de privacidade</h1>
      <p className="text-sm text-muted-foreground mb-8">Última atualização: 26 de setembro de 2026</p>

      <div className="space-y-8 text-[15px] leading-relaxed">
        <section>
          <h2 className="font-display text-2xl mb-3">1. Dados que coletamos</h2>
          <p className="text-muted-foreground">Coletamos nome, e-mail, telefone e endereço fornecidos no cadastro e nos pedidos, além de informações de uso da plataforma (como pedidos realizados e lojas acessadas). Não coletamos dados de pagamento online, pois os pagamentos são tratados diretamente entre cliente e loja.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-3">2. Como usamos seus dados</h2>
          <p className="text-muted-foreground">Utilizamos seus dados para processar pedidos, entregar as compras, comunicar o andamento dos pedidos, exibir lojas próximas e melhorar a plataforma. O lojista recebe os dados necessários do cliente apenas para cumprir o pedido realizado.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-3">3. Compartilhamento</h2>
          <p className="text-muted-foreground">Compartilhamos com a loja apenas os dados do cliente necessários para a entrega do pedido (nome, telefone, endereço e itens). Não vendemos nem cedemos seus dados a terceiros para fins de marketing.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-3">4. Seus direitos (LGPD)</h2>
          <p className="text-muted-foreground">Conforme a Lei Geral de Proteção de Dados, você pode solicitar acesso, correção, portabilidade ou exclusão dos seus dados a qualquer momento. Para isso, entre em contato com a administração da plataforma.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-3">5. Segurança</h2>
          <p className="text-muted-foreground">Adotamos medidas técnicas e organizacionais para proteger seus dados. Acesso a dados pessoais é restrito a quem precisa deles para operar a plataforma.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-3">6. Retenção</h2>
          <p className="text-muted-foreground">Mantemos seus dados pelo tempo necessário para cumprir as finalidades descritas e conforme obrigações legais. Você pode solicitar a exclusão da sua conta quando desejar.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-3">7. Alterações</h2>
          <p className="text-muted-foreground">Esta política pode ser atualizada periodicamente. Recomendamos revisá-la de tempos em tempos.</p>
        </section>
      </div>
    </div>
  );
}
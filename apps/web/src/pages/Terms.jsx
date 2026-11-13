import React from "react";

export default function Terms() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-16">
      <h1 className="font-display text-4xl mt-2 mb-8">Termos de uso</h1>
      <p className="text-sm text-muted-foreground mb-8">Última atualização: 13 de novembro de 2026 · versão 2026-11 (rascunho em revisão jurídica)</p>

      <div className="space-y-8 text-[15px] leading-relaxed">
        <section>
          <h2 className="font-display text-2xl mb-3">1. Sobre o VizinhoMarket</h2>
          <p className="text-muted-foreground">O <strong>VizinhoMarket</strong> é uma plataforma digital que conecta moradores a estabelecimentos comerciais e prestadores de serviço locais. Não somos parte das transações entre lojistas e consumidores: apenas disponibilizamos o ambiente de vitrine, catálogo e pedidos.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-3">2. Cadastro e contas</h2>
          <p className="text-muted-foreground">Para comprar, basta criar uma conta de cliente. Para vender, é necessário cadastrar a loja e aguardar a aprovação da administração. Você é responsável pela veracidade das informações fornecidas e pela segurança da sua senha.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-3">3. Comissão do lojista e do prestador</h2>
          <p className="text-muted-foreground">Não há mensalidade. O lojista paga comissão sobre os produtos de cada pedido entregue (descontos dados pela própria loja reduzem a base; cupons da plataforma não). Em pedidos pagos pelo app, a comissão é descontada do repasse; nos pagos na entrega ou direto à loja, entra na fatura do período. O prestador de serviço paga comissão sobre o valor da proposta aceita, quando o serviço é concluído. Faturas em atraso podem levar à suspensão.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-3">4. Pedidos e pagamentos</h2>
          <p className="text-muted-foreground">Os pedidos são enviados diretamente à loja, que é responsável por aceitar, preparar e entregar. O pagamento pode ser feito <strong>pelo app</strong> (Pix ou cartão, processado por um banco/gateway parceiro; o pedido só vai para a loja depois da confirmação do banco) ou <strong>na entrega/retirada</strong> (Pix direto à loja, cartão na maquininha ou dinheiro), quando a loja aceitar. Os valores são sempre calculados pela plataforma no momento do pedido. Cupons têm regras próprias (validade, pedido mínimo, limite de uso) informadas na campanha.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-3">5. Responsabilidades do lojista</h2>
          <p className="text-muted-foreground">O lojista se compromete a manter o catálogo atualizado, cumprir os horários informados, honrar os pedidos aceitos e respeitar as leis aplicáveis ao seu ramo. A plataforma pode suspender contas que descumpram estes termos.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-3">6. Responsabilidades do cliente</h2>
          <p className="text-muted-foreground">O cliente se compromete a fornecer dados de contato e endereço corretos e a receber o pedido nas condições combinadas. Em caso de problema com um pedido entregue, o cliente pode pedir reembolso pelo app em até 7 dias; a equipe analisa com a loja e responde com justificativa.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-3">7. Limitação de responsabilidade</h2>
          <p className="text-muted-foreground">A plataforma não se responsabiliza pela qualidade, disponibilidade, preço ou entrega dos produtos e serviços anunciados, sendo essas obrigações exclusivas das lojas. Em caso de divergência, o cliente deve buscar a loja diretamente.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-3">8. Alterações</h2>
          <p className="text-muted-foreground">Podemos atualizar estes termos a qualquer momento. O uso continuado da plataforma após a atualização implica aceitação dos novos termos.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-3">8.1 Entregas pela plataforma e serviços</h2>
          <p className="text-muted-foreground">Quando a entrega é feita por entregador parceiro da plataforma, ele só conclui com o código de 4 números mostrado ao cliente; pedidos com bebida alcoólica exigem documento de quem recebe. Serviços profissionais são contratados por orçamento: o prestador responde com o valor, o cliente decide, e o pagamento é combinado diretamente com o prestador.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-3">9. Cancelamentos</h2>
          <p className="text-muted-foreground">O cliente pode cancelar um pedido enquanto ele não tiver sido aceito pela loja. Se o pedido foi pago pelo app e for cancelado (pelo cliente, pela loja, pela plataforma ou por falta de resposta da loja), o valor é devolvido automaticamente para a mesma forma de pagamento. Após o aceite, o cancelamento deve ser tratado diretamente com a loja, que decidirá conforme a etapa de preparo; em caso de não retirada ou não comparecimento, a loja pode aplicar as condições que informar em seu estabelecimento. O lojista pode sair da plataforma a qualquer momento, pagando as comissões dos pedidos já concluídos. A plataforma pode suspender ou encerrar contas em caso de descumprimento destes termos, fraude ou faturas em atraso.</p>
        </section>
      </div>
    </div>
  );
}
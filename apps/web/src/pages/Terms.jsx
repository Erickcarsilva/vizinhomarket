import React from "react";

export default function Terms() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-16">
      <h1 className="font-display text-4xl mt-2 mb-8">Termos de uso</h1>
      <p className="text-sm text-muted-foreground mb-8">Última atualização: 26 de setembro de 2026</p>

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
          <h2 className="font-display text-2xl mb-3">3. Mensalidade do lojista</h2>
          <p className="text-muted-foreground">O lojista paga uma comissão sobre o valor dos produtos de cada pedido concluído pela plataforma, sem mensalidade. A comissão é informada no cadastro e faturada por período; faturas em atraso podem levar à suspensão da loja na vitrine.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-3">4. Pedidos e pagamentos</h2>
          <p className="text-muted-foreground">Os pedidos são enviados diretamente à loja, que é responsável por aceitar, preparar e entregar. Pagamentos são combinados diretamente entre cliente e loja (Pix, cartão na maquininha ou dinheiro na entrega/retirada). A plataforma não processa pagamentos online entre cliente e loja.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-3">5. Responsabilidades do lojista</h2>
          <p className="text-muted-foreground">O lojista se compromete a manter o catálogo atualizado, cumprir os horários informados, honrar os pedidos aceitos e respeitar as leis aplicáveis ao seu ramo. A plataforma pode suspender contas que descumpram estes termos.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-3">6. Responsabilidades do cliente</h2>
          <p className="text-muted-foreground">O cliente se compromete a fornecer dados de contato e endereço corretos e a receber o pedido nas condições combinadas. Cancelamentos e problemas com produtos devem ser tratados diretamente com a loja.</p>
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
          <h2 className="font-display text-2xl mb-3">9. Cancelamentos</h2>
          <p className="text-muted-foreground">O cliente pode cancelar um pedido enquanto ele não tiver sido aceito pela loja. Após o aceite, o cancelamento deve ser tratado diretamente com a loja, que decidirá conforme a etapa de preparo; em caso de não retirada ou não comparecimento, a loja pode aplicar as condições que informar em seu estabelecimento. O lojista pode sair da plataforma a qualquer momento, pagando as comissões dos pedidos já concluídos. A plataforma pode suspender ou encerrar contas em caso de descumprimento destes termos, fraude ou faturas em atraso.</p>
        </section>
      </div>
    </div>
  );
}
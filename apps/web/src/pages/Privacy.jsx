import React from "react";

// RASCUNHO para revisão jurídica. Descreve o que a plataforma faz de fato (ver docs/SEGURANCA_LGPD.md).
const S = ({ n, t, children }) => (
  <section>
    <h2 className="font-display text-2xl mb-3">{n}. {t}</h2>
    <div className="text-muted-foreground space-y-2">{children}</div>
  </section>
);

export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-16">
      <h1 className="font-display text-4xl mt-2 mb-8">Política de privacidade</h1>
      <p className="text-sm text-muted-foreground mb-8">Última atualização: 13 de novembro de 2026 · versão 2026-11 (rascunho em revisão jurídica)</p>

      <div className="space-y-8 text-[15px] leading-relaxed">
        <S n="1" t="Dados que coletamos">
          <p><strong>Clientes:</strong> nome, e-mail, telefone, endereços de entrega, pedidos, avaliações, atendimentos e favoritos. Para itens +18, guardamos apenas que você declarou ter 18 anos ou mais e quando (a data de nascimento não é guardada). Se você pagar pelo app e o banco exigir, guardamos o seu CPF na sua conta.</p>
          <p><strong>Lojistas e prestadores:</strong> dados da loja, CPF/CNPJ, responsável, contato e chave Pix — nunca exibidos ao público.</p>
          <p><strong>Entregadores:</strong> CPF, veículo e placa; a <strong>localização só é coletada com o app aberto e online</strong>. As posições de cada entrega ficam guardadas por até 30 dias. Ao ficar offline, a última posição é apagada.</p>
          <p><strong>Pagamentos pelo app:</strong> os dados do cartão são digitados no ambiente do banco/gateway e <strong>não passam nem ficam no VizinhoMarket</strong>. Guardamos só o resultado (pago, recusado, estornado) e o identificador do pagamento.</p>
        </S>
        <S n="2" t="Para que usamos">
          <p>Processar pedidos, pagamentos, entregas e orçamentos; avisar sobre o andamento (inclusive notificações no celular, se você ativar); prevenir fraudes; atender reclamações e reembolsos; cumprir obrigações legais e contábeis; melhorar a plataforma.</p>
        </S>
        <S n="3" t="Com quem compartilhamos">
          <p><strong>Loja:</strong> nome, telefone, endereço e itens do pedido. <strong>Entregador:</strong> o endereço e o telefone só aparecem depois que ele aceita a corrida. <strong>Prestador de serviço:</strong> telefone e endereço só depois que você aceita a proposta. <strong>Cliente:</strong> vê só o primeiro nome do entregador e a posição dele enquanto o pedido está a caminho.</p>
          <p><strong>Banco/gateway de pagamento:</strong> nome, e-mail, CPF (quando exigido) e valor, para processar o pagamento. Infraestrutura (hospedagem e banco de dados) em provedores contratados. Não vendemos dados.</p>
        </S>
        <S n="4" t="Seus direitos (LGPD)">
          <p>Você pode, pelo próprio app: <strong>baixar uma cópia dos seus dados</strong> (Perfil → Baixar meus dados) e <strong>excluir sua conta</strong> (Perfil → Excluir minha conta). Para correção, informação sobre compartilhamento ou revogação de consentimento, use Ajuda → Fale com a equipe.</p>
        </S>
        <S n="5" t="Segurança">
          <p>Acesso aos dados controlado no servidor por pessoa e por loja, registros de auditoria das ações administrativas, histórico financeiro que não pode ser alterado e cópias de segurança diárias.</p>
        </S>
        <S n="6" t="Por quanto tempo guardamos">
          <p>Conta: enquanto estiver ativa. Pedidos e registros financeiros: pelo prazo legal (são anonimizados se você excluir a conta). Posições de entrega: 30 dias. Registros de erro do app: 30 dias. Avisos enviados: 7 dias.</p>
        </S>
        <S n="7" t="Alterações e contato">
          <p>Avisaremos no app quando esta política mudar. Encarregado de dados (DPO): a definir antes do lançamento.</p>
        </S>
      </div>
    </div>
  );
}

import React from "react";

// Borda de toldo (ondulada) — assinatura da marca. Fica na base de faixas coloridas: topo da página inicial,
// cabeçalho da loja, faixa do app do entregador. color: cor do toldo (normalmente a mesma da faixa acima).
export default function Toldo({ color = "hsl(var(--marca))", className = "" }) {
  return <div aria-hidden="true" className={`toldo-borda ${className}`} style={{ "--toldo-cor": color }} />;
}

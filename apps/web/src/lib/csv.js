// Exportação para planilha (CSV com ";" e vírgula decimal, que o Excel em português abre direto).
const cell = (v) => {
  if (v == null) return "";
  const s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function downloadCsv(filename, columns, rows) {
  const lines = [columns.map(([, label]) => cell(label)).join(";"), ...rows.map((r) => columns.map(([key]) => cell(typeof key === "function" ? key(r) : r[key])).join(";"))];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Busca todas as páginas de uma lista paginada ({ rows, hasMore }) antes de exportar (até 100 páginas).
export async function allPages(fetchPage) {
  const out = [];
  for (let page = 0; page < 100; page++) {
    const r = await fetchPage(page);
    out.push(...r.rows);
    if (!r.hasMore) break;
  }
  return out;
}
const dt = (d) => (d ? new Date(d).toLocaleString("pt-BR") : "");
export const ORDER_COLUMNS = [
  ["code", "Pedido"], [(o) => dt(o.created_date), "Feito em"], [(o) => dt(o.delivered_at), "Entregue em"], ["status", "Situação"],
  ["store_name", "Loja"], ["customer_name", "Cliente"], ["fulfillment", "Entrega"], ["payment_method", "Pagamento"], ["payment_mode", "Modo"],
  ["payment_status", "Situação do pagamento"], ["subtotal", "Subtotal"], ["delivery_fee", "Taxa de entrega"], ["discount", "Desconto"],
  ["total", "Total"], ["commission_amount", "Comissão"], ["refunded_amount", "Estornado"],
];

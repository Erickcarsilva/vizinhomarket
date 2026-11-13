import React, { useEffect, useState } from "react";
import { Copy, Check, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { brl } from "@/lib/constants";

const left = (iso) => {
  const ms = Date.parse(iso) - Date.now();
  if (!iso || Number.isNaN(ms)) return null;
  if (ms <= 0) return "vencido";
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
};

// Pagamento pelo app: gera (ou reaproveita) a cobrança no servidor. A confirmação chega pelo banco (tempo real);
// "Já paguei" só atualiza a tela — nunca marca o pagamento.
export default function OnlinePayment({ order, onRefresh, autoStart }) {
  const [charge, setCharge] = useState(null);
  const [state, setState] = useState({ busy: false, error: "" });
  const [copied, setCopied] = useState(false);
  const [, tick] = useState(0);

  const start = async () => {
    setState({ busy: true, error: "" });
    try { setCharge(await base44.entities.Order.startPayment(order.id)); setState({ busy: false, error: "" }); }
    catch (e) { setState({ busy: false, error: e.message }); }
  };
  useEffect(() => { if (autoStart || order.payment_status === "awaiting_payment") start(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [order.id]);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);

  const copy = async () => { try { await navigator.clipboard.writeText(charge.pix_copy_paste); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* sem acesso */ } };
  const remaining = left(charge?.expires_at);

  return (
    <div className="rounded-lg border-2 border-marca bg-card p-4 space-y-3" data-pagamento-online>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-semibold">{order.payment_status === "failed" ? "Pagamento não aprovado" : "Pague para a loja receber o pedido"}</p>
        <p className="font-bold">{brl(order.total)}</p>
      </div>
      {charge?.sandbox && <p className="text-[13px] font-semibold text-[#C2331A]">Ambiente de teste: este Pix é simulado e não cobra nada.</p>}
      {state.busy && !charge && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Gerando pagamento…</p>}
      {state.error && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">{state.error}</p>
          <button type="button" onClick={start} className="btn-contorno h-10"><RefreshCw className="w-4 h-4" aria-hidden="true" />Tentar de novo</button>
        </div>
      )}
      {charge?.pix_qr_base64 && <img src={`data:image/png;base64,${charge.pix_qr_base64}`} alt="QR Code do Pix" className="w-48 h-48 mx-auto rounded-lg border border-border bg-white p-2" />}
      {charge?.pix_copy_paste && (
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">Pix copia e cola</p>
          <div className="flex items-center gap-2 rounded-lg bg-background border border-border pl-3 pr-1 py-1">
            <p className="font-mono text-[13px] break-all flex-1 line-clamp-2">{charge.pix_copy_paste}</p>
            <button type="button" onClick={copy} className="h-10 px-3 rounded-md border border-marca text-marca text-sm font-semibold flex items-center gap-1.5 shrink-0">
              {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}{copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      )}
      {charge?.checkout_url && !charge.checkout_url.startsWith("sandbox://") && (
        <a href={charge.checkout_url} target="_blank" rel="noreferrer" className="btn-acao w-full h-12"><ExternalLink className="w-4 h-4" aria-hidden="true" />Pagar com cartão</a>
      )}
      {charge && remaining && <p className="text-[13px] text-muted-foreground">{remaining === "vencido" ? "O prazo para pagar acabou." : `Pague em até ${remaining}. Depois disso o pedido é cancelado sem cobrança.`}</p>}
      {charge && (
        <button type="button" onClick={onRefresh} className="btn-contorno h-11 w-full">Já paguei — atualizar</button>
      )}
      <p className="text-[12px] text-muted-foreground">A confirmação vem do banco e aparece aqui sozinha. Não envie comprovante: não é preciso.</p>
    </div>
  );
}

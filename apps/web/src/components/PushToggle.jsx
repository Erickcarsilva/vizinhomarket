import React, { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { pushStatus, enablePush, disablePush } from "@/lib/push";

const TEXT = {
  "ios-home": "No iPhone, adicione o app à Tela de Início (Compartilhar → Adicionar) para receber avisos.",
  unsupported: "Este navegador não recebe avisos.",
  "not-configured": null, // avisos ainda não configurados no servidor: não mostra nada
  denied: "Os avisos estão bloqueados nas configurações do navegador.",
};

// Liga/desliga os avisos neste aparelho (cliente: andamento do pedido; entregador: corridas novas).
export default function PushToggle({ title = "Avisos no celular", description, compact = false }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushStatus().then(setSt).catch(() => setSt("unsupported")); }, []);
  if (!st || st === "not-configured") return null;
  const toggle = async () => {
    setBusy(true);
    try { setSt(st === "on" ? await disablePush() : await enablePush()); } catch { setSt(await pushStatus().catch(() => "unsupported")); } finally { setBusy(false); }
  };
  const canToggle = st === "on" || st === "off";
  return (
    <div className={`rounded-2xl border border-border bg-card ${compact ? "p-3" : "p-4"} flex items-center gap-3`} data-push={st}>
      {st === "on" ? <Bell className="w-5 h-5 shrink-0" aria-hidden="true" /> : <BellOff className="w-5 h-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
      <div className="flex-1 min-w-0 text-sm">
        <p className="font-semibold">{title}</p>
        <p className="text-muted-foreground">{TEXT[st] || (st === "on" ? "Ativados neste aparelho." : description)}</p>
      </div>
      {canToggle && (
        <button type="button" onClick={toggle} disabled={busy} className="h-10 px-4 rounded-full border border-border text-sm font-semibold flex items-center gap-1.5 shrink-0 disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}{st === "on" ? "Desligar" : "Ativar"}
        </button>
      )}
    </div>
  );
}

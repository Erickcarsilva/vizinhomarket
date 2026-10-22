import React, { useEffect, useState } from "react";
import { Bell, Volume2, Smartphone, Loader2 } from "lucide-react";
import { pushStatus, enablePush, disablePush } from "@/lib/push";
import { Switch } from "@/components/ui/switch";

const KEY_SOUND = "perto_notify_sound";
const KEY_VISUAL = "perto_notify_visual";

function Row({ icon: Icon, title, desc, checked, onChange }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
      <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

const PUSH_TEXT = {
  on: "Ligado neste aparelho. Chega aviso de pedido novo mesmo com o painel fechado.",
  off: "Desligado neste aparelho.",
  denied: "O navegador bloqueou as notificações deste site. Libere nas configurações do navegador (cadeado ao lado do endereço) e tente de novo.",
  "ios-home": "No iPhone: toque em Compartilhar → Adicionar à Tela de Início, abra o painel pelo ícone e volte aqui.",
  unsupported: "Este navegador não recebe avisos com o painel fechado. Use o Chrome no Android ou no computador.",
  "not-configured": "O aviso com o painel fechado ainda não foi ligado na plataforma.",
};

function PushCard() {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { pushStatus().then(setSt).catch(() => setSt("unsupported")); }, []);
  const act = async (fn) => {
    setBusy(true); setErr("");
    try { setSt(await fn()); } catch (e) { setErr(e?.message || "Não foi possível."); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3" data-push={st || ""}>
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Smartphone className="w-5 h-5" /></div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold">Aviso com o painel fechado</p>
          <p className="text-sm text-muted-foreground">{st ? PUSH_TEXT[st] : "Verificando…"}</p>
        </div>
        {(st === "off" || st === "on") && (
          <button type="button" disabled={busy} onClick={() => act(st === "on" ? disablePush : enablePush)}
            className={`h-10 px-4 rounded-full text-sm font-semibold flex items-center gap-2 disabled:opacity-50 ${st === "on" ? "border border-border" : "bg-primary text-primary-foreground"}`}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}{st === "on" ? "Desligar" : "Ligar"}
          </button>
        )}
      </div>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <p className="text-xs text-muted-foreground">Ligue em cada celular ou computador que deve receber o aviso. Mesmo assim, deixe o painel aberto no balcão: o alarme com som só toca com ele aberto.</p>
    </div>
  );
}

export default function Notificacoes() {
  const [sound, setSound] = useState(() => localStorage.getItem(KEY_SOUND) !== "off");
  const [visual, setVisual] = useState(() => localStorage.getItem(KEY_VISUAL) !== "off");
  const toggleSound = (v) => { setSound(v); localStorage.setItem(KEY_SOUND, v ? "on" : "off"); };
  const toggleVisual = (v) => { setVisual(v); localStorage.setItem(KEY_VISUAL, v ? "on" : "off"); };

  return (
    <div className="max-w-2xl mx-auto px-5 py-12 space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Notificações</p>
        <h1 className="font-display text-4xl mt-2">Alertas de novos pedidos</h1>
        <p className="text-muted-foreground mt-3">Escolha como você quer ser avisado quando chegar um pedido novo na sua loja.</p>
      </div>
      <div className="space-y-4">
        <Row icon={Volume2} title="Alerta sonoro" desc="Toca um som quando chega um novo pedido." checked={sound} onChange={toggleSound} />
        <Row icon={Bell} title="Notificação visual" desc="Exibe um aviso na tela para novos pedidos." checked={visual} onChange={toggleVisual} />
        <PushCard />
      </div>
      <p className="text-sm text-muted-foreground">Estas preferências valem neste navegador/dispositivo.</p>
    </div>
  );
}
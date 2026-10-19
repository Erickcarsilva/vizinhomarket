import React, { useState } from "react";
import { Bell, Volume2 } from "lucide-react";
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
      </div>
      <p className="text-sm text-muted-foreground">Estas preferências valem neste navegador/dispositivo.</p>
    </div>
  );
}
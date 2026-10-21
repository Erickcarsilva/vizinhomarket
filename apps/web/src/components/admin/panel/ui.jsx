import React, { useState } from "react";
import { Loader2 } from "lucide-react";

export const Card = ({ className = "", children }) => <div className={`rounded-2xl border border-border bg-card ${className}`}>{children}</div>;
export const Empty = ({ children }) => <Card className="py-10 px-6 text-center text-muted-foreground text-sm">{children}</Card>;
export const Chip = ({ tone = "default", children }) => {
  const tones = {
    default: "bg-secondary text-foreground", ok: "bg-emerald-100 text-emerald-800", warn: "bg-amber-100 text-amber-800",
    bad: "bg-red-100 text-red-700", info: "bg-sky-100 text-sky-800",
  };
  return <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${tones[tone]}`}>{children}</span>;
};
export const Btn = ({ variant = "outline", busy, className = "", children, ...props }) => {
  const v = {
    outline: "border border-border hover:bg-secondary",
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    danger: "border border-destructive/40 text-destructive hover:bg-destructive/5",
  };
  return (
    <button type="button" disabled={busy || props.disabled} className={`h-9 px-4 rounded-full text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-40 ${v[variant]} ${className}`} {...props}>
      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{children}
    </button>
  );
};
export const Seg = ({ options, value, onChange }) => (
  <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
    {options.map(([k, label]) => (
      <button key={k} type="button" onClick={() => onChange(k)}
        className={`h-9 px-4 rounded-full text-sm whitespace-nowrap border transition ${value === k ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card hover:bg-secondary"}`}>{label}</button>
    ))}
  </div>
);

// Executa uma ação do admin com aviso de erro e "carregando" por item.
export function useAction(onDone) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const run = async (key, fn, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key); setError("");
    try { await fn(); onDone && (await onDone()); }
    catch (e) { setError(e.message || "Não foi possível concluir."); }
    finally { setBusy(null); }
  };
  return { busy, error, run, setError };
}
export const ErrorLine = ({ error }) => error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null;

export const fmtDate = (d) => d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
export const pct = (r) => r == null ? "—" : `${(r * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
export const waLink = (phone, text) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  const full = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
};

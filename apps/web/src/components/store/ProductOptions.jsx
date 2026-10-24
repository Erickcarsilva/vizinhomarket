import React, { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Check } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { brl } from "@/lib/constants";

export const hasOptions = (p) => (p?.variants || []).some((v) => v.available) || (p?.addon_groups || []).some((g) => g.addons.some((a) => a.available));
export const startingPrice = (p) => {
  const prices = (p?.variants || []).filter((v) => v.available).map((v) => v.price);
  return prices.length ? Math.min(...prices) : p.price;
};

// Escolha de tamanho e adicionais antes de colocar no carrinho.
// As mesmas regras (mínimo/máximo por grupo) são conferidas de novo no servidor.
export default function ProductOptions({ product, open, onOpenChange, onConfirm }) {
  const variants = useMemo(() => (product?.variants || []).filter((v) => v.available), [product]);
  const groups = useMemo(() => (product?.addon_groups || []).map((g) => ({ ...g, addons: g.addons.filter((a) => a.available) })).filter((g) => g.addons.length), [product]);
  const [variantId, setVariantId] = useState(null);
  const [chosen, setChosen] = useState({});
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (open) { setVariantId(variants[0]?.id || null); setChosen({}); setQty(1); }
  }, [open, variants]);

  if (!product) return null;
  const variant = variants.find((v) => v.id === variantId) || null;
  const picked = groups.flatMap((g) => g.addons.filter((a) => (chosen[g.id] || []).includes(a.id)));
  const unit = (variant ? variant.price : product.price) + picked.reduce((s, a) => s + a.price, 0);
  const missing = groups.find((g) => (chosen[g.id] || []).length < g.min);
  const needsVariant = variants.length > 0 && !variant;

  const toggle = (g, a) => setChosen((c) => {
    const cur = c[g.id] || [];
    if (cur.includes(a.id)) return { ...c, [g.id]: cur.filter((x) => x !== a.id) };
    if (g.max === 1) return { ...c, [g.id]: [a.id] };
    if (cur.length >= g.max) return c;
    return { ...c, [g.id]: [...cur, a.id] };
  });

  const rule = (g) => g.min > 0 ? (g.min === g.max ? `Escolha ${g.min}` : `Escolha de ${g.min} a ${g.max}`) : g.max === 1 ? "Opcional · até 1" : `Opcional · até ${g.max}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-2xl p-0 bg-background">
        <div className="px-5 pt-6 pb-4 border-b border-border">
          <SheetTitle className="font-display text-2xl text-marca">{product.name}</SheetTitle>
          {product.description ? <SheetDescription className="mt-1">{product.description}</SheetDescription> : <SheetDescription className="sr-only">Escolha as opções</SheetDescription>}
        </div>

        <div className="px-5 py-4 space-y-6">
          {variants.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="font-semibold">Tamanho</h3>
                <span className="text-xs font-semibold text-accent">Obrigatório</span>
              </div>
              <div className="space-y-2">
                {variants.map((v) => (
                  <button type="button" key={v.id} onClick={() => setVariantId(v.id)}
                    className={`w-full min-h-[48px] px-4 rounded-xl border flex items-center justify-between text-left transition ${variantId === v.id ? "border-marca bg-card ring-1 ring-marca" : "border-border bg-card"}`} aria-pressed={variantId === v.id}>
                    <span className="flex items-center gap-3">
                      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${variantId === v.id ? "border-marca" : "border-input"}`}>
                        {variantId === v.id && <span className="w-2.5 h-2.5 rounded-full bg-marca" />}
                      </span>
                      {v.name}
                    </span>
                    <span className="font-semibold">{brl(v.price)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {groups.map((g) => (
            <section key={g.id}>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="font-semibold">{g.name}</h3>
                <span className={`text-xs font-semibold ${g.min > 0 ? "text-accent" : "text-muted-foreground"}`}>{rule(g)}</span>
              </div>
              <div className="space-y-2">
                {g.addons.map((a) => {
                  const on = (chosen[g.id] || []).includes(a.id);
                  const full = !on && g.max > 1 && (chosen[g.id] || []).length >= g.max;
                  return (
                    <button type="button" key={a.id} onClick={() => toggle(g, a)} disabled={full}
                      className={`w-full min-h-[48px] px-4 rounded-xl border flex items-center justify-between text-left transition disabled:opacity-60 ${on ? "border-marca bg-card ring-1 ring-marca" : "border-border bg-card"}`} aria-pressed={on}>
                      <span className="flex items-center gap-3">
                        <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${on ? "border-marca bg-marca text-white" : "border-input"}`}>
                          {on && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                        </span>
                        {a.name}
                      </span>
                      <span className="text-sm text-muted-foreground">{a.price ? `+ ${brl(a.price)}` : "grátis"}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="sticky bottom-0 bg-background border-t border-border px-5 py-4 flex items-center gap-3">
          <div className="flex items-center gap-2 bg-secondary rounded-full p-1">
            <button type="button" aria-label="Diminuir" onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-9 h-9 rounded-full hover:bg-background flex items-center justify-center"><Minus className="w-4 h-4" aria-hidden="true" /></button>
            <span className="w-6 text-center font-semibold" aria-live="polite"><span className="sr-only">Quantidade </span>{qty}</span>
            <button type="button" aria-label="Aumentar" onClick={() => setQty((q) => q + 1)} className="w-9 h-9 rounded-full hover:bg-background flex items-center justify-center"><Plus className="w-4 h-4" aria-hidden="true" /></button>
          </div>
          <button type="button" disabled={needsVariant || !!missing}
            onClick={() => { onConfirm({ variant, addons: picked, quantity: qty }); onOpenChange(false); }}
            className="flex-1 h-12 rounded-lg bg-primary text-primary-foreground font-semibold flex items-center justify-between px-5 hover:bg-[#8F4527] transition-colors disabled:bg-secondary disabled:text-muted-foreground">
            <span>{missing ? `Escolha: ${missing.name}` : "Adicionar"}</span>
            <span>{brl(unit * qty)}</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

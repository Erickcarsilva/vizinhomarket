import React, { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const blank = { name: "", description: "", price: "", category: "", image_url: "", age_restricted: false, variants: [], addon_groups: [] };
const clone = (p) => p ? {
  ...p, price: p.price ?? "", age_restricted: !!p.age_restricted,
  variants: (p.variants || []).map((v) => ({ ...v })),
  addon_groups: (p.addon_groups || []).map((g) => ({ ...g, addons: g.addons.map((a) => ({ ...a })) })),
} : { ...blank };

const Small = ({ children }) => <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-semibold">{children}</p>;
const IconBtn = ({ onClick, label }) => (
  <button type="button" onClick={onClick} aria-label={label} className="w-9 h-9 shrink-0 rounded-full hover:bg-secondary text-muted-foreground hover:text-destructive flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
);
const AddBtn = ({ onClick, children }) => (
  <button type="button" onClick={onClick} className="h-9 px-3 rounded-full border border-dashed border-border text-sm flex items-center gap-1 hover:bg-secondary"><Plus className="w-4 h-4" />{children}</button>
);

export default function ProductForm({ storeId, product, open, onClose, onSaved }) {
  const [form, setForm] = useState(() => clone(product));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setForm(clone(product)); setError(""); } }, [open, product]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // tamanhos
  const setVariant = (i, k, v) => setForm((f) => ({ ...f, variants: f.variants.map((x, n) => (n === i ? { ...x, [k]: v } : x)) }));
  const addVariant = () => setForm((f) => ({ ...f, variants: [...f.variants, { name: "", price: "" }] }));
  const delVariant = (i) => setForm((f) => ({ ...f, variants: f.variants.filter((_, n) => n !== i) }));
  // grupos de adicionais
  const setGroup = (i, k, v) => setForm((f) => ({ ...f, addon_groups: f.addon_groups.map((g, n) => (n === i ? { ...g, [k]: v } : g)) }));
  const addGroup = () => setForm((f) => ({ ...f, addon_groups: [...f.addon_groups, { name: "Adicionais", min: 0, max: 3, addons: [{ name: "", price: "" }] }] }));
  const delGroup = (i) => setForm((f) => ({ ...f, addon_groups: f.addon_groups.filter((_, n) => n !== i) }));
  const setAddon = (gi, ai, k, v) => setForm((f) => ({ ...f, addon_groups: f.addon_groups.map((g, n) => (n === gi ? { ...g, addons: g.addons.map((a, m) => (m === ai ? { ...a, [k]: v } : a)) } : g)) }));
  const addAddon = (gi) => setForm((f) => ({ ...f, addon_groups: f.addon_groups.map((g, n) => (n === gi ? { ...g, addons: [...g.addons, { name: "", price: "" }] } : g)) }));
  const delAddon = (gi, ai) => setForm((f) => ({ ...f, addon_groups: f.addon_groups.map((g, n) => (n === gi ? { ...g, addons: g.addons.filter((_, m) => m !== ai) } : g)) }));

  const sizes = form.variants.filter((v) => String(v.name).trim());
  const hasSizes = sizes.length > 0;

  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true); setError("");
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      setForm((f) => ({ ...f, image_url: file_url }));
    } catch (err) { setError(err.message || "Não foi possível enviar a foto."); }
    finally { setBusy(false); }
  };

  const save = async (e) => {
    e.preventDefault();
    if (sizes.some((v) => v.price === "" || Number(v.price) < 0)) { setError("Informe o preço de cada tamanho."); return; }
    if (!hasSizes && (form.price === "" || Number(form.price) < 0)) { setError("Informe o preço."); return; }
    setBusy(true); setError("");
    try {
      // Com tamanhos, o preço do produto vira o menor tamanho (usado no "a partir de").
      const price = hasSizes ? Math.min(...sizes.map((v) => Number(v.price))) : Number(form.price);
      const data = { name: form.name, description: form.description, price, category: form.category, image_url: form.image_url, age_restricted: !!form.age_restricted, variants: form.variants, addon_groups: form.addon_groups };
      if (product) await base44.entities.Product.update(product.id, data);
      else await base44.entities.Product.create({ ...data, store_id: storeId, available: true });
      onSaved();
    } catch (err) {
      setError(err.message || "Não foi possível salvar o produto.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">{product ? "Editar produto" : "Novo produto"}</DialogTitle>
          <DialogDescription className="sr-only">Dados, tamanhos e adicionais do produto</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <Input required placeholder="Nome" value={form.name} onChange={set("name")} />
          <Textarea placeholder="Descrição" value={form.description} onChange={set("description")} />
          <div className="grid grid-cols-2 gap-3">
            <Input type="number" step="0.01" min="0" placeholder={hasSizes ? "Preço pelos tamanhos" : "Preço (R$)"} value={hasSizes ? "" : form.price} onChange={set("price")} disabled={hasSizes} />
            <Input placeholder="Seção (ex: Lanches)" value={form.category} onChange={set("category")} />
          </div>
          <label className="block text-sm text-muted-foreground">
            Foto {form.image_url && "✓"}
            <input type="file" accept="image/*" onChange={upload} className="block mt-1 text-sm" />
          </label>

          <label className="flex gap-2 items-start text-sm">
            <input type="checkbox" data-mais18 checked={!!form.age_restricted} onChange={(e) => setForm((f) => ({ ...f, age_restricted: e.target.checked }))} className="mt-1" />
            <span>Só para maiores de 18 anos (bebida alcoólica, cigarro e similares). O cliente confirma a idade e a entrega exige conferir um documento.</span>
          </label>

          <div className="space-y-2 pt-2 border-t border-border">
            <Small>Tamanhos (opcional)</Small>
            <p className="text-xs text-muted-foreground">Ex.: Marmita P, M e G, cada uma com seu preço. O cliente escolhe um.</p>
            {form.variants.map((v, i) => (
              <div key={v.id || `n${i}`} className="flex gap-2">
                <Input placeholder="Tamanho (ex: Grande)" value={v.name} onChange={(e) => setVariant(i, "name", e.target.value)} />
                <Input type="number" step="0.01" min="0" placeholder="R$" value={v.price} onChange={(e) => setVariant(i, "price", e.target.value)} className="w-28" />
                <IconBtn onClick={() => delVariant(i)} label="Remover tamanho" />
              </div>
            ))}
            <AddBtn onClick={addVariant}>Adicionar tamanho</AddBtn>
          </div>

          <div className="space-y-3 pt-2 border-t border-border">
            <Small>Adicionais e escolhas (opcional)</Small>
            <p className="text-xs text-muted-foreground">Ex.: "Adicionais" (bacon, ovo), "Escolha a carne" (obrigatório, 1 opção).</p>
            {form.addon_groups.map((g, gi) => (
              <div key={g.id || `g${gi}`} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex gap-2">
                  <Input placeholder="Nome do grupo" value={g.name} onChange={(e) => setGroup(gi, "name", e.target.value)} />
                  <IconBtn onClick={() => delGroup(gi)} label="Remover grupo" />
                </div>
                <div className="flex gap-3 text-sm items-center">
                  <label className="flex items-center gap-2">Mínimo <Input type="number" min="0" value={g.min} onChange={(e) => setGroup(gi, "min", e.target.value)} className="w-16 h-9" /></label>
                  <label className="flex items-center gap-2">Máximo <Input type="number" min="1" value={g.max} onChange={(e) => setGroup(gi, "max", e.target.value)} className="w-16 h-9" /></label>
                </div>
                <p className="text-xs text-muted-foreground">Mínimo 0 = opcional. Mínimo 1 = o cliente é obrigado a escolher.</p>
                {g.addons.map((a, ai) => (
                  <div key={a.id || `a${ai}`} className="flex gap-2">
                    <Input placeholder="Opção (ex: Bacon)" value={a.name} onChange={(e) => setAddon(gi, ai, "name", e.target.value)} />
                    <Input type="number" step="0.01" min="0" placeholder="+R$" value={a.price} onChange={(e) => setAddon(gi, ai, "price", e.target.value)} className="w-24" />
                    <IconBtn onClick={() => delAddon(gi, ai)} label="Remover opção" />
                  </div>
                ))}
                <AddBtn onClick={() => addAddon(gi)}>Adicionar opção</AddBtn>
              </div>
            ))}
            <AddBtn onClick={addGroup}>Adicionar grupo</AddBtn>
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <button type="submit" disabled={busy} className="w-full h-11 rounded-full bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

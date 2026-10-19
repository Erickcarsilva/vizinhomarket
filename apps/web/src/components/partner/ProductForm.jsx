import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function ProductForm({ storeId, product, open, onClose, onSaved }) {
  const [form, setForm] = useState(product || { name: "", description: "", price: "", category: "", image_url: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
    setForm((f) => ({ ...f, image_url: file_url }));
    setBusy(false);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const data = { name: form.name, description: form.description, price: Number(form.price), category: form.category, image_url: form.image_url };
    if (product) await base44.entities.Product.update(product.id, data);
    else await base44.entities.Product.create({ ...data, store_id: storeId, available: true });
    setBusy(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="rounded-2xl">
        <DialogHeader><DialogTitle className="font-display text-2xl font-normal">{product ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <Input required placeholder="Nome" value={form.name} onChange={set("name")} />
          <Textarea placeholder="Descrição" value={form.description} onChange={set("description")} />
          <div className="grid grid-cols-2 gap-3">
            <Input required type="number" step="0.01" min="0" placeholder="Preço (R$)" value={form.price} onChange={set("price")} />
            <Input placeholder="Seção (ex: Lanches)" value={form.category} onChange={set("category")} />
          </div>
          <label className="block text-sm text-muted-foreground">
            Foto {form.image_url && "✓"}
            <input type="file" accept="image/*" onChange={upload} className="block mt-1 text-sm" />
          </label>
          <button disabled={busy} className="w-full h-11 rounded-full bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Switch } from "@/components/ui/switch";
import { brl } from "@/lib/constants";
import ProductForm from "@/components/partner/ProductForm";

export default function ProductsManager({ storeId }) {
  const [editing, setEditing] = useState(null);
  const { data: products = [], refetch } = useQuery({
    queryKey: ["partner-products", storeId],
    queryFn: () => base44.entities.Product.filter({ store_id: storeId }, "category", 500),
  });

  const toggle = async (p) => { await base44.entities.Product.update(p.id, { available: !p.available }); refetch(); };
  const remove = async (p) => { if (window.confirm(`Excluir ${p.name}?`)) { await base44.entities.Product.delete(p.id); refetch(); } };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-muted-foreground">{products.length} produtos</p>
        <button onClick={() => setEditing({})} className="h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-2"><Plus className="w-4 h-4" />Novo produto</button>
      </div>
      <div className="bg-card border border-border rounded-2xl divide-y divide-border">
        {products.length === 0 && <p className="p-8 text-center text-muted-foreground text-sm">Cadastre seu primeiro produto.</p>}
        {products.map((p) => (
          <div key={p.id} className="flex items-center gap-4 p-4">
            <div className="flex-1 min-w-0">
              <p className={`font-medium truncate ${p.available ? "" : "text-muted-foreground line-through"}`}>{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.category || "Sem seção"} · {brl(p.price)}</p>
            </div>
            <Switch checked={p.available} onCheckedChange={() => toggle(p)} />
            <button onClick={() => setEditing(p)} className="p-2 rounded-full hover:bg-secondary"><Pencil className="w-4 h-4" /></button>
            <button onClick={() => remove(p)} className="p-2 rounded-full hover:bg-secondary text-destructive"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
      {editing && (
        <ProductForm key={editing.id || "new"} storeId={storeId} product={editing.id ? editing : null} open onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refetch(); }} />
      )}
    </div>
  );
}
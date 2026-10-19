import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Heart, ShoppingCart } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { getFavorites, toggleFavorite } from "@/lib/favorites";
import { brl } from "@/lib/constants";
import { Image } from "@/components/ui/image";

export default function Favoritos() {
  const [ids, setIds] = useState(() => getFavorites());
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true);
      const res = await Promise.all(ids.map((id) => base44.entities.Product.get(id).catch(() => null)));
      if (on) { setProducts(res.filter(Boolean)); setLoading(false); }
    })();
    return () => { on = false; };
  }, [ids.join()]);

  const remove = (id) => { toggleFavorite(id); setIds(getFavorites()); setProducts((p) => p.filter((x) => x.id !== id)); };

  return (
    <div className="max-w-3xl mx-auto px-5 py-12 space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Lista de desejos</p>
        <h1 className="font-display text-4xl mt-2">Favoritos</h1>
      </div>
      {loading ? (
        <div className="space-y-4">{[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />)}</div>
      ) : products.length === 0 ? (
        <div className="text-center py-16">
          <Heart className="w-10 h-10 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground mt-4">Você ainda não favoritou produtos.</p>
          <Link to="/vitrine" className="inline-flex items-center mt-6 h-11 px-6 rounded-full bg-primary text-primary-foreground font-semibold">Explorar lojas</Link>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {products.map((p) => (
            <div key={p.id} className="flex items-center gap-4 py-4">
              {p.image_url ? (
                <Image src={p.image_url} className="w-16 h-16 rounded-xl object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-secondary flex items-center justify-center font-display text-2xl text-primary/40">{(p.name || "?")[0]}</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{p.name}</p>
                <p className="font-display text-lg">{brl(p.price)}</p>
              </div>
              <Link to={`/loja/${p.store_id}`} className="h-9 px-4 rounded-full border border-border hover:bg-secondary text-sm font-medium flex items-center gap-1.5 whitespace-nowrap">
                <ShoppingCart className="w-4 h-4" />Ver na loja
              </Link>
              <button onClick={() => remove(p.id)} aria-label="Remover dos favoritos" className="p-2 rounded-full hover:bg-secondary text-destructive">
                <Heart className="w-5 h-5 fill-current" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
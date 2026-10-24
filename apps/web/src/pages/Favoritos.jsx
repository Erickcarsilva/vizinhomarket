import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { getFavorites, toggleFavorite, syncFavorites } from "@/lib/favorites";
import { brl } from "@/lib/constants";
import { Image } from "@/components/ui/image";

export default function Favoritos() {
  const [ids, setIds] = useState(() => getFavorites());
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  // Traz os favoritos salvos na conta (de outro aparelho, por exemplo).
  useEffect(() => { syncFavorites().then((list) => setIds(list)).catch(() => {}); }, []);

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
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 pb-10 space-y-3">
      <h1 className="font-display text-2xl text-marca">Favoritos</h1>
      {loading ? (
        <p className="text-[13px] text-muted-foreground">Carregando favoritos…</p>
      ) : products.length === 0 ? (
        <div className="text-center py-16">
          <span className="mx-auto w-16 h-16 rounded-full bg-[#E5DDCE] text-marca flex items-center justify-center"><Heart className="w-7 h-7" aria-hidden="true" /></span>
          <p className="font-semibold mt-4">Você ainda não favoritou produtos.</p>
          <p className="text-sm text-muted-foreground mt-1">Toque no coração de um produto para guardar aqui.</p>
          <Link to="/" className="btn-acao mt-6">Ver as lojas</Link>
        </div>
      ) : (
        <div className="divide-y divide-[#EDE6D8]">
          {products.map((p) => (
            <div key={p.id} className="flex items-center gap-3 py-3 min-w-0">
              {p.image_url ? (
                <Image src={p.image_url} alt="" className="w-[60px] h-[60px] shrink-0 rounded-[14px] object-cover bg-[#E5DDCE]" />
              ) : (
                <div aria-hidden="true" className="w-[60px] h-[60px] shrink-0 rounded-[14px] bg-[#E5DDCE] flex items-center justify-center font-display text-2xl text-marca">{(p.name || "?")[0]}</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{p.name}</p>
                <p className="text-[15px] font-bold">{brl(p.price)}</p>
                <Link to={`/loja/${p.store_id}`} className="text-sm font-semibold text-marca underline underline-offset-2">Ver na loja</Link>
              </div>
              <button type="button" onClick={() => remove(p.id)} aria-label="Remover dos favoritos" className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full hover:bg-secondary text-primary">
                <Heart className="w-5 h-5 fill-current" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
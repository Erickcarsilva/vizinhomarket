import React from "react";
import { Store, ShoppingCart, MapPin, Heart } from "lucide-react";

const ITEMS = [
  { icon: Store, title: "Lojas da sua cidade", desc: "Negócios locais em um só lugar." },
  { icon: ShoppingCart, title: "Compre sem complicação", desc: "Escolha, peça e combine a entrega." },
  { icon: MapPin, title: "Acompanhe seu pedido", desc: "Veja o status do início à entrega." },
  { icon: Heart, title: "Descubra novos lugares", desc: "Favorite e volte quando quiser." },
];

export default function WhyVizinho() {
  return (
    <section className="max-w-6xl mx-auto px-5 mt-20 mb-4">
      <div className="rounded-3xl bg-secondary/60 border border-border/60 p-8 md:p-12">
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Por que o VizinhoMarket</p>
        <h2 className="font-display text-3xl md:text-4xl mt-3 max-w-xl">Comércio local, mais perto de você.</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8">
          {ITEMS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="space-y-2">
              <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Icon className="w-5 h-5" />
              </div>
              <p className="font-semibold">{title}</p>
              <p className="text-sm text-muted-foreground leading-snug">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
import React, { useState } from "react";
import { Star } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Textarea } from "@/components/ui/textarea";

const NOMES = ["", "Ruim", "Fraco", "Bom", "Muito bom", "Excelente"];
const estrela = (on, cls) => <Star className={`${cls} ${on ? "fill-[#B7791F] text-[#B7791F]" : "text-[#C9BFAE]"}`} aria-hidden="true" />;

export default function RateOrder({ order, onSaved }) {
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (order.rating) {
    return (
      <div className="rounded-lg bg-card border border-border p-4">
        <p className="text-[13px] text-muted-foreground">Sua avaliação</p>
        <div className="flex items-center gap-1 mt-1.5" role="img" aria-label={`${order.rating} de 5 estrelas`}>
          {[1, 2, 3, 4, 5].map((n) => <span key={n}>{estrela(n <= order.rating, "w-5 h-5")}</span>)}
          <span className="ml-1.5 text-sm font-semibold" aria-hidden="true">{NOMES[order.rating]}</span>
        </div>
        {order.review && <p className="mt-2 text-[15px]">{order.review}</p>}
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await base44.entities.Order.update(order.id, { rating, review });
      onSaved();
    } catch (err) {
      setSaving(false);
      setError(err?.message || "Não foi possível salvar sua avaliação agora.");
    }
  };

  return (
    <div className="rounded-lg bg-card border border-border p-4">
      <p className="font-display text-xl text-marca" id={`nota-${order.id}`}>Como foi seu pedido?</p>
      <div className="flex items-center gap-1 mt-2" role="radiogroup" aria-labelledby={`nota-${order.id}`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"} (${NOMES[n]})`} onClick={() => setRating(n)}
            className="w-11 h-11 -ml-1 first:ml-0 flex items-center justify-center rounded-full hover:bg-secondary transition-colors">
            {estrela(n <= rating, "w-7 h-7")}
          </button>
        ))}
        {rating > 0 && <span className="ml-1 text-sm font-semibold">{NOMES[rating]}</span>}
      </div>
      <Textarea placeholder="Conte como foi (opcional)" aria-label="Conte como foi (opcional)" value={review} onChange={(e) => setReview(e.target.value)} className="mt-3 rounded-lg bg-card text-[15px]" />
      <button type="button" onClick={save} disabled={!rating || saving} className="btn-acao mt-3 h-11">
        {saving ? "Enviando..." : "Enviar avaliação"}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}

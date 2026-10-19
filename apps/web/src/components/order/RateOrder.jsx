import React, { useState } from "react";
import { Star } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Textarea } from "@/components/ui/textarea";

export default function RateOrder({ order, onSaved }) {
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (order.rating) {
    return (
      <div className="rounded-2xl bg-secondary p-6">
        <p className="text-sm text-muted-foreground">Sua avaliação</p>
        <div className="flex gap-1 mt-2">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`w-5 h-5 ${n <= order.rating ? "fill-accent text-accent" : "text-border"}`} />)}</div>
        {order.review && <p className="mt-2 text-sm">{order.review}</p>}
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
    <div className="rounded-2xl border border-border p-6">
      <p className="font-display text-xl">Como foi seu pedido?</p>
      <div className="flex gap-1 mt-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} className="hover:scale-110 transition-transform">
            <Star className={`w-7 h-7 ${n <= rating ? "fill-accent text-accent" : "text-border"}`} />
          </button>
        ))}
      </div>
      <Textarea placeholder="Conte como foi (opcional)" value={review} onChange={(e) => setReview(e.target.value)} className="mt-4 rounded-xl" />
      <button onClick={save} disabled={!rating || saving} className="mt-4 h-11 px-6 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40">
        {saving ? "Enviando..." : "Enviar avaliação"}
      </button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
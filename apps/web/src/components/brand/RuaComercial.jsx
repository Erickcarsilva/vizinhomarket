import React from "react";
import { categoryStyle } from "@/lib/categoryStyle";

// Ilustração da marca: uma rua de comércio — fachadas lado a lado, cada toldo na cor de uma categoria
// (comida, mercado, farmácia, eletrônicos, pet). É desenho vetorial próprio, não foto de banco de imagens.
const LOJAS = ["alimentacao", "mercado", "farmacia", "eletronicos", "pet"];

function Fachada({ x, w, h, slug }) {
  const st = categoryStyle(slug);
  const y = 160 - h;
  const n = Math.round(w / 14);
  const r = w / n / 2;
  const ondas = Array.from({ length: n }, (_, i) => `M${x + i * 2 * r} ${y + 26} a${r} ${r} 0 0 0 ${2 * r} 0`).join(" ");
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="3" fill="#FFFFFF" fillOpacity="0.96" />
      <rect x={x - 3} y={y + 8} width={w + 6} height="18" rx="2" fill={st.fg} />
      <path d={ondas} fill={st.fg} />
      <rect x={x + w * 0.12} y={y + 42} width={w * 0.42} height={h - 52} rx="2" fill={st.bg} />
      <rect x={x + w * 0.62} y={y + 50} width={w * 0.26} height={h - 50} rx="2" fill="#14201A" fillOpacity="0.85" />
    </g>
  );
}

export default function RuaComercial({ className = "" }) {
  const larguras = [78, 92, 70, 84, 74];
  const alturas = [96, 118, 88, 106, 92];
  let x = 6;
  return (
    <svg viewBox="0 0 440 168" className={className} role="img" aria-label="Fachadas de lojas de categorias diferentes, lado a lado">
      <rect x="0" y="160" width="440" height="8" rx="2" fill="#FFFFFF" fillOpacity="0.25" />
      {LOJAS.map((slug, i) => {
        const el = <Fachada key={slug} x={x} w={larguras[i]} h={alturas[i]} slug={slug} />;
        x += larguras[i] + 8;
        return el;
      })}
    </svg>
  );
}

import React from "react";
import { Link, useLocation } from "react-router-dom";
import { MapPinOff } from "lucide-react";

// Página não encontrada do app do cliente (dentro do topo e do menu, em português).
export default function NaoEncontrada() {
  const { pathname } = useLocation();
  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <span className="mx-auto w-16 h-16 rounded-full bg-[#E5DDCE] text-marca flex items-center justify-center"><MapPinOff className="w-7 h-7" aria-hidden="true" /></span>
      <h1 className="font-display text-2xl text-marca mt-5">Página não encontrada</h1>
      <p className="text-muted-foreground mt-2 break-words">O endereço <strong className="font-semibold text-foreground">{pathname}</strong> não existe no VizinhoMarket.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/" className="btn-acao">Ver as lojas</Link>
        <Link to="/busca" className="btn-contorno">Buscar</Link>
      </div>
    </div>
  );
}

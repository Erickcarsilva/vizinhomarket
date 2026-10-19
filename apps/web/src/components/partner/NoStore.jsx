import React from "react";
import { Link } from "react-router-dom";

export default function NoStore() {
  return (
    <div className="max-w-md mx-auto px-5 py-24 text-center">
      <h1 className="font-display text-4xl">Nenhuma loja encontrada</h1>
      <p className="text-muted-foreground mt-3">Cadastre sua loja para acessar esta área.</p>
      <Link to="/cadastrar-loja" className="inline-block mt-8 h-12 leading-[3rem] px-8 rounded-full bg-primary text-primary-foreground font-semibold">
        Cadastrar minha loja
      </Link>
    </div>
  );
}
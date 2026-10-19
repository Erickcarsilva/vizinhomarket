import React from "react";
import { Link } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function StoreSwitcher({ stores, store, onPick }) {
  if (!stores || stores.length === 0) return null;
  return (
    <div className="flex items-center gap-3">
      {stores.length > 1 ? (
        <Select value={store?.id} onValueChange={onPick}>
          <SelectTrigger className="w-64 h-11 rounded-full"><SelectValue placeholder="Escolher loja" /></SelectTrigger>
          <SelectContent>{stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      ) : (
        <span className="font-display text-2xl">{store?.name}</span>
      )}
      <Link to="/cadastrar-loja" className="text-sm underline underline-offset-4 whitespace-nowrap">Nova loja</Link>
    </div>
  );
}
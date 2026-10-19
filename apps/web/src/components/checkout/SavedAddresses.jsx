import React from "react";
import { Star, MapPin } from "lucide-react";

const KEY = "perto_addresses";
const DEF_KEY = "perto_addresses_default";

export default function SavedAddresses({ value, onPick }) {
  const list = JSON.parse(localStorage.getItem(KEY) || "[]");
  if (list.length === 0) return null;
  const def = Number(localStorage.getItem(DEF_KEY) || "-1");
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((a, i) => (
        <button type="button" key={i} onClick={() => onPick(a)} className={`h-9 px-3 rounded-full border text-xs flex items-center gap-1.5 transition ${value === a ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-secondary"}`}>
          {i === def && <Star className="w-3 h-3 fill-current" />}
          <MapPin className="w-3 h-3" />
          {a.length > 30 ? a.slice(0, 30) + "…" : a}
        </button>
      ))}
    </div>
  );
}
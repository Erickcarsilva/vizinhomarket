import React from "react";

// Escolha única em linhas (como botões de rádio): bolinha verde na opção marcada.
export default function ChoiceGroup({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid sm:grid-cols-3 gap-2">
      {options.map(([key, text]) => {
        const on = value === key;
        return (
          <button key={key} type="button" role="radio" aria-checked={on} onClick={() => onChange(key)}
            className={`min-h-[48px] px-3.5 rounded-lg border bg-card text-left text-[15px] font-medium flex items-center gap-3 transition-colors ${on ? "border-marca ring-1 ring-marca" : "border-border hover:border-marca/40"}`}>
            <span className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center ${on ? "border-marca" : "border-input"}`} aria-hidden="true">
              {on && <span className="w-2.5 h-2.5 rounded-full bg-marca" />}
            </span>
            <span className="min-w-0">{text}</span>
          </button>
        );
      })}
    </div>
  );
}

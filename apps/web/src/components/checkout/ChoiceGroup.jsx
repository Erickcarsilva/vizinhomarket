import React from "react";

export default function ChoiceGroup({ options, value, onChange }) {
  return (
    <div className="grid sm:grid-cols-3 gap-2">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`h-12 px-4 rounded-xl border text-sm font-medium transition-all ${
            value === key ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:border-primary/40"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
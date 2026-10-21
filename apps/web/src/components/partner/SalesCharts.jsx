import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid } from "recharts";
import { brl } from "@/lib/constants";

export default function SalesCharts({ daily, cumulative }) {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="bg-card border border-border rounded-2xl p-5">
        <p className="text-sm font-semibold mb-4">Vendas por dia</p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={daily} margin={{ left: -16, right: 8, top: 10 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis width={72} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `R$ ${Number(v).toLocaleString("pt-BR")}`} />
            <Tooltip formatter={(v) => brl(v)} labelStyle={{ fontSize: 12 }} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }} />
            <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-card border border-border rounded-2xl p-5">
        <p className="text-sm font-semibold mb-4">Faturamento acumulado</p>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={cumulative} margin={{ left: -16, right: 8, top: 10 }}>
            <defs>
              <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis width={72} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `R$ ${Number(v).toLocaleString("pt-BR")}`} />
            <Tooltip formatter={(v) => brl(v)} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }} />
            <Area type="monotone" dataKey="value" stroke="hsl(var(--accent))" strokeWidth={2} fill="url(#cumFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
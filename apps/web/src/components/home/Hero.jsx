import React from "react";
import { motion } from "framer-motion";
import { Search } from "lucide-react";

export default function Hero({ query, onQuery }) {
  return (
    <section className="max-w-6xl mx-auto px-5 pt-14 pb-10 md:pt-24 md:pb-14">
      <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-xs uppercase tracking-[0.3em] text-accent font-semibold mb-5 hidden">
        Marketplace local
      </motion.p>
      <motion.h1
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.6 }}
        className="font-display font-light text-5xl md:text-7xl leading-[1.02] tracking-tight max-w-3xl">
        
        Tudo da sua cidade, <em className="text-primary">em um só lugar.</em>
      </motion.h1>
      <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6 }} className="mt-5 text-lg text-muted-foreground max-w-xl">
        Encontre lojas, produtos e serviços perto de você e compre de quem faz parte da sua cidade.
      </motion.p>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }} className="mt-10 max-w-xl relative">
        <Search className="w-5 h-5 absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Buscar lojas ou produtos"
          className="w-full h-14 pl-14 pr-5 rounded-full bg-card border border-border shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition" />
        
      </motion.div>
    </section>);

}
import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Input } from "@/components/ui/input";
import { Card, Chip, Btn, Empty, ErrorLine, useAction, fmtDate } from "./ui";

export default function UsersAdmin() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const { data: users = [], isLoading } = useQuery({ queryKey: ["admin-users", term], queryFn: () => base44.admin.listUsers(term) });
  const { busy, error, run } = useAction(() => qc.invalidateQueries({ queryKey: ["admin-users"] }));

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); setTerm(search); }} className="flex gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por e-mail, nome ou telefone" className="h-11 rounded-xl" />
        <button className="h-11 px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold">Buscar</button>
      </form>
      <ErrorLine error={error} />
      {isLoading ? <Empty>Carregando…</Empty> : users.length === 0 ? <Empty>Nenhum usuário encontrado.</Empty> : (
        <Card className="divide-y divide-border">
          {users.map((u) => {
            const isAdmin = (u.roles || []).includes("admin");
            const self = u.id === me?.id;
            return (
              <div key={u.id} className="p-4 space-y-2">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{u.full_name || "Sem nome"}{self ? " (você)" : ""}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email} · {u.phone || "sem telefone"}</p>
                    <p className="text-xs text-muted-foreground">Cadastro {fmtDate(u.created_at)} · último acesso {fmtDate(u.last_sign_in_at)} · {u.orders_count} pedido(s)</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {isAdmin && <Chip tone="info">Admin</Chip>}
                  {u.owns_store && <Chip>Lojista</Chip>}
                  {u.courier_status && <Chip tone={u.courier_status === "approved" ? "ok" : "warn"}>Entregador {u.courier_status === "approved" ? "aprovado" : u.courier_status === "pending" ? "pendente" : "suspenso"}</Chip>}
                  {u.banned && <Chip tone="bad">Bloqueado</Chip>}
                </div>
                {!self && (
                  <div className="flex flex-wrap gap-2">
                    {u.banned
                      ? <Btn busy={busy === `b-${u.id}`} onClick={() => run(`b-${u.id}`, () => base44.admin.setBanned(u.id, false))}>Desbloquear</Btn>
                      : <Btn variant="danger" busy={busy === `b-${u.id}`} onClick={() => run(`b-${u.id}`, () => base44.admin.setBanned(u.id, true, "bloqueado pelo admin"), `Bloquear ${u.email}? A pessoa não consegue mais entrar no app.`)}>Bloquear</Btn>}
                    {isAdmin
                      ? <Btn busy={busy === `a-${u.id}`} onClick={() => run(`a-${u.id}`, () => base44.admin.setAdmin(u.id, false), `Tirar o acesso de administrador de ${u.email}?`)}>Remover admin</Btn>
                      : <Btn busy={busy === `a-${u.id}`} onClick={() => run(`a-${u.id}`, () => base44.admin.setAdmin(u.id, true), `Dar acesso TOTAL de administrador para ${u.email}?`)}>Tornar admin</Btn>}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

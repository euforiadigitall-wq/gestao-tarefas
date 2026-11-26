"use client";

import { Search } from "lucide-react";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { definirAcesso } from "@/app/(app)/admin/actions";
import type { Acesso, Area, ClienteAdmin, PessoaAdmin } from "@/lib/tipos";

export function AdminAcessos({
  membros, clientes, areas, acessos,
}: { membros: PessoaAdmin[]; clientes: ClienteAdmin[]; areas: Area[]; acessos: Acesso[] }) {
  const [pessoaId, setPessoaId] = useState(membros[0]?.id ?? "");
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [, iniciar] = useTransition();

  const liberados = useMemo(() => {
    const s = new Set<string>();
    for (const a of acessos) {
      if (a.pessoa_id !== pessoaId) continue;
      if (a.area_id === null) areas.forEach((ar) => s.add(`${a.cliente_id}:${ar.id}`));
      else s.add(`${a.cliente_id}:${a.area_id}`);
    }
    return s;
  }, [acessos, areas, pessoaId]);

  const [otimista, aplicar] = useOptimistic(liberados, (atual, m: { k: string; v: boolean }) => {
    const n = new Set(atual);
    if (m.v) n.add(m.k); else n.delete(m.k);
    return n;
  });

  function alternar(clienteId: string, areaId: string, liberar: boolean) {
    setErro("");
    iniciar(async () => {
      aplicar({ k: `${clienteId}:${areaId}`, v: liberar });
      const r = await definirAcesso({ pessoaId, clienteId, areaId, liberar });
      if (r.erro) setErro(r.erro);
    });
  }

  if (membros.length === 0) {
    return <div className="panel px-6 py-8 text-center text-sm text-tx2">Não há membros ativos. Admins já enxergam tudo.</div>;
  }

  const ativos = clientes.filter((c) => c.ativo);
  const lista = ativos.filter((c) => c.nome.toLowerCase().includes(busca.trim().toLowerCase()));
  const totalClientes = new Set(Array.from(otimista).map((k) => k.split(":")[0])).size;

  return (
    <div className="space-y-5">
      <p className="rounded-lg bg-panel2 px-4 py-3 text-[13px] text-tx2">
        Marque em qual área cada cliente fica liberado para o membro. Quem é responsável por uma tarefa sempre vê a própria tarefa, mesmo sem liberação.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="ac-pessoa" className="label mb-1.5 block">Membro</label>
          <select id="ac-pessoa" className="field !h-9 !w-auto min-w-[180px]" value={pessoaId} onChange={(e) => setPessoaId(e.target.value)}>
            {membros.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </div>
        <div className="min-w-[200px] flex-1">
          <label htmlFor="ac-busca" className="label mb-1.5 block">Buscar cliente</label>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tx3" />
            <input id="ac-busca" className="field !h-9 !pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome do cliente" />
          </div>
        </div>
        <p className="mono pb-2 text-xs text-tx2">{totalClientes} cliente{totalClientes === 1 ? "" : "s"} liberado{totalClientes === 1 ? "" : "s"}</p>
      </div>

      {erro && <p role="alert" className="rounded-lg bg-dangerbg px-3 py-2 text-[13px] text-danger">{erro}</p>}

      {ativos.length === 0 ? (
        <div className="panel px-6 py-8 text-center text-sm text-tx2">Cadastre clientes na aba Clientes primeiro.</div>
      ) : lista.length === 0 ? (
        <div className="panel px-6 py-8 text-center text-sm text-tx2">Nenhum cliente com esse nome.</div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="flex items-center gap-4 border-b border-[var(--line)] px-4 py-2.5">
            <span className="label flex-1">Cliente</span>
            {areas.map((a) => <span key={a.id} className="label w-[110px] text-center">{a.nome}</span>)}
          </div>
          <ul className="divide-y divide-[var(--line)]">
            {lista.map((c) => (
              <li key={c.id} className="flex items-center gap-4 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm">{c.nome}</span>
                {areas.map((a) => {
                  const marcado = otimista.has(`${c.id}:${a.id}`);
                  return (
                    <span key={a.id} className="flex w-[110px] justify-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                        aria-label={`${c.nome}, ${a.nome}`}
                        checked={marcado}
                        onChange={(e) => alternar(c.id, a.id, e.target.checked)}
                      />
                    </span>
                  );
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

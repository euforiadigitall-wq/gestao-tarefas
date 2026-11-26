"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Opcao } from "@/lib/tipos";

export function FiltrosHistorico({
  admin, pessoas, pessoa, periodo, q,
}: { admin: boolean; pessoas: Opcao[]; pessoa: string; periodo: string; q: string }) {
  const router = useRouter();
  const [busca, setBusca] = useState(q);

  function ir(novo: { pessoa?: string; periodo?: string; q?: string }) {
    const p = new URLSearchParams();
    const pes = novo.pessoa ?? pessoa;
    const per = novo.periodo ?? periodo;
    const qq = (novo.q ?? busca).trim();
    if (admin && pes && pes !== "todas") p.set("pessoa", pes);
    if (per !== "30") p.set("periodo", per);
    if (qq) p.set("q", qq);
    const qs = p.toString();
    router.push(qs ? `/historico?${qs}` : "/historico");
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); ir({}); }} className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="h-periodo" className="label mb-1.5 block">Período</label>
        <select id="h-periodo" className="field !h-9 !w-auto min-w-[150px]" value={periodo} onChange={(e) => ir({ periodo: e.target.value })}>
          <option value="7">Últimos 7 dias</option>
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
          <option value="todos">Tudo</option>
        </select>
      </div>
      {admin && (
        <div>
          <label htmlFor="h-pessoa" className="label mb-1.5 block">Pessoa</label>
          <select id="h-pessoa" className="field !h-9 !w-auto min-w-[160px]" value={pessoa} onChange={(e) => ir({ pessoa: e.target.value })}>
            <option value="todas">Todas</option>
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
      )}
      <div className="min-w-[200px] flex-1">
        <label htmlFor="h-busca" className="label mb-1.5 block">Buscar no título</label>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tx3" />
          <input id="h-busca" className="field !h-9 !pl-9" placeholder="Digite e aperte Enter" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>
    </form>
  );
}

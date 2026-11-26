"use client";

import { useRouter } from "next/navigation";
import type { Area, LancamentoOpcao, Opcao } from "@/lib/tipos";

interface Props {
  base: string;
  admin: boolean;
  pessoas: Opcao[];
  clientes: Opcao[];
  areas: Area[];
  valores: { pessoa: string; cliente: string; area: string; agrupar?: string; lanc?: string };
  lancamentos?: LancamentoOpcao[];
  fixos?: Record<string, string>;
  comAgrupar?: boolean;
}

// Filtros que moram na URL, para a visão poder ser compartilhada por link
export function FiltrosVisao({ base, admin, pessoas, clientes, areas, valores, fixos = {}, comAgrupar, lancamentos = [] }: Props) {
  const router = useRouter();

  function ir(novo: Partial<typeof valores>) {
    const v = { ...valores, ...novo };
    const p = new URLSearchParams();
    for (const [k, val] of Object.entries(fixos)) if (val) p.set(k, val);
    if (admin && v.pessoa !== "todas") p.set("pessoa", v.pessoa);
    if (v.cliente !== "todos") p.set("cliente", v.cliente);
    if (v.area !== "todas") p.set("area", v.area);
    if (v.lanc && v.lanc !== "todos") p.set("lanc", v.lanc);
    if (comAgrupar && v.agrupar && v.agrupar !== "pessoa") p.set("agrupar", v.agrupar);
    const qs = p.toString();
    router.push(qs ? `${base}?${qs}` : base);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      {comAgrupar && (
        <div>
          <label htmlFor="v-agrupar" className="label mb-1.5 block">Agrupar por</label>
          <select id="v-agrupar" className="field !h-9 !w-auto min-w-[130px]" value={valores.agrupar} onChange={(e) => ir({ agrupar: e.target.value })}>
            <option value="pessoa">Pessoa</option>
            <option value="cliente">Cliente</option>
            <option value="etapa">Etapa da esteira</option>
          </select>
        </div>
      )}
      {admin && (
        <div>
          <label htmlFor="v-pessoa" className="label mb-1.5 block">Pessoa</label>
          <select id="v-pessoa" className="field !h-9 !w-auto min-w-[150px]" value={valores.pessoa} onChange={(e) => ir({ pessoa: e.target.value })}>
            <option value="todas">Todas</option>
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="v-cliente" className="label mb-1.5 block">Cliente</label>
        <select id="v-cliente" className="field !h-9 !w-auto min-w-[170px]" value={valores.cliente} onChange={(e) => ir({ cliente: e.target.value })}>
          <option value="todos">Todos</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>
      {lancamentos.length > 0 && (
        <div>
          <label htmlFor="v-lanc" className="label mb-1.5 block">Lançamento</label>
          <select id="v-lanc" className="field !h-9 !w-auto min-w-[150px]" value={valores.lanc ?? "todos"} onChange={(e) => ir({ lanc: e.target.value })}>
            <option value="todos">Todos</option>
            {lancamentos.map((l) => <option key={l.id} value={l.id}>{l.codigo}</option>)}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="v-area" className="label mb-1.5 block">Área</label>
        <select id="v-area" className="field !h-9 !w-auto min-w-[140px]" value={valores.area} onChange={(e) => ir({ area: e.target.value })}>
          <option value="todas">Todas</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
      </div>
    </div>
  );
}

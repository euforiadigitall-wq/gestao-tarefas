"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { criarTarefa } from "@/app/(app)/hoje/actions";
import type { Area, Opcao } from "@/lib/tipos";

export function NovaTarefa({
  admin, meuId, clientes, areas, pessoas,
}: { admin: boolean; meuId: string; clientes: Opcao[]; areas: Area[]; pessoas: Opcao[] }) {
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [titulo, setTitulo] = useState("");
  const [prazo, setPrazo] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [responsavelId, setResponsavelId] = useState(meuId);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    iniciar(async () => {
      const r = await criarTarefa({ titulo, prazo, clienteId, areaId, responsavelId });
      if (r.erro) return setErro(r.erro);
      setTitulo(""); setPrazo(""); setClienteId(""); setAreaId(""); setResponsavelId(meuId);
      setAberto(false);
    });
  }

  if (!aberto) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setAberto(true)}>
        <Plus size={16} /> Nova tarefa
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="panel w-full space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-medium">Nova tarefa</h2>
        <button type="button" className="btn btn-ghost !h-8 !w-8 !px-0" onClick={() => setAberto(false)} aria-label="Fechar"><X size={16} /></button>
      </div>
      <div>
        <label htmlFor="nt-titulo" className="label mb-1.5 block">O que precisa ser feito</label>
        <input id="nt-titulo" className="field" required maxLength={200} autoFocus placeholder="Ex.: revisar os stories de captação" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="nt-prazo" className="label mb-1.5 block">Prazo</label>
          <input id="nt-prazo" type="date" className="field" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </div>
        <div>
          <label htmlFor="nt-cliente" className="label mb-1.5 block">Cliente</label>
          <select id="nt-cliente" className="field" value={clienteId} onChange={(e) => { setClienteId(e.target.value); if (!e.target.value) setAreaId(""); }}>
            <option value="">Interna, sem cliente</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="nt-area" className="label mb-1.5 block">Área</label>
          <select id="nt-area" className="field" disabled={!clienteId} required={!!clienteId} value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            <option value="">{clienteId ? "Escolha" : "Só com cliente"}</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        </div>
        {admin && (
          <div>
            <label htmlFor="nt-resp" className="label mb-1.5 block">Para quem</label>
            <select id="nt-resp" className="field" value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}>
              {pessoas.map((p) => <option key={p.id} value={p.id}>{p.id === meuId ? `${p.nome} (eu)` : p.nome}</option>)}
            </select>
          </div>
        )}
      </div>
      {erro && <p role="alert" className="rounded-lg bg-dangerbg px-3 py-2 text-[13px] text-danger">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => setAberto(false)}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={pendente}>
          {pendente && <Loader2 size={15} className="animate-spin" />} Criar tarefa
        </button>
      </div>
    </form>
  );
}

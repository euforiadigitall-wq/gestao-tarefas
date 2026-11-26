"use client";

import { Loader2, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { adicionarClientes, alternarCliente, renomearCliente, type Resultado } from "@/app/(app)/admin/actions";
import type { ClienteAdmin } from "@/lib/tipos";

function Linha({ c, rodar }: { c: ClienteAdmin; rodar: (fn: () => Promise<Resultado>) => void }) {
  const [nome, setNome] = useState(c.nome);
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <input
        aria-label={`Nome do cliente ${c.nome}`}
        className={`field !h-9 flex-1 ${c.ativo ? "" : "!text-tx3"}`}
        value={nome}
        maxLength={120}
        onChange={(e) => setNome(e.target.value)}
        onBlur={() => { if (nome.trim() && nome.trim() !== c.nome) rodar(() => renomearCliente(c.id, nome)); else setNome(c.nome); }}
      />
      <button type="button" className="btn !h-9" onClick={() => rodar(() => alternarCliente(c.id, !c.ativo))}>
        {c.ativo ? "Desativar" : "Reativar"}
      </button>
    </li>
  );
}

export function AdminClientes({ clientes }: { clientes: ClienteAdmin[] }) {
  const [pendente, iniciar] = useTransition();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  function rodar(fn: () => Promise<Resultado>) {
    setErro(""); setAviso("");
    iniciar(async () => {
      const r = await fn();
      if (r.erro) setErro(r.erro);
      if (r.aviso) setAviso(r.aviso);
    });
  }

  function adicionar(e: React.FormEvent) {
    e.preventDefault();
    setErro(""); setAviso("");
    iniciar(async () => {
      const r = await adicionarClientes(texto);
      if (r.erro) return setErro(r.erro);
      if (r.aviso) setAviso(r.aviso);
      setTexto("");
    });
  }

  const ativos = clientes.filter((c) => c.ativo);
  const inativos = clientes.filter((c) => !c.ativo);

  return (
    <div className="space-y-6">
      <form onSubmit={adicionar} className="panel space-y-3 p-5">
        <label htmlFor="novos" className="label block">Adicionar clientes, um por linha</label>
        <textarea id="novos" className="field" rows={4} placeholder={"Nome do cliente 1\nNome do cliente 2"} value={texto} onChange={(e) => setTexto(e.target.value)} />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-tx3">Nomes que já existem são ignorados.</p>
          <button type="submit" className="btn btn-primary" disabled={pendente || !texto.trim()}>
            {pendente ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Adicionar
          </button>
        </div>
      </form>

      {erro && <p role="alert" className="rounded-lg bg-dangerbg px-3 py-2 text-[13px] text-danger">{erro}</p>}
      {aviso && <p role="status" className="rounded-lg bg-okbg px-3 py-2 text-[13px] text-ok">{aviso}</p>}

      <section>
        <h2 className="mb-3 flex items-center gap-2.5">
          <span className="label">Ativos</span>
          <span className="mono rounded-md bg-panel2 px-1.5 text-[11px] text-tx2">{ativos.length}</span>
          <span className="h-px flex-1 bg-[var(--line)]" />
        </h2>
        {ativos.length === 0 ? (
          <div className="panel px-6 py-8 text-center text-sm text-tx2">Nenhum cliente ainda. Adicione acima.</div>
        ) : (
          <ul className="panel divide-y divide-[var(--line)]">
            {ativos.map((c) => <Linha key={c.id + c.nome} c={c} rodar={rodar} />)}
          </ul>
        )}
      </section>

      {inativos.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2.5">
            <span className="label">Desativados</span>
            <span className="mono rounded-md bg-panel2 px-1.5 text-[11px] text-tx2">{inativos.length}</span>
            <span className="h-px flex-1 bg-[var(--line)]" />
          </h2>
          <ul className="panel divide-y divide-[var(--line)]">
            {inativos.map((c) => <Linha key={c.id + c.nome} c={c} rodar={rodar} />)}
          </ul>
        </section>
      )}
    </div>
  );
}

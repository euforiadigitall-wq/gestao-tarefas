"use client";

import { useState, useTransition } from "react";
import { atualizarPessoa, type Resultado } from "@/app/(app)/admin/actions";
import type { PessoaAdmin } from "@/lib/tipos";

function Linha({ p, meuId, rodar }: { p: PessoaAdmin; meuId: string; rodar: (fn: () => Promise<Resultado>) => void }) {
  const [nome, setNome] = useState(p.nome);
  const [apelido, setApelido] = useState(p.apelido ?? "");
  const eu = p.id === meuId;
  return (
    <li className="grid gap-3 px-4 py-3 md:grid-cols-[1.2fr_1fr_1.4fr_130px_110px] md:items-center">
      <div>
        <label className="label mb-1 block md:hidden">Nome</label>
        <input className="field !h-9" aria-label={`Nome de ${p.nome}`} value={nome} maxLength={120}
          onChange={(e) => setNome(e.target.value)}
          onBlur={() => { if (nome.trim() && nome.trim() !== p.nome) rodar(() => atualizarPessoa(p.id, { nome })); else setNome(p.nome); }} />
      </div>
      <div>
        <label className="label mb-1 block md:hidden">Apelido</label>
        <input className="field !h-9" aria-label={`Apelido de ${p.nome}`} value={apelido} maxLength={60} placeholder="Apelido"
          onChange={(e) => setApelido(e.target.value)}
          onBlur={() => { if (apelido.trim() !== (p.apelido ?? "")) rodar(() => atualizarPessoa(p.id, { apelido })); }} />
      </div>
      <p className="truncate text-[13px] text-tx2" title={p.email ?? ""}>{p.email ?? "sem e-mail"}</p>
      <div>
        <label className="label mb-1 block md:hidden">Papel</label>
        <select className="field !h-9" aria-label={`Papel de ${p.nome}`} value={p.papel} disabled={eu}
          onChange={(e) => rodar(() => atualizarPessoa(p.id, { papel: e.target.value as "admin" | "membro" }))}>
          <option value="admin">Admin</option>
          <option value="membro">Membro</option>
        </select>
      </div>
      <button type="button" className="btn !h-9" disabled={eu} title={eu ? "Você não pode se desativar" : undefined}
        onClick={() => rodar(() => atualizarPessoa(p.id, { ativo: !p.ativo }))}>
        {p.ativo ? "Desativar" : "Reativar"}
      </button>
    </li>
  );
}

export function AdminPessoas({ pessoas, meuId }: { pessoas: PessoaAdmin[]; meuId: string }) {
  const [, iniciar] = useTransition();
  const [erro, setErro] = useState("");

  function rodar(fn: () => Promise<Resultado>) {
    setErro("");
    iniciar(async () => {
      const r = await fn();
      if (r.erro) setErro(r.erro);
    });
  }

  const ativas = pessoas.filter((p) => p.ativo);
  const inativas = pessoas.filter((p) => !p.ativo);

  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-panel2 px-4 py-3 text-[13px] text-tx2">
        Para incluir uma pessoa nova: crie o login em Authentication, Users, no Supabase, e rode o script 03 com o e-mail dela. Depois ela aparece aqui.
        Admin vê e faz tudo. Membro só vê o que for liberado na aba Acessos.
      </p>
      {erro && <p role="alert" className="rounded-lg bg-dangerbg px-3 py-2 text-[13px] text-danger">{erro}</p>}

      <section>
        <h2 className="mb-3 flex items-center gap-2.5">
          <span className="label">Ativas</span>
          <span className="mono rounded-md bg-panel2 px-1.5 text-[11px] text-tx2">{ativas.length}</span>
          <span className="h-px flex-1 bg-[var(--line)]" />
        </h2>
        <ul className="panel divide-y divide-[var(--line)]">
          {ativas.map((p) => <Linha key={p.id + p.nome + (p.apelido ?? "")} p={p} meuId={meuId} rodar={rodar} />)}
        </ul>
      </section>

      {inativas.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2.5">
            <span className="label">Desativadas</span>
            <span className="mono rounded-md bg-panel2 px-1.5 text-[11px] text-tx2">{inativas.length}</span>
            <span className="h-px flex-1 bg-[var(--line)]" />
          </h2>
          <ul className="panel divide-y divide-[var(--line)]">
            {inativas.map((p) => <Linha key={p.id + p.nome + (p.apelido ?? "")} p={p} meuId={meuId} rodar={rodar} />)}
          </ul>
        </section>
      )}
    </div>
  );
}

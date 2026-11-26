"use client";

import { useState, useTransition } from "react";
import { definirPapel, definirPapelParaTodos, definirPapelPadrao } from "@/app/(app)/admin/actions";
import { PAPEIS_CLIENTE, type ClienteAdmin, type PapelCliente, type PessoaAdmin } from "@/lib/tipos";

export function AdminPapeis({
  clientes, pessoas, papeis, padroes,
}: { clientes: ClienteAdmin[]; pessoas: PessoaAdmin[]; papeis: PapelCliente[]; padroes: { papel: string; pessoa_id: string }[] }) {
  const [, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const ativos = clientes.filter((c) => c.ativo);
  const ativas = pessoas.filter((p) => p.ativo);
  const valor = (cid: string, papel: string) => papeis.find((x) => x.cliente_id === cid && x.papel === papel)?.pessoa_id ?? "";

  function rodar(fn: () => Promise<{ erro?: string; aviso?: string }>) {
    setErro(""); setAviso("");
    iniciar(async () => {
      const r = await fn();
      if (r.erro) setErro(r.erro);
      if (r.aviso) setAviso(r.aviso);
    });
  }

  const padrao = (papel: string) => padroes.find((x) => x.papel === papel)?.pessoa_id ?? "";

  const blocoPadrao = (
    <section className="panel p-5" aria-labelledby="padrao-titulo">
      <h2 id="padrao-titulo" className="text-[15px] font-medium">Quem faz cada função por padrão</h2>
      <p className="mt-1 text-[13px] text-tx2">
        Ao criar uma tarefa de um tipo (Site, Calendário editorial e os outros), cada etapa vai direto para a pessoa da função. Vale para cliente avulso também, e para quem não é admin.
        Um papel salvo para um cliente (tabela abaixo) vem antes deste padrão.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PAPEIS_CLIENTE.map((p) => (
          <div key={p.codigo}>
            <label htmlFor={`padrao-${p.codigo}`} className="mb-1.5 block text-[13px] text-tx2">{p.nome}</label>
            <select id={`padrao-${p.codigo}`} className="field" value={padrao(p.codigo)}
              onChange={(e) => rodar(() => definirPapelPadrao(p.codigo, e.target.value))}>
              <option value="">Sem padrão</option>
              {ativas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          </div>
        ))}
      </div>
    </section>
  );

  if (ativos.length === 0) return <div className="space-y-5">{blocoPadrao}<div className="panel px-6 py-8 text-center text-sm text-tx2">Cadastre clientes na aba Clientes para definir papéis por cliente.</div></div>;

  return (
    <div className="space-y-5">
      {blocoPadrao}
      <p className="rounded-lg bg-panel2 px-4 py-3 text-[13px] text-tx2">
        Opcional. Serve só para clientes com equipe diferente do padrão: ao criar uma peça, a pessoa do cliente vale no lugar do padrão acima.
        Use a linha &quot;Todos os clientes&quot; para preencher de uma vez e depois ajuste o que for diferente.
      </p>
      {erro && <p role="alert" className="rounded-lg bg-dangerbg px-3 py-2 text-[13px] text-danger">{erro}</p>}
      {aviso && <p role="status" className="rounded-lg bg-okbg px-3 py-2 text-[13px] text-ok">{aviso}</p>}

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-left">
              <th className="label px-4 py-2.5 font-normal">Cliente</th>
              {PAPEIS_CLIENTE.map((p) => <th key={p.codigo} className="label px-2 py-2.5 font-normal">{p.nome}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            <tr className="bg-panel2">
              <td className="px-4 py-2.5 text-[13px] font-medium">Todos os clientes</td>
              {PAPEIS_CLIENTE.map((p) => (
                <td key={p.codigo} className="px-2 py-2.5">
                  <select className="field !h-9" aria-label={`${p.nome} para todos os clientes`} value=""
                    onChange={(e) => { if (e.target.value) rodar(() => definirPapelParaTodos(p.codigo, e.target.value)); }}>
                    <option value="">Aplicar a todos</option>
                    {ativas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                  </select>
                </td>
              ))}
            </tr>
            {ativos.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2 text-sm">{c.nome}</td>
                {PAPEIS_CLIENTE.map((p) => (
                  <td key={p.codigo} className="px-2 py-2">
                    <select className="field !h-9" aria-label={`${p.nome} de ${c.nome}`} value={valor(c.id, p.codigo)}
                      onChange={(e) => rodar(() => definirPapel(c.id, p.codigo, e.target.value))}>
                      <option value="">Sem definir</option>
                      {ativas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

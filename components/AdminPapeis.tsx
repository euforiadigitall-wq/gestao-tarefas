"use client";

import { useState, useTransition } from "react";
import { definirPapel, definirPapelParaTodos } from "@/app/(app)/admin/actions";
import { PAPEIS_CLIENTE, type ClienteAdmin, type PapelCliente, type PessoaAdmin } from "@/lib/tipos";

export function AdminPapeis({
  clientes, pessoas, papeis,
}: { clientes: ClienteAdmin[]; pessoas: PessoaAdmin[]; papeis: PapelCliente[] }) {
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

  if (ativos.length === 0) return <div className="panel px-6 py-8 text-center text-sm text-tx2">Cadastre clientes na aba Clientes primeiro.</div>;

  return (
    <div className="space-y-5">
      <p className="rounded-lg bg-panel2 px-4 py-3 text-[13px] text-tx2">
        Define quem faz cada função nas peças com esteira de cada cliente. Ao criar a peça, a etapa vai para a pessoa dessa função.
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

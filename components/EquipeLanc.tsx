"use client";

import { useState, useTransition } from "react";
import { definirEquipe } from "@/app/(app)/lancamentos/actions";
import { PAPEIS_CLIENTE, type Opcao } from "@/lib/tipos";

// Quem faz cada função neste lançamento. Admin troca aqui; os itens ainda abertos acompanham.
export function EquipeLanc({
  lancamentoId, equipe, pessoas, admin,
}: { lancamentoId: string; equipe: Record<string, string>; pessoas: Opcao[]; admin: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const nome = (id: string) => pessoas.find((p) => p.id === id)?.nome ?? "";

  function trocar(papel: string, pessoaId: string) {
    setErro("");
    iniciar(async () => {
      const r = await definirEquipe(lancamentoId, papel, pessoaId);
      if (r.erro) setErro(r.erro);
    });
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {PAPEIS_CLIENTE.map((p) => (
          <div key={p.codigo}>
            <p className="mb-1.5 text-[13px] text-tx2">{p.nome}</p>
            {admin ? (
              <select
                aria-label={`Quem faz: ${p.nome}`}
                className="field !h-9"
                disabled={pendente}
                value={equipe[p.codigo] ?? ""}
                onChange={(e) => trocar(p.codigo, e.target.value)}
              >
                <option value="">Ninguém</option>
                {pessoas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            ) : (
              <p className={`text-[14px] ${equipe[p.codigo] ? "" : "text-tx3"}`}>{equipe[p.codigo] ? nome(equipe[p.codigo]) : "Ninguém"}</p>
            )}
          </div>
        ))}
      </div>
      {erro && <p role="alert" className="mt-2 rounded-lg bg-dangerbg px-3 py-2 text-[13px] text-danger">{erro}</p>}
    </div>
  );
}

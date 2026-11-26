"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { excluirEntregavel, excluirLancamento } from "@/app/(app)/lancamentos/actions";

// Exclui o lançamento inteiro (com as tarefas dos entregáveis) ou um entregável. Sempre pede confirmação.
export function ExcluirLancamento({
  tipo, id, lancamentoId, nome,
}: { tipo: "lancamento" | "entregavel"; id: string; lancamentoId?: string; nome: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState("");

  function excluir() {
    setErro("");
    iniciar(async () => {
      const r = tipo === "lancamento" ? await excluirLancamento(id) : await excluirEntregavel(id, lancamentoId ?? "");
      if (r.erro) { setErro(r.erro); setConfirmando(false); return; }
      if (tipo === "lancamento") router.push("/lancamentos");
    });
  }

  if (!confirmando) {
    return (
      <span className="inline-flex items-center gap-2">
        <button type="button" className="btn btn-ghost !text-danger" onClick={() => setConfirmando(true)} aria-label={`Excluir ${nome}`}>
          <Trash2 size={15} /> Excluir
        </button>
        {erro && <span role="alert" className="text-[13px] text-danger">{erro}</span>}
      </span>
    );
  }
  return (
    <span role="alert" className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-dangerbg px-3 py-1.5 text-[13px] text-danger">
      {tipo === "lancamento" ? "Excluir o lançamento, o checklist e todas as tarefas dos entregáveis? Não dá para desfazer." : "Excluir o entregável e a tarefa dele? Não dá para desfazer."}
      <button type="button" className="btn !h-8 !text-danger" disabled={pendente} onClick={excluir}>
        {pendente && <Loader2 size={14} className="animate-spin" />} Sim, excluir
      </button>
      <button type="button" className="btn btn-ghost !h-8" onClick={() => setConfirmando(false)}>Cancelar</button>
    </span>
  );
}

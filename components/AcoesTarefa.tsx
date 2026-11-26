"use client";

import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { excluirTarefa, reabrirTarefa } from "@/app/(app)/acoes/actions";

// Desfazer a conclusão e excluir. Excluir pede confirmação e só aparece para admin.
export function AcoesTarefa({ id, concluida = false, admin, titulo }: { id: string; concluida?: boolean; admin: boolean; titulo: string }) {
  const [pendente, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState("");

  function rodar(fn: () => Promise<{ erro?: string }>) {
    setErro("");
    iniciar(async () => {
      const r = await fn();
      if (r.erro) setErro(r.erro);
      setConfirmando(false);
    });
  }

  if (!concluida && !admin) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {concluida && (
        <button type="button" className="btn btn-ghost" disabled={pendente} onClick={() => rodar(() => reabrirTarefa(id))}>
          {pendente ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />} Desfazer conclusão
        </button>
      )}
      {admin && !confirmando && (
        <button type="button" className="btn btn-ghost !text-danger" disabled={pendente} onClick={() => setConfirmando(true)} aria-label={`Excluir ${titulo}`}>
          <Trash2 size={15} /> Excluir
        </button>
      )}
      {admin && confirmando && (
        <span className="flex flex-wrap items-center gap-2 rounded-lg bg-dangerbg px-3 py-1.5 text-[13px] text-danger" role="alert">
          Excluir de vez? Não dá para desfazer.
          <button type="button" className="btn !h-8 !text-danger" disabled={pendente} onClick={() => rodar(() => excluirTarefa(id))}>
            {pendente && <Loader2 size={14} className="animate-spin" />} Sim, excluir
          </button>
          <button type="button" className="btn btn-ghost !h-8" onClick={() => setConfirmando(false)}>Cancelar</button>
        </span>
      )}
      {erro && <span role="alert" className="text-[13px] text-danger">{erro}</span>}
    </div>
  );
}

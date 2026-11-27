"use client";

import { Loader2, Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import Markdown from "react-markdown";
import { salvarPaginaBase } from "@/app/(app)/base-arco/actions";
import { EncontrosAcordeao } from "@/components/EncontrosAcordeao";

export function BaseArcoEditor({ id, titulo, conteudo, acordeao = false }: { id: string; titulo: string; conteudo: string; acordeao?: boolean }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(conteudo);
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();

  function salvar() {
    setErro("");
    iniciar(async () => {
      const r = await salvarPaginaBase(id, texto);
      if (r.erro) return setErro(r.erro);
      setEditando(false);
    });
  }

  return (
    <section className="panel p-5" aria-label={titulo}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-medium">{titulo}</h2>
        {!editando && (
          <button type="button" className="btn btn-ghost" onClick={() => { setTexto(conteudo); setEditando(true); }}>
            <Pencil size={15} /> Editar
          </button>
        )}
      </div>
      {editando ? (
        <div className="mt-4 space-y-3">
          <label htmlFor="base-texto" className="label block">Texto (markdown: ## título, * lista, **negrito**)</label>
          <textarea id="base-texto" className="field mono min-h-[420px] w-full text-[13px] leading-relaxed" value={texto} onChange={(e) => setTexto(e.target.value)} />
          {erro && <p role="alert" className="rounded-lg bg-dangerbg px-3 py-2 text-[13px] text-danger">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setEditando(false)}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={pendente} onClick={salvar}>
              {pendente && <Loader2 size={15} className="animate-spin" />} Salvar
            </button>
          </div>
        </div>
      ) : conteudo.trim() ? (
        acordeao ? (
          <EncontrosAcordeao conteudo={conteudo} />
        ) : (
          <div className="base-md mt-4 text-[14px] leading-relaxed text-tx2">
            <Markdown>{conteudo}</Markdown>
          </div>
        )
      ) : (
        <p className="mt-4 text-sm text-tx3">Página vazia. Use Editar para escrever.</p>
      )}
    </section>
  );
}

"use client";

import { Loader2, Send, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { comentarTarefa, excluirComentario, listarComentarios, type ListaComentarios } from "@/app/(app)/acoes/comentarios";

function quando(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).replace(",", " às");
}

// Conversa dentro da tarefa. Carrega só quando o card é aberto. Quem é marcado recebe um aviso.
export function Comentarios({ tarefaId }: { tarefaId: string }) {
  const [lista, setLista] = useState<ListaComentarios | null>(null);
  const [texto, setTexto] = useState("");
  const [marcados, setMarcados] = useState<string[]>([]);
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    let vivo = true;
    listarComentarios(tarefaId).then((r) => { if (vivo) setLista(r); });
    return () => { vivo = false; };
  }, [tarefaId]);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    iniciar(async () => {
      const r = await comentarTarefa(tarefaId, texto, marcados);
      if (r.erro) return setErro(r.erro);
      setTexto(""); setMarcados([]);
      setLista(await listarComentarios(tarefaId));
    });
  }

  function apagar(id: string) {
    setErro("");
    iniciar(async () => {
      const r = await excluirComentario(id);
      if (r.erro) return setErro(r.erro);
      setLista(await listarComentarios(tarefaId));
    });
  }

  const alterna = (id: string) => setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  return (
    <div>
      <p className="label mb-1.5">Comentários</p>
      {!lista && <p className="text-xs text-tx2">Carregando...</p>}
      {lista?.erro && <p role="alert" className="text-xs text-danger">{lista.erro}</p>}
      {lista?.itens && lista.itens.length === 0 && <p className="text-xs text-tx2">Nenhum comentário ainda.</p>}
      {lista?.itens && lista.itens.length > 0 && (
        <ul className="space-y-2.5">
          {lista.itens.map((c) => (
            <li key={c.id} className="rounded-lg bg-panel2 px-3 py-2">
              <p className="flex items-center justify-between gap-2 text-xs text-tx2">
                <span><b className="font-medium text-tx">{c.autor}</b> · {quando(c.criado_em)}</span>
                {(c.meu || lista.sou_admin) && (
                  <button type="button" className="btn btn-ghost !h-6 !w-6 !px-0" aria-label="Apagar comentário" title="Apagar" disabled={pendente} onClick={() => apagar(c.id)}><Trash2 size={13} /></button>
                )}
              </p>
              <p className="mt-1 whitespace-pre-line text-[13px]">{c.texto}</p>
            </li>
          ))}
        </ul>
      )}
      {lista?.itens && (
        <form onSubmit={enviar} className="mt-3 space-y-2">
          <label htmlFor={`co-${tarefaId}`} className="sr-only">Novo comentário</label>
          <textarea id={`co-${tarefaId}`} className="field" rows={2} maxLength={1000} placeholder="Escreva o que a equipe precisa saber" value={texto} onChange={(e) => setTexto(e.target.value)} />
          {(lista.pessoas ?? []).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-tx2">Avisar:</span>
              {lista.pessoas!.map((p) => (
                <button key={p.id} type="button" aria-pressed={marcados.includes(p.id)} onClick={() => alterna(p.id)}
                  className={`chip ${marcados.includes(p.id) ? "bg-goldbg text-gold" : "bg-panel2 text-tx2"}`}>{p.nome.split(" ")[0]}</button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-end gap-3">
            {erro && <span role="alert" className="mr-auto text-xs text-danger">{erro}</span>}
            <button type="submit" className="btn btn-primary" disabled={pendente || !texto.trim()}>
              {pendente ? <Loader2 size={15} className="animate-spin" /> : <Send size={14} />} Comentar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

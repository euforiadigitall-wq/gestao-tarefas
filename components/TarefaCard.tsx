"use client";

import { Etiquetas } from "@/components/Etiqueta";
import { Check, ChevronDown, ExternalLink, Loader2, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { adicionarLink, avancarEtapa, concluirTarefa, devolverEtapa, removerLink, salvarDescricao } from "@/app/(app)/hoje/actions";
import { LinksCampo } from "@/components/LinksCampo";
import { descreverPrazo, type TomPrazo } from "@/lib/datas";
import { rotuloLink } from "@/lib/links";
import type { TarefaLink, TarefaView } from "@/lib/tipos";

const cores: Record<TomPrazo, string> = {
  atrasada: "bg-dangerbg text-danger",
  hoje: "bg-goldbg text-gold",
  breve: "bg-infobg text-info",
  neutro: "bg-panel2 text-tx2",
};
const trilho: Record<TomPrazo, string> = {
  atrasada: "bg-[var(--danger)]",
  hoje: "bg-[var(--gold)]",
  breve: "bg-[var(--info)]",
  neutro: "bg-[var(--line-strong)]",
};

export function TarefaCard({ t, hoje, links = [] }: { t: TarefaView; hoje: string; links?: TarefaLink[] }) {
  const [pendente, iniciar] = useTransition();
  const [devolvendo, setDevolvendo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [detalhes, setDetalhes] = useState(false);
  const [desc, setDesc] = useState(t.notas ?? "");
  const [salvo, setSalvo] = useState(true);
  const prazo = descreverPrazo(t.prazo_vez ?? t.prazo, hoje);
  const esteira = t.etapa_atual !== null;

  function rodar(fn: () => Promise<{ erro?: string }>) {
    setErro("");
    iniciar(async () => {
      const r = await fn();
      if (r.erro) setErro(r.erro);
      else {
        setDevolvendo(false);
        setMotivo("");
      }
    });
  }

  return (
    <article className="panel relative overflow-hidden pl-5 pr-4 py-3.5">
      <span className={`absolute inset-y-0 left-0 w-1 ${trilho[prazo.tom]}`} aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <h3 className="text-[15px] font-medium leading-snug">{t.titulo}</h3>
          {t.lancamentos && t.lancamentos.length > 0 && <p className="mt-1 flex flex-wrap gap-1"><Etiquetas itens={t.lancamentos} /></p>}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-tx2">
            {t.cliente ? <span>{t.cliente}</span> : <span className="text-tx3">Interna</span>}
            {t.area && <span className="mono text-tx3">· {t.area}</span>}
            {esteira && (
              <>
                <span className="text-tx3">·</span>
                <span className="chip bg-infobg text-info">{t.estado_atual}</span>
                {t.proxima_acao && <span>Sua ação: <b className="font-medium text-tx">{t.proxima_acao}</b></span>}
              </>
            )}
          </p>
        </div>
        <span className={`chip ${cores[prazo.tom]}`}>{prazo.texto}</span>
        <button type="button" className="btn btn-ghost !h-9 !w-9 !px-0" aria-expanded={detalhes} aria-label={detalhes ? "Fechar detalhes" : "Abrir detalhes"} title="Descrição e links" onClick={() => setDetalhes((v) => !v)}>
          <ChevronDown size={16} className={`transition-transform ${detalhes ? "rotate-180" : ""}`} />
        </button>
        <div className="flex items-center gap-2">
          {esteira && (
            <button type="button" className="btn btn-ghost" disabled={pendente} onClick={() => setDevolvendo((v) => !v)}>
              <Undo2 size={15} /> Devolver
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={pendente}
            onClick={() => rodar(() => (esteira ? avancarEtapa(t.id) : concluirTarefa(t.id)))}
          >
            {pendente ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {esteira ? "Concluir etapa" : "Concluir"}
          </button>
        </div>
      </div>

      {!detalhes && (t.notas || links.length > 0) && (
        <div className="mt-2.5 space-y-2">
          {t.notas && <p className="line-clamp-2 whitespace-pre-line text-[13px] text-tx2">{t.notas}</p>}
          {links.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {links.map((l) => (
                <li key={l.id}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="chip bg-infobg text-info hover:underline">
                    <ExternalLink size={12} aria-hidden="true" /> {rotuloLink(l.url, l.titulo)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {detalhes && (
        <div className="mt-3 space-y-4 border-t border-[var(--line)] pt-3">
          <div>
            <label htmlFor={`d-${t.id}`} className="label mb-1.5 flex items-center justify-between">
              <span>Descrição</span>
              <span className="mono normal-case text-tx3">{desc.length}/600</span>
            </label>
            <textarea id={`d-${t.id}`} className="field" rows={3} maxLength={600} placeholder="O essencial. O resto fica no link." value={desc}
              onChange={(e) => { setDesc(e.target.value); setSalvo(false); }} />
            <div className="mt-2 flex items-center justify-end gap-3">
              {salvo ? <span className="text-xs text-tx3">Salvo</span> : <span className="text-xs text-tx2">Alterações não salvas</span>}
              <button type="button" className="btn" disabled={pendente || salvo} onClick={() => rodar(async () => { const r = await salvarDescricao(t.id, desc); if (!r.erro) setSalvo(true); return r; })}>
                Salvar descrição
              </button>
            </div>
          </div>
          <div>
            <p className="label mb-1.5">Links</p>
            <LinksCampo
              ocupado={pendente}
              itens={links.map((l) => ({ chave: l.id, titulo: l.titulo, url: l.url }))}
              onAdicionar={async (l) => { const r = await adicionarLink(t.id, l); if (r.erro) return r.erro; }}
              onRemover={(k) => rodar(() => removerLink(k))}
            />
          </div>
        </div>
      )}

      {devolvendo && (
        <div className="mt-3 border-t border-[var(--line)] pt-3">
          <label htmlFor={`m-${t.id}`} className="label mb-1.5 block">Motivo da devolução</label>
          <textarea id={`m-${t.id}`} className="field" placeholder="O que precisa ser ajustado?" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setDevolvendo(false)}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={pendente} onClick={() => rodar(() => devolverEtapa(t.id, motivo))}>
              Devolver peça
            </button>
          </div>
        </div>
      )}
      {erro && <p role="alert" className="mt-3 rounded-lg bg-dangerbg px-3 py-2 text-[13px] text-danger">{erro}</p>}
    </article>
  );
}

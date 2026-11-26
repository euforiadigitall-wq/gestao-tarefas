"use client";

import { Check, Loader2, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { avancarEtapa, concluirTarefa, devolverEtapa } from "@/app/(app)/hoje/actions";
import { descreverPrazo, type TomPrazo } from "@/lib/datas";
import type { TarefaView } from "@/lib/tipos";

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

export function TarefaCard({ t, hoje }: { t: TarefaView; hoje: string }) {
  const [pendente, iniciar] = useTransition();
  const [devolvendo, setDevolvendo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
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

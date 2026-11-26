"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import { useState, useTransition } from "react";
import { detalhesTarefa, type DetalheTarefa } from "@/app/(app)/acoes/actions";
import { AcoesTarefa } from "@/components/AcoesTarefa";
import { Etiquetas } from "@/components/Etiqueta";
import { ddmm } from "@/lib/datas";
import { rotuloLink } from "@/lib/links";
import type { EtiquetaLanc } from "@/lib/tipos";

export interface DadosCard {
  id: string;
  titulo: string;
  linha: string;
  area: string | null;
  bloco: string | null;
  lancamentos: EtiquetaLanc[] | null;
  estado: string | null;
  proxima: string | null;
  prazoTexto: string;
  prazoClasse: string;
  trilho: string;
}

// Card do Quadro: clique para abrir etapas, descrição e links.
export function CardQuadro({ d, admin }: { d: DadosCard; admin: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [det, setDet] = useState<DetalheTarefa | null>(null);
  const [pendente, iniciar] = useTransition();

  function alternar() {
    const abrir = !aberto;
    setAberto(abrir);
    if (abrir && !det) iniciar(async () => setDet(await detalhesTarefa(d.id)));
  }

  return (
    <article className="panel relative overflow-hidden py-3 pl-4 pr-3">
      <span className={`absolute inset-y-0 left-0 w-1 ${d.trilho}`} aria-hidden="true" />
      <button type="button" onClick={alternar} aria-expanded={aberto} className="block w-full text-left">
        <span className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium leading-snug">{d.titulo}</span>
          <ChevronDown size={16} className={`mt-0.5 shrink-0 text-tx3 transition-transform ${aberto ? "rotate-180" : ""}`} aria-hidden="true" />
        </span>
        {d.lancamentos && d.lancamentos.length > 0 && <span className="mt-1 flex flex-wrap gap-1"><Etiquetas itens={d.lancamentos} /></span>}
        <span className="mt-1 block text-xs text-tx2">{d.linha}{d.area && <span className="mono text-tx3"> · {d.area}</span>}</span>
        {d.bloco && <span className="mono mt-1 block text-[11px] text-tx3">{d.bloco}</span>}
        <span className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {d.estado && <span className="chip bg-infobg text-info">{d.estado}</span>}
          {d.proxima && <span className="text-xs text-tx2">Próxima: <b className="font-medium text-tx">{d.proxima}</b></span>}
          <span className={`chip ml-auto ${d.prazoClasse}`}>{d.prazoTexto}</span>
        </span>
      </button>
      {aberto && (
        <div className="mt-3 space-y-3 border-t border-[var(--line)] pt-3">
          {pendente && !det && <p className="text-xs text-tx2">Carregando...</p>}
          {det?.erro && <p role="alert" className="text-xs text-danger">{det.erro}</p>}
          {det?.etapas && det.etapas.length > 0 && (
            <ol className="space-y-1.5" aria-label="Etapas">
              {det.etapas.map((e) => (
                <li key={e.ordem} className={`flex flex-wrap items-baseline gap-x-2 text-[13px] ${e.concluida ? "text-tx2 line-through decoration-[var(--line-strong)]" : "text-tx"}`}>
                  <span className="mono text-tx3">{e.ordem}.</span>
                  <span className="font-medium">{e.nome}</span>
                  <span className="text-tx2">{e.responsavel?.split(" ")[0] ?? "Sem responsável"}</span>
                  {e.prazo && <span className="mono ml-auto text-xs text-tx2">{ddmm(e.prazo)}</span>}
                </li>
              ))}
            </ol>
          )}
          {det?.notas && <p className="whitespace-pre-line text-[13px] text-tx2">{det.notas}</p>}
          {det?.links && det.links.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {det.links.map((l) => (
                <li key={l.id}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="chip bg-infobg text-info hover:underline">
                    <ExternalLink size={12} aria-hidden="true" /> {rotuloLink(l.url, l.titulo)}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {det && !det.erro && !det.notas && !(det.links?.length) && !(det.etapas?.length) && <p className="text-xs text-tx2">Sem detalhes. Quem faz a tarefa pode abrir no Hoje.</p>}
          <AcoesTarefa id={d.id} admin={admin} titulo={d.titulo} />
        </div>
      )}
    </article>
  );
}

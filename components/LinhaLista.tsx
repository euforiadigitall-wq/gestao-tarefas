import { Avatar, Esteira } from "@/components/Esteira";
import { Etiquetas } from "@/components/Etiqueta";
import type { EtiquetaLanc } from "@/lib/tipos";

export interface DadosLinha {
  chave: string;
  titulo: string;
  sub: string;
  lancamentos: EtiquetaLanc[] | null;
  etapa: number | null;
  total: number;
  acao: string | null;
  quem: string | null;
  prazoTexto: string;
  prazoClasse: string;
  futuro?: boolean;
}

const GRID = "md:grid-cols-[84px_minmax(0,1fr)_190px_36px_96px]";

export function CabecalhoLista() {
  return (
    <div className={`hidden gap-3 border-b border-[var(--line)] bg-panel2 px-4 py-2 md:grid ${GRID}`} aria-hidden="true">
      {["Lançamento", "Peça", "Esteira", "Quem", "Prazo"].map((c) => <span key={c} className="label !text-[10px]">{c}</span>)}
    </div>
  );
}

// Linha compacta, para a visão em lista do Quadro e da Agenda.
export function LinhaLista({ d }: { d: DadosLinha }) {
  return (
    <li className={`grid items-center gap-x-3 gap-y-1.5 border-t border-[var(--line)] px-4 py-2.5 first:border-t-0 ${GRID} ${d.futuro ? "border-dashed" : ""}`}>
      <span className="flex flex-wrap gap-1">{d.lancamentos && d.lancamentos.length > 0 ? <Etiquetas itens={d.lancamentos} /> : <span className="text-xs text-tx3">sem lançamento</span>}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{d.titulo}</span>
        <span className="block truncate text-xs text-tx2">{d.sub}</span>
      </span>
      <span className="flex items-center gap-2 text-xs text-tx2">
        {d.etapa !== null && d.total > 1 ? <Esteira atual={d.etapa} total={d.total} nome={d.acao} /> : <span className="text-tx3">sem esteira</span>}
        {d.acao && <span className="truncate">{d.acao}</span>}
      </span>
      <span><Avatar nome={d.quem} /></span>
      <span className={`chip justify-self-start ${d.prazoClasse}`}>{d.prazoTexto}</span>
    </li>
  );
}

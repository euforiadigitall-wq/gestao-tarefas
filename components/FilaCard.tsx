import { Hourglass } from "lucide-react";
import { ddmm } from "@/lib/datas";
import type { TarefaFila } from "@/lib/tipos";

export function FilaCard({ f }: { f: TarefaFila }) {
  return (
    <article className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] border border-dashed border-[var(--line-strong)] px-5 py-3 text-tx3">
      <Hourglass size={15} aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-56">
        <h3 className="text-[14px] leading-snug">{f.titulo}</h3>
        <p className="mt-0.5 text-[12px]">
          {f.cliente ?? "Interna"} · sua ação: {f.acao}
        </p>
      </div>
      <span className="chip border border-[var(--line)]">na fila · previsto {ddmm(f.prazo)}</span>
    </article>
  );
}

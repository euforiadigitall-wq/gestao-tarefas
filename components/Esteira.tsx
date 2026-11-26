// Linha de etapas da peça: concluídas, atual e futuras. Só desenho, sem estado.
export function Esteira({ atual, total, nome, concluida = false }: { atual: number; total: number; nome?: string | null; concluida?: boolean }) {
  if (total < 2) return null;
  const passos = Array.from({ length: total }, (_, i) => i + 1);
  const rotulo = concluida ? `Todas as ${total} etapas concluídas` : `Etapa ${atual} de ${total}${nome ? `: ${nome}` : ""}`;
  return (
    <span className="inline-flex items-center" role="img" aria-label={rotulo} title={rotulo}>
      {passos.map((n, i) => {
        const feita = concluida || n < atual;
        const agora = !concluida && n === atual;
        return (
          <span key={n} className="inline-flex items-center">
            {i > 0 && <span className={`h-[1.5px] w-5 ${n <= atual || concluida ? "bg-[var(--ok)]" : "bg-[var(--line-strong)]"}`} aria-hidden="true" />}
            <span
              aria-hidden="true"
              className={`h-[9px] w-[9px] rounded-full border-[1.5px] ${feita ? "border-[var(--ok)] bg-[var(--ok)]" : agora ? "border-[var(--gold)] bg-[var(--gold)] shadow-[0_0_0_3px_var(--gold-bg)]" : "border-[var(--line-strong)]"}`}
            />
          </span>
        );
      })}
    </span>
  );
}

export function Avatar({ nome }: { nome: string | null | undefined }) {
  const n = (nome ?? "").trim();
  return (
    <span className="mono inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-goldbg text-[10px] font-medium text-gold" title={n || "Sem responsável"} aria-label={n || "Sem responsável"}>
      {n ? n.slice(0, 2).toUpperCase() : "?"}
    </span>
  );
}

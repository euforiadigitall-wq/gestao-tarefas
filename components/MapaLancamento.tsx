
export interface Folha {
  texto: string;
  tom: "ok" | "atrasado" | "critico" | "aberto";
  tipo: "item" | "entregavel";
}
export interface RamoEtapa {
  id: string;
  nome: string;
  folhas: Folha[];
}

const COR: Record<Folha["tom"], string> = {
  ok: "var(--ok)",
  atrasado: "var(--danger)",
  critico: "var(--gold)",
  aberto: "var(--tx-3)",
};

const LINHA = 24;
const corta = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

// Mapa mental do lançamento: leitura dos mesmos dados do checklist e dos entregáveis.
// Árvore da esquerda para a direita: lançamento, etapas, itens.
export function MapaLancamento({ codigo, cor, ramos }: { codigo: string; cor: string; ramos: RamoEtapa[] }) {
  const topo = 16;
  let y = topo;
  const pos = ramos.map((r) => {
    const linhas = Math.max(r.folhas.length, 1);
    const alturaBloco = linhas * LINHA;
    const centro = y + alturaBloco / 2;
    const folhas = r.folhas.map((f, i) => ({ ...f, y: y + i * LINHA + LINHA / 2 }));
    const ini = y;
    y += alturaBloco + 14;
    return { ...r, centro, folhas, ini };
  });
  const altura = Math.max(y + 6, 120);
  const cy = altura / 2;

  return (
    <div>
      <svg viewBox={`0 0 680 ${altura}`} width="100%" role="img" aria-label={`Mapa do lançamento ${codigo}`}>
        <title>{`Mapa do lançamento ${codigo}`}</title>
        <desc>Etapas do lançamento e, em cada uma, os itens do checklist e os entregáveis, coloridos pelo estado.</desc>
        {pos.map((r) => (
          <g key={r.id} fill="none" stroke="var(--line-strong)" strokeWidth="1">
            <path d={`M 118 ${cy} C 150 ${cy}, 150 ${r.centro}, 178 ${r.centro}`} />
            {r.folhas.map((f, i) => (
              <path key={i} d={`M 318 ${r.centro} C 336 ${r.centro}, 336 ${f.y}, 352 ${f.y}`} />
            ))}
          </g>
        ))}
        <rect x="8" y={cy - 20} width="110" height="40" rx="10" style={{ fill: `var(--tag-${cor})`, opacity: 0.16 }} />
        <rect x="8" y={cy - 20} width="110" height="40" rx="10" fill="none" style={{ stroke: `var(--tag-${cor})` }} strokeWidth="1.2" />
        <text x="63" y={cy + 5} textAnchor="middle" fontSize="14" fontWeight="600" style={{ fill: `var(--tag-${cor})` }}>{corta(codigo, 12)}</text>
        {pos.map((r) => (
          <g key={`n-${r.id}`}>
            <rect x="178" y={r.centro - 14} width="140" height="28" rx="8" style={{ fill: "var(--panel-2)", stroke: "var(--line-strong)" }} strokeWidth="1" />
            <text x="248" y={r.centro + 4.5} textAnchor="middle" fontSize="12.5" fontWeight="500" style={{ fill: "var(--tx)" }}>{corta(r.nome, 20)}</text>
            {r.folhas.length === 0 && (
              <text x="358" y={r.centro + 4} fontSize="12" style={{ fill: "var(--tx-3)" }}>sem itens</text>
            )}
            {r.folhas.map((f, i) => (
              <g key={i}>
                <circle cx="362" cy={f.y} r="4" style={{ fill: COR[f.tom] }} />
                {f.tipo === "entregavel" && <rect x="357" y={f.y - 5} width="10" height="10" rx="2.5" fill="none" style={{ stroke: COR[f.tom] }} strokeWidth="1.2" />}
                <text x="374" y={f.y + 4} fontSize="12" style={{ fill: f.tom === "ok" ? "var(--tx-3)" : "var(--tx)" }} textDecoration={f.tom === "ok" ? "line-through" : undefined}>
                  {corta(f.texto, 46)}
                </text>
              </g>
            ))}
          </g>
        ))}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-tx2" aria-label="Legenda do mapa">
        {([["ok", "feito"], ["atrasado", "atrasado"], ["critico", "crítico em aberto"], ["aberto", "em aberto"]] as const).map(([t, n]) => (
          <li key={t} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COR[t] }} />{n}</li>
        ))}
        <li className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[3px] border" style={{ borderColor: "var(--tx-2)" }} />entregável (círculo com borda quadrada)</li>
      </ul>
    </div>
  );
}


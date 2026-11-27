"use client";

import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import Markdown from "react-markdown";

interface Secao { titulo: string; previa: string; corpo: string }

// Divide o markdown pelos títulos do nível mais alto que aparece (nas páginas de encontros é "### Encontro N · data").
// Devolve null quando não há títulos para separar: aí a página é mostrada como texto corrido.
export function dividirPorTitulos(md: string): { intro: string; secoes: Secao[] } | null {
  const linhas = md.replace(/\r\n/g, "\n").split("\n");
  const ehTitulo = (l: string) => /^(#{1,6})\s+\S/.exec(l);
  let nivel = 7;
  let codigo = false;
  for (const l of linhas) {
    if (/^\s*```/.test(l)) codigo = !codigo;
    if (codigo) continue;
    const m = ehTitulo(l);
    if (m) nivel = Math.min(nivel, m[1].length);
  }
  if (nivel === 7) return null;

  const intro: string[] = [];
  const blocos: { titulo: string; linhas: string[] }[] = [];
  codigo = false;
  for (const l of linhas) {
    if (/^\s*```/.test(l)) codigo = !codigo;
    const m = codigo ? null : ehTitulo(l);
    if (m && m[1].length === nivel) {
      blocos.push({ titulo: l.replace(/^#{1,6}\s+/, "").replace(/\s+#+\s*$/, "").replace(/[*_`]/g, "").trim(), linhas: [] });
    } else if (blocos.length) {
      blocos[blocos.length - 1].linhas.push(l);
    } else {
      intro.push(l);
    }
  }
  if (blocos.length < 2) return null;

  const secoes = blocos.map((b) => {
    const corpo = b.linhas.join("\n").trim();
    const p = /^\*\*Estado depois deste encontro:\*\*\s*(.+)$/m.exec(corpo);
    return { titulo: b.titulo, previa: p ? p[1].trim() : "", corpo };
  });
  return { intro: intro.join("\n").trim(), secoes };
}

export function EncontrosAcordeao({ conteudo }: { conteudo: string }) {
  const partes = useMemo(() => dividirPorTitulos(conteudo), [conteudo]);
  const total = partes?.secoes.length ?? 0;
  // O primeiro (o mais recente) já abre; os outros ficam recolhidos.
  const [abertos, setAbertos] = useState<boolean[]>(() => Array.from({ length: total }, (_, i) => i === 0));

  if (!partes) {
    return (
      <div className="base-md mt-4 text-[14px] leading-relaxed text-tx2">
        <Markdown>{conteudo}</Markdown>
      </div>
    );
  }

  const todosAbertos = abertos.every(Boolean);
  const mudar = (i: number, aberto: boolean) => setAbertos((a) => a.map((v, j) => (j === i ? aberto : v)));

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-tx3">{total} {total === 1 ? "registro" : "registros"}</p>
        <button type="button" className="btn btn-ghost" onClick={() => setAbertos(Array.from({ length: total }, () => !todosAbertos))}>
          {todosAbertos ? "Recolher tudo" : "Expandir tudo"}
        </button>
      </div>

      {partes.intro && (
        <div className="base-md base-md-sec mt-3 text-[14px] leading-relaxed text-tx2">
          <Markdown>{partes.intro}</Markdown>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {partes.secoes.map((s, i) => (
          <details key={`${i}-${s.titulo}`} open={abertos[i]} onToggle={(e) => mudar(i, e.currentTarget.open)}
            className="group rounded-lg border border-[var(--line)] bg-panel2">
            <summary className="flex cursor-pointer list-none items-start gap-2.5 rounded-lg px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden hover:bg-panel">
              <ChevronRight size={16} aria-hidden="true" className="mt-[3px] shrink-0 text-tx3 transition-transform group-open:rotate-90" />
              <span className="min-w-0">
                <span className="block text-[15px] font-medium text-tx">{s.titulo}</span>
                {s.previa && <span className="mt-0.5 line-clamp-2 block text-[13px] text-tx3 group-open:hidden">{s.previa}</span>}
              </span>
            </summary>
            <div className="base-md base-md-sec border-t border-[var(--line)] px-4 pb-4 pt-1 text-[14px] leading-relaxed text-tx2">
              <Markdown>{s.corpo}</Markdown>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

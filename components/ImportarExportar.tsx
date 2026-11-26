"use client";

import { Download, Loader2, Upload } from "lucide-react";
import { useState, useTransition } from "react";
import { importarTarefas, type ResultadoImportacao } from "@/app/(app)/acoes/actions";

const MODELO = "Título;Cliente;Área;Responsável;Prazo;Lançamento;Descrição\r\nRevisar stories de captação;Virgínia Arrais;Lançamentos;Bia;28/11/2026;2 TJRS;\r\n";

// Exportar vale para todos (cada um exporta o que vê). Importar é só de admin.
export function ImportarExportar({
  admin, filtros = "", lancamentoId,
}: { admin: boolean; filtros?: string; lancamentoId?: string }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [res, setRes] = useState<ResultadoImportacao | null>(null);
  const [pendente, iniciar] = useTransition();
  const link = (extra: string) => `/exportar?${[filtros, extra].filter(Boolean).join("&")}`;

  async function arquivo(f: File | undefined) {
    if (!f) return;
    if (f.size > 400_000) return setRes({ erro: "Arquivo grande demais. Divida em partes de até 300 tarefas." });
    setRes(null);
    setTexto(await f.text());
  }

  function importar() {
    setRes(null);
    iniciar(async () => {
      const r = await importarTarefas(texto, lancamentoId);
      setRes(r);
      if (r.criadas && !r.erros) setTexto("");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a className="btn" href={link("")} download><Download size={15} /> Exportar</a>
      <a className="btn btn-ghost" href={link("concluidas=1")} download title="Inclui as já concluídas">Exportar com concluídas</a>
      {admin && (
        <button type="button" className="btn" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
          <Upload size={15} /> Importar
        </button>
      )}
      {admin && aberto && (
        <div className="panel mt-1 w-full space-y-3 p-5">
          <p className="text-[13px] text-tx2">
            Cole a planilha ou envie o arquivo .csv. A primeira linha é o cabeçalho: Título, Cliente, Área, Responsável, Prazo (dd/mm/aaaa), Lançamento, Descrição.
            Só o título é obrigatório. Com cliente, a área é obrigatória. Vários lançamentos na mesma célula: use +. Se uma linha tiver problema, nada é importado.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <a className="btn btn-ghost" href={`data:text/csv;charset=utf-8,${encodeURIComponent("﻿" + MODELO)}`} download="modelo-importar-tarefas.csv">Baixar modelo</a>
            <label className="btn btn-ghost cursor-pointer">
              Escolher arquivo
              <input type="file" accept=".csv,.txt,text/csv" className="sr-only" onChange={(e) => arquivo(e.target.files?.[0])} />
            </label>
          </div>
          <label htmlFor="imp-texto" className="sr-only">Planilha</label>
          <textarea id="imp-texto" className="field mono" rows={6} placeholder="Título;Cliente;Área;Responsável;Prazo;Lançamento" value={texto} onChange={(e) => { setTexto(e.target.value); setRes(null); }} />
          {res?.erros && (
            <ul role="alert" className="space-y-1 rounded-lg bg-dangerbg px-3 py-2 text-[13px] text-danger">
              {res.erros.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          {res?.erro && <p role="alert" className="rounded-lg bg-dangerbg px-3 py-2 text-[13px] text-danger">{res.erro}</p>}
          {res?.criadas ? <p role="status" className="rounded-lg bg-okbg px-3 py-2 text-[13px] text-ok">{res.criadas} tarefas importadas.</p> : null}
          <div className="flex justify-end">
            <button type="button" className="btn btn-primary" disabled={pendente || !texto.trim()} onClick={importar}>
              {pendente && <Loader2 size={15} className="animate-spin" />} Importar tarefas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { Check, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { definirResponsavelItem, marcarItem } from "@/app/(app)/lancamentos/actions";
import { Etiqueta } from "@/components/Etiqueta";
import { descreverPrazo } from "@/lib/datas";
import type { Opcao } from "@/lib/tipos";
import { corPrazo } from "@/lib/visual";

export interface ItemLanc {
  id: string;
  lancamento_id: string;
  texto: string;
  critico: boolean;
  prazo: string | null;
  feito: boolean;
  pessoa_id: string | null;
  pessoa: string | null;
}

// Uma linha do checklist do lançamento. Na tela do lançamento a etiqueta não é necessária;
// no Hoje ela mostra de qual lançamento é o item.
export function ItemChecklist({
  item, hoje, podeMarcar, admin, pessoas, etiqueta,
}: {
  item: ItemLanc; hoje: string; podeMarcar: boolean; admin: boolean; pessoas?: Opcao[];
  etiqueta?: { codigo: string; cor: string };
}) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const prazo = item.prazo && !item.feito ? descreverPrazo(item.prazo, hoje) : null;

  function marcar() {
    setErro("");
    iniciar(async () => {
      const r = await marcarItem(item.id, !item.feito, item.lancamento_id);
      if (r.erro) setErro(r.erro);
    });
  }
  function atribuir(pessoaId: string) {
    setErro("");
    iniciar(async () => {
      const r = await definirResponsavelItem(item.id, pessoaId, item.lancamento_id);
      if (r.erro) setErro(r.erro);
    });
  }

  return (
    <li className="border-t border-[var(--line)] py-2.5 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={item.feito}
          aria-label={item.feito ? `Desmarcar: ${item.texto}` : `Marcar como feito: ${item.texto}`}
          disabled={!podeMarcar || pendente}
          onClick={marcar}
          title={podeMarcar ? undefined : "Só o responsável ou um admin marca"}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed ${
            item.feito ? "border-[var(--ok)] bg-okbg text-ok" : "border-[var(--line-strong)] bg-transparent text-transparent hover:border-[var(--tx-2)]"
          }`}
        >
          {pendente ? <Loader2 size={12} className="animate-spin text-tx2" /> : <Check size={13} />}
        </button>
        <span className={`min-w-0 flex-1 basis-56 text-[14px] leading-snug ${item.feito ? "text-tx3 line-through" : ""}`}>
          {etiqueta && <span className="mr-2 inline-block align-middle"><Etiqueta codigo={etiqueta.codigo} cor={etiqueta.cor} /></span>}
          {item.texto}
        </span>
        {item.critico && !item.feito && <span className="chip bg-goldbg text-gold">crítico</span>}
        {prazo && <span className={`chip ${corPrazo[prazo.tom]}`}>{prazo.texto}</span>}
        {admin && pessoas ? (
          <select
            aria-label={`Responsável por: ${item.texto}`}
            className={`field !h-8 !w-auto min-w-[130px] !py-0 text-[13px] ${item.pessoa_id ? "" : "!border-[var(--danger)]"}`}
            value={item.pessoa_id ?? ""}
            disabled={pendente}
            onChange={(e) => atribuir(e.target.value)}
          >
            <option value="">Sem responsável</option>
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        ) : (
          <span className={`text-[13px] ${item.pessoa ? "text-tx2" : "text-danger"}`}>{item.pessoa ?? "Sem responsável"}</span>
        )}
      </div>
      {erro && <p role="alert" className="mt-1.5 text-[12px] text-danger">{erro}</p>}
    </li>
  );
}

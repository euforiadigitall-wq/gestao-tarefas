"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { reatribuirTarefas } from "@/app/(app)/admin/actions";
import type { Opcao } from "@/lib/tipos";

// Passa todas as tarefas abertas de uma pessoa para outra (férias, saída). Quem recebe ganha um aviso só.
export function ReatribuirTarefas({ pessoas }: { pessoas: Opcao[] }) {
  const [de, setDe] = useState("");
  const [para, setPara] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const nome = (id: string) => pessoas.find((p) => p.id === id)?.nome ?? "";

  function passar() {
    setMsg(null);
    iniciar(async () => {
      const r = await reatribuirTarefas(de, para);
      setConfirmando(false);
      if (r.erro) return setMsg({ tom: "erro", texto: r.erro });
      const n = r.quantidade ?? 0;
      setMsg({ tom: "ok", texto: n === 0 ? `${nome(de)} não tinha tarefas abertas.` : `${n} tarefa${n > 1 ? "s" : ""} passada${n > 1 ? "s" : ""} de ${nome(de)} para ${nome(para)}.` });
    });
  }

  return (
    <section className="panel mt-6 p-5" aria-labelledby="reat-t">
      <h2 id="reat-t" className="text-[15px] font-medium">Passar tarefas de uma pessoa para outra</h2>
      <p className="mt-1 text-sm text-tx2">Serve para férias ou saída. Vão todas as tarefas abertas, as etapas que ainda não foram feitas e os itens de checklist em aberto. O histórico fica como está.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="re-de" className="label mb-1.5 block">De</label>
          <select id="re-de" className="field" value={de} onChange={(e) => { setDe(e.target.value); setConfirmando(false); setMsg(null); }}>
            <option value="">Escolha</option>
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="re-para" className="label mb-1.5 block">Para</label>
          <select id="re-para" className="field" value={para} onChange={(e) => { setPara(e.target.value); setConfirmando(false); setMsg(null); }}>
            <option value="">Escolha</option>
            {pessoas.filter((p) => p.id !== de).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
        {!confirmando ? (
          <button type="button" className="btn" disabled={!de || !para || de === para} onClick={() => setConfirmando(true)}>Passar tarefas</button>
        ) : (
          <span className="flex gap-2">
            <button type="button" className="btn btn-primary" disabled={pendente} onClick={passar}>
              {pendente && <Loader2 size={15} className="animate-spin" />} Confirmar
            </button>
            <button type="button" className="btn btn-ghost" disabled={pendente} onClick={() => setConfirmando(false)}>Cancelar</button>
          </span>
        )}
      </div>
      {confirmando && <p className="mt-3 text-sm text-tx2">Todas as tarefas abertas de <b className="font-medium text-tx">{nome(de)}</b> passam para <b className="font-medium text-tx">{nome(para)}</b>. Para voltar, é preciso fazer o caminho inverso.</p>}
      {msg && <p role={msg.tom === "erro" ? "alert" : "status"} className={`mt-3 text-sm ${msg.tom === "erro" ? "text-danger" : "text-tx"}`}>{msg.texto}</p>}
    </section>
  );
}

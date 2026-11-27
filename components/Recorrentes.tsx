"use client";

import { Loader2, Pause, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { alternarRecorrente, excluirRecorrente, gerarAgora, salvarRecorrente, type DadosRecorrente } from "@/app/(app)/recorrentes/actions";
import { ddmm } from "@/lib/datas";
import type { Area, LancamentoOpcao, Opcao } from "@/lib/tipos";

export interface LinhaRecorrente {
  id: string;
  titulo: string;
  cliente_id: string | null;
  area_id: string | null;
  responsavel_id: string;
  responsaveis_extras: string[] | null;
  lancamento_id: string | null;
  frequencia: "diaria_util" | "semanal" | "mensal";
  dias_semana: number[] | null;
  intervalo_semanas: number;
  dia_mes: number | null;
  ultimo_dia_util: boolean;
  prazo_dias_uteis: number;
  horario: string | null;
  inicio: string;
  fim: string | null;
  notas: string | null;
  ativo: boolean;
  ultima_geracao: string | null;
}

const DIAS = [{ n: 1, c: "Seg" }, { n: 2, c: "Ter" }, { n: 3, c: "Qua" }, { n: 4, c: "Qui" }, { n: 5, c: "Sex" }];
const DIA_LONGO: Record<number, string> = { 1: "segunda", 2: "terça", 3: "quarta", 4: "quinta", 5: "sexta" };

function lista(itens: string[]): string {
  return itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

export function descreverRegra(r: Pick<LinhaRecorrente, "frequencia" | "dias_semana" | "intervalo_semanas" | "dia_mes" | "ultimo_dia_util" | "prazo_dias_uteis">): string {
  let quando = "Todo dia útil";
  if (r.frequencia === "semanal") {
    const dias = lista((r.dias_semana ?? []).map((n) => DIA_LONGO[n]));
    quando = r.intervalo_semanas > 1 ? `A cada ${r.intervalo_semanas} semanas, ${dias}` : `Toda ${dias}`;
  } else if (r.frequencia === "mensal") {
    quando = r.ultimo_dia_util ? "No último dia útil do mês" : `Todo dia ${r.dia_mes} do mês`;
  }
  const prazo = r.prazo_dias_uteis === 0 ? "prazo no mesmo dia" : `prazo em ${r.prazo_dias_uteis} dia${r.prazo_dias_uteis > 1 ? "s" : ""} útil${r.prazo_dias_uteis > 1 ? "eis" : ""}`;
  return `${quando}, ${prazo}`;
}

function vazio(hoje: string, eu: string): DadosRecorrente {
  return {
    titulo: "", clienteId: "", areaId: "", responsavelId: eu, responsaveisExtras: [], lancamentoId: "", frequencia: "semanal", diasSemana: [1], intervaloSemanas: 1,
    diaMes: 1, ultimoDiaUtil: false, prazoDiasUteis: 1, horario: "", inicio: hoje, fim: "", notas: "",
  };
}

export function Recorrentes({
  itens, pessoas, clientes, areas, lancamentos, meuId, hoje,
}: { itens: LinhaRecorrente[]; pessoas: Opcao[]; clientes: Opcao[]; areas: Area[]; lancamentos: LancamentoOpcao[]; meuId: string; hoje: string }) {
  const [pendente, iniciar] = useTransition();
  const [editando, setEditando] = useState<string | "novo" | null>(null);
  const [d, setD] = useState<DadosRecorrente>(vazio(hoje, meuId));
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const nome = (id: string) => pessoas.find((p) => p.id === id)?.nome.split(" ")[0] ?? "";
  const set = <K extends keyof DadosRecorrente>(k: K, v: DadosRecorrente[K]) => setD((s) => ({ ...s, [k]: v }));

  function abrir(r?: LinhaRecorrente) {
    setErro(""); setAviso("");
    setD(r ? {
      titulo: r.titulo, clienteId: r.cliente_id ?? "", areaId: r.area_id ?? "", responsavelId: r.responsavel_id, responsaveisExtras: r.responsaveis_extras ?? [], lancamentoId: r.lancamento_id ?? "",
      frequencia: r.frequencia, diasSemana: r.dias_semana ?? [1], intervaloSemanas: r.intervalo_semanas, diaMes: r.dia_mes ?? 1,
      ultimoDiaUtil: r.ultimo_dia_util, prazoDiasUteis: r.prazo_dias_uteis, horario: r.horario?.slice(0, 5) ?? "", inicio: r.inicio, fim: r.fim ?? "", notas: r.notas ?? "",
    } : vazio(hoje, meuId));
    setEditando(r ? r.id : "novo");
  }

  function rodar(fn: () => Promise<{ erro?: string; geradas?: number }>, ok?: (n?: number) => void) {
    setErro(""); setAviso("");
    iniciar(async () => {
      const r = await fn();
      if (r.erro) setErro(r.erro);
      else ok?.(r.geradas);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" onClick={() => abrir()}><Plus size={16} /> Nova recorrente</button>
        <button type="button" className="btn" disabled={pendente} title="Gera agora as que são de hoje. Cada uma gera no máximo uma vez por dia."
          onClick={() => rodar(gerarAgora, (n) => setAviso(n ? `${n} tarefa${n > 1 ? "s" : ""} gerada${n > 1 ? "s" : ""} para hoje.` : "Nada para gerar agora. Ou já foram geradas hoje, ou hoje não é dia de nenhuma."))}>
          {pendente && <Loader2 size={15} className="animate-spin" />} Gerar as de hoje agora
        </button>
      </div>
      {aviso && <p role="status" className="mt-3 rounded-lg bg-okbg px-3 py-2 text-[13px] text-ok">{aviso}</p>}
      {erro && !editando && <p role="alert" className="mt-3 rounded-lg bg-dangerbg px-3 py-2 text-[13px] text-danger">{erro}</p>}

      {editando && (
        <form className="panel mt-5 space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); rodar(() => salvarRecorrente(d, editando === "novo" ? undefined : editando), () => setEditando(null)); }}>
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-medium">{editando === "novo" ? "Nova tarefa recorrente" : "Editar recorrente"}</h2>
            <button type="button" className="btn btn-ghost !h-8 !w-8 !px-0" aria-label="Fechar" onClick={() => setEditando(null)}><X size={16} /></button>
          </div>
          <div>
            <label htmlFor="rc-titulo" className="label mb-1.5 block">O que precisa ser feito</label>
            <input id="rc-titulo" className="field" required maxLength={200} autoFocus placeholder="Ex.: Enviar relatório semanal de tráfego" value={d.titulo} onChange={(e) => set("titulo", e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="rc-quem" className="label mb-1.5 block">Quem faz</label>
              <select id="rc-quem" className="field" value={d.responsavelId} onChange={(e) => set("responsavelId", e.target.value)}>
                {pessoas.map((p) => <option key={p.id} value={p.id}>{p.id === meuId ? `${p.nome} (eu)` : p.nome}</option>)}
              </select>
              <p className="label mb-1.5 mt-3">Mais responsáveis (opcional)</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Mais responsáveis">
                {pessoas.filter((p) => p.id !== d.responsavelId).map((p) => {
                  const on = d.responsaveisExtras.includes(p.id);
                  return (
                    <button key={p.id} type="button" aria-pressed={on}
                      onClick={() => set("responsaveisExtras", on ? d.responsaveisExtras.filter((i) => i !== p.id) : [...d.responsaveisExtras, p.id])}
                      className={`chip ${on ? "bg-infobg text-info" : "bg-panel2 text-tx2"}`}>
                      {p.nome.split(" ")[0]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label htmlFor="rc-cli" className="label mb-1.5 block">Cliente</label>
              <select id="rc-cli" className="field" value={d.clienteId} onChange={(e) => { set("clienteId", e.target.value); if (!e.target.value) set("areaId", ""); }}>
                <option value="">Interna, sem cliente</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="rc-area" className="label mb-1.5 block">Área</label>
              <select id="rc-area" className="field" disabled={!d.clienteId} required={!!d.clienteId} value={d.areaId} onChange={(e) => set("areaId", e.target.value)}>
                <option value="">{d.clienteId ? "Escolha" : "Só com cliente"}</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="rc-lanc" className="label mb-1.5 block">Lançamento (opcional)</label>
              <select id="rc-lanc" className="field" value={d.lancamentoId} onChange={(e) => set("lancamentoId", e.target.value)}>
                <option value="">Nenhum</option>
                {lancamentos.map((l) => <option key={l.id} value={l.id}>{l.codigo}</option>)}
              </select>
            </div>
          </div>

          <fieldset className="space-y-3 rounded-lg bg-panel2 p-4">
            <legend className="label px-1">Repetição</legend>
            <div role="tablist" aria-label="Frequência" className="inline-flex rounded-lg bg-[var(--panel)] p-1">
              {([["diaria_util", "Todo dia útil"], ["semanal", "Dias da semana"], ["mensal", "Todo mês"]] as const).map(([v, n]) => (
                <button key={v} type="button" role="tab" aria-selected={d.frequencia === v} onClick={() => set("frequencia", v)}
                  className={`rounded-md px-3 py-1.5 text-[13px] ${d.frequencia === v ? "bg-panel2 font-medium text-tx" : "text-tx2 hover:text-tx"}`}>{n}</button>
              ))}
            </div>
            {d.frequencia === "semanal" && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Dias da semana">
                  {DIAS.map((x) => {
                    const on = d.diasSemana.includes(x.n);
                    return (
                      <button key={x.n} type="button" aria-pressed={on} className={`chip ${on ? "bg-goldbg text-gold outline outline-1 outline-[var(--gold)]" : "bg-[var(--panel)] text-tx2"}`}
                        onClick={() => set("diasSemana", on ? d.diasSemana.filter((n) => n !== x.n) : [...d.diasSemana, x.n])}>{x.c}</button>
                    );
                  })}
                </div>
                <label className="flex items-center gap-2 text-[13px] text-tx2">A cada
                  <input type="number" min={1} max={8} className="field !h-9 !w-16" value={d.intervaloSemanas} onChange={(e) => set("intervaloSemanas", Number(e.target.value))} aria-label="Intervalo em semanas" />
                  semana(s)
                </label>
              </div>
            )}
            {d.frequencia === "mensal" && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <label className="flex items-center gap-2 text-[13px] text-tx2">
                  <input type="checkbox" checked={d.ultimoDiaUtil} onChange={(e) => set("ultimoDiaUtil", e.target.checked)} /> Último dia útil do mês
                </label>
                {!d.ultimoDiaUtil && (
                  <label className="flex items-center gap-2 text-[13px] text-tx2">Dia
                    <input type="number" min={1} max={28} className="field !h-9 !w-16" value={d.diaMes} onChange={(e) => set("diaMes", Number(e.target.value))} aria-label="Dia do mês" />
                    do mês (se cair em fim de semana, gera no próximo dia útil)
                  </label>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="rc-prazo" className="mb-1.5 block text-[13px] text-tx2">Prazo, em dias úteis depois de gerar (0 = no próprio dia)</label>
                <input id="rc-prazo" type="number" min={0} max={30} className="field !w-24" value={d.prazoDiasUteis} onChange={(e) => set("prazoDiasUteis", Number(e.target.value))} />
              </div>
              <div>
                <label htmlFor="rc-hora" className="mb-1.5 block text-[13px] text-tx2">Horário (opcional)</label>
                <input id="rc-hora" type="time" className="field !w-[120px]" value={d.horario} onChange={(e) => set("horario", e.target.value)} />
              </div>
              <div>
                <label htmlFor="rc-ini" className="mb-1.5 block text-[13px] text-tx2">Começa em</label>
                <input id="rc-ini" type="date" required className="field" value={d.inicio} onChange={(e) => set("inicio", e.target.value)} />
              </div>
              <div>
                <label htmlFor="rc-fim" className="mb-1.5 block text-[13px] text-tx2">Termina em (opcional)</label>
                <input id="rc-fim" type="date" className="field" value={d.fim} onChange={(e) => set("fim", e.target.value)} />
              </div>
            </div>
          </fieldset>
          <div>
            <label htmlFor="rc-notas" className="label mb-1.5 block">Descrição breve (opcional)</label>
            <textarea id="rc-notas" className="field" rows={2} maxLength={600} value={d.notas} onChange={(e) => set("notas", e.target.value)} />
          </div>
          {erro && <p role="alert" className="rounded-lg bg-dangerbg px-3 py-2 text-[13px] text-danger">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setEditando(null)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={pendente}>{pendente && <Loader2 size={15} className="animate-spin" />} Salvar</button>
          </div>
        </form>
      )}

      <ul className="mt-6 space-y-2.5">
        {itens.length === 0 && (
          <li className="panel px-6 py-10 text-center">
            <p className="text-[15px] font-medium">Nenhuma tarefa recorrente ainda</p>
            <p className="mt-1 text-sm text-tx2">Crie uma e ela passa a aparecer sozinha no Hoje de quem faz, todo dia às 8h.</p>
          </li>
        )}
        {itens.map((r) => (
          <li key={r.id} className={`panel px-5 py-3.5 ${r.ativo ? "" : "opacity-80"}`}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1 basis-64">
                <p className="text-[15px] font-medium leading-snug">{r.titulo} {!r.ativo && <span className="chip bg-panel2 text-tx2">pausada</span>}</p>
                <p className="mt-0.5 text-[13px] text-tx2">{descreverRegra(r)} · {[r.responsavel_id, ...(r.responsaveis_extras ?? [])].map(nome).filter(Boolean).join(", ")}</p>
                <p className="mono mt-0.5 text-xs text-tx3">
                  {clientes.find((c) => c.id === r.cliente_id)?.nome ?? "Interna"}
                  {r.lancamento_id && ` · ${lancamentos.find((l) => l.id === r.lancamento_id)?.codigo ?? ""}`}
                  {` · desde ${ddmm(r.inicio)}`}{r.fim && ` até ${ddmm(r.fim)}`}
                  {r.ultima_geracao && ` · última geração ${ddmm(r.ultima_geracao)}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn btn-ghost" onClick={() => abrir(r)}><Pencil size={15} /> Editar</button>
                <button type="button" className="btn btn-ghost" disabled={pendente} onClick={() => rodar(() => alternarRecorrente(r.id, !r.ativo))}>
                  {r.ativo ? <><Pause size={15} /> Pausar</> : <><Play size={15} /> Retomar</>}
                </button>
                {excluindo === r.id ? (
                  <span role="alert" className="flex flex-wrap items-center gap-2 rounded-lg bg-dangerbg px-3 py-1.5 text-[13px] text-danger">
                    Excluir? As tarefas já geradas ficam.
                    <button type="button" className="btn !h-8 !text-danger" disabled={pendente} onClick={() => rodar(() => excluirRecorrente(r.id), () => setExcluindo(null))}>Sim, excluir</button>
                    <button type="button" className="btn btn-ghost !h-8" onClick={() => setExcluindo(null)}>Cancelar</button>
                  </span>
                ) : (
                  <button type="button" className="btn btn-ghost !text-danger" onClick={() => setExcluindo(r.id)} aria-label={`Excluir ${r.titulo}`}><Trash2 size={15} /> Excluir</button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

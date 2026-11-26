"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { criarTarefa, criarTarefaEsteira } from "@/app/(app)/hoje/actions";
import { LinksCampo, type ItemLink } from "@/components/LinksCampo";
import { ddmm } from "@/lib/datas";
import { PAPEIS_CLIENTE, type Area, type ModeloPeca, type Opcao, type PapelCliente } from "@/lib/tipos";

export function NovaTarefa({
  admin, meuId, clientes, areas, pessoas, modelos, papeisCliente, prazoInicial, fecharHref,
}: {
  admin: boolean; meuId: string; clientes: Opcao[]; areas: Area[]; pessoas: Opcao[]; modelos: ModeloPeca[]; papeisCliente: PapelCliente[];
  // Usados pela Agenda: abre já com o dia escolhido e volta para fecharHref ao terminar
  prazoInicial?: string; fecharHref?: string;
}) {
  const router = useRouter();
  const daAgenda = !!fecharHref;
  const [aberto, setAberto] = useState(daAgenda);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [titulo, setTitulo] = useState("");
  const [prazo, setPrazo] = useState(prazoInicial ?? "");
  const [clienteId, setClienteId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [responsavelId, setResponsavelId] = useState(meuId);
  const [esteira, setEsteira] = useState(false);
  const [modeloId, setModeloId] = useState("");
  const [bloco, setBloco] = useState("");
  const modelo = modelos.find((m) => m.id === modeloId);
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [descricao, setDescricao] = useState("");
  const [links, setLinks] = useState<ItemLink[]>([]);
  const papeisDaPeca = modelo
    ? Array.from(new Set(modelo.etapas.map((e) => e.papel).filter((p): p is string => !!p)))
    : [];
  const sugerido = (papel: string) => papeisCliente.find((x) => x.cliente_id === clienteId && x.papel === papel)?.pessoa_id ?? "";
  const quem = (papel: string) => escolhas[papel] ?? sugerido(papel);
  const nomePapel = (papel: string) => PAPEIS_CLIENTE.find((p) => p.codigo === papel)?.nome ?? papel;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    iniciar(async () => {
      const r = esteira
        ? await criarTarefaEsteira({ titulo, modeloId, clienteId, areaId, bloco, descricao, links, responsaveis: Object.fromEntries(papeisDaPeca.map((p) => [p, quem(p)])) })
        : await criarTarefa({ titulo, prazo, clienteId, areaId, responsavelId, descricao, links });
      if (r.erro) return setErro(r.erro);
      setTitulo(""); setPrazo(""); setClienteId(""); setAreaId(""); setResponsavelId(meuId);
      setModeloId(""); setBloco(""); setEsteira(false); setEscolhas({}); setDescricao(""); setLinks([]);
      fechar();
    });
  }

  function fechar() {
    if (fecharHref) router.push(fecharHref);
    else setAberto(false);
  }

  if (!aberto) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setAberto(true)}>
        <Plus size={16} /> Nova tarefa
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="panel w-full space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-medium">{prazoInicial ? `Nova tarefa para ${ddmm(prazoInicial)}` : "Nova tarefa"}</h2>
        <button type="button" className="btn btn-ghost !h-8 !w-8 !px-0" onClick={fechar} aria-label="Fechar"><X size={16} /></button>
      </div>
      {admin && !daAgenda && (
        <div role="tablist" aria-label="Tipo de tarefa" className="inline-flex rounded-lg bg-panel2 p-1">
          {[{ v: false, n: "Tarefa simples" }, { v: true, n: "Peça com esteira" }].map((o) => (
            <button key={o.n} type="button" role="tab" aria-selected={esteira === o.v}
              onClick={() => { setEsteira(o.v); setErro(""); }}
              className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${esteira === o.v ? "bg-[var(--panel)] font-medium text-tx shadow-sm" : "text-tx2 hover:text-tx"}`}>
              {o.n}
            </button>
          ))}
        </div>
      )}
      <div>
        <label htmlFor="nt-titulo" className="label mb-1.5 block">{esteira ? "Nome da peça" : "O que precisa ser feito"}</label>
        <input id="nt-titulo" className="field" required maxLength={200} autoFocus placeholder={esteira ? "Ex.: Carrossel: 3 erros na maquiagem de noiva" : "Ex.: revisar os stories de captação"} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {esteira ? (
          <div>
            <label htmlFor="nt-modelo" className="label mb-1.5 block">Tipo de peça</label>
            <select id="nt-modelo" className="field" required value={modeloId} onChange={(e) => { setModeloId(e.target.value); setEscolhas({}); }}>
              <option value="">Escolha</option>
              {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label htmlFor="nt-prazo" className="label mb-1.5 block">Prazo</label>
            <input id="nt-prazo" type="date" className="field" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </div>
        )}
        <div>
          <label htmlFor="nt-cliente" className="label mb-1.5 block">Cliente</label>
          <select id="nt-cliente" className="field" value={clienteId} onChange={(e) => { setClienteId(e.target.value); if (!e.target.value) setAreaId(""); }}>
            <option value="">{esteira ? "Avulso" : "Interna, sem cliente"}</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          {clientes.length === 0 && <p className="mt-1.5 text-xs text-tx3">Nenhum cliente cadastrado ainda.</p>}
        </div>
        <div>
          <label htmlFor="nt-area" className="label mb-1.5 block">Área</label>
          <select id="nt-area" className="field" disabled={!clienteId} required={!!clienteId} value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            <option value="">{clienteId ? "Escolha" : "Só com cliente"}</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
          {!clienteId && <p className="mt-1.5 text-xs text-tx3">Escolha um cliente para liberar.</p>}
        </div>
        {esteira ? (
          <div>
            <label htmlFor="nt-bloco" className="label mb-1.5 block">Bloco (opcional)</label>
            <input id="nt-bloco" className="field" maxLength={120} placeholder="Ex.: Captação, dia 1" value={bloco} onChange={(e) => setBloco(e.target.value)} />
          </div>
        ) : admin && (
          <div>
            <label htmlFor="nt-resp" className="label mb-1.5 block">Para quem</label>
            <select id="nt-resp" className="field" value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}>
              {pessoas.map((p) => <option key={p.id} value={p.id}>{p.id === meuId ? `${p.nome} (eu)` : p.nome}</option>)}
            </select>
          </div>
        )}
      </div>
      <div>
        <label htmlFor="nt-desc" className="label mb-1.5 flex items-center justify-between">
          <span>Descrição breve (opcional)</span>
          <span className="mono normal-case text-tx3">{descricao.length}/600</span>
        </label>
        <textarea id="nt-desc" className="field" rows={3} maxLength={600} placeholder="O essencial para quem vai fazer. O resto fica no link." value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </div>
      <div>
        <p className="label mb-1.5">Links (opcional)</p>
        <LinksCampo
          itens={links}
          onAdicionar={(l) => { setLinks((s) => [...s, { chave: `${Date.now()}-${s.length}`, ...l }]); }}
          onRemover={(k) => setLinks((s) => s.filter((x) => x.chave !== k))}
        />
      </div>
      {esteira && modelo && (
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg bg-panel2 px-3 py-2.5 text-[13px] text-tx2" aria-label="Sequência da peça">
          {modelo.etapas.map((e, i) => (
            <li key={e.ordem} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden className="text-tx3">→</span>}
              <span><span className="text-tx">{e.nome}</span> <span className="text-tx3">({e.estado})</span></span>
            </li>
          ))}
        </ol>
      )}
      {esteira && papeisDaPeca.length > 0 && (
        <div>
          <p className="label mb-2">Quem faz cada função</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {papeisDaPeca.map((papel) => (
              <div key={papel}>
                <label htmlFor={`nt-papel-${papel}`} className="mb-1.5 block text-[13px] text-tx2">{nomePapel(papel)}</label>
                <select id={`nt-papel-${papel}`} className="field" required value={quem(papel)} onChange={(e) => setEscolhas((s) => ({ ...s, [papel]: e.target.value }))}>
                  <option value="">Escolha</option>
                  {pessoas.map((p) => <option key={p.id} value={p.id}>{p.id === meuId ? `${p.nome} (eu)` : p.nome}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
      {esteira && <p className="text-xs text-tx3">Os prazos vêm do modelo, 1 dia útil por etapa. A primeira etapa já fica na vez de quem a executa.</p>}
      {erro && <p role="alert" className="rounded-lg bg-dangerbg px-3 py-2 text-[13px] text-danger">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={fechar}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={pendente}>
          {pendente && <Loader2 size={15} className="animate-spin" />} {esteira ? "Criar peça" : "Criar tarefa"}
        </button>
      </div>
    </form>
  );
}

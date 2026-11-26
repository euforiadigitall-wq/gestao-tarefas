"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { criarEntregavel } from "@/app/(app)/lancamentos/actions";
import { ETAPAS, TIPOS_ENTREGAVEL, tituloEntregavel } from "@/lib/lancamentos";
import { PAPEIS_CLIENTE, type ModeloPeca, type Opcao } from "@/lib/tipos";

export function NovoEntregavel({
  lancamentoId, etapaInicial, etapasAtivas, modelos, pessoas, equipe,
}: {
  lancamentoId: string; etapaInicial: string; etapasAtivas: string[]; modelos: ModeloPeca[]; pessoas: Opcao[]; equipe: Record<string, string>;
}) {
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [etapa, setEtapa] = useState(etapaInicial);
  const [tipo, setTipo] = useState("mensagens");
  const [qtd, setQtd] = useState("10");
  const [rotulo, setRotulo] = useState("");
  const [modeloId, setModeloId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});

  const modeloSugerido = (t: string) => modelos.find((m) => m.nome === TIPOS_ENTREGAVEL.find((x) => x.id === t)?.modelo)?.id ?? "";
  const modeloAtual = modelos.find((m) => m.id === (modeloId || modeloSugerido(tipo)));
  const papeis = modeloAtual ? Array.from(new Set(modeloAtual.etapas.map((e) => e.papel).filter((p): p is string => !!p))) : [];
  const faltam = papeis.filter((p) => !equipe[p] && !escolhas[p]);
  const n = Number(qtd);
  const tituloAuto = Number.isInteger(n) && n > 0 ? tituloEntregavel(n, tipo, etapa) : "";
  const nomePapel = (p: string) => PAPEIS_CLIENTE.find((x) => x.codigo === p)?.nome ?? p;
  const quemDoPapel = (p: string) => (equipe[p] ? pessoas.find((x) => x.id === equipe[p])?.nome ?? nomePapel(p) : nomePapel(p));

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    iniciar(async () => {
      const r = await criarEntregavel({
        lancamentoId, etapa, tipo, quantidade: n, rotulo, modeloId: modeloId || modeloSugerido(tipo),
        titulo: titulo || tituloAuto, responsaveis: escolhas,
      });
      if (r.erro) return setErro(r.erro);
      setRotulo(""); setTitulo(""); setEscolhas({}); setAberto(false);
    });
  }

  if (!aberto) {
    return (
      <button type="button" className="btn btn-ghost" onClick={() => { setEtapa(etapaInicial); setAberto(true); }}>
        <Plus size={15} /> Adicionar entregável
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="panel space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-medium">Novo entregável</h3>
        <button type="button" className="btn btn-ghost !h-8 !w-8 !px-0" onClick={() => setAberto(false)} aria-label="Fechar"><X size={16} /></button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="ne-etapa" className="label mb-1.5 block">Etapa</label>
          <select id="ne-etapa" className="field" value={etapa} onChange={(e) => setEtapa(e.target.value)}>
            {ETAPAS.filter((x) => etapasAtivas.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ne-tipo" className="label mb-1.5 block">Tipo</label>
          <select id="ne-tipo" className="field" value={tipo} onChange={(e) => { setTipo(e.target.value); setModeloId(""); setEscolhas({}); }}>
            {TIPOS_ENTREGAVEL.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ne-qtd" className="label mb-1.5 block">Quantidade</label>
          <input id="ne-qtd" className="field mono" inputMode="numeric" required value={qtd} onChange={(e) => setQtd(e.target.value.replace(/\D/g, "").slice(0, 3))} />
        </div>
        <div>
          <label htmlFor="ne-rotulo" className="label mb-1.5 block">Bloco (opcional)</label>
          <input id="ne-rotulo" className="field" maxLength={80} placeholder="Ex.: semana 1" value={rotulo} onChange={(e) => setRotulo(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ne-titulo" className="label mb-1.5 block">Nome do card</label>
          <input id="ne-titulo" className="field" maxLength={200} placeholder={tituloAuto} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ne-modelo" className="label mb-1.5 block">Sequência (tipo de peça)</label>
          <select id="ne-modelo" className="field" value={modeloId || modeloSugerido(tipo)} onChange={(e) => { setModeloId(e.target.value); setEscolhas({}); }}>
            <option value="">Escolha</option>
            {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </div>
      </div>
      {modeloAtual && (
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg bg-panel2 px-3 py-2.5 text-[13px] text-tx2" aria-label="Sequência do entregável">
          {modeloAtual.etapas.map((e, i) => (
            <li key={e.ordem} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden className="text-tx3">→</span>}
              <span><span className="text-tx">{e.nome}</span>{e.papel ? <span className="text-tx3"> ({quemDoPapel(e.papel)})</span> : null}</span>
            </li>
          ))}
        </ol>
      )}
      {faltam.length > 0 && (
        <div>
          <p className="label mb-2">Funções sem ninguém na equipe do lançamento</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {faltam.map((papel) => (
              <div key={papel}>
                <label htmlFor={`ne-p-${papel}`} className="mb-1.5 block text-[13px] text-tx2">{nomePapel(papel)}</label>
                <select id={`ne-p-${papel}`} className="field" required value={escolhas[papel] ?? ""} onChange={(e) => setEscolhas((s) => ({ ...s, [papel]: e.target.value }))}>
                  <option value="">Escolha</option>
                  {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-tx3">Um card só para o bloco inteiro. Os prazos vêm da sequência, 1 dia útil por etapa, e o card já nasce com a etiqueta do lançamento.</p>
      {erro && <p role="alert" className="rounded-lg bg-dangerbg px-3 py-2 text-[13px] text-danger">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => setAberto(false)}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={pendente}>
          {pendente && <Loader2 size={15} className="animate-spin" />} Criar entregável
        </button>
      </div>
    </form>
  );
}

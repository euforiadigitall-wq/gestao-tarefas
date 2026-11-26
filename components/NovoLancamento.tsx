"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { criarLancamento } from "@/app/(app)/lancamentos/actions";
import { CORES_TAG, ETAPAS } from "@/lib/lancamentos";
import { PAPEIS_CLIENTE, type Opcao } from "@/lib/tipos";

export function NovoLancamento({ clientes, pessoas }: { clientes: Opcao[]; pessoas: Opcao[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [cor, setCor] = useState<string>("azul");
  const [ini, setIni] = useState("");
  const [abertura, setAbertura] = useState("");
  const [fim, setFim] = useState("");
  const [etapas, setEtapas] = useState<string[]>(ETAPAS.map((e) => e.id));
  const [promocao, setPromocao] = useState(false);
  const [equipe, setEquipe] = useState<Record<string, string>>({});

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    iniciar(async () => {
      const r = await criarLancamento({ clienteId, nome, codigo, cor, dataInicio: ini, dataAbertura: abertura, dataFechamento: fim, etapas, promocao, equipe });
      if (r.erro) return setErro(r.erro);
      if (r.id) router.push(`/lancamentos/${r.id}`);
    });
  }

  if (!aberto) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setAberto(true)}>
        <Plus size={16} /> Novo lançamento
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="panel w-full space-y-5 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-medium">Novo lançamento</h2>
        <button type="button" className="btn btn-ghost !h-8 !w-8 !px-0" onClick={() => setAberto(false)} aria-label="Fechar"><X size={16} /></button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label htmlFor="nl-cliente" className="label mb-1.5 block">Cliente</label>
          <select id="nl-cliente" className="field" required value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Escolha</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="nl-nome" className="label mb-1.5 block">Nome do lançamento</label>
          <input id="nl-nome" className="field" required maxLength={120} placeholder="Ex.: Treinamento Prova Oral TJBA" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div>
          <label htmlFor="nl-codigo" className="label mb-1.5 block">Código (a etiqueta)</label>
          <input id="nl-codigo" className="field mono" required maxLength={14} placeholder="Ex.: TJBA" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
        </div>
        <div>
          <p className="label mb-1.5">Cor da etiqueta</p>
          <div className="flex h-10 items-center gap-2" role="radiogroup" aria-label="Cor da etiqueta">
            {CORES_TAG.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={cor === c} aria-label={c} title={c} onClick={() => setCor(c)}
                className={`h-6 w-6 rounded-full border-2 transition-transform ${cor === c ? "scale-110 border-[var(--tx)]" : "border-transparent"}`}
                style={{ background: `var(--tag-${c})` }} />
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="nl-ini" className="label mb-1.5 block">Início</label>
          <input id="nl-ini" type="date" className="field" value={ini} onChange={(e) => setIni(e.target.value)} />
        </div>
        <div>
          <label htmlFor="nl-ab" className="label mb-1.5 block">Abertura do carrinho</label>
          <input id="nl-ab" type="date" className="field" value={abertura} onChange={(e) => setAbertura(e.target.value)} />
        </div>
        <div>
          <label htmlFor="nl-fim" className="label mb-1.5 block">Fechamento</label>
          <input id="nl-fim" type="date" className="field" value={fim} onChange={(e) => setFim(e.target.value)} />
        </div>
      </div>

      <fieldset>
        <legend className="label mb-2">Etapas que este lançamento usa</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {ETAPAS.map((e) => (
            <label key={e.id} className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={etapas.includes(e.id)} onChange={(ev) => setEtapas((s) => (ev.target.checked ? [...s, e.id] : s.filter((x) => x !== e.id)))} />
              {e.nome}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-start gap-2 text-[14px]">
        <input type="checkbox" className="mt-1" checked={promocao} onChange={(e) => setPromocao(e.target.checked)} />
        <span>Tem promoção com desconto explícito na página de vendas<span className="block text-xs text-tx3">Liga o item de tirar a página do ar quando o carrinho fecha.</span></span>
      </label>

      <div>
        <p className="label mb-2">Equipe deste lançamento</p>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {PAPEIS_CLIENTE.map((p) => (
            <div key={p.codigo}>
              <label htmlFor={`nl-p-${p.codigo}`} className="mb-1.5 block text-[13px] text-tx2">{p.nome}</label>
              <select id={`nl-p-${p.codigo}`} className="field !h-9" value={equipe[p.codigo] ?? ""} onChange={(e) => setEquipe((s) => ({ ...s, [p.codigo]: e.target.value }))}>
                <option value="">Ninguém</option>
                {pessoas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-tx3">O checklist e as peças usam essa equipe. Dá para trocar depois na página do lançamento.</p>
      </div>

      {erro && <p role="alert" className="rounded-lg bg-dangerbg px-3 py-2 text-[13px] text-danger">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => setAberto(false)}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={pendente}>
          {pendente && <Loader2 size={15} className="animate-spin" />} Criar lançamento
        </button>
      </div>
    </form>
  );
}

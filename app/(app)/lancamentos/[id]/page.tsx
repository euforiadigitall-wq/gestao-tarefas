import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EquipeLanc } from "@/components/EquipeLanc";
import { Etiqueta } from "@/components/Etiqueta";
import { ItemChecklist, type ItemLanc } from "@/components/ItemChecklist";
import { MapaLancamento, type Folha, type RamoEtapa } from "@/components/MapaLancamento";
import { NovoEntregavel } from "@/components/NovoEntregavel";
import { ddmm, descreverPrazo, hojeSP } from "@/lib/datas";
import { ETAPAS, TIPOS_ENTREGAVEL, etapaPelasDatas, nomeEtapa } from "@/lib/lancamentos";
import { supabaseServer } from "@/lib/supabase/server";
import type { ModeloPeca, Opcao, Pessoa } from "@/lib/tipos";
import { corPrazo } from "@/lib/visual";

export const metadata: Metadata = { title: "Lançamento" };
export const dynamic = "force-dynamic";

interface Lanc {
  id: string;
  codigo: string | null;
  cor: string;
  nome: string;
  status: string;
  data_inicio: string | null;
  data_abertura: string | null;
  data_fechamento: string | null;
  promocao_explicita: boolean;
  cliente: { nome: string } | null;
  etapas: { id: string; etapa: string; ativa: boolean }[];
}

interface ItemBanco {
  id: string;
  lancamento_id: string;
  etapa: string;
  texto: string;
  critico: boolean;
  prazo: string | null;
  feito: boolean;
  pessoa_id: string | null;
  ordem: number;
}

interface TarefaEnt {
  id: string;
  titulo: string;
  entregavel_id: string;
  status: string;
  estado_atual: string;
  proxima_acao: string | null;
  responsavel: string | null;
  prazo_vez: string | null;
  atrasada: boolean;
  arquivada_em: string | null;
}

export default async function PaginaLancamento({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ etapa?: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const meuId = auth.user!.id;
  const { data: eu } = await supabase.from("pessoas").select("id,nome,papel").eq("id", meuId).single<Pessoa>();
  const admin = eu?.papel === "admin";
  const hoje = hojeSP();

  const ehUuid = /^[0-9a-f-]{36}$/i.test(id);
  if (!ehUuid) notFound();

  const [lancRes, papeisRes, itensRes, pessoasRes] = await Promise.all([
    supabase
      .from("lancamentos")
      .select("id,codigo,cor,nome,status,data_inicio,data_abertura,data_fechamento,promocao_explicita,cliente:clientes(nome),etapas:lancamento_etapas(id,etapa,ativa)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("lancamento_papeis").select("papel,pessoa_id").eq("lancamento_id", id),
    supabase.from("lancamento_checklist").select("id,lancamento_id,etapa,texto,critico,prazo,feito,pessoa_id,ordem").eq("lancamento_id", id).order("ordem"),
    supabase.from("pessoas").select("id,nome").eq("ativo", true).order("nome"),
  ]);
  const l = lancRes.data as unknown as Lanc | null;
  if (!l) notFound();

  const pessoas = (pessoasRes.data ?? []) as Opcao[];
  const nomeDe = (pid: string | null) => pessoas.find((p) => p.id === pid)?.nome ?? null;
  const equipe = Object.fromEntries(((papeisRes.data ?? []) as { papel: string; pessoa_id: string }[]).map((p) => [p.papel, p.pessoa_id]));
  const itensBanco = (itensRes.data ?? []) as ItemBanco[];
  const etapaIdPorEtapa = new Map(l.etapas.map((e) => [e.id, e.etapa]));
  const ativas = l.etapas.filter((e) => e.ativa).map((e) => e.etapa);

  const entRes = l.etapas.length
    ? await supabase.from("entregaveis").select("id,tipo,quantidade,rotulo,lancamento_etapa_id").in("lancamento_etapa_id", l.etapas.map((e) => e.id))
    : { data: [] as { id: string; tipo: string; quantidade: number | null; rotulo: string | null; lancamento_etapa_id: string }[], error: null };
  const entregaveis = (entRes.data ?? []) as { id: string; tipo: string; quantidade: number | null; rotulo: string | null; lancamento_etapa_id: string }[];
  const tarRes = entregaveis.length
    ? await supabase
        .from("v_tarefas")
        .select("id,titulo,entregavel_id,status,estado_atual,proxima_acao,responsavel,prazo_vez,atrasada,arquivada_em")
        .in("entregavel_id", entregaveis.map((e) => e.id))
        .order("prazo_vez", { ascending: true, nullsFirst: false })
    : { data: [] as TarefaEnt[], error: null };
  const tarefaDoEnt = new Map(((tarRes.data ?? []) as TarefaEnt[]).map((t) => [t.entregavel_id, t]));
  const { count: tagadas } = await supabase.from("tarefa_lancamentos").select("tarefa_id", { count: "exact", head: true }).eq("lancamento_id", id);

  let modelos: ModeloPeca[] = [];
  if (admin) {
    const { data } = await supabase.from("modelos_peca").select("id,nome,etapas:modelos_etapa(ordem,nome,estado,papel)").eq("ativo", true).order("nome");
    modelos = ((data ?? []) as ModeloPeca[]).map((m) => ({ ...m, etapas: [...m.etapas].sort((a, b) => a.ordem - b.ordem) }));
  }

  const sp = await searchParams;
  const sugerida = etapaPelasDatas(l, ativas, hoje);
  const etapa = sp.etapa && ativas.includes(sp.etapa) ? sp.etapa : sugerida;

  const itensDaEtapa = (e: string): ItemLanc[] =>
    itensBanco
      .filter((i) => i.etapa === e)
      .map((i) => ({ id: i.id, lancamento_id: i.lancamento_id, texto: i.texto, critico: i.critico, prazo: i.prazo, feito: i.feito, pessoa_id: i.pessoa_id, pessoa: nomeDe(i.pessoa_id) }));

  const entregaveisDaEtapa = (e: string) => entregaveis.filter((x) => etapaIdPorEtapa.get(x.lancamento_etapa_id) === e);
  const abertosPorEtapa = (e: string) => itensBanco.filter((i) => i.etapa === e && !i.feito).length;
  const criticosPorEtapa = (e: string) => itensBanco.filter((i) => i.etapa === e && !i.feito && i.critico).length;

  const ramos: RamoEtapa[] = ETAPAS.filter((e) => ativas.includes(e.id)).map((e) => {
    const folhasItens: Folha[] = itensBanco
      .filter((i) => i.etapa === e.id)
      .map((i) => ({
        texto: i.texto,
        tipo: "item" as const,
        tom: i.feito ? "ok" : i.prazo && i.prazo < hoje ? "atrasado" : i.critico ? "critico" : "aberto",
      }));
    const folhasEnt: Folha[] = entregaveisDaEtapa(e.id).map((x) => {
      const t = tarefaDoEnt.get(x.id);
      const tipo = TIPOS_ENTREGAVEL.find((y) => y.id === x.tipo);
      return {
        texto: t?.titulo ?? `${x.quantidade ?? ""} ${tipo?.plural ?? x.tipo}`.trim(),
        tipo: "entregavel" as const,
        tom: t?.status === "concluida" ? "ok" : t?.atrasada ? "atrasado" : "aberto",
      };
    });
    return { id: e.id, nome: e.nome, folhas: [...folhasEnt, ...folhasItens] };
  });

  const periodo = [
    l.data_inicio && `início ${ddmm(l.data_inicio)}`,
    l.data_abertura && `carrinho abre ${ddmm(l.data_abertura)}`,
    l.data_fechamento && `fecha ${ddmm(l.data_fechamento)}`,
  ].filter(Boolean).join(" · ") || "sem datas definidas";

  const itensEtapa = itensDaEtapa(etapa);
  const pendentes = itensEtapa.filter((i) => !i.feito);
  const feitos = itensEtapa.filter((i) => i.feito);
  const entsEtapa = entregaveisDaEtapa(etapa);
  const falhou = lancRes.error || itensRes.error || papeisRes.error || entRes.error || tarRes.error;

  return (
    <div className="mx-auto max-w-[1000px]">
      <Link href="/lancamentos" className="inline-flex items-center gap-1.5 text-[13px] text-tx2 hover:text-tx">
        <ArrowLeft size={14} /> Lançamentos
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {l.codigo && <Etiqueta codigo={l.codigo} cor={l.cor} />}
        <h1 className="text-[28px] font-semibold leading-none tracking-tight">{l.nome}</h1>
      </div>
      <p className="mt-2 text-[14px] text-tx2">
        {l.cliente?.nome ?? "Cliente"} · {periodo}
        {l.promocao_explicita && <span className="chip ml-2 bg-goldbg text-gold">promoção explícita</span>}
      </p>

      {falhou && (
        <p role="alert" className="mt-6 rounded-lg bg-dangerbg px-4 py-3 text-sm text-danger">
          Não consegui carregar tudo agora. Atualize a página; se continuar, avise a Iza.
        </p>
      )}

      <section className="panel mt-6 p-5" aria-labelledby="equipe-t">
        <h2 id="equipe-t" className="label mb-3">Equipe deste lançamento</h2>
        <EquipeLanc lancamentoId={l.id} equipe={equipe} pessoas={pessoas} admin={admin} />
      </section>

      <nav className="mt-8 grid gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Etapas do lançamento">
        {ETAPAS.map((e) => {
          const ligada = ativas.includes(e.id);
          const atual = e.id === etapa;
          const abertos = abertosPorEtapa(e.id);
          const crit = criticosPorEtapa(e.id);
          const miolo = (
            <>
              <span className="block text-[13px] font-medium leading-tight">{e.nome}</span>
              <span className="mt-1 block text-[12px] text-tx3">
                {!ligada ? "não usa" : abertos === 0 ? "em dia" : `${abertos} em aberto`}
                {ligada && crit > 0 && <span className="text-gold"> · {crit} crítico{crit > 1 ? "s" : ""}</span>}
              </span>
              {ligada && e.id === sugerida && <span className="label mt-1.5 block !text-[10px]">pelas datas</span>}
            </>
          );
          return ligada ? (
            <Link key={e.id} href={`/lancamentos/${l.id}?etapa=${e.id}`} aria-current={atual ? "step" : undefined}
              className={`rounded-xl border px-3 py-2.5 transition-colors ${atual ? "border-[var(--accent)] bg-panel" : "border-[var(--line)] hover:border-[var(--line-strong)]"}`}>
              {miolo}
            </Link>
          ) : (
            <span key={e.id} className="rounded-xl border border-dashed border-[var(--line)] px-3 py-2.5 text-tx3">{miolo}</span>
          );
        })}
      </nav>

      <section className="mt-6" aria-labelledby="check-t">
        <h2 id="check-t" className="mb-3 flex items-center gap-2.5">
          <span className="label">Checklist · {nomeEtapa(etapa).toLowerCase()}</span>
          <span className="mono rounded-md bg-panel2 px-1.5 text-[11px] text-tx2">{pendentes.length}</span>
          <span className="h-px flex-1 bg-[var(--line)]" />
        </h2>
        {itensEtapa.length === 0 ? (
          <div className="panel px-6 py-8 text-center">
            <p className="text-[15px] font-medium">Nenhum item nesta etapa</p>
            <p className="mt-1 text-sm text-tx2">O modelo de checklist não tem itens para ela, ou a etapa não pede nada.</p>
          </div>
        ) : (
          <ul className="panel px-5 py-1.5">
            {[...pendentes, ...feitos].map((i) => (
              <ItemChecklist key={i.id} item={i} hoje={hoje} admin={admin} pessoas={pessoas} podeMarcar={admin || i.pessoa_id === meuId} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-9" aria-labelledby="ent-t">
        <h2 id="ent-t" className="mb-3 flex items-center gap-2.5">
          <span className="label">Entregáveis · {nomeEtapa(etapa).toLowerCase()}</span>
          <span className="mono rounded-md bg-panel2 px-1.5 text-[11px] text-tx2">{entsEtapa.length}</span>
          <span className="h-px flex-1 bg-[var(--line)]" />
        </h2>
        {entsEtapa.length === 0 ? (
          <p className="mb-3 text-sm text-tx2">Nenhum entregável nesta etapa ainda.</p>
        ) : (
          <ul className="mb-3 space-y-2">
            {entsEtapa.map((x) => {
              const t = tarefaDoEnt.get(x.id);
              const tipo = TIPOS_ENTREGAVEL.find((y) => y.id === x.tipo);
              const prazo = t && t.status !== "concluida" ? descreverPrazo(t.prazo_vez, hoje) : null;
              return (
                <li key={x.id} className="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="text-[15px] font-medium leading-snug">{t?.titulo ?? `${x.quantidade ?? ""} ${tipo?.plural ?? x.tipo}`}</p>
                    <p className="mt-0.5 text-[13px] text-tx2">
                      {tipo?.nome}{x.quantidade ? ` · ${x.quantidade}` : ""}{x.rotulo ? ` · ${x.rotulo}` : ""}
                      {t && t.status !== "concluida" && t.proxima_acao && <> · próxima ação: <b className="font-medium text-tx">{t.proxima_acao}</b>{t.responsavel ? ` (${t.responsavel})` : ""}</>}
                    </p>
                  </div>
                  {t?.status === "concluida" ? <span className="chip bg-okbg text-ok">concluído</span> : prazo && <span className={`chip ${corPrazo[prazo.tom]}`}>{prazo.texto}</span>}
                </li>
              );
            })}
          </ul>
        )}
        {admin && (
          <NovoEntregavel key={etapa} lancamentoId={l.id} etapaInicial={etapa} etapasAtivas={ativas} modelos={modelos} pessoas={pessoas} equipe={equipe} />
        )}
      </section>

      <section className="mt-10" aria-labelledby="mapa-t">
        <h2 id="mapa-t" className="mb-3 flex items-center gap-2.5">
          <span className="label">Mapa do lançamento</span>
          <span className="h-px flex-1 bg-[var(--line)]" />
        </h2>
        <div className="panel p-5">
          <MapaLancamento codigo={l.codigo ?? "?"} cor={l.cor} ramos={ramos} />
        </div>
        <p className="mt-3 text-[13px] text-tx2">
          {tagadas ?? 0} tarefa{(tagadas ?? 0) === 1 ? "" : "s"} com a etiqueta {l.codigo}.{" "}
          <Link className="underline underline-offset-2 hover:text-tx" href={`/quadro?lanc=${l.id}`}>Ver no Quadro</Link>
        </p>
      </section>
    </div>
  );
}

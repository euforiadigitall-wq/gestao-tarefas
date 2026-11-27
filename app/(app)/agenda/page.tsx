import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Etiquetas } from "@/components/Etiqueta";
import { FiltrosVisao } from "@/components/FiltrosVisao";
import { AcoesTarefa } from "@/components/AcoesTarefa";
import { CabecalhoLista, LinhaLista } from "@/components/LinhaLista";
import { Arrastavel, DiaAlvo } from "@/components/AgendaArrastar";
import { ImportarExportar } from "@/components/ImportarExportar";
import { MaisNoDia } from "@/components/MaisNoDia";
import { GavetaTarefa } from "@/components/GavetaTarefa";
import { NovaTarefa } from "@/components/NovaTarefa";
import { TarefaCard } from "@/components/TarefaCard";
import {
  dataExtensa, ddmm, diaDoMes, diaSemanaLongo, domingoDe, ehData, fimMes, hojeSP, inicioMes, rotuloMes, segundaDe, somarDias, somarMeses,
} from "@/lib/datas";
import { previaRecorrente, type RegraRecorrente } from "@/lib/recorrentes";
import { etiquetasDeTarefas } from "@/lib/lancfiltro";
import { filtroResponsavel } from "@/lib/responsavel";
import { corTag } from "@/lib/lancamentos";
import { pessoaAtual, supabaseServer, usuarioAtual } from "@/lib/supabase/server";
import type { Area, EtiquetaLanc, LancamentoOpcao, Opcao, Pessoa, TarefaLink, TarefaView } from "@/lib/tipos";
import { TituloTarefa } from "@/components/TituloTarefa";

export const metadata: Metadata = { title: "Agenda" };
export const dynamic = "force-dynamic";

type Visao = "mes" | "semana" | "dia" | "lista";
const VISOES: { id: Visao; nome: string }[] = [
  { id: "mes", nome: "Mês" },
  { id: "semana", nome: "Semana" },
  { id: "dia", nome: "Dia" },
  { id: "lista", nome: "Lista" },
];
const SEMANA_CURTA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

interface Item {
  chave: string;
  tarefaId?: string;
  titulo: string;
  cliente: string | null;
  area: string | null;
  quem: string | null;
  rotulo: string | null;
  futuro: boolean;
  data: string | null;
  horario?: string | null;
  movel?: boolean;
  lancamentos?: EtiquetaLanc[] | null;
}

interface EtapaRow {
  id: string;
  ordem: number;
  nome: string;
  prazo_previsto: string | null;
  responsavel: { nome: string } | null;
  tarefa: {
    id: string;
    titulo: string;
    etapa_atual: number | null;
    status: string;
    arquivada_em: string | null;
    cliente_id: string | null;
    area_id: string | null;
    cliente: { nome: string } | null;
    area: { nome: string } | null;
  };
}

interface TarefaRow {
  id: string;
  titulo: string;
  cliente: string | null;
  area: string | null;
  responsavel: string | null;
  proxima_acao: string | null;
  etapa_atual: number | null;
  prazo: string | null;
  prazo_vez: string | null;
  horario: string | null;
  lancamentos: EtiquetaLanc[] | null;
}

const primeiro = (n: string | null) => (n ? n.split(" ")[0] : null);

// Tarefa simples com dia pode ser arrastada para outro dia (mês e semana). Esteira não: o prazo vem do SLA.
function Movel({ i, children }: { i: Item; children: React.ReactNode }) {
  return i.movel && i.tarefaId && i.data ? <Arrastavel id={i.tarefaId} de={i.data}>{children}</Arrastavel> : <>{children}</>;
}

function CartaoItem({ i, tom, admin, abrir }: { i: Item; tom?: "atrasada"; admin?: boolean; abrir?: string }) {
  return (
    <article className={`panel relative overflow-hidden py-2.5 pl-3.5 pr-3 ${i.futuro ? "opacity-90 border-dashed" : ""}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${tom === "atrasada" ? "bg-[var(--danger)]" : i.futuro ? "bg-[var(--line)]" : "bg-[var(--info)]"}`} aria-hidden="true" />
      <h3 className="text-[13px] font-medium leading-snug">
        {i.horario && <span className="mono mr-1.5 text-tx2">{i.horario.slice(0, 5)}</span>}
        {abrir ? <Link href={abrir} scroll={false} draggable={false} className="after:absolute after:inset-0 hover:underline"><TituloTarefa titulo={i.titulo} /></Link> : <TituloTarefa titulo={i.titulo} />}
      </h3>
      {i.lancamentos && i.lancamentos.length > 0 && <p className="mt-1 flex flex-wrap gap-1"><Etiquetas itens={i.lancamentos} /></p>}
      <p className="mt-0.5 text-xs text-tx2">
        {i.cliente ?? "Interna"}
        {i.area && <span className="mono text-tx3"> · {i.area}</span>}
      </p>
      {(i.rotulo || i.quem) && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-tx2">
          {i.futuro && <span className="chip bg-panel2 text-tx3">na fila</span>}
          {i.rotulo && <b className="font-medium text-tx">{i.rotulo}</b>}
          {i.quem && <span>{i.rotulo ? "· " : ""}{i.quem}</span>}
        </p>
      )}
      {admin && i.tarefaId && <div className="relative z-[2] mt-2"><AcoesTarefa id={i.tarefaId} admin titulo={i.titulo} /></div>}
    </article>
  );
}

function Mini({ i, abrir }: { i: Item; abrir?: string }) {
  const dica = [i.horario ? i.horario.slice(0, 5) : null, i.titulo, i.cliente ?? "Interna", i.rotulo, i.quem].filter(Boolean).join(" · ");
  return (
    <div title={dica} className={`relative truncate rounded-md bg-panel py-1 pl-2.5 pr-1.5 text-[11px] leading-tight ring-1 ring-[var(--line)] ${i.futuro ? "text-tx3" : "text-tx"}`}>
      <span className={`absolute inset-y-0 left-0 w-[3px] rounded-l-md ${i.futuro ? "bg-[var(--line-strong)]" : "bg-[var(--info)]"}`} aria-hidden="true" />
      {abrir && <Link href={abrir} draggable={false} scroll={false} aria-label={`Abrir ${i.titulo}`} className="absolute inset-0 z-[1] rounded-md hover:ring-1 hover:ring-[var(--line-strong)]" />}
      {i.lancamentos && i.lancamentos.length > 0 && (
        <span className="mono mr-1 font-medium" style={{ color: `var(--tag-${corTag(i.lancamentos[0].cor)})` }}>{i.lancamentos.map((e) => e.codigo).join("+")}</span>
      )}
      {i.horario && <span className="mono mr-1 text-tx2">{i.horario.slice(0, 5)}</span>}
      <TituloTarefa titulo={i.titulo} />
    </div>
  );
}

export default async function Agenda({
  searchParams,
}: { searchParams: Promise<{ visao?: string; data?: string; pessoa?: string; cliente?: string; area?: string; nova?: string; lanc?: string; tarefa?: string }> }) {
  const supabase = await supabaseServer();
  const { data: auth } = await usuarioAtual();
  const meuId = auth.user!.id;
  const eu = await pessoaAtual();
  const admin = eu?.papel === "admin";

  const [pessoasRes, clientesRes, areasRes, lancRes] = await Promise.all([
    supabase.from("pessoas").select("id,nome").eq("ativo", true).order("nome"),
    supabase.from("clientes").select("id,nome").eq("ativo", true).order("nome"),
    supabase.from("areas").select("id,codigo,nome").eq("ativo", true).order("nome"),
    supabase.from("lancamentos").select("id,codigo,cor,nome").neq("status", "encerrado").order("codigo"),
  ]);
  const pessoas = (pessoasRes.data ?? []) as Opcao[];
  const clientes = (clientesRes.data ?? []) as Opcao[];
  const areas = (areasRes.data ?? []) as Area[];
  const lancs = ((lancRes.data ?? []) as LancamentoOpcao[]).filter((l) => l.codigo);

  const sp = await searchParams;
  const hoje = hojeSP();
  const visao: Visao = sp.visao === "semana" || sp.visao === "dia" || sp.visao === "lista" ? sp.visao : "mes";
  const data = ehData(sp.data) ? sp.data : hoje;
  // Admin abre direto na própria visão; "Todas" só quando escolhe (pessoa=todas na URL)
  const padraoPessoa = pessoas.some((p) => p.id === meuId) ? meuId : "todas";
  const pessoa = admin ? (sp.pessoa === "todas" ? "todas" : sp.pessoa && pessoas.some((p) => p.id === sp.pessoa) ? sp.pessoa : padraoPessoa) : "todas";
  const cliente = sp.cliente && clientes.some((c) => c.id === sp.cliente) ? sp.cliente : "todos";
  const area = sp.area && areas.some((a) => a.id === sp.area) ? sp.area : "todas";
  const lanc = sp.lanc && lancs.some((l) => l.id === sp.lanc) ? sp.lanc : "todos";
  const nova = ehData(sp.nova) ? sp.nova : null;
  const tarefaId = sp.tarefa && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sp.tarefa) ? sp.tarefa : null;
  const abertaRes = tarefaId
    ? await supabase.from("v_tarefas")
        .select("id,titulo,cliente_id,cliente,area,responsavel_id,responsavel,status,etapa_atual,estado_atual,proxima_acao,prazo,prazo_vez,atrasada,bloco,notas,lancamentos,etapas_total,horario,co_responsavel_ids,co_responsaveis")
        .eq("id", tarefaId).is("arquivada_em", null).maybeSingle()
    : null;
  const aberta = (abertaRes?.data ?? null) as unknown as TarefaView | null;
  const linksAbertos = aberta
    ? (((await supabase.from("links").select("id,tarefa_id,titulo,url").eq("tarefa_id", aberta.id).order("criado_em")).data ?? []) as TarefaLink[])
    : [];
  const dono = admin ? (pessoa !== "todas" ? pessoa : null) : meuId;

  // Intervalo que a visão precisa
  let ini: string;
  let fim: string;
  if (visao === "mes" || visao === "lista") {
    ini = segundaDe(inicioMes(data));
    fim = domingoDe(fimMes(data));
  } else if (visao === "semana") {
    ini = segundaDe(data);
    fim = domingoDe(data);
  } else {
    ini = data;
    fim = data;
  }

  let etapasQ = supabase
    .from("tarefa_etapas")
    .select("id,ordem,nome,prazo_previsto,responsavel:pessoas(nome),tarefa:tarefas!inner(id,titulo,etapa_atual,status,arquivada_em,cliente_id,area_id,cliente:clientes(nome),area:areas(nome))")
    .is("concluida_em", null)
    .gte("prazo_previsto", ini)
    .lte("prazo_previsto", fim)
    .limit(1000);
  if (dono) etapasQ = etapasQ.eq("responsavel_id", dono);

  const filtrar = <T extends { eq: (c: string, v: string) => T; contains: (c: string, v: string[]) => T; or: (f: string) => T }>(q: T): T => {
    let r = q;
    if (dono) r = r.or(filtroResponsavel(dono));
    if (cliente !== "todos") r = r.eq("cliente_id", cliente);
    if (area !== "todas") r = r.eq("area_id", area);
    if (lanc !== "todos") r = r.contains("lancamento_ids", [lanc]);
    return r;
  };
  const colunas = "id,titulo,cliente,area,responsavel,proxima_acao,etapa_atual,prazo,prazo_vez,horario,lancamentos";

  const [etapasRes, simplesRes, atrasadasRes] = await Promise.all([
    etapasQ,
    filtrar(
      supabase.from("v_tarefas").select(colunas).is("etapa_atual", null).neq("status", "concluida").is("arquivada_em", null)
        .gte("prazo", ini).lte("prazo", fim).limit(500),
    ),
    filtrar(supabase.from("v_tarefas").select(colunas).eq("atrasada", true).order("prazo_vez", { ascending: true }).limit(100)),
  ]);

  const atrasadasRows = (atrasadasRes.data ?? []) as unknown as TarefaRow[];
  const atrasadasIds = new Set(atrasadasRows.map((t) => t.id));
  const etapasRows = (etapasRes.data ?? []) as unknown as EtapaRow[];
  const tagsEtapas = await etiquetasDeTarefas(supabase, etapasRows.map((e) => e.tarefa.id));

  const itens: Item[] = [];
  for (const e of etapasRows) {
    const t = e.tarefa;
    if (t.status === "concluida" || t.arquivada_em) continue;
    if (cliente !== "todos" && t.cliente_id !== cliente) continue;
    if (area !== "todas" && t.area_id !== area) continue;
    if (lanc !== "todos" && !(tagsEtapas.get(t.id) ?? []).some((x) => x.id === lanc)) continue;
    const atual = t.etapa_atual === e.ordem;
    if (atual && atrasadasIds.has(t.id)) continue;
    itens.push({
      chave: `e-${e.id}`, tarefaId: t.id, titulo: t.titulo, cliente: t.cliente?.nome ?? null, area: t.area?.nome ?? null,
      quem: primeiro(e.responsavel?.nome ?? null), rotulo: e.nome, futuro: t.etapa_atual !== null && e.ordem > t.etapa_atual, data: e.prazo_previsto, lancamentos: tagsEtapas.get(t.id) ?? null,
    });
  }
  for (const t of (simplesRes.data ?? []) as unknown as TarefaRow[]) {
    itens.push({ chave: `t-${t.id}`, tarefaId: t.id, titulo: t.titulo, cliente: t.cliente, area: t.area, quem: primeiro(t.responsavel), rotulo: null, futuro: false, data: t.prazo, horario: t.horario, movel: true, lancamentos: t.lancamentos });
  }
  // Prévia das recorrentes: o que ainda vai ser gerado nesse período (cada um vê as regras em que é responsável; admin vê todas)
  {
    const regrasRes = await supabase.from("recorrentes")
      .select("id,titulo,cliente_id,area_id,responsavel_id,responsaveis_extras,lancamento_id,frequencia,dias_semana,intervalo_semanas,dia_mes,ultimo_dia_util,prazo_dias_uteis,horario,inicio,fim,ultima_geracao")
      .eq("ativo", true);
    const nomeDe = (id: string) => primeiro(pessoas.find((p) => p.id === id)?.nome ?? null);
    for (const r of (regrasRes.data ?? []) as unknown as RegraRecorrente[]) {
      const time = [r.responsavel_id, ...(r.responsaveis_extras ?? [])];
      if (dono && !time.includes(dono)) continue;
      if (cliente !== "todos" && r.cliente_id !== cliente) continue;
      if (area !== "todas" && r.area_id !== area) continue;
      if (lanc !== "todos" && r.lancamento_id !== lanc) continue;
      for (const o of previaRecorrente(r, ini, fim, hoje)) {
        // já existe a tarefa desse dia (nasceu do evento do Google ou já foi gerada): não repete
        if (itens.some((i) => i.data === o.prazo && i.titulo.trim().toLowerCase() === r.titulo.trim().toLowerCase())) continue;
        itens.push({
          chave: `r-${r.id}-${o.prazo}`, titulo: r.titulo, cliente: null, area: null,
          quem: time.map(nomeDe).filter(Boolean).join(", ") || null, rotulo: "recorrente", futuro: true, data: o.prazo, horario: r.horario,
        });
      }
    }
  }
  const porDia = (d: string) => itens.filter((i) => i.data === d).sort((x, y) => (x.horario ?? "99:99").localeCompare(y.horario ?? "99:99"));

  // Endereços que mantêm filtros e visão
  const href = (novo: { visao?: Visao; data?: string; nova?: string; tarefa?: string }) => {
    const p = new URLSearchParams();
    const v = novo.visao ?? visao;
    const d = novo.data ?? data;
    if (v !== "mes") p.set("visao", v);
    if (d !== hoje) p.set("data", d);
    if (admin && pessoa !== padraoPessoa) p.set("pessoa", pessoa);
    if (cliente !== "todos") p.set("cliente", cliente);
    if (area !== "todas") p.set("area", area);
    if (lanc !== "todos") p.set("lanc", lanc);
    if (novo.nova) p.set("nova", novo.nova);
    if (novo.tarefa) p.set("tarefa", novo.tarefa);
    const s = p.toString();
    return s ? `/agenda?${s}` : "/agenda";
  };

  const anterior = visao === "mes" || visao === "lista" ? somarMeses(data, -1) : somarDias(data, visao === "semana" ? -7 : -1);
  const proximo = visao === "mes" || visao === "lista" ? somarMeses(data, 1) : somarDias(data, visao === "semana" ? 7 : 1);
  const rotuloPeriodo = visao === "mes" || visao === "lista" ? rotuloMes(data) : visao === "semana" ? `${ddmm(ini)} a ${ddmm(fim)}` : dataExtensa(data);
  const noPeriodoAtual = visao === "mes" || visao === "lista" ? inicioMes(data) === inicioMes(hoje) : visao === "semana" ? segundaDe(data) === segundaDe(hoje) : data === hoje;

  const fixos: Record<string, string> = {};
  if (visao !== "mes") fixos.visao = visao;
  if (data !== hoje) fixos.data = data;
  const exportFiltros = [dono ? `pessoa=${dono}` : "", cliente !== "todos" ? `cliente=${cliente}` : "", area !== "todas" ? `area=${area}` : "", lanc !== "todos" ? `lanc=${lanc}` : ""].filter(Boolean).join("&");
  const abrir = (i: Item) => (i.tarefaId ? href({ tarefa: i.tarefaId }) : undefined);
  // Aviso na tela removido a pedido da Iza; o erro real fica no log do servidor (Vercel)
  for (const [n, r] of [["etapas", etapasRes], ["simples", simplesRes], ["atrasadas", atrasadasRes]] as const) {
    if (r.error) console.error(`[agenda] consulta ${n}:`, r.error.message);
  }

  const semanasMes = visao === "mes" ? Math.round((new Date(fim).getTime() - new Date(ini).getTime()) / 86400000 + 1) / 7 : 0;
  const diasGrade = visao === "mes" ? Array.from({ length: semanasMes * 7 }, (_, n) => somarDias(ini, n)) : [];
  const diasSemana = visao === "semana" ? Array.from({ length: 7 }, (_, n) => somarDias(ini, n)) : [];
  const VISIVEIS_ATRASADAS = 6;

  return (
    <div>
      <p className="label">Prazos e entregas, em dias úteis</p>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[30px] font-semibold leading-none tracking-tight">Agenda</h1>
        <div role="tablist" aria-label="Visão" className="inline-flex rounded-lg bg-panel2 p-1">
          {VISOES.map((v) => (
            <Link key={v.id} role="tab" aria-selected={v.id === visao} href={href({ visao: v.id })}
              className={`rounded-md px-3.5 py-1.5 text-[13px] transition-colors ${v.id === visao ? "bg-[var(--panel)] font-medium text-tx shadow-sm" : "text-tx2 hover:text-tx"}`}>
              {v.nome}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <FiltrosVisao base="/agenda" admin={admin} pessoas={pessoas} clientes={clientes} areas={areas}
          valores={{ pessoa, cliente, area, lanc }} padraoPessoa={padraoPessoa} fixos={fixos} lancamentos={lancs} />
        <nav className="flex items-center gap-1.5" aria-label="Período">
          <Link href={href({ data: anterior })} className="btn btn-ghost !h-9 !w-9 !px-0" aria-label="Período anterior"><ChevronLeft size={16} /></Link>
          <span className="mono min-w-[150px] text-center text-[13px] text-tx2">{rotuloPeriodo}</span>
          <Link href={href({ data: proximo })} className="btn btn-ghost !h-9 !w-9 !px-0" aria-label="Próximo período"><ChevronRight size={16} /></Link>
          {!noPeriodoAtual && <Link href={href({ data: hoje })} className="btn !h-9">Hoje</Link>}
        </nav>
      </div>

      <div className="mt-4">
        <ImportarExportar admin={admin} filtros={exportFiltros} lancamentoId={lanc !== "todos" ? lanc : undefined} />
      </div>

      {aberta && (
        <GavetaTarefa fecharHref={href({})}>
          <TarefaCard key={aberta.id} t={aberta} hoje={hoje} admin={admin} pessoas={pessoas} links={linksAbertos} abrirDetalhes />
        </GavetaTarefa>
      )}
      {tarefaId && !aberta && (
        <p role="status" className="mt-6 rounded-lg bg-panel2 px-4 py-3 text-sm text-tx2">
          Não achei essa tarefa. Ela pode ter sido arquivada ou você não tem acesso. <Link className="underline" href={href({})}>Fechar</Link>
        </p>
      )}

      {nova && (
        <div>
          <NovaTarefa key={nova} admin={admin} socia={!!eu?.socia} meuId={meuId} clientes={clientes} areas={areas} pessoas={pessoas}
            modelos={[]} papeisCliente={[]} lancamentos={lancs} prazoInicial={nova} fecharHref={href({})} />
        </div>
      )}

      {atrasadasRows.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-3 flex items-center gap-2.5">
            <span className="label !text-danger">Atrasadas</span>
            <span className="mono rounded-md bg-panel2 px-1.5 text-[11px] text-tx2">{atrasadasRows.length}</span>
            <span className="h-px flex-1 bg-[var(--line)]" />
          </h2>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {atrasadasRows.slice(0, VISIVEIS_ATRASADAS).map((t) => (
              (() => {
              const i: Item = {
                chave: t.id, tarefaId: t.id, titulo: t.titulo, cliente: t.cliente, area: t.area, quem: primeiro(t.responsavel),
                rotulo: t.etapa_atual !== null ? t.proxima_acao : null, futuro: false, data: t.prazo_vez, movel: t.etapa_atual === null, lancamentos: t.lancamentos,
              };
              return <Movel key={t.id} i={i}><CartaoItem tom="atrasada" admin={admin} i={i} abrir={abrir(i)} /></Movel>;
            })()
            ))}
          </div>
          {atrasadasRows.length > VISIVEIS_ATRASADAS && (
            <p className="mt-2 text-xs text-tx3">e mais {atrasadasRows.length - VISIVEIS_ATRASADAS}. Veja todas no <Link className="underline" href="/quadro">Quadro</Link>.</p>
          )}
        </section>
      )}

      {visao === "lista" && (
        <div className="panel mt-7 overflow-hidden">
          {itens.filter((i) => i.data).length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-tx2">Nada com prazo neste mês.</p>
          ) : (
            <>
              <CabecalhoLista />
              <ul>
                {itens.filter((i) => i.data).sort((a, b) => (a.data ?? "").localeCompare(b.data ?? "") || (a.horario ?? "99:99").localeCompare(b.horario ?? "99:99")).map((i) => (
                  <LinhaLista key={i.chave} d={{
                    chave: i.chave, titulo: i.titulo, sub: `${i.cliente ?? "Interna"}${i.area ? ` · ${i.area}` : ""}`, lancamentos: i.lancamentos ?? null,
                    etapa: null, total: 0, acao: i.rotulo, quem: i.quem, prazoTexto: ddmm(i.data!), prazoClasse: "bg-panel2 text-tx2", futuro: i.futuro,
                  }} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {visao === "mes" && (
        <div className="-mx-5 mt-7 overflow-x-auto px-5 pb-2 md:-mx-9 md:px-9">
          <div className="min-w-[840px] overflow-hidden rounded-xl border border-[var(--line)] bg-panel">
            <div className="grid grid-cols-7 border-b border-[var(--line)] bg-panel2">
              {SEMANA_CURTA.map((n, idx) => (
                <div key={n} className={`label px-2.5 py-2 ${idx > 4 ? "!text-tx3" : ""}`}>{n}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {diasGrade.map((d, idx) => {
                const doDia = porDia(d);
                const fora = d.slice(0, 7) !== data.slice(0, 7);
                const fds = idx % 7 > 4;
                const ehHoje = d === hoje;
                return (
                  <DiaAlvo key={d} data={d} className={`group relative min-h-[116px] border-b border-r border-[var(--line)] p-1.5 ${fds ? "bg-panel2/60" : ""} ${fora ? "opacity-50" : ""}`}>
                    <Link href={href({ visao: "dia", data: d })} aria-label={`Abrir ${diaSemanaLongo(d)}, ${ddmm(d)}`}
                      className={`mono mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-xs hover:bg-panel2 ${ehHoje ? "bg-[var(--gold)] font-medium text-white" : "text-tx2"}`}>
                      {diaDoMes(d)}
                    </Link>
                    <Link href={href({ nova: d })} scroll={false} aria-label={`Adicionar tarefa em ${ddmm(d)}`} title="Adicionar tarefa"
                      className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md text-tx2 opacity-0 transition-opacity hover:bg-panel2 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-60">
                      <Plus size={14} />
                    </Link>
                    <div className="space-y-1">
                      {doDia.slice(0, 3).map((i) => <Movel key={i.chave} i={i}><Mini i={i} abrir={abrir(i)} /></Movel>)}
                      {doDia.length > 3 && (
                        <MaisNoDia total={doDia.length - 3} rotulo={ddmm(d)}>
                          {doDia.slice(3).map((i) => <Movel key={i.chave} i={i}><Mini i={i} abrir={abrir(i)} /></Movel>)}
                        </MaisNoDia>
                      )}
                    </div>
                  </DiaAlvo>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {visao === "semana" && (
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {diasSemana.slice(0, 5).map((d) => {
            const doDia = porDia(d);
            const ehHoje = d === hoje;
            return (
              <DiaAlvo as="section" key={d} data={d} aria-label={`${diaSemanaLongo(d)}, ${ddmm(d)}`} className={`rounded-xl p-2.5 ${ehHoje ? "bg-goldbg/40 ring-1 ring-[var(--gold)]" : ""}`}>
                <h2 className="mb-2.5 flex items-baseline justify-between px-0.5">
                  <Link href={href({ visao: "dia", data: d })} className={`text-sm font-medium hover:underline ${ehHoje ? "text-gold" : ""}`}>{diaSemanaLongo(d)}</Link>
                  <span className="mono flex items-center gap-1.5 text-xs text-tx3">
                    {ddmm(d)}
                    <Link href={href({ nova: d })} scroll={false} aria-label={`Adicionar tarefa em ${ddmm(d)}`} title="Adicionar tarefa" className="inline-flex h-6 w-6 items-center justify-center rounded-md text-tx2 hover:bg-panel2"><Plus size={14} /></Link>
                  </span>
                </h2>
                <div className="space-y-2">
                  {doDia.length === 0 ? <p className="px-0.5 text-xs text-tx3">Nada neste dia</p> : doDia.map((i) => <Movel key={i.chave} i={i}><CartaoItem i={i} admin={admin} abrir={abrir(i)} /></Movel>)}
                </div>
              </DiaAlvo>
            );
          })}
        </div>
      )}
      {visao === "semana" && diasSemana.slice(5).some((d) => porDia(d).length > 0) && (
        <section className="mt-6" aria-label="Fim de semana">
          <h2 className="mb-3 flex items-center gap-2.5">
            <span className="label">Fim de semana</span>
            <span className="h-px flex-1 bg-[var(--line)]" />
          </h2>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {diasSemana.slice(5).flatMap((d) => porDia(d)).map((i) => <CartaoItem key={i.chave} i={i} admin={admin} abrir={abrir(i)} />)}
          </div>
        </section>
      )}

      {visao === "dia" && (
        <section className="mt-7" aria-label={`${diaSemanaLongo(data)}, ${ddmm(data)}`}>
          <div className="mb-3 flex justify-end">
            <Link href={href({ nova: data })} scroll={false} className="btn"><Plus size={15} /> Adicionar tarefa neste dia</Link>
          </div>
          {porDia(data).length === 0 ? (
            <div className="panel px-6 py-10 text-center">
              <p className="text-[15px] font-medium">Nada marcado para este dia</p>
              <p className="mt-1 text-sm text-tx2">Prazos e etapas com data neste dia aparecem aqui.</p>
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {porDia(data).map((i) => <CartaoItem key={i.chave} i={i} admin={admin} abrir={abrir(i)} />)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

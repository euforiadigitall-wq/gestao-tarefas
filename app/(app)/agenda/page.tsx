import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FiltrosVisao } from "@/components/FiltrosVisao";
import {
  dataExtensa, ddmm, diaDoMes, diaSemanaLongo, domingoDe, ehData, fimMes, hojeSP, inicioMes, rotuloMes, segundaDe, somarDias, somarMeses,
} from "@/lib/datas";
import { supabaseServer } from "@/lib/supabase/server";
import type { Area, Opcao, Pessoa } from "@/lib/tipos";

export const metadata: Metadata = { title: "Agenda" };
export const dynamic = "force-dynamic";

type Visao = "mes" | "semana" | "dia";
const VISOES: { id: Visao; nome: string }[] = [
  { id: "mes", nome: "Mês" },
  { id: "semana", nome: "Semana" },
  { id: "dia", nome: "Dia" },
];
const SEMANA_CURTA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

interface Item {
  chave: string;
  titulo: string;
  cliente: string | null;
  area: string | null;
  quem: string | null;
  rotulo: string | null;
  futuro: boolean;
  data: string | null;
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
}

const primeiro = (n: string | null) => (n ? n.split(" ")[0] : null);

function CartaoItem({ i, tom }: { i: Item; tom?: "atrasada" }) {
  return (
    <article className={`panel relative overflow-hidden py-2.5 pl-3.5 pr-3 ${i.futuro ? "opacity-70" : ""}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${tom === "atrasada" ? "bg-[var(--danger)]" : i.futuro ? "bg-[var(--line)]" : "bg-[var(--info)]"}`} aria-hidden="true" />
      <h3 className="text-[13px] font-medium leading-snug">{i.titulo}</h3>
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
    </article>
  );
}

function Mini({ i }: { i: Item }) {
  const dica = [i.titulo, i.cliente ?? "Interna", i.rotulo, i.quem].filter(Boolean).join(" · ");
  return (
    <div title={dica} className={`relative truncate rounded-md bg-panel py-1 pl-2.5 pr-1.5 text-[11px] leading-tight ring-1 ring-[var(--line)] ${i.futuro ? "text-tx3" : "text-tx"}`}>
      <span className={`absolute inset-y-0 left-0 w-[3px] rounded-l-md ${i.futuro ? "bg-[var(--line-strong)]" : "bg-[var(--info)]"}`} aria-hidden="true" />
      {i.titulo}
    </div>
  );
}

export default async function Agenda({
  searchParams,
}: { searchParams: Promise<{ visao?: string; data?: string; pessoa?: string; cliente?: string; area?: string }> }) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const meuId = auth.user!.id;
  const { data: eu } = await supabase.from("pessoas").select("id,nome,papel").eq("id", meuId).single<Pessoa>();
  const admin = eu?.papel === "admin";

  const [pessoasRes, clientesRes, areasRes] = await Promise.all([
    supabase.from("pessoas").select("id,nome").eq("ativo", true).order("nome"),
    supabase.from("clientes").select("id,nome").eq("ativo", true).order("nome"),
    supabase.from("areas").select("id,codigo,nome").eq("ativo", true).order("nome"),
  ]);
  const pessoas = (pessoasRes.data ?? []) as Opcao[];
  const clientes = (clientesRes.data ?? []) as Opcao[];
  const areas = (areasRes.data ?? []) as Area[];

  const sp = await searchParams;
  const hoje = hojeSP();
  const visao: Visao = sp.visao === "semana" || sp.visao === "dia" ? sp.visao : "mes";
  const data = ehData(sp.data) ? sp.data : hoje;
  const pessoa = admin && sp.pessoa && pessoas.some((p) => p.id === sp.pessoa) ? sp.pessoa : "todas";
  const cliente = sp.cliente && clientes.some((c) => c.id === sp.cliente) ? sp.cliente : "todos";
  const area = sp.area && areas.some((a) => a.id === sp.area) ? sp.area : "todas";
  const dono = admin ? (pessoa !== "todas" ? pessoa : null) : meuId;

  // Intervalo que a visão precisa
  let ini: string;
  let fim: string;
  if (visao === "mes") {
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

  const filtrar = <T extends { eq: (c: string, v: string) => T }>(q: T): T => {
    let r = q;
    if (dono) r = r.eq("responsavel_id", dono);
    if (cliente !== "todos") r = r.eq("cliente_id", cliente);
    if (area !== "todas") r = r.eq("area_id", area);
    return r;
  };
  const colunas = "id,titulo,cliente,area,responsavel,proxima_acao,etapa_atual,prazo,prazo_vez";

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

  const itens: Item[] = [];
  for (const e of (etapasRes.data ?? []) as unknown as EtapaRow[]) {
    const t = e.tarefa;
    if (t.status === "concluida" || t.arquivada_em) continue;
    if (cliente !== "todos" && t.cliente_id !== cliente) continue;
    if (area !== "todas" && t.area_id !== area) continue;
    const atual = t.etapa_atual === e.ordem;
    if (atual && atrasadasIds.has(t.id)) continue;
    itens.push({
      chave: `e-${e.id}`, titulo: t.titulo, cliente: t.cliente?.nome ?? null, area: t.area?.nome ?? null,
      quem: primeiro(e.responsavel?.nome ?? null), rotulo: e.nome, futuro: t.etapa_atual !== null && e.ordem > t.etapa_atual, data: e.prazo_previsto,
    });
  }
  for (const t of (simplesRes.data ?? []) as unknown as TarefaRow[]) {
    itens.push({ chave: `t-${t.id}`, titulo: t.titulo, cliente: t.cliente, area: t.area, quem: primeiro(t.responsavel), rotulo: null, futuro: false, data: t.prazo });
  }
  const porDia = (d: string) => itens.filter((i) => i.data === d);

  // Endereços que mantêm filtros e visão
  const href = (novo: { visao?: Visao; data?: string }) => {
    const p = new URLSearchParams();
    const v = novo.visao ?? visao;
    const d = novo.data ?? data;
    if (v !== "mes") p.set("visao", v);
    if (d !== hoje) p.set("data", d);
    if (admin && pessoa !== "todas") p.set("pessoa", pessoa);
    if (cliente !== "todos") p.set("cliente", cliente);
    if (area !== "todas") p.set("area", area);
    const s = p.toString();
    return s ? `/agenda?${s}` : "/agenda";
  };

  const anterior = visao === "mes" ? somarMeses(data, -1) : somarDias(data, visao === "semana" ? -7 : -1);
  const proximo = visao === "mes" ? somarMeses(data, 1) : somarDias(data, visao === "semana" ? 7 : 1);
  const rotuloPeriodo = visao === "mes" ? rotuloMes(data) : visao === "semana" ? `${ddmm(ini)} a ${ddmm(fim)}` : dataExtensa(data);
  const noPeriodoAtual = visao === "mes" ? inicioMes(data) === inicioMes(hoje) : visao === "semana" ? segundaDe(data) === segundaDe(hoje) : data === hoje;

  const fixos: Record<string, string> = {};
  if (visao !== "mes") fixos.visao = visao;
  if (data !== hoje) fixos.data = data;
  const erro = etapasRes.error || simplesRes.error || atrasadasRes.error;

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
          valores={{ pessoa, cliente, area }} fixos={fixos} />
        <nav className="flex items-center gap-1.5" aria-label="Período">
          <Link href={href({ data: anterior })} className="btn btn-ghost !h-9 !w-9 !px-0" aria-label="Período anterior"><ChevronLeft size={16} /></Link>
          <span className="mono min-w-[150px] text-center text-[13px] text-tx2">{rotuloPeriodo}</span>
          <Link href={href({ data: proximo })} className="btn btn-ghost !h-9 !w-9 !px-0" aria-label="Próximo período"><ChevronRight size={16} /></Link>
          {!noPeriodoAtual && <Link href={href({ data: hoje })} className="btn !h-9">Hoje</Link>}
        </nav>
      </div>

      {erro && (
        <p role="alert" className="mt-6 rounded-lg bg-dangerbg px-4 py-3 text-sm text-danger">
          Não consegui carregar a agenda agora. Atualize a página; se continuar, avise a Iza.
        </p>
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
              <CartaoItem key={t.id} tom="atrasada" i={{
                chave: t.id, titulo: t.titulo, cliente: t.cliente, area: t.area, quem: primeiro(t.responsavel),
                rotulo: t.etapa_atual !== null ? t.proxima_acao : null, futuro: false, data: t.prazo_vez,
              }} />
            ))}
          </div>
          {atrasadasRows.length > VISIVEIS_ATRASADAS && (
            <p className="mt-2 text-xs text-tx3">e mais {atrasadasRows.length - VISIVEIS_ATRASADAS}. Veja todas no <Link className="underline" href="/quadro">Quadro</Link>.</p>
          )}
        </section>
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
                  <div key={d} className={`min-h-[116px] border-b border-r border-[var(--line)] p-1.5 ${fds ? "bg-panel2/60" : ""} ${fora ? "opacity-50" : ""}`}>
                    <Link href={href({ visao: "dia", data: d })} aria-label={`Abrir ${diaSemanaLongo(d)}, ${ddmm(d)}`}
                      className={`mono mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-xs hover:bg-panel2 ${ehHoje ? "bg-[var(--gold)] font-medium text-white" : "text-tx2"}`}>
                      {diaDoMes(d)}
                    </Link>
                    <div className="space-y-1">
                      {doDia.slice(0, 3).map((i) => <Mini key={i.chave} i={i} />)}
                      {doDia.length > 3 && (
                        <Link href={href({ visao: "dia", data: d })} className="block px-1 text-[11px] text-tx2 hover:underline">+{doDia.length - 3} mais</Link>
                      )}
                    </div>
                  </div>
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
              <section key={d} aria-label={`${diaSemanaLongo(d)}, ${ddmm(d)}`} className={`rounded-xl p-2.5 ${ehHoje ? "bg-goldbg/40 ring-1 ring-[var(--gold)]" : ""}`}>
                <h2 className="mb-2.5 flex items-baseline justify-between px-0.5">
                  <Link href={href({ visao: "dia", data: d })} className={`text-sm font-medium hover:underline ${ehHoje ? "text-gold" : ""}`}>{diaSemanaLongo(d)}</Link>
                  <span className="mono text-xs text-tx3">{ddmm(d)}</span>
                </h2>
                <div className="space-y-2">
                  {doDia.length === 0 ? <p className="px-0.5 text-xs text-tx3">Nada neste dia</p> : doDia.map((i) => <CartaoItem key={i.chave} i={i} />)}
                </div>
              </section>
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
            {diasSemana.slice(5).flatMap((d) => porDia(d)).map((i) => <CartaoItem key={i.chave} i={i} />)}
          </div>
        </section>
      )}

      {visao === "dia" && (
        <section className="mt-7" aria-label={`${diaSemanaLongo(data)}, ${ddmm(data)}`}>
          {porDia(data).length === 0 ? (
            <div className="panel px-6 py-10 text-center">
              <p className="text-[15px] font-medium">Nada marcado para este dia</p>
              <p className="mt-1 text-sm text-tx2">Prazos e etapas com data neste dia aparecem aqui.</p>
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {porDia(data).map((i) => <CartaoItem key={i.chave} i={i} />)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

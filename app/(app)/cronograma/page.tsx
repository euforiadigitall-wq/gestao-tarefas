import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FiltrosVisao } from "@/components/FiltrosVisao";
import { ddmm, diaSemanaLongo, ehData, hojeSP, segundaDe, somarDias } from "@/lib/datas";
import { supabaseServer } from "@/lib/supabase/server";
import type { Area, Opcao, Pessoa } from "@/lib/tipos";

export const metadata: Metadata = { title: "Cronograma" };
export const dynamic = "force-dynamic";

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

export default async function Cronograma({
  searchParams,
}: { searchParams: Promise<{ semana?: string; pessoa?: string; cliente?: string; area?: string }> }) {
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
  const seg = segundaDe(ehData(sp.semana) ? sp.semana : hoje);
  const dom = somarDias(seg, 6);
  const pessoa = admin && sp.pessoa && pessoas.some((p) => p.id === sp.pessoa) ? sp.pessoa : "todas";
  const cliente = sp.cliente && clientes.some((c) => c.id === sp.cliente) ? sp.cliente : "todos";
  const area = sp.area && areas.some((a) => a.id === sp.area) ? sp.area : "todas";
  const dono = admin ? (pessoa !== "todas" ? pessoa : null) : meuId;

  let etapasQ = supabase
    .from("tarefa_etapas")
    .select("id,ordem,nome,prazo_previsto,responsavel:pessoas(nome),tarefa:tarefas!inner(id,titulo,etapa_atual,status,arquivada_em,cliente_id,area_id,cliente:clientes(nome),area:areas(nome))")
    .is("concluida_em", null)
    .gte("prazo_previsto", seg)
    .lte("prazo_previsto", dom)
    .limit(500);
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
        .gte("prazo", seg).lte("prazo", dom).limit(300),
    ),
    filtrar(
      supabase.from("v_tarefas").select(colunas).eq("atrasada", true).order("prazo_vez", { ascending: true }).limit(100),
    ),
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

  const dias = Array.from({ length: 5 }, (_, n) => somarDias(seg, n));
  const fimDeSemana = itens.filter((i) => i.data === somarDias(seg, 5) || i.data === dom);
  const porDia = (d: string) => itens.filter((i) => i.data === d);

  const fixos: Record<string, string> = { semana: seg };
  const qsNav = (semana: string) => {
    const p = new URLSearchParams();
    if (semana !== segundaDe(hoje)) p.set("semana", semana);
    if (admin && pessoa !== "todas") p.set("pessoa", pessoa);
    if (cliente !== "todos") p.set("cliente", cliente);
    if (area !== "todas") p.set("area", area);
    const s = p.toString();
    return s ? `/cronograma?${s}` : "/cronograma";
  };
  const erro = etapasRes.error || simplesRes.error || atrasadasRes.error;

  return (
    <div>
      <p className="label">Dias úteis, segunda a sexta</p>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[30px] font-semibold leading-none tracking-tight">Cronograma</h1>
        <nav className="flex items-center gap-1.5" aria-label="Semana">
          <Link href={qsNav(somarDias(seg, -7))} className="btn btn-ghost !h-9 !w-9 !px-0" aria-label="Semana anterior"><ChevronLeft size={16} /></Link>
          <span className="mono min-w-[120px] text-center text-[13px] text-tx2">{ddmm(seg)} a {ddmm(dom)}</span>
          <Link href={qsNav(somarDias(seg, 7))} className="btn btn-ghost !h-9 !w-9 !px-0" aria-label="Próxima semana"><ChevronRight size={16} /></Link>
          {seg !== segundaDe(hoje) && <Link href={qsNav(segundaDe(hoje))} className="btn !h-9">Esta semana</Link>}
        </nav>
      </div>

      <div className="mt-6">
        <FiltrosVisao base="/cronograma" admin={admin} pessoas={pessoas} clientes={clientes} areas={areas}
          valores={{ pessoa, cliente, area }} fixos={seg === segundaDe(hoje) ? {} : fixos} />
      </div>

      {erro && (
        <p role="alert" className="mt-6 rounded-lg bg-dangerbg px-4 py-3 text-sm text-danger">
          Não consegui carregar o cronograma agora. Atualize a página; se continuar, avise a Iza.
        </p>
      )}

      {atrasadasRows.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2.5">
            <span className="label !text-danger">Atrasadas</span>
            <span className="mono rounded-md bg-panel2 px-1.5 text-[11px] text-tx2">{atrasadasRows.length}</span>
            <span className="h-px flex-1 bg-[var(--line)]" />
          </h2>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {atrasadasRows.map((t) => (
              <CartaoItem key={t.id} tom="atrasada" i={{
                chave: t.id, titulo: t.titulo, cliente: t.cliente, area: t.area, quem: primeiro(t.responsavel),
                rotulo: t.etapa_atual !== null ? t.proxima_acao : null, futuro: false, data: t.prazo_vez,
              }} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {dias.map((d) => {
          const doDia = porDia(d);
          const ehHoje = d === hoje;
          return (
            <section key={d} aria-label={`${diaSemanaLongo(d)}, ${ddmm(d)}`} className={`rounded-xl p-2.5 ${ehHoje ? "bg-goldbg/40 ring-1 ring-[var(--gold)]" : ""}`}>
              <h2 className="mb-2.5 flex items-baseline justify-between px-0.5">
                <span className={`text-sm font-medium ${ehHoje ? "text-gold" : ""}`}>{diaSemanaLongo(d)}</span>
                <span className="mono text-xs text-tx3">{ddmm(d)}</span>
              </h2>
              <div className="space-y-2">
                {doDia.length === 0 ? <p className="px-0.5 text-xs text-tx3">Nada neste dia</p> : doDia.map((i) => <CartaoItem key={i.chave} i={i} />)}
              </div>
            </section>
          );
        })}
      </div>

      {fimDeSemana.length > 0 && (
        <section className="mt-6" aria-label="Fim de semana">
          <h2 className="mb-3 flex items-center gap-2.5">
            <span className="label">Fim de semana</span>
            <span className="mono rounded-md bg-panel2 px-1.5 text-[11px] text-tx2">{fimDeSemana.length}</span>
            <span className="h-px flex-1 bg-[var(--line)]" />
          </h2>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">{fimDeSemana.map((i) => <CartaoItem key={i.chave} i={i} />)}</div>
        </section>
      )}
    </div>
  );
}

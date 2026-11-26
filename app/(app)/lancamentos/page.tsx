import type { Metadata } from "next";
import Link from "next/link";
import { ImportarExportar } from "@/components/ImportarExportar";
import { NovoLancamento, type CopiaLancamento } from "@/components/NovoLancamento";
import { Etiqueta } from "@/components/Etiqueta";
import { ddmm, hojeSP } from "@/lib/datas";
import { ETAPAS, etapaPelasDatas, nomeEtapa } from "@/lib/lancamentos";
import { pessoaAtual, supabaseServer, usuarioAtual } from "@/lib/supabase/server";
import type { Opcao, Pessoa } from "@/lib/tipos";

export const metadata: Metadata = { title: "Lançamentos" };
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
  cliente: { nome: string } | null;
  etapas: { etapa: string; ativa: boolean }[];
}

function Cartao({ l, resumo, hoje }: { l: Lanc; resumo: { tarefas: number; atrasadas: number; feitos: number; total: number; criticos: number; itensAtrasados: number }; hoje: string }) {
  const ativas = l.etapas.filter((e) => e.ativa).map((e) => e.etapa);
  const atual = etapaPelasDatas(l, ativas, hoje);
  const periodo = l.data_inicio || l.data_abertura || l.data_fechamento
    ? `${ddmm(l.data_inicio ?? l.data_abertura)} a ${ddmm(l.data_fechamento ?? l.data_abertura)}`
    : "sem datas";
  return (
    <Link href={`/lancamentos/${l.id}`} className="panel block px-5 py-4 transition-colors hover:border-[var(--line-strong)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            {l.codigo && <Etiqueta codigo={l.codigo} cor={l.cor} />}
            <span className="truncate text-[15px] font-medium">{l.nome}</span>
          </p>
          <p className="mt-1 text-[13px] text-tx2">{l.cliente?.nome ?? "Cliente"}</p>
        </div>
        <span className="mono shrink-0 text-[12px] text-tx3">{periodo}</span>
      </div>
      <div className="mt-3 flex gap-1" aria-hidden="true">
        {ETAPAS.map((e) => {
          const ligada = ativas.includes(e.id);
          const ativaAgora = e.id === atual;
          return <span key={e.id} className={`h-1.5 flex-1 rounded-full ${!ligada ? "border border-dashed border-[var(--line-strong)]" : ativaAgora ? "bg-[var(--accent)]" : "bg-[var(--line-strong)]"}`} />;
        })}
      </div>
      <p className="mt-1.5 text-[12px] text-tx2">
        Etapa pelas datas: <b className="font-medium text-tx">{nomeEtapa(atual).toLowerCase()}</b>
        <span className="sr-only"> (etapas ligadas: {ativas.map(nomeEtapa).join(", ")})</span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {resumo.atrasadas > 0 && <span className="chip bg-dangerbg text-danger">{resumo.atrasadas} tarefa{resumo.atrasadas > 1 ? "s" : ""} atrasada{resumo.atrasadas > 1 ? "s" : ""}</span>}
        {resumo.itensAtrasados > 0 && <span className="chip bg-dangerbg text-danger">{resumo.itensAtrasados} item{resumo.itensAtrasados > 1 ? "s" : ""} do checklist atrasado{resumo.itensAtrasados > 1 ? "s" : ""}</span>}
        {resumo.criticos > 0 && <span className="chip bg-goldbg text-gold">{resumo.criticos} crítico{resumo.criticos > 1 ? "s" : ""} em aberto</span>}
        <span className="chip bg-panel2 text-tx2">{resumo.tarefas} tarefa{resumo.tarefas === 1 ? "" : "s"} abertas</span>
        <span className="chip bg-panel2 text-tx2">checklist {resumo.feitos}/{resumo.total}</span>
      </div>
    </Link>
  );
}

export default async function Lancamentos({ searchParams }: { searchParams: Promise<{ copiar?: string }> }) {
  const { copiar } = await searchParams;
  const supabase = await supabaseServer();
  const { data: auth } = await usuarioAtual();
  const meuId = auth.user!.id;
  const eu = await pessoaAtual();
  const admin = eu?.papel === "admin";
  const hoje = hojeSP();

  const [lancRes, itensRes, tlRes, clientesRes, pessoasRes] = await Promise.all([
    supabase
      .from("lancamentos")
      .select("id,codigo,cor,nome,status,data_inicio,data_abertura,data_fechamento,cliente:clientes(nome),etapas:lancamento_etapas(etapa,ativa)")
      .order("data_abertura", { ascending: false, nullsFirst: false }),
    supabase.from("lancamento_checklist").select("lancamento_id,feito,critico,prazo"),
    supabase.from("tarefa_lancamentos").select("lancamento_id,tarefa_id"),
    admin ? supabase.from("clientes").select("id,nome").eq("ativo", true).order("nome") : Promise.resolve({ data: [] as unknown[] }),
    admin ? supabase.from("pessoas").select("id,nome").eq("ativo", true).order("nome") : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const lancs = (lancRes.data ?? []) as unknown as Lanc[];
  const itens = (itensRes.data ?? []) as { lancamento_id: string; feito: boolean; critico: boolean; prazo: string | null }[];
  const tl = (tlRes.data ?? []) as { lancamento_id: string; tarefa_id: string }[];
  const { data: tarefasData } = tl.length
    ? await supabase.from("v_tarefas").select("id,status,atrasada,arquivada_em").in("id", Array.from(new Set(tl.map((x) => x.tarefa_id))))
    : { data: [] as { id: string; status: string; atrasada: boolean; arquivada_em: string | null }[] };
  const tarefaPorId = new Map((tarefasData ?? []).map((t) => [t.id, t]));

  function resumoDe(id: string) {
    const meus = itens.filter((i) => i.lancamento_id === id);
    const abertos = meus.filter((i) => !i.feito);
    const ts = tl.filter((x) => x.lancamento_id === id).map((x) => tarefaPorId.get(x.tarefa_id)).filter((t) => t && t.status !== "concluida" && !t.arquivada_em);
    return {
      tarefas: ts.length,
      atrasadas: ts.filter((t) => t!.atrasada).length,
      feitos: meus.length - abertos.length,
      total: meus.length,
      criticos: abertos.filter((i) => i.critico).length,
      itensAtrasados: abertos.filter((i) => i.prazo && i.prazo < hoje).length,
    };
  }

  let copia: CopiaLancamento | null = null;
  if (admin && copiar && /^[0-9a-f-]{36}$/i.test(copiar)) {
    const [oRes, pRes] = await Promise.all([
      supabase.from("lancamentos").select("nome,cliente_id,cor,promocao_explicita,etapas:lancamento_etapas(etapa,ativa)").eq("id", copiar).maybeSingle(),
      supabase.from("lancamento_papeis").select("papel,pessoa_id").eq("lancamento_id", copiar),
    ]);
    const o = oRes.data as { nome: string; cliente_id: string; cor: string; promocao_explicita: boolean; etapas: { etapa: string; ativa: boolean }[] } | null;
    if (o) {
      copia = {
        clienteId: o.cliente_id, cor: o.cor, promocao: o.promocao_explicita, deNome: o.nome,
        etapas: o.etapas.filter((e) => e.ativa).map((e) => e.etapa),
        equipe: Object.fromEntries(((pRes.data ?? []) as { papel: string; pessoa_id: string | null }[]).filter((p) => p.pessoa_id).map((p) => [p.papel, p.pessoa_id as string])),
      };
    }
  }

  const andamento = lancs.filter((l) => l.status !== "encerrado");
  const encerrados = lancs.filter((l) => l.status === "encerrado");
  const falhou = lancRes.error || itensRes.error || tlRes.error;

  return (
    <div className="mx-auto max-w-[1000px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Cada lançamento tem o seu código</p>
          <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight">Lançamentos</h1>
        </div>
        {admin && <NovoLancamento key={copiar ?? "novo"} copia={copia} clientes={(clientesRes.data ?? []) as Opcao[]} pessoas={(pessoasRes.data ?? []) as Opcao[]} />}
      </div>

      <div className="mt-4">
        <ImportarExportar admin={admin} />
      </div>

      {falhou && (
        <p role="alert" className="mt-6 rounded-lg bg-dangerbg px-4 py-3 text-sm text-danger">
          Não consegui carregar os lançamentos agora. Atualize a página; se continuar, avise a Iza.
        </p>
      )}

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2.5">
          <span className="label">Em andamento</span>
          <span className="mono rounded-md bg-panel2 px-1.5 text-[11px] text-tx2">{andamento.length}</span>
          <span className="h-px flex-1 bg-[var(--line)]" />
        </h2>
        {andamento.length === 0 ? (
          <div className="panel px-6 py-10 text-center">
            <p className="text-[15px] font-medium">Nenhum lançamento em andamento</p>
            <p className="mt-1 text-sm text-tx2">{admin ? "Crie o primeiro em Novo lançamento." : "Quando você for liberado em um lançamento, ele aparece aqui."}</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {andamento.map((l) => <Cartao key={l.id} l={l} resumo={resumoDe(l.id)} hoje={hoje} />)}
          </div>
        )}
      </section>

      {encerrados.length > 0 && (
        <section className="mt-9">
          <h2 className="mb-3 flex items-center gap-2.5">
            <span className="label">Encerrados</span>
            <span className="mono rounded-md bg-panel2 px-1.5 text-[11px] text-tx2">{encerrados.length}</span>
            <span className="h-px flex-1 bg-[var(--line)]" />
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {encerrados.map((l) => <Cartao key={l.id} l={l} resumo={resumoDe(l.id)} hoje={hoje} />)}
          </div>
        </section>
      )}
    </div>
  );
}

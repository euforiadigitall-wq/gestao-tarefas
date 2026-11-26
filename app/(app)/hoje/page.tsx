import type { Metadata } from "next";
import { FilaCard } from "@/components/FilaCard";
import { NovaTarefa } from "@/components/NovaTarefa";
import { TarefaCard } from "@/components/TarefaCard";
import { TrocarPessoa } from "@/components/TrocarPessoa";
import { dataExtensa, hojeSP } from "@/lib/datas";
import { supabaseServer } from "@/lib/supabase/server";
import type { Area, Opcao, Pessoa, TarefaFila, TarefaView } from "@/lib/tipos";

export const metadata: Metadata = { title: "Hoje" };
export const dynamic = "force-dynamic";

interface EtapaFila {
  id: string;
  ordem: number;
  nome: string;
  prazo_previsto: string | null;
  tarefa: {
    id: string;
    titulo: string;
    etapa_atual: number | null;
    status: string;
    arquivada_em: string | null;
    cliente: { nome: string } | null;
  };
}

function Secao({ titulo, n, tom, children }: { titulo: string; n: number; tom?: "danger"; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="mb-3 flex items-center gap-2.5">
        <span className={`label ${tom === "danger" ? "!text-danger" : ""}`}>{titulo}</span>
        <span className="mono rounded-md bg-panel2 px-1.5 text-[11px] text-tx2">{n}</span>
        <span className="h-px flex-1 bg-[var(--line)]" />
      </h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Numero({ rotulo, valor, tom }: { rotulo: string; valor: number; tom?: string }) {
  return (
    <div className="panel px-5 py-4">
      <p className="label">{rotulo}</p>
      <p className={`mono mt-1.5 text-[34px] font-medium leading-none ${tom ?? ""}`}>{String(valor).padStart(2, "0")}</p>
    </div>
  );
}

export default async function Hoje({ searchParams }: { searchParams: Promise<{ pessoa?: string }> }) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const meuId = auth.user!.id;

  const { data: eu } = await supabase.from("pessoas").select("id,nome,papel").eq("id", meuId).single<Pessoa>();
  const admin = eu?.papel === "admin";

  const { data: pessoasLista } = await supabase.from("pessoas").select("id,nome").eq("ativo", true).order("nome");
  const pessoas = (pessoasLista ?? []) as Opcao[];

  const { pessoa: pedida } = await searchParams;
  const alvo = admin && pedida && pessoas.some((p) => p.id === pedida) ? pedida : meuId;
  const nomeAlvo = pessoas.find((p) => p.id === alvo)?.nome.split(" ")[0] ?? "";

  const [tarefasRes, filaRes, clientesRes, areasRes] = await Promise.all([
    supabase
      .from("v_tarefas")
      .select("id,titulo,cliente_id,cliente,area,responsavel_id,status,etapa_atual,estado_atual,proxima_acao,prazo,prazo_vez,atrasada,bloco,notas")
      .eq("responsavel_id", alvo)
      .neq("status", "concluida")
      .is("arquivada_em", null)
      .order("prazo_vez", { ascending: true, nullsFirst: false })
      .limit(300),
    supabase
      .from("tarefa_etapas")
      .select("id,ordem,nome,prazo_previsto,tarefa:tarefas!inner(id,titulo,etapa_atual,status,arquivada_em,cliente:clientes(nome))")
      .eq("responsavel_id", alvo)
      .is("concluida_em", null)
      .limit(300),
    supabase.from("clientes").select("id,nome").eq("ativo", true).order("nome"),
    supabase.from("areas").select("id,codigo,nome").eq("ativo", true).order("nome"),
  ]);

  const tarefas = (tarefasRes.data ?? []) as unknown as TarefaView[];
  const hoje = hojeSP();
  const atrasadas = tarefas.filter((t) => t.atrasada);
  const naVez = tarefas.filter((t) => !t.atrasada);

  const fila: TarefaFila[] = ((filaRes.data ?? []) as unknown as EtapaFila[])
    .filter((e) => e.tarefa.status !== "concluida" && !e.tarefa.arquivada_em && e.tarefa.etapa_atual !== null && e.ordem > e.tarefa.etapa_atual)
    .map((e) => ({ id: e.id, tarefa_id: e.tarefa.id, titulo: e.tarefa.titulo, cliente: e.tarefa.cliente?.nome ?? null, acao: e.nome, prazo: e.prazo_previsto }))
    .sort((a, b) => (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999"));

  const falhou = tarefasRes.error || filaRes.error;

  return (
    <div className="mx-auto max-w-[920px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">{dataExtensa(hoje)}</p>
          <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight">
            {alvo === meuId ? "Hoje" : `Hoje, ${nomeAlvo}`}
          </h1>
        </div>
        {admin && pessoas.length > 1 && <TrocarPessoa pessoas={pessoas} atual={alvo} meuId={meuId} />}
      </div>

      <div className="mt-6">
        <NovaTarefa
          admin={admin}
          meuId={meuId}
          clientes={(clientesRes.data ?? []) as Opcao[]}
          areas={(areasRes.data ?? []) as Area[]}
          pessoas={pessoas}
        />
      </div>

      {falhou && (
        <p role="alert" className="mt-6 rounded-lg bg-dangerbg px-4 py-3 text-sm text-danger">
          Não consegui carregar as tarefas agora. Atualize a página; se continuar, avise a Iza.
        </p>
      )}

      <div className="mt-7 grid grid-cols-3 gap-3">
        <Numero rotulo="Atrasadas" valor={atrasadas.length} tom={atrasadas.length ? "text-danger" : "text-tx3"} />
        <Numero rotulo="Na sua vez" valor={naVez.length} />
        <Numero rotulo="Na fila" valor={fila.length} tom="text-tx3" />
      </div>

      {atrasadas.length > 0 && (
        <Secao titulo="Atrasadas" n={atrasadas.length} tom="danger">
          {atrasadas.map((t) => <TarefaCard key={t.id} t={t} hoje={hoje} />)}
        </Secao>
      )}

      <Secao titulo="Na sua vez" n={naVez.length}>
        {naVez.length === 0 ? (
          <div className="panel px-6 py-10 text-center">
            <p className="text-[15px] font-medium">Nada na sua vez agora</p>
            <p className="mt-1 text-sm text-tx2">Quando uma tarefa ou uma etapa chegar para {alvo === meuId ? "você" : nomeAlvo}, ela aparece aqui.</p>
          </div>
        ) : (
          naVez.map((t) => <TarefaCard key={t.id} t={t} hoje={hoje} />)
        )}
      </Secao>

      {fila.length > 0 && (
        <Secao titulo="Na fila, ainda não é sua" n={fila.length}>
          {fila.map((f) => <FilaCard key={f.id} f={f} />)}
        </Secao>
      )}
    </div>
  );
}

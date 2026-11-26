import type { Metadata } from "next";
import { AcoesTarefa } from "@/components/AcoesTarefa";
import { FiltrosHistorico } from "@/components/FiltrosHistorico";
import { dataHoraSP, dias, diaSP } from "@/lib/datas";
import { pessoaAtual, supabaseServer, usuarioAtual } from "@/lib/supabase/server";
import type { Opcao, Pessoa } from "@/lib/tipos";

export const metadata: Metadata = { title: "Histórico" };
export const dynamic = "force-dynamic";

interface Concluida {
  id: string;
  titulo: string;
  cliente: string | null;
  area: string | null;
  responsavel_id: string | null;
  responsavel: string | null;
  prazo: string | null;
  concluida_em: string;
  concluida_por: string | null;
  arquivada_em: string | null;
}

const LIMITE = 200;

function situacaoPrazo(prazo: string | null, concluidaEm: string): { texto: string; classe: string } {
  if (!prazo) return { texto: "sem prazo", classe: "bg-panel2 text-tx2" };
  const atraso = dias(diaSP(concluidaEm), prazo);
  if (atraso <= 0) return { texto: "no prazo", classe: "bg-okbg text-ok" };
  return { texto: atraso === 1 ? "1 dia de atraso" : `${atraso} dias de atraso`, classe: "bg-dangerbg text-danger" };
}

export default async function Historico({
  searchParams,
}: { searchParams: Promise<{ pessoa?: string; periodo?: string; q?: string }> }) {
  const supabase = await supabaseServer();
  const { data: auth } = await usuarioAtual();
  const meuId = auth.user!.id;

  const eu = await pessoaAtual();
  const admin = eu?.papel === "admin";

  const { data: pessoasLista } = await supabase.from("pessoas").select("id,nome").order("nome");
  const pessoas = (pessoasLista ?? []) as Opcao[];
  const nomes = new Map(pessoas.map((p) => [p.id, p.nome]));

  const sp = await searchParams;
  const periodo = ["7", "30", "90", "todos"].includes(sp.periodo ?? "") ? (sp.periodo as string) : "30";
  const pessoa = admin && sp.pessoa && pessoas.some((p) => p.id === sp.pessoa) ? sp.pessoa : "todas";
  const q = (sp.q ?? "").trim().slice(0, 80);

  let consulta = supabase
    .from("v_tarefas")
    .select("id,titulo,cliente,area,responsavel_id,responsavel,prazo,concluida_em,concluida_por,arquivada_em")
    .eq("status", "concluida")
    .not("concluida_em", "is", null)
    .order("concluida_em", { ascending: false })
    .limit(LIMITE);

  if (!admin) consulta = consulta.eq("responsavel_id", meuId);
  else if (pessoa !== "todas") consulta = consulta.eq("responsavel_id", pessoa);
  if (periodo !== "todos") {
    const desde = new Date(Date.now() - Number(periodo) * 86400000).toISOString();
    consulta = consulta.gte("concluida_em", desde);
  }
  if (q) consulta = consulta.ilike("titulo", `%${q.replace(/[%_,()]/g, " ")}%`);

  const { data, error } = await consulta;
  const itens = (data ?? []) as unknown as Concluida[];
  const noPrazo = itens.filter((t) => t.prazo && dias(diaSP(t.concluida_em), t.prazo) <= 0).length;
  const comPrazo = itens.filter((t) => t.prazo).length;

  return (
    <div className="mx-auto max-w-[920px]">
      <p className="label">Concluídas</p>
      <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight">Histórico</h1>

      <div className="mt-6">
        <FiltrosHistorico admin={admin} pessoas={pessoas} pessoa={pessoa} periodo={periodo} q={q} />
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-lg bg-dangerbg px-4 py-3 text-sm text-danger">
          Não consegui carregar o histórico agora. Atualize a página; se continuar, avise a Iza.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-tx2">
        <span><b className="mono text-base font-medium text-tx">{String(itens.length).padStart(2, "0")}</b> concluídas</span>
        {comPrazo > 0 && <span><b className="mono text-base font-medium text-tx">{noPrazo}</b> de {comPrazo} com prazo, no prazo</span>}
        {itens.length === LIMITE && <span className="text-tx3">Mostrando as {LIMITE} mais recentes. Use os filtros para refinar.</span>}
      </div>

      <div className="mt-4 space-y-2.5">
        {itens.length === 0 ? (
          <div className="panel px-6 py-10 text-center">
            <p className="text-[15px] font-medium">Nada concluído neste filtro</p>
            <p className="mt-1 text-sm text-tx2">Quando uma tarefa for concluída, ela fica guardada aqui.</p>
          </div>
        ) : (
          itens.map((t) => {
            const s = situacaoPrazo(t.prazo, t.concluida_em);
            const por = t.concluida_por ? nomes.get(t.concluida_por)?.split(" ")[0] : null;
            return (
              <article key={t.id} className="panel px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1 basis-64">
                    <h3 className="text-[15px] font-medium leading-snug">{t.titulo}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-tx2">
                      {t.cliente ? <span>{t.cliente}</span> : <span className="text-tx3">Interna</span>}
                      {t.area && <span className="mono text-tx3">· {t.area}</span>}
                      {admin && t.responsavel && <span className="text-tx3">· de {t.responsavel.split(" ")[0]}</span>}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 text-right">
                    <span className={`chip ${s.classe}`}>{s.texto}</span>
                    <span className="mono text-xs text-tx3">
                      {dataHoraSP(t.concluida_em)}{por ? ` · ${por}` : ""}
                    </span>
                  </div>
                </div>
                <div className="mt-2.5 border-t border-[var(--line)] pt-2.5">
                  <AcoesTarefa id={t.id} concluida admin={admin} titulo={t.titulo} />
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

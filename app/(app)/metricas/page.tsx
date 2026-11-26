import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { hojeSP } from "@/lib/datas";
import { pessoaAtual, supabaseServer } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Métricas" };
export const dynamic = "force-dynamic";

interface Carga { pessoa_id: string | null; nome: string; abertas: number; atrasadas: number; hoje: number; semana: number; sem_prazo: number }
interface Gargalo {
  dias: number;
  etapas: { modelo: string; etapa: string; concluidas: number; dias_medios: number; fora_do_prazo: number }[];
  devolucoes_etapa: { modelo: string; etapa: string | null; devolucoes: number }[];
  devolucoes_pessoa: { nome: string; devolucoes: number }[];
  atrasadas_cliente: { cliente: string; atrasadas: number }[];
}

const PERIODOS = [30, 90, 180] as const;

function Barra({ valor, max, ruim = false }: { valor: number; max: number; ruim?: boolean }) {
  const pct = max > 0 ? Math.max(valor > 0 ? 4 : 0, Math.round((valor / max) * 100)) : 0;
  return (
    <span className="block h-2 w-full rounded-full bg-panel2" aria-hidden="true">
      <span className={`block h-2 rounded-full ${ruim ? "bg-danger" : "bg-[var(--gold)]"}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

export default async function Metricas({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const eu = await pessoaAtual();
  if (!eu) redirect("/login");
  if (eu.papel !== "admin") redirect("/hoje");
  const sp = await searchParams;
  const dias = PERIODOS.find((d) => String(d) === sp.dias) ?? 90;
  const supabase = await supabaseServer();
  const [cargaRes, gargaloRes] = await Promise.all([
    supabase.rpc("metricas_carga", { p_hoje: hojeSP() }),
    supabase.rpc("metricas_gargalo", { p_dias: dias }),
  ]);
  const falhou = cargaRes.error || gargaloRes.error;
  const carga = ((cargaRes.data ?? []) as Carga[]);
  const g = (gargaloRes.data ?? null) as Gargalo | null;
  const maxAbertas = Math.max(0, ...carga.map((c) => c.abertas));

  return (
    <div className="mx-auto max-w-[1000px]">
      <p className="label">Só para admin</p>
      <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight">Métricas</h1>

      {falhou && (
        <p role="alert" className="mt-6 rounded-lg bg-dangerbg px-4 py-3 text-sm text-danger">
          Não consegui carregar as métricas. Confira se o script 12 foi rodado no Supabase.
        </p>
      )}

      <section className="mt-8" aria-labelledby="m-carga">
        <h2 id="m-carga" className="text-[17px] font-medium">Carga por pessoa</h2>
        <p className="mt-1 text-sm text-tx2">Tarefas abertas agora, pelo prazo da etapa atual.</p>
        <div className="panel mt-4 overflow-x-auto">
          {carga.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-tx2">Nenhuma tarefa aberta.</p>
          ) : (
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left">
                  {["Pessoa", "Abertas", "Atrasadas", "Hoje", "Próximos 7 dias", "Sem prazo"].map((c) => <th key={c} className="label px-4 py-2.5 font-normal">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {carga.map((c) => (
                  <tr key={c.pessoa_id ?? "sem"} className="border-t border-[var(--line)]">
                    <td className="px-4 py-3 font-medium">{c.pessoa_id ? <Link href={`/hoje?pessoa=${c.pessoa_id}`} className="hover:underline">{c.nome}</Link> : c.nome}</td>
                    <td className="w-[200px] px-4 py-3"><span className="flex items-center gap-2"><span className="mono w-6 text-right">{c.abertas}</span><Barra valor={c.abertas} max={maxAbertas} /></span></td>
                    <td className={`mono px-4 py-3 ${c.atrasadas ? "font-medium text-danger" : "text-tx3"}`}>{c.atrasadas}</td>
                    <td className="mono px-4 py-3">{c.hoje}</td>
                    <td className="mono px-4 py-3">{c.semana}</td>
                    <td className="mono px-4 py-3 text-tx3">{c.sem_prazo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="mt-10" aria-labelledby="m-gargalo">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="m-gargalo" className="text-[17px] font-medium">Onde a esteira trava</h2>
            <p className="mt-1 text-sm text-tx2">Etapas concluídas nos últimos {dias} dias.</p>
          </div>
          <div role="tablist" aria-label="Período" className="inline-flex rounded-lg bg-panel2 p-1">
            {PERIODOS.map((d) => (
              <Link key={d} role="tab" aria-selected={d === dias} href={`/metricas?dias=${d}`}
                className={`rounded-md px-3.5 py-1.5 text-[13px] ${d === dias ? "bg-[var(--panel)] font-medium text-tx shadow-sm" : "text-tx2 hover:text-tx"}`}>{d} dias</Link>
            ))}
          </div>
        </div>

        <div className="panel mt-4 overflow-x-auto">
          {!g || g.etapas.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-tx2">Ainda não há etapas concluídas neste período.</p>
          ) : (
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left">
                  {["Peça", "Etapa", "Concluídas", "Dias em média", "Fora do prazo"].map((c) => <th key={c} className="label px-4 py-2.5 font-normal">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {g.etapas.map((e) => (
                  <tr key={`${e.modelo}-${e.etapa}`} className="border-t border-[var(--line)]">
                    <td className="px-4 py-3">{e.modelo}</td>
                    <td className="px-4 py-3 font-medium">{e.etapa}</td>
                    <td className="mono px-4 py-3">{e.concluidas}</td>
                    <td className="mono px-4 py-3">{String(e.dias_medios).replace(".", ",")}</td>
                    <td className={`mono px-4 py-3 ${e.fora_do_prazo ? "text-danger" : "text-tx3"}`}>{e.fora_do_prazo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Lista titulo="Devoluções por etapa" vazio="Nenhuma devolução no período." itens={(g?.devolucoes_etapa ?? []).map((d) => ({ nome: `${d.modelo}: ${d.etapa ?? "sem etapa"}`, n: d.devolucoes }))} />
          <Lista titulo="Devoluções recebidas por pessoa" vazio="Nenhuma devolução no período." itens={(g?.devolucoes_pessoa ?? []).map((d) => ({ nome: d.nome, n: d.devolucoes }))} />
          <Lista titulo="Atrasadas por cliente" vazio="Nada atrasado agora." ruim itens={(g?.atrasadas_cliente ?? []).map((d) => ({ nome: d.cliente, n: d.atrasadas }))} />
        </div>
      </section>

      <section className="mt-10" aria-labelledby="m-backup">
        <h2 id="m-backup" className="text-[17px] font-medium">Cópia de segurança</h2>
        <p className="mt-1 text-sm text-tx2">Baixa um arquivo com tarefas, etapas, histórico, comentários, lançamentos, clientes e recorrentes. Guarde em um lugar seguro.</p>
        <a href="/exportar/backup" className="btn mt-4"><Download size={15} /> Baixar cópia completa</a>
      </section>
    </div>
  );
}

function Lista({ titulo, itens, vazio, ruim = false }: { titulo: string; itens: { nome: string; n: number }[]; vazio: string; ruim?: boolean }) {
  const max = Math.max(0, ...itens.map((i) => i.n));
  return (
    <div className="panel p-4">
      <h3 className="text-sm font-medium">{titulo}</h3>
      {itens.length === 0 ? <p className="mt-3 text-sm text-tx2">{vazio}</p> : (
        <ul className="mt-3 space-y-2.5">
          {itens.map((i) => (
            <li key={i.nome} className="text-sm">
              <span className="flex items-baseline justify-between gap-3"><span className="min-w-0 truncate">{i.nome}</span><span className="mono shrink-0">{i.n}</span></span>
              <span className="mt-1 block"><Barra valor={i.n} max={max} ruim={ruim} /></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ddmm } from "@/lib/datas";
import { pessoaAtual, supabaseServer } from "@/lib/supabase/server";
import { acrescentarItem, aprovarReuniao, descartarReuniao, removerItem, salvarItem } from "./actions";

export const metadata: Metadata = { title: "Reuniões" };
export const dynamic = "force-dynamic";

interface Item {
  id: string; reuniao_id: string; titulo: string; responsavel_id: string | null; responsavel_texto: string | null;
  prazo: string | null; destino: "equipe" | "cliente"; notas: string | null; status: string; ordem: number;
}
interface Reuniao {
  id: string; titulo: string; data: string; tipo: "interna" | "arco"; status: string; resumo: string | null;
  cliente: { nome: string } | null;
}

const campo = "h-9 rounded-lg border border-line bg-panel px-2.5 text-sm";

export default async function PaginaReunioes({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const sp = await searchParams;
  const tipo: "interna" | "arco" = sp.tipo === "arco" ? "arco" : "interna";
  const eu = await pessoaAtual();
  if (!eu) redirect("/login");
  if (eu.papel !== "admin") redirect("/hoje");
  const supabase = await supabaseServer();

  const [reuRes, itRes, pesRes] = await Promise.all([
    supabase.from("reunioes").select("id,titulo,data,tipo,status,resumo,cliente:clientes(nome)").eq("status", "pendente").eq("tipo", tipo).order("data", { ascending: false }).limit(30),
    supabase.from("reuniao_itens").select("id,reuniao_id,titulo,responsavel_id,responsavel_texto,prazo,destino,notas,status,ordem").eq("status", "proposta").order("ordem"),
    supabase.from("pessoas").select("id,nome").eq("ativo", true).order("nome"),
  ]);
  const contRes = await supabase.from("reunioes").select("tipo").eq("status", "pendente");
  const conta = (t: string) => ((contRes.data ?? []) as { tipo: string }[]).filter((x) => x.tipo === t).length;
  const reunioes = (reuRes.data ?? []) as unknown as Reuniao[];
  const itens = (itRes.data ?? []) as Item[];
  const pessoas = (pesRes.data ?? []) as { id: string; nome: string }[];

  const seletor = (nome: string, valor: string | null) => (
    <select name={nome} defaultValue={valor ?? ""} className={campo} aria-label="Responsável">
      <option value="">Sem responsável</option>
      {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome.split(" ")[0]}</option>)}
    </select>
  );

  return (
    <div className="mx-auto max-w-[1000px]">
      <p className="label">Tarefas que saíram das reuniões, esperando aprovação</p>
      <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight">Reuniões</h1>

      <div role="tablist" aria-label="Tipo de reunião" className="mt-5 inline-flex rounded-lg bg-panel2 p-1">
        {([["interna", "Internas"], ["arco", "Arco"]] as const).map(([t, nome]) => (
          <Link key={t} href={t === "interna" ? "/reunioes" : "/reunioes?tipo=arco"} role="tab" aria-selected={tipo === t}
            className={`rounded-md px-3.5 py-1.5 text-sm font-medium ${tipo === t ? "bg-panel shadow-sm" : "text-muted"}`}>
            {nome}{conta(t) > 0 ? ` (${conta(t)})` : ""}
          </Link>
        ))}
      </div>

      {reuRes.error && (
        <p role="alert" className="mt-6 rounded-lg bg-dangerbg px-4 py-3 text-sm text-danger">
          Não consegui carregar as reuniões. Confira se o script 29 foi rodado no Supabase.
        </p>
      )}
      {!reuRes.error && reunioes.length === 0 && (
        <p className="mt-6 text-sm text-muted">{tipo === "arco" ? "Nenhuma reunião do Arco esperando aprovação." : "Nenhuma reunião interna esperando aprovação."}</p>
      )}

      <div className="mt-6 space-y-8">
        {reunioes.map((r) => {
          const meus = itens.filter((i) => i.reuniao_id === r.id);
          const semResp = meus.some((i) => i.destino === "equipe" && !i.responsavel_id);
          return (
            <section key={r.id} className="rounded-xl border border-line bg-panel p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">{r.titulo}</h2>
                <span className="label">{ddmm(r.data)}{r.tipo === "arco" ? " · Arco" : ""}{r.cliente ? ` · ${r.cliente.nome}` : ""}</span>
              </div>
              {r.resumo && <p className="mt-2 text-sm text-muted">{r.resumo}</p>}

              <div className="mt-4 space-y-3">
                {meus.length === 0 && <p className="text-sm text-muted">Nenhum item. Acrescente abaixo ou descarte a reunião.</p>}
                {meus.map((i) => (
                  <form key={i.id} action={salvarItem} className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
                    <input type="hidden" name="id" value={i.id} />
                    <input name="titulo" defaultValue={i.titulo} maxLength={300} className={`${campo} w-full`} aria-label="Tarefa" />
                    {seletor("responsavel", i.responsavel_id)}
                    <input type="date" name="prazo" defaultValue={i.prazo ?? ""} className={campo} aria-label="Prazo" />
                    <select name="destino" defaultValue={i.destino} className={campo} aria-label="Para">
                      <option value="equipe">Equipe</option>
                      <option value="cliente">Cliente (Portal)</option>
                    </select>
                    <div className="flex gap-2 sm:col-span-4">
                      <button className="btn btn-ghost !h-8" type="submit">Salvar</button>
                      <button className="btn !h-8 !text-danger" formAction={removerItem} type="submit">Remover</button>
                      {!i.responsavel_id && i.destino === "equipe" && (
                        <span className="self-center text-xs text-danger">
                          {i.responsavel_texto ? `Não achei "${i.responsavel_texto}" na equipe.` : "Escolha quem faz."}
                        </span>
                      )}
                    </div>
                  </form>
                ))}
              </div>

              <form action={acrescentarItem} className="mt-5 grid gap-2 border-t border-line pt-4 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-center">
                <input type="hidden" name="reuniao" value={r.id} />
                <input name="titulo" placeholder="Acrescentar tarefa" maxLength={300} className={`${campo} w-full`} aria-label="Nova tarefa" />
                {seletor("responsavel", null)}
                <input type="date" name="prazo" className={campo} aria-label="Prazo" />
                <select name="destino" className={campo} aria-label="Para">
                  <option value="equipe">Equipe</option>
                  <option value="cliente">Cliente (Portal)</option>
                </select>
                <button className="btn btn-ghost !h-9" type="submit">Acrescentar</button>
              </form>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <form action={aprovarReuniao}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn btn-primary" type="submit" disabled={semResp}>Aprovar e criar as tarefas da equipe</button>
                </form>
                <form action={descartarReuniao}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn btn-ghost !text-danger" type="submit">Descartar reunião</button>
                </form>
                {semResp && <span className="text-xs text-danger">Todo item da equipe precisa de responsável. Salve depois de escolher.</span>}
              </div>
              <p className="mt-3 text-xs text-muted">Salve cada linha editada antes de aprovar. Itens para o cliente ficam guardados para o Portal Arco.</p>
            </section>
          );
        })}
      </div>
    </div>
  );
}

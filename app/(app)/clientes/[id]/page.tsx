import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { Etiqueta, Etiquetas } from "@/components/Etiqueta";
import { comHora, descreverPrazo, hojeSP } from "@/lib/datas";
import { supabaseServer } from "@/lib/supabase/server";
import { PAPEIS_CLIENTE, type EtiquetaLanc } from "@/lib/tipos";
import { corPrazo } from "@/lib/visual";
import { TituloTarefa } from "@/components/TituloTarefa";

export const metadata: Metadata = { title: "Cliente" };
export const dynamic = "force-dynamic";

interface Linha {
  id: string; titulo: string; area: string | null; responsavel: string | null; proxima_acao: string | null; etapa_atual: number | null;
  prazo: string | null; prazo_vez: string | null; horario: string | null; lancamentos: EtiquetaLanc[] | null;
}

export default async function PaginaCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await supabaseServer();
  const hoje = hojeSP();

  const [cliRes, tarRes, concRes, lanRes, papRes] = await Promise.all([
    supabase.from("clientes").select("id,nome").eq("id", id).maybeSingle(),
    supabase.from("v_tarefas").select("id,titulo,area,responsavel,proxima_acao,etapa_atual,prazo,prazo_vez,horario,lancamentos")
      .eq("cliente_id", id).neq("status", "concluida").is("arquivada_em", null).order("prazo_vez", { ascending: true, nullsFirst: false }).limit(500),
    supabase.from("v_tarefas").select("id", { count: "exact", head: true }).eq("cliente_id", id).eq("status", "concluida"),
    supabase.from("lancamentos").select("id,codigo,cor,nome,status").eq("cliente_id", id).order("data_abertura", { ascending: false, nullsFirst: false }),
    supabase.from("cliente_papeis").select("papel,pessoa:pessoas(nome)").eq("cliente_id", id),
  ]);
  const cliente = cliRes.data as { id: string; nome: string } | null;
  if (!cliente) notFound();
  const tarefas = (tarRes.data ?? []) as unknown as Linha[];
  const lancs = (lanRes.data ?? []) as { id: string; codigo: string | null; cor: string; nome: string; status: string }[];
  const papeis = (papRes.data ?? []) as unknown as { papel: string; pessoa: { nome: string } | null }[];

  const porArea = new Map<string, Linha[]>();
  for (const t of tarefas) porArea.set(t.area ?? "Sem área", [...(porArea.get(t.area ?? "Sem área") ?? []), t]);

  return (
    <div className="mx-auto max-w-[1000px]">
      <Link href="/clientes" className="inline-flex items-center gap-1.5 text-[13px] text-tx2 hover:text-tx"><ArrowLeft size={14} /> Clientes</Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-semibold leading-none tracking-tight">{cliente.nome}</h1>
        <a className="btn" href={`/exportar?cliente=${cliente.id}&concluidas=1`} download><Download size={15} /> Exportar tudo deste cliente</a>
      </div>
      <p className="mt-2 text-[14px] text-tx2">{tarefas.length} abertas · {concRes.count ?? 0} concluídas</p>

      {(lanRes.error || tarRes.error) && (
        <p role="alert" className="mt-6 rounded-lg bg-dangerbg px-4 py-3 text-sm text-danger">Não consegui carregar tudo agora. Atualize a página; se continuar, avise a Iza.</p>
      )}

      {lancs.length > 0 && (
        <section className="mt-8" aria-labelledby="c-lanc">
          <h2 id="c-lanc" className="label mb-3">Lançamentos</h2>
          <ul className="flex flex-wrap gap-2.5">
            {lancs.map((l) => (
              <li key={l.id}>
                <Link href={`/lancamentos/${l.id}`} className="panel flex items-center gap-2.5 px-4 py-2.5 hover:border-[var(--line-strong)]">
                  {l.codigo && <Etiqueta codigo={l.codigo} cor={l.cor} />}
                  <span className="text-[14px]">{l.nome}</span>
                  {l.status === "encerrado" && <span className="chip bg-panel2 text-tx2">encerrado</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {papeis.length > 0 && (
        <section className="mt-8" aria-labelledby="c-eq">
          <h2 id="c-eq" className="label mb-3">Quem cuida de cada função</h2>
          <dl className="panel grid gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-3">
            {PAPEIS_CLIENTE.filter((p) => papeis.some((x) => x.papel === p.codigo)).map((p) => (
              <div key={p.codigo}>
                <dt className="text-[12px] text-tx2">{p.nome}</dt>
                <dd className="text-[14px] font-medium">{papeis.find((x) => x.papel === p.codigo)?.pessoa?.nome.split(" ")[0] ?? "Sem responsável"}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="mt-8" aria-labelledby="c-tar">
        <h2 id="c-tar" className="label mb-3">Em aberto</h2>
        {tarefas.length === 0 ? (
          <div className="panel px-6 py-10 text-center"><p className="text-[15px] font-medium">Nada em aberto neste cliente</p></div>
        ) : (
          Array.from(porArea.entries()).map(([area, ts]) => (
            <div key={area} className="mb-6">
              <h3 className="mb-2 flex items-center gap-2.5">
                <span className="mono text-[12px] text-tx2">{area}</span>
                <span className="mono rounded-md bg-panel2 px-1.5 text-[11px] text-tx2">{ts.length}</span>
                <span className="h-px flex-1 bg-[var(--line)]" />
              </h3>
              <ul className="space-y-2">
                {ts.map((t) => {
                  const prazo = descreverPrazo(t.prazo_vez ?? t.prazo, hoje);
                  return (
                    <li key={t.id} className="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="text-[15px] font-medium leading-snug"><TituloTarefa titulo={t.titulo} /></p>
                        {t.lancamentos && t.lancamentos.length > 0 && <p className="mt-1 flex flex-wrap gap-1"><Etiquetas itens={t.lancamentos} /></p>}
                        <p className="mt-0.5 text-[13px] text-tx2">
                          {t.responsavel?.split(" ")[0] ?? "Sem responsável"}
                          {t.etapa_atual !== null && t.proxima_acao && <> · próxima ação: <b className="font-medium text-tx">{t.proxima_acao}</b></>}
                        </p>
                      </div>
                      <span className={`chip ${corPrazo[prazo.tom]}`}>{comHora(prazo.texto, t.horario)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

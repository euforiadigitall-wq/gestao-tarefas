import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { CardQuadro } from "@/components/CardQuadro";
import { Etiqueta } from "@/components/Etiqueta";
import { descreverPrazo, hojeSP } from "@/lib/datas";
import { pessoaAtual, supabaseServer } from "@/lib/supabase/server";
import type { EtiquetaLanc } from "@/lib/tipos";
import { corPrazo, trilhoPrazo } from "@/lib/visual";

export const metadata: Metadata = { title: "Busca" };
export const dynamic = "force-dynamic";

interface Linha {
  id: string; titulo: string; cliente: string | null; area: string | null; responsavel: string | null; bloco: string | null;
  status: string; etapa_atual: number | null; estado_atual: string; proxima_acao: string | null; prazo: string | null; prazo_vez: string | null;
  lancamentos: EtiquetaLanc[] | null; etapas_total: number;
}

// Tira o que quebra o filtro do banco (vírgula, parênteses, curingas), para a pessoa digitar qualquer coisa.
function termoSeguro(q: string): string {
  return q.replace(/[,()*"\\%_]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export default async function Busca({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const termo = termoSeguro(q);
  const eu = await pessoaAtual();
  const admin = eu?.papel === "admin";
  const hoje = hojeSP();
  const supabase = await supabaseServer();

  let tarefas: Linha[] = [];
  let lancs: { id: string; nome: string; codigo: string | null; cor: string; status: string; cliente: { nome: string } | null }[] = [];
  let clientes: { id: string; nome: string }[] = [];
  let falhou = false;
  if (termo.length >= 2) {
    const padrao = `%${termo}%`;
    const [tRes, lRes, cRes] = await Promise.all([
      supabase.from("v_tarefas")
        .select("id,titulo,cliente,area,responsavel,bloco,status,etapa_atual,estado_atual,proxima_acao,prazo,prazo_vez,lancamentos,etapas_total")
        .is("arquivada_em", null)
        .or(`titulo.ilike.${padrao},cliente.ilike.${padrao},bloco.ilike.${padrao},notas.ilike.${padrao},responsavel.ilike.${padrao}`)
        .order("prazo_vez", { ascending: true, nullsFirst: false })
        .limit(40),
      supabase.from("lancamentos").select("id,nome,codigo,cor,status,cliente:clientes(nome)").or(`nome.ilike.${padrao},codigo.ilike.${padrao}`).limit(10),
      supabase.from("clientes").select("id,nome").eq("ativo", true).ilike("nome", padrao).order("nome").limit(10),
    ]);
    falhou = !!(tRes.error || lRes.error || cRes.error);
    tarefas = (tRes.data ?? []) as unknown as Linha[];
    lancs = (lRes.data ?? []) as unknown as typeof lancs;
    clientes = (cRes.data ?? []) as { id: string; nome: string }[];
  }
  const nada = termo.length >= 2 && !falhou && tarefas.length + lancs.length + clientes.length === 0;

  return (
    <div className="mx-auto max-w-[900px]">
      <p className="label">Busca</p>
      <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight">Achar uma tarefa</h1>
      <form action="/busca" className="mt-5 flex gap-2" role="search">
        <label htmlFor="busca-q" className="sr-only">Buscar</label>
        <input id="busca-q" name="q" type="search" className="field" defaultValue={q} maxLength={60} placeholder="Título, cliente, lançamento, pessoa ou bloco" autoFocus />
        <button type="submit" className="btn btn-primary"><Search size={15} /> Buscar</button>
      </form>

      {termo.length > 0 && termo.length < 2 && <p className="mt-5 text-sm text-tx2">Digite ao menos 2 letras.</p>}
      {falhou && <p role="alert" className="mt-5 rounded-lg bg-dangerbg px-4 py-3 text-sm text-danger">Não consegui buscar agora. Atualize a página e tente de novo.</p>}
      {nada && <p className="mt-5 text-sm text-tx2">Nada encontrado para “{termo}”. Tente parte do nome ou outra palavra.</p>}

      {(lancs.length > 0 || clientes.length > 0) && (
        <section className="mt-6" aria-label="Lançamentos e clientes">
          <ul className="flex flex-wrap gap-2">
            {lancs.map((l) => (
              <li key={l.id}>
                <Link href={`/lancamentos/${l.id}`} className="panel flex items-center gap-2 px-3 py-2 text-sm hover:border-[var(--line-strong)]">
                  {l.codigo && <Etiqueta codigo={l.codigo} cor={l.cor} />}<span>{l.nome}</span><span className="text-xs text-tx3">lançamento</span>
                </Link>
              </li>
            ))}
            {clientes.map((c) => (
              <li key={c.id}>
                <Link href={`/clientes/${c.id}`} className="panel flex items-center gap-2 px-3 py-2 text-sm hover:border-[var(--line-strong)]">
                  <span>{c.nome}</span><span className="text-xs text-tx3">cliente</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tarefas.length > 0 && (
        <section className="mt-6" aria-label="Tarefas">
          <p className="label mb-2">{tarefas.length === 40 ? "40 primeiras tarefas" : `${tarefas.length} tarefa${tarefas.length > 1 ? "s" : ""}`}</p>
          <div className="space-y-2.5">
            {tarefas.map((t) => {
              const feita = t.status === "concluida";
              const prazo = descreverPrazo(t.prazo_vez ?? t.prazo, hoje);
              return (
                <CardQuadro key={t.id} admin={admin} d={{
                  id: t.id, titulo: t.titulo, area: t.area, bloco: t.bloco, lancamentos: t.lancamentos,
                  linha: `${t.cliente ?? "Interna"} · ${t.responsavel ?? "Sem responsável"}`,
                  estado: t.etapa_atual !== null ? t.estado_atual : null,
                  proxima: !feita && t.proxima_acao ? t.proxima_acao : null,
                  prazoTexto: feita ? "Concluída" : prazo.texto, prazoClasse: feita ? "bg-panel2 text-tx2" : corPrazo[prazo.tom], trilho: feita ? "bg-[var(--line-strong)]" : trilhoPrazo[prazo.tom],
                  etapa: t.etapa_atual, total: t.etapas_total, quem: t.responsavel,
                }} />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

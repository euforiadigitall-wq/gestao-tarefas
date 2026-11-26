import type { Metadata } from "next";
import { CardQuadro } from "@/components/CardQuadro";
import { FiltrosVisao } from "@/components/FiltrosVisao";
import { descreverPrazo, hojeSP } from "@/lib/datas";
import { pessoaAtual, supabaseServer, usuarioAtual } from "@/lib/supabase/server";
import type { Area, EtiquetaLanc, LancamentoOpcao, Opcao, Pessoa } from "@/lib/tipos";
import { corPrazo, trilhoPrazo } from "@/lib/visual";

export const metadata: Metadata = { title: "Quadro" };
export const dynamic = "force-dynamic";

interface Linha {
  id: string;
  titulo: string;
  cliente_id: string | null;
  cliente: string | null;
  area: string | null;
  area_id: string | null;
  responsavel_id: string | null;
  responsavel: string | null;
  etapa_atual: number | null;
  estado_atual: string;
  proxima_acao: string | null;
  prazo: string | null;
  prazo_vez: string | null;
  bloco: string | null;
  lancamentos: EtiquetaLanc[] | null;
}

const LIMITE = 500;

export default async function Quadro({
  searchParams,
}: { searchParams: Promise<{ pessoa?: string; cliente?: string; area?: string; agrupar?: string; lanc?: string }> }) {
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
  const agrupar = sp.agrupar === "cliente" || sp.agrupar === "etapa" ? sp.agrupar : "pessoa";
  const pessoa = admin && sp.pessoa && pessoas.some((p) => p.id === sp.pessoa) ? sp.pessoa : "todas";
  const cliente = sp.cliente && clientes.some((c) => c.id === sp.cliente) ? sp.cliente : "todos";
  const area = sp.area && areas.some((a) => a.id === sp.area) ? sp.area : "todas";
  const lanc = sp.lanc && lancs.some((l) => l.id === sp.lanc) ? sp.lanc : "todos";

  let q = supabase
    .from("v_tarefas")
    .select("id,titulo,cliente_id,cliente,area,area_id,responsavel_id,responsavel,etapa_atual,estado_atual,proxima_acao,prazo,prazo_vez,bloco,lancamentos")
    .neq("status", "concluida")
    .is("arquivada_em", null)
    .order("prazo_vez", { ascending: true, nullsFirst: false })
    .limit(LIMITE);
  if (!admin) q = q.eq("responsavel_id", meuId);
  else if (pessoa !== "todas") q = q.eq("responsavel_id", pessoa);
  if (cliente !== "todos") q = q.eq("cliente_id", cliente);
  if (area !== "todas") q = q.eq("area_id", area);
  if (lanc !== "todos") q = q.contains("lancamento_ids", [lanc]);

  const { data, error } = await q;
  const tarefas = (data ?? []) as unknown as Linha[];
  const hoje = hojeSP();

  const colunas = new Map<string, { nome: string; ordem: number; itens: Linha[] }>();
  for (const t of tarefas) {
    let chave: string;
    let nome: string;
    let ordem = 0;
    if (agrupar === "pessoa") {
      chave = t.responsavel_id ?? "sem";
      nome = t.responsavel ?? "Sem responsável";
    } else if (agrupar === "cliente") {
      chave = t.cliente_id ?? "interna";
      nome = t.cliente ?? "Internas";
    } else {
      // Etapa da esteira: onde cada peça está parada agora
      const esteira = t.etapa_atual !== null && !!t.proxima_acao;
      chave = esteira ? `${t.proxima_acao}` : "simples";
      nome = esteira ? `${t.proxima_acao}` : "Tarefas simples";
      ordem = esteira ? t.etapa_atual! : 999;
    }
    if (!colunas.has(chave)) colunas.set(chave, { nome, ordem, itens: [] });
    const c = colunas.get(chave)!;
    c.ordem = Math.min(c.ordem, ordem);
    c.itens.push(t);
  }
  const lista = Array.from(colunas.values()).sort((a, b) =>
    agrupar === "etapa" ? a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR") : a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <div>
      <p className="label">Tudo que está em andamento</p>
      <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight">Quadro</h1>

      <div className="mt-6">
        <FiltrosVisao base="/quadro" admin={admin} pessoas={pessoas} clientes={clientes} areas={areas}
          valores={{ pessoa, cliente, area, agrupar, lanc }} lancamentos={lancs} comAgrupar />
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-lg bg-dangerbg px-4 py-3 text-sm text-danger">
          Não consegui carregar o quadro agora. Atualize a página; se continuar, avise a Iza.
        </p>
      )}
      {tarefas.length >= LIMITE && (
        <p className="mt-6 rounded-lg bg-panel2 px-4 py-3 text-[13px] text-tx2">Mostrando as {LIMITE} primeiras. Use os filtros para ver o resto.</p>
      )}

      {lista.length === 0 && !error ? (
        <div className="panel mt-8 px-6 py-12 text-center">
          <p className="text-[15px] font-medium">Nada em andamento com esses filtros</p>
          <p className="mt-1 text-sm text-tx2">Quando houver tarefas abertas, elas aparecem aqui, uma coluna por {agrupar === "pessoa" ? "pessoa" : agrupar === "cliente" ? "cliente" : "etapa da esteira"}.</p>
        </div>
      ) : (
        <div className="-mx-5 mt-8 overflow-x-auto px-5 pb-4 md:-mx-9 md:px-9">
          <div className="flex items-start gap-4">
            {lista.map((col) => (
              <section key={col.nome} className="w-[280px] shrink-0" aria-label={col.nome}>
                <h2 className="mb-3 flex items-center gap-2.5">
                  <span className="label truncate">{col.nome}</span>
                  <span className="mono rounded-md bg-panel2 px-1.5 text-[11px] text-tx2">{col.itens.length}</span>
                  <span className="h-px flex-1 bg-[var(--line)]" />
                </h2>
                <div className="space-y-2.5">
                  {col.itens.map((t) => {
                    const prazo = descreverPrazo(t.prazo_vez ?? t.prazo, hoje);
                    return (
                      <CardQuadro key={t.id} admin={admin} d={{
                        id: t.id, titulo: t.titulo, area: t.area, bloco: t.bloco, lancamentos: t.lancamentos,
                        linha: agrupar === "pessoa" ? (t.cliente ?? "Interna") : agrupar === "cliente" ? (t.responsavel ?? "Sem responsável") : `${t.cliente ?? "Interna"} · ${t.responsavel ?? "Sem responsável"}`,
                        estado: t.etapa_atual !== null ? t.estado_atual : null,
                        proxima: t.proxima_acao && agrupar !== "etapa" ? t.proxima_acao : null,
                        prazoTexto: prazo.texto, prazoClasse: corPrazo[prazo.tom], trilho: trilhoPrazo[prazo.tom],
                      }} />
                    );

                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

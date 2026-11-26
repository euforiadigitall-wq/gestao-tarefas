import type { Metadata } from "next";
import { FiltrosVisao } from "@/components/FiltrosVisao";
import { descreverPrazo, hojeSP } from "@/lib/datas";
import { supabaseServer } from "@/lib/supabase/server";
import type { Area, Opcao, Pessoa } from "@/lib/tipos";
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
}

const LIMITE = 500;

export default async function Quadro({
  searchParams,
}: { searchParams: Promise<{ pessoa?: string; cliente?: string; area?: string; agrupar?: string }> }) {
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
  const agrupar = sp.agrupar === "cliente" ? "cliente" : "pessoa";
  const pessoa = admin && sp.pessoa && pessoas.some((p) => p.id === sp.pessoa) ? sp.pessoa : "todas";
  const cliente = sp.cliente && clientes.some((c) => c.id === sp.cliente) ? sp.cliente : "todos";
  const area = sp.area && areas.some((a) => a.id === sp.area) ? sp.area : "todas";

  let q = supabase
    .from("v_tarefas")
    .select("id,titulo,cliente_id,cliente,area,area_id,responsavel_id,responsavel,etapa_atual,estado_atual,proxima_acao,prazo,prazo_vez,bloco")
    .neq("status", "concluida")
    .is("arquivada_em", null)
    .order("prazo_vez", { ascending: true, nullsFirst: false })
    .limit(LIMITE);
  if (!admin) q = q.eq("responsavel_id", meuId);
  else if (pessoa !== "todas") q = q.eq("responsavel_id", pessoa);
  if (cliente !== "todos") q = q.eq("cliente_id", cliente);
  if (area !== "todas") q = q.eq("area_id", area);

  const { data, error } = await q;
  const tarefas = (data ?? []) as unknown as Linha[];
  const hoje = hojeSP();

  const colunas = new Map<string, { nome: string; itens: Linha[] }>();
  for (const t of tarefas) {
    const chave = agrupar === "pessoa" ? t.responsavel_id ?? "sem" : t.cliente_id ?? "interna";
    const nome = agrupar === "pessoa" ? t.responsavel ?? "Sem responsável" : t.cliente ?? "Internas";
    if (!colunas.has(chave)) colunas.set(chave, { nome, itens: [] });
    colunas.get(chave)!.itens.push(t);
  }
  const lista = Array.from(colunas.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <div>
      <p className="label">Tudo que está em andamento</p>
      <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight">Quadro</h1>

      <div className="mt-6">
        <FiltrosVisao base="/quadro" admin={admin} pessoas={pessoas} clientes={clientes} areas={areas}
          valores={{ pessoa, cliente, area, agrupar }} comAgrupar />
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
          <p className="mt-1 text-sm text-tx2">Quando houver tarefas abertas, elas aparecem aqui, uma coluna por {agrupar === "pessoa" ? "pessoa" : "cliente"}.</p>
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
                      <article key={t.id} className="panel relative overflow-hidden py-3 pl-4 pr-3">
                        <span className={`absolute inset-y-0 left-0 w-1 ${trilhoPrazo[prazo.tom]}`} aria-hidden="true" />
                        <h3 className="text-sm font-medium leading-snug">{t.titulo}</h3>
                        <p className="mt-1 text-xs text-tx2">
                          {agrupar === "pessoa" ? (t.cliente ?? "Interna") : (t.responsavel ?? "Sem responsável")}
                          {t.area && <span className="mono text-tx3"> · {t.area}</span>}
                        </p>
                        {t.bloco && <p className="mono mt-1 text-[11px] text-tx3">{t.bloco}</p>}
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          {t.etapa_atual !== null && <span className="chip bg-infobg text-info">{t.estado_atual}</span>}
                          {t.proxima_acao && <span className="text-xs text-tx2">Próxima: <b className="font-medium text-tx">{t.proxima_acao}</b></span>}
                          <span className={`chip ml-auto ${corPrazo[prazo.tom]}`}>{prazo.texto}</span>
                        </div>
                      </article>
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

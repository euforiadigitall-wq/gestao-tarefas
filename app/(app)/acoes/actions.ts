"use server";

import { revalidatePath } from "next/cache";
import { lerCsv, lerData, normalizar } from "@/lib/csv";
import { supabaseServer } from "@/lib/supabase/server";

export type Resultado = { erro?: string };

function atualizar() {
  for (const p of ["/hoje", "/agenda", "/quadro", "/historico", "/lancamentos"]) revalidatePath(p);
  revalidatePath("/lancamentos/[id]", "page");
}

function traduzir(msg: string | undefined): string {
  if (!msg) return "Não foi possível concluir. Tente de novo.";
  if (msg.includes("apenas admin")) return "Só admin pode excluir.";
  if (msg.includes("so o responsavel")) return "Só o responsável ou um admin pode reabrir.";
  if (msg.includes("nao esta concluida")) return "Essa tarefa não está concluída.";
  if (msg.includes("nao encontrad")) return "Não encontrei. Atualize a página.";
  if (msg.includes("row-level security")) return "Você não tem permissão para isso.";
  return "Não foi possível concluir. Atualize a página e tente de novo.";
}

export async function reabrirTarefa(id: string): Promise<Resultado> {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("reabrir_tarefa", { p_tarefa: id });
  if (error) return { erro: traduzir(error.message) };
  atualizar();
  return {};
}

export async function excluirTarefa(id: string): Promise<Resultado> {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("excluir_tarefa", { p_tarefa: id });
  if (error) return { erro: traduzir(error.message) };
  atualizar();
  return {};
}

export interface DetalheTarefa {
  erro?: string;
  notas?: string | null;
  links?: { id: string; titulo: string; url: string }[];
  etapas?: { ordem: number; nome: string; estado: string; responsavel: string | null; prazo: string | null; concluida: boolean }[];
}

// Carrega só quando o card é aberto, para o Quadro continuar leve.
export async function detalhesTarefa(id: string): Promise<DetalheTarefa> {
  const supabase = await supabaseServer();
  const [t, l, e] = await Promise.all([
    supabase.from("tarefas").select("notas").eq("id", id).maybeSingle(),
    supabase.from("links").select("id,titulo,url").eq("tarefa_id", id).order("criado_em"),
    supabase.from("tarefa_etapas").select("ordem,nome,estado,prazo_previsto,concluida_em,responsavel:pessoas(nome)").eq("tarefa_id", id).order("ordem"),
  ]);
  if (t.error || !t.data) return { erro: "Não consegui abrir os detalhes. Atualize a página." };
  return {
    notas: (t.data as { notas: string | null }).notas,
    links: (l.data ?? []) as { id: string; titulo: string; url: string }[],
    etapas: ((e.data ?? []) as unknown as { ordem: number; nome: string; estado: string; prazo_previsto: string | null; concluida_em: string | null; responsavel: { nome: string } | null }[])
      .map((x) => ({ ordem: x.ordem, nome: x.nome, estado: x.estado, responsavel: x.responsavel?.nome ?? null, prazo: x.prazo_previsto, concluida: !!x.concluida_em })),
  };
}

const MAX_LINHAS = 300;

export interface ResultadoImportacao { erro?: string; erros?: string[]; criadas?: number }

const COLUNAS: Record<string, string> = {
  titulo: "titulo", tarefa: "titulo", nome: "titulo",
  cliente: "cliente", area: "area", categoria: "area",
  responsavel: "responsavel", quem: "responsavel",
  prazo: "prazo", data: "prazo", "data de entrega": "prazo",
  lancamento: "lancamento", etiqueta: "lancamento", tag: "lancamento",
  descricao: "notas", notas: "notas", observacao: "notas",
};

// Importa tarefas simples. Tudo ou nada: se uma linha tiver problema, nada é criado e a lista de problemas volta.
export async function importarTarefas(texto: string, lancamentoPadrao?: string): Promise<ResultadoImportacao> {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erro: "Sua sessão expirou. Entre de novo." };
  const { data: eu } = await supabase.from("pessoas").select("papel").eq("id", auth.user.id).maybeSingle();
  if (eu?.papel !== "admin") return { erro: "Só admin importa tarefas em massa." };

  const linhas = lerCsv(texto.slice(0, 400_000));
  if (linhas.length < 2) return { erro: "Cole ou envie a planilha com o cabeçalho na primeira linha e ao menos uma tarefa." };
  if (linhas.length - 1 > MAX_LINHAS) return { erro: `Use no máximo ${MAX_LINHAS} tarefas por importação.` };

  const cab = linhas[0].map((c) => COLUNAS[normalizar(c)] ?? "");
  if (!cab.includes("titulo")) return { erro: "Falta a coluna \"Título\" no cabeçalho." };

  const [pes, cli, are, lan] = await Promise.all([
    supabase.from("pessoas").select("id,nome").eq("ativo", true),
    supabase.from("clientes").select("id,nome").eq("ativo", true),
    supabase.from("areas").select("id,nome,codigo").eq("ativo", true),
    supabase.from("lancamentos").select("id,codigo"),
  ]);
  const pessoas = (pes.data ?? []) as { id: string; nome: string }[];
  const clientes = (cli.data ?? []) as { id: string; nome: string }[];
  const areas = (are.data ?? []) as { id: string; nome: string; codigo: string }[];
  const lancs = (lan.data ?? []) as { id: string; codigo: string | null }[];

  const achaPessoa = (v: string) => {
    const n = normalizar(v);
    const exato = pessoas.filter((p) => normalizar(p.nome) === n);
    if (exato.length === 1) return exato[0];
    const prim = pessoas.filter((p) => normalizar(p.nome).split(" ")[0] === n);
    return prim.length === 1 ? prim[0] : null;
  };
  const padrao = lancamentoPadrao ? lancs.find((l) => l.id === lancamentoPadrao) : undefined;

  const erros: string[] = [];
  const novas: { titulo: string; notas: string | null; prazo: string | null; cliente_id: string | null; area_id: string | null; responsavel_id: string; criado_por: string; status: string; lanc: string[] }[] = [];

  linhas.slice(1).forEach((cols, i) => {
    const n = i + 2;
    const v = (campo: string) => (cols[cab.indexOf(campo)] ?? "").trim();
    const titulo = v("titulo");
    if (!titulo) { erros.push(`Linha ${n}: falta o título.`); return; }
    if (titulo.length > 200) { erros.push(`Linha ${n}: título com mais de 200 caracteres.`); return; }
    let cliente_id: string | null = null;
    let area_id: string | null = null;
    if (v("cliente")) {
      const c = clientes.find((x) => normalizar(x.nome) === normalizar(v("cliente")));
      if (!c) { erros.push(`Linha ${n}: cliente "${v("cliente")}" não está cadastrado.`); return; }
      cliente_id = c.id;
      const a = areas.find((x) => normalizar(x.nome) === normalizar(v("area")) || x.codigo === normalizar(v("area")));
      if (!a) { erros.push(`Linha ${n}: com cliente, a área precisa ser ${areas.map((x) => x.nome).join(", ")}.`); return; }
      area_id = a.id;
    }
    let responsavel_id = auth.user!.id;
    if (v("responsavel")) {
      const p = achaPessoa(v("responsavel"));
      if (!p) { erros.push(`Linha ${n}: não achei a pessoa "${v("responsavel")}".`); return; }
      responsavel_id = p.id;
    }
    let prazo: string | null = null;
    if (v("prazo")) {
      prazo = lerData(v("prazo"));
      if (!prazo) { erros.push(`Linha ${n}: prazo "${v("prazo")}" inválido. Use dd/mm/aaaa.`); return; }
    }
    const ids: string[] = padrao ? [padrao.id] : [];
    for (const cod of v("lancamento").split("+").map((x) => x.trim()).filter(Boolean)) {
      const l = lancs.find((x) => x.codigo && normalizar(x.codigo) === normalizar(cod));
      if (!l) { erros.push(`Linha ${n}: lançamento "${cod}" não existe.`); return; }
      if (!ids.includes(l.id)) ids.push(l.id);
    }
    novas.push({ titulo, notas: v("notas").slice(0, 600) || null, prazo, cliente_id, area_id, responsavel_id, criado_por: auth.user!.id, status: "a_fazer", lanc: ids });
  });

  if (erros.length > 0) return { erros: erros.slice(0, 30), erro: erros.length > 30 ? `Mostrando 30 de ${erros.length} problemas.` : undefined };

  const { data: criadas, error } = await supabase
    .from("tarefas")
    .insert(novas.map(({ lanc: _l, ...t }) => t))
    .select("id");
  if (error || !criadas) return { erro: "Não consegui importar. Nada foi criado. Confira a planilha e tente de novo." };

  const juncao = criadas.flatMap((c, i) => novas[i].lanc.map((l) => ({ tarefa_id: c.id as string, lancamento_id: l })));
  if (juncao.length > 0) {
    const { error: e2 } = await supabase.from("tarefa_lancamentos").insert(juncao);
    if (e2) { atualizar(); return { criadas: criadas.length, erro: "As tarefas foram criadas, mas as etiquetas de lançamento não foram salvas." }; }
  }
  atualizar();
  return { criadas: criadas.length };
}

"use server";

import { revalidatePath } from "next/cache";
import { CORES_TAG, ETAPAS, TIPOS_ENTREGAVEL, tituloEntregavel } from "@/lib/lancamentos";
import { supabaseServer } from "@/lib/supabase/server";

export type Resultado = { erro?: string; id?: string };

const PAPEIS_OK = ["copy", "aprovador", "design", "social", "site", "dev"];
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function revalidarTudo(id?: string) {
  for (const p of ["/lancamentos", "/hoje", "/agenda", "/quadro"]) revalidatePath(p);
  if (id) revalidatePath(`/lancamentos/${id}`);
}

function traduzir(msg: string | undefined): string {
  if (!msg) return "Não foi possível salvar. Tente de novo.";
  if (msg.includes("ja existe um lancamento")) return "Já existe um lançamento com esse código. Escolha outro.";
  if (msg.includes("informe o codigo")) return "Informe o código do lançamento.";
  if (msg.includes("nao esta ligada")) return "Essa etapa não está ligada neste lançamento.";
  if (msg.includes("defina quem faz")) return "Defina quem faz cada função da peça (equipe do lançamento ou na hora).";
  if (msg.includes("apenas admin")) return "Só admin faz isso.";
  if (msg.includes("sem permissao")) return "Só o responsável pelo item, ou um admin, pode marcar.";
  if (msg.includes("row-level security")) return "Você não tem permissão para isso.";
  return "Não foi possível salvar. Atualize a página e tente de novo.";
}

export async function criarLancamento(d: {
  clienteId: string;
  nome: string;
  codigo: string;
  cor: string;
  dataInicio: string;
  dataAbertura: string;
  dataFechamento: string;
  etapas: string[];
  promocao: boolean;
  equipe: Record<string, string>;
}): Promise<Resultado> {
  const nome = d.nome.replace(/\s+/g, " ").trim();
  const codigo = d.codigo.replace(/\s+/g, " ").trim();
  if (!d.clienteId) return { erro: "Escolha o cliente." };
  if (!nome) return { erro: "Dê um nome ao lançamento." };
  if (!codigo) return { erro: "Informe o código do lançamento, é ele que aparece nas tarefas." };
  if (codigo.length > 14) return { erro: "Use no máximo 14 caracteres no código." };
  if (!CORES_TAG.includes(d.cor as (typeof CORES_TAG)[number])) return { erro: "Cor inválida." };
  for (const v of [d.dataInicio, d.dataAbertura, d.dataFechamento]) {
    if (v && !DATA.test(v)) return { erro: "Alguma data está inválida." };
  }
  if (d.dataAbertura && d.dataFechamento && d.dataFechamento < d.dataAbertura) return { erro: "O fechamento não pode ser antes da abertura do carrinho." };
  const ativas = d.etapas.filter((e) => ETAPAS.some((x) => x.id === e));
  if (ativas.length === 0) return { erro: "Ligue pelo menos uma etapa." };
  const equipe = Object.fromEntries(Object.entries(d.equipe).filter(([k, v]) => v && PAPEIS_OK.includes(k)));

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("criar_lancamento", {
    p_cliente: d.clienteId,
    p_nome: nome,
    p_codigo: codigo,
    p_cor: d.cor,
    p_data_inicio: d.dataInicio || null,
    p_data_abertura: d.dataAbertura || null,
    p_data_fechamento: d.dataFechamento || null,
    p_etapas: ativas,
    p_promocao: d.promocao,
    p_equipe: equipe,
  });
  if (error) return { erro: traduzir(error.message) };
  revalidarTudo();
  return { id: data as string };
}

export async function criarEntregavel(d: {
  lancamentoId: string;
  etapa: string;
  tipo: string;
  quantidade: number;
  rotulo: string;
  modeloId: string;
  titulo: string;
  responsaveis: Record<string, string>;
}): Promise<Resultado> {
  if (!ETAPAS.some((e) => e.id === d.etapa)) return { erro: "Etapa inválida." };
  if (!TIPOS_ENTREGAVEL.some((t) => t.id === d.tipo)) return { erro: "Tipo inválido." };
  if (!Number.isInteger(d.quantidade) || d.quantidade < 1 || d.quantidade > 500) return { erro: "Informe a quantidade, de 1 a 500." };
  if (!d.modeloId) return { erro: "Escolha o tipo de peça." };
  const titulo = (d.titulo.trim() || tituloEntregavel(d.quantidade, d.tipo, d.etapa)).slice(0, 200);

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("criar_entregavel", {
    p_lancamento: d.lancamentoId,
    p_etapa: d.etapa,
    p_tipo: d.tipo,
    p_quantidade: d.quantidade,
    p_rotulo: d.rotulo.trim().slice(0, 80),
    p_modelo: d.modeloId,
    p_titulo: titulo,
    p_responsaveis: Object.fromEntries(Object.entries(d.responsaveis).filter(([, v]) => v)),
  });
  if (error) return { erro: traduzir(error.message) };
  revalidarTudo(d.lancamentoId);
  return {};
}

export async function marcarItem(itemId: string, feito: boolean, lancamentoId?: string): Promise<Resultado> {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("marcar_item_lancamento", { p_item: itemId, p_feito: feito });
  if (error) return { erro: traduzir(error.message) };
  revalidarTudo(lancamentoId);
  return {};
}

export async function definirResponsavelItem(itemId: string, pessoaId: string, lancamentoId: string): Promise<Resultado> {
  const supabase = await supabaseServer();
  const { error } = await supabase.from("lancamento_checklist").update({ pessoa_id: pessoaId || null }).eq("id", itemId);
  if (error) return { erro: traduzir(error.message) };
  revalidarTudo(lancamentoId);
  return {};
}

// Muda quem faz o papel no lançamento e repassa os itens ainda abertos desse papel
export async function definirEquipe(lancamentoId: string, papel: string, pessoaId: string): Promise<Resultado> {
  if (!PAPEIS_OK.includes(papel)) return { erro: "Função inválida." };
  const supabase = await supabaseServer();
  if (pessoaId) {
    const { error } = await supabase.from("lancamento_papeis").upsert({ lancamento_id: lancamentoId, papel, pessoa_id: pessoaId });
    if (error) return { erro: traduzir(error.message) };
  } else {
    const { error } = await supabase.from("lancamento_papeis").delete().eq("lancamento_id", lancamentoId).eq("papel", papel);
    if (error) return { erro: traduzir(error.message) };
  }
  const { error: e2 } = await supabase
    .from("lancamento_checklist")
    .update({ pessoa_id: pessoaId || null })
    .eq("lancamento_id", lancamentoId)
    .eq("papel", papel)
    .eq("feito", false);
  if (e2) return { erro: traduzir(e2.message) };
  revalidarTudo(lancamentoId);
  return {};
}

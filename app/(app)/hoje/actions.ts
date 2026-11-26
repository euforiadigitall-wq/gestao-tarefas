"use server";

import { revalidatePath } from "next/cache";
import { normalizarUrl, rotuloLink } from "@/lib/links";
import { supabaseServer } from "@/lib/supabase/server";

export type Resultado = { erro?: string };
export type NovoLink = { titulo: string; url: string };

const MAX_DESCRICAO = 600;

function prepararLinks(links: NovoLink[] | undefined): { ok: { titulo: string; url: string }[] } | { erro: string } {
  const lista = links ?? [];
  if (lista.length > 20) return { erro: "Use no máximo 20 links por tarefa." };
  const ok: { titulo: string; url: string }[] = [];
  for (const l of lista) {
    const url = normalizarUrl(l.url);
    if (!url) return { erro: "Um dos links não é um endereço válido." };
    ok.push({ titulo: (l.titulo.trim() || rotuloLink(url)).slice(0, 80), url });
  }
  return { ok };
}

function traduzir(msg: string | undefined): string {
  if (!msg) return "Não foi possível concluir. Tente de novo.";
  if (msg.includes("so o responsavel")) return "Só quem é responsável pela tarefa, ou um admin, pode concluir.";
  if (msg.includes("row-level security")) return "Você não tem permissão para isso.";
  if (msg.includes("ja concluida")) return "Essa tarefa já foi concluída.";
  if (msg.includes("defina quem faz")) return "Escolha quem faz cada função da peça.";
  if (msg.includes("escolha a area")) return "Escolha a área do cliente (Tráfego ou Lançamentos).";
  if (msg.includes("apenas admin")) return "Só admin cria tarefa com esteira.";
  if (msg.includes("primeira")) return "Essa já é a primeira etapa, não dá para devolver.";
  return "Não foi possível concluir. Atualize a página e tente de novo.";
}

export async function concluirTarefa(id: string): Promise<Resultado> {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("concluir_tarefa", { p_tarefa: id });
  if (error) return { erro: traduzir(error.message) };
  revalidatePath("/hoje");
  return {};
}

export async function salvarDescricao(id: string, texto: string): Promise<Resultado> {
  const t = texto.trim();
  if (t.length > MAX_DESCRICAO) return { erro: `Use no máximo ${MAX_DESCRICAO} caracteres. Ponha o resto em um link.` };
  const supabase = await supabaseServer();
  const { error } = await supabase.from("tarefas").update({ notas: t || null }).eq("id", id);
  if (error) return { erro: traduzir(error.message) };
  revalidatePath("/hoje");
  return {};
}

export async function adicionarLink(tarefaId: string, link: NovoLink): Promise<Resultado> {
  const p = prepararLinks([link]);
  if ("erro" in p) return p;
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erro: "Sua sessão expirou. Entre de novo." };
  const { count } = await supabase.from("links").select("id", { count: "exact", head: true }).eq("tarefa_id", tarefaId);
  if ((count ?? 0) >= 20) return { erro: "Use no máximo 20 links por tarefa." };
  const { error } = await supabase.from("links").insert({ ...p.ok[0], tarefa_id: tarefaId, criado_por: auth.user.id });
  if (error) return { erro: traduzir(error.message) };
  revalidatePath("/hoje");
  return {};
}

export async function removerLink(id: string): Promise<Resultado> {
  const supabase = await supabaseServer();
  const { error } = await supabase.from("links").delete().eq("id", id);
  if (error) return { erro: traduzir(error.message) };
  revalidatePath("/hoje");
  return {};
}

export async function avancarEtapa(id: string): Promise<Resultado> {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("avancar_etapa", { p_tarefa: id });
  if (error) return { erro: traduzir(error.message) };
  revalidatePath("/hoje");
  return {};
}

export async function devolverEtapa(id: string, motivo: string): Promise<Resultado> {
  const texto = motivo.trim();
  if (texto.length < 3) return { erro: "Conte o motivo da devolução, para quem recebe saber o que ajustar." };
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("devolver_etapa", { p_tarefa: id, p_motivo: texto.slice(0, 1000) });
  if (error) return { erro: traduzir(error.message) };
  revalidatePath("/hoje");
  return {};
}

export async function criarTarefa(dados: {
  titulo: string;
  prazo: string;
  clienteId: string;
  areaId: string;
  responsavelId: string;
  descricao?: string;
  links?: NovoLink[];
}): Promise<Resultado> {
  const titulo = dados.titulo.trim();
  if (!titulo) return { erro: "Escreva o que precisa ser feito." };
  if (titulo.length > 200) return { erro: "Use no máximo 200 caracteres no título." };
  if (dados.clienteId && !dados.areaId) return { erro: "Escolha a área do cliente (Tráfego ou Lançamentos)." };
  if (dados.prazo && !/^\d{4}-\d{2}-\d{2}$/.test(dados.prazo)) return { erro: "Prazo inválido." };
  const descricao = (dados.descricao ?? "").trim();
  if (descricao.length > MAX_DESCRICAO) return { erro: `A descrição passou de ${MAX_DESCRICAO} caracteres. Deixe só o essencial e ponha o resto em um link.` };
  const links = prepararLinks(dados.links);
  if ("erro" in links) return links;

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erro: "Sua sessão expirou. Entre de novo." };

  const { data: criada, error } = await supabase.from("tarefas").insert({
    titulo,
    notas: descricao || null,
    prazo: dados.prazo || null,
    cliente_id: dados.clienteId || null,
    area_id: dados.clienteId ? dados.areaId : null,
    // Membro so cria para si; o banco confere de novo.
    responsavel_id: dados.responsavelId || auth.user.id,
    criado_por: auth.user.id,
    status: "a_fazer",
  }).select("id").single();
  if (error) return { erro: traduzir(error.message) };
  if (criada && links.ok.length > 0) {
    const { error: e2 } = await supabase.from("links").insert(links.ok.map((l) => ({ ...l, tarefa_id: criada.id, criado_por: auth.user!.id })));
    if (e2) { revalidatePath("/hoje"); return { erro: "A tarefa foi criada, mas os links não foram salvos. Abra Detalhes e adicione de novo." }; }
  }
  revalidatePath("/hoje");
  return {};
}

export async function criarTarefaEsteira(dados: {
  titulo: string;
  modeloId: string;
  clienteId: string;
  areaId: string;
  bloco: string;
  responsaveis: Record<string, string>;
  descricao?: string;
  links?: NovoLink[];
}): Promise<Resultado> {
  const titulo = dados.titulo.trim();
  if (!titulo) return { erro: "Escreva o nome da peça." };
  if (titulo.length > 200) return { erro: "Use no máximo 200 caracteres no título." };
  if (!dados.modeloId) return { erro: "Escolha o tipo de peça." };
  if (dados.clienteId && !dados.areaId) return { erro: "Escolha a área do cliente (Tráfego ou Lançamentos)." };
  const descricao = (dados.descricao ?? "").trim();
  if (descricao.length > MAX_DESCRICAO) return { erro: `A descrição passou de ${MAX_DESCRICAO} caracteres. Deixe só o essencial e ponha o resto em um link.` };
  const links = prepararLinks(dados.links);
  if ("erro" in links) return links;

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erro: "Sua sessão expirou. Entre de novo." };

  const { data: id, error } = await supabase.rpc("criar_tarefa_de_modelo", {
    p_titulo: titulo,
    p_cliente: dados.clienteId || null,
    p_modelo: dados.modeloId,
    p_area: dados.clienteId ? dados.areaId : null,
    p_bloco: dados.bloco.trim().slice(0, 120) || null,
    p_responsaveis: Object.fromEntries(Object.entries(dados.responsaveis).filter(([, v]) => v)),
  });
  if (error) return { erro: traduzir(error.message) };
  if (id && descricao) await supabase.from("tarefas").update({ notas: descricao }).eq("id", id as string);
  if (id && links.ok.length > 0) {
    const { error: e2 } = await supabase.from("links").insert(links.ok.map((l) => ({ ...l, tarefa_id: id as string, criado_por: auth.user!.id })));
    if (e2) { revalidatePath("/hoje"); return { erro: "A peça foi criada, mas os links não foram salvos. Abra Detalhes e adicione de novo." }; }
  }
  revalidatePath("/hoje");
  return {};
}

"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export type Resultado = { erro?: string };

function traduzir(msg: string | undefined): string {
  if (!msg) return "Não foi possível concluir. Tente de novo.";
  if (msg.includes("so o responsavel")) return "Só quem é responsável pela tarefa, ou um admin, pode concluir.";
  if (msg.includes("row-level security")) return "Você não tem permissão para isso.";
  if (msg.includes("ja concluida")) return "Essa tarefa já foi concluída.";
  if (msg.includes("defina no cliente")) {
    const quem = msg.split("papel:")[1]?.trim() ?? "";
    return `Antes de criar, defina em Admin, Papéis, quem faz cada função desse cliente${quem ? ` (${quem})` : ""}.`;
  }
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
}): Promise<Resultado> {
  const titulo = dados.titulo.trim();
  if (!titulo) return { erro: "Escreva o que precisa ser feito." };
  if (titulo.length > 200) return { erro: "Use no máximo 200 caracteres no título." };
  if (dados.clienteId && !dados.areaId) return { erro: "Escolha a área do cliente (Tráfego ou Lançamentos)." };
  if (dados.prazo && !/^\d{4}-\d{2}-\d{2}$/.test(dados.prazo)) return { erro: "Prazo inválido." };

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erro: "Sua sessão expirou. Entre de novo." };

  const { error } = await supabase.from("tarefas").insert({
    titulo,
    prazo: dados.prazo || null,
    cliente_id: dados.clienteId || null,
    area_id: dados.clienteId ? dados.areaId : null,
    // Membro so cria para si; o banco confere de novo.
    responsavel_id: dados.responsavelId || auth.user.id,
    criado_por: auth.user.id,
    status: "a_fazer",
  });
  if (error) return { erro: traduzir(error.message) };
  revalidatePath("/hoje");
  return {};
}

export async function criarTarefaEsteira(dados: {
  titulo: string;
  modeloId: string;
  clienteId: string;
  areaId: string;
  bloco: string;
}): Promise<Resultado> {
  const titulo = dados.titulo.trim();
  if (!titulo) return { erro: "Escreva o nome da peça." };
  if (titulo.length > 200) return { erro: "Use no máximo 200 caracteres no título." };
  if (!dados.modeloId) return { erro: "Escolha o tipo de peça." };
  if (!dados.clienteId) return { erro: "Tarefa com esteira precisa de cliente." };
  if (!dados.areaId) return { erro: "Escolha a área do cliente (Tráfego ou Lançamentos)." };

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erro: "Sua sessão expirou. Entre de novo." };

  const { error } = await supabase.rpc("criar_tarefa_de_modelo", {
    p_titulo: titulo,
    p_cliente: dados.clienteId,
    p_modelo: dados.modeloId,
    p_area: dados.areaId,
    p_bloco: dados.bloco.trim().slice(0, 120) || null,
  });
  if (error) return { erro: traduzir(error.message) };
  revalidatePath("/hoje");
  return {};
}

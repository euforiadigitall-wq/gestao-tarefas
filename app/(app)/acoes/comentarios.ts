"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export interface ComentarioItem { id: string; texto: string; criado_em: string; autor: string; meu: boolean }
export interface ListaComentarios { erro?: string; itens?: ComentarioItem[]; pessoas?: { id: string; nome: string }[]; sou_admin?: boolean }

export async function listarComentarios(tarefaId: string): Promise<ListaComentarios> {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erro: "Sua sessão expirou. Entre de novo." };
  const [c, p, eu] = await Promise.all([
    supabase.from("comentarios").select("id,texto,criado_em,autor_id,autor:pessoas(nome)").eq("tarefa_id", tarefaId).order("criado_em", { ascending: true }).limit(200),
    supabase.from("pessoas").select("id,nome").eq("ativo", true).order("nome"),
    supabase.from("pessoas").select("papel").eq("id", auth.user.id).maybeSingle(),
  ]);
  if (c.error) return { erro: "Não consegui abrir os comentários. Atualize a página." };
  const itens = ((c.data ?? []) as unknown as { id: string; texto: string; criado_em: string; autor_id: string; autor: { nome: string } | null }[]).map((x) => ({
    id: x.id, texto: x.texto, criado_em: x.criado_em, autor: x.autor?.nome ?? "Alguém", meu: x.autor_id === auth.user!.id,
  }));
  return { itens, pessoas: ((p.data ?? []) as { id: string; nome: string }[]).filter((x) => x.id !== auth.user!.id), sou_admin: eu.data?.papel === "admin" };
}

export async function comentarTarefa(tarefaId: string, texto: string, mencionados: string[]): Promise<{ erro?: string }> {
  const limpo = texto.trim();
  if (!limpo) return { erro: "Escreva o comentário." };
  if (limpo.length > 1000) return { erro: "Use até 1000 caracteres." };
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("comentar", { p_tarefa: tarefaId, p_texto: limpo, p_mencionados: mencionados.slice(0, 10) });
  if (error) {
    if (error.message.includes("sem acesso")) return { erro: "Você não tem acesso a esta tarefa." };
    return { erro: "Não foi possível enviar. Atualize a página e tente de novo." };
  }
  revalidatePath("/hoje");
  return {};
}

export async function excluirComentario(id: string): Promise<{ erro?: string }> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from("comentarios").delete().eq("id", id).select("id");
  if (error || !data || data.length === 0) return { erro: "Não foi possível apagar este comentário." };
  return {};
}

"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

type Resultado = { erro?: string; id?: string };

async function exigirAdmin() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erro: "Sua sessão expirou. Entre de novo." } as const;
  const { data } = await supabase.from("pessoas").select("papel,ativo").eq("id", auth.user.id).maybeSingle();
  if (!data || !data.ativo || data.papel !== "admin") return { erro: "Só admin acessa a Base Arco." } as const;
  return { supabase, meuId: auth.user.id } as const;
}

export async function salvarPaginaBase(id: string, conteudo: string): Promise<Resultado> {
  const ctx = await exigirAdmin();
  if ("erro" in ctx) return ctx;
  if (conteudo.length > 200000) return { erro: "O texto passou do limite. Divida em duas páginas." };
  const { error } = await ctx.supabase.from("base_arco").update({ conteudo, atualizado_em: new Date().toISOString(), atualizado_por: ctx.meuId }).eq("id", id);
  if (error) return { erro: "Não foi possível salvar. Atualize a página e tente de novo." };
  revalidatePath("/base-arco");
  return {};
}

export async function criarClienteBase(nome: string): Promise<Resultado> {
  const ctx = await exigirAdmin();
  if ("erro" in ctx) return ctx;
  const titulo = nome.replace(/\s+/g, " ").trim();
  if (!titulo || titulo.length > 120) return { erro: "Escreva o nome do cliente, até 120 caracteres." };
  const { data: topo, error } = await ctx.supabase.from("base_arco").insert({ titulo, conteudo: "## Ficha\n\n## Estado atual\n\n## Decisões-chave\n\n## Alertas\n", atualizado_por: ctx.meuId, ordem: 1000 }).select("id").single();
  if (error || !topo) return { erro: error?.message.includes("duplicate") ? "Já existe uma página com esse nome." : "Não foi possível criar." };
  const { error: e2 } = await ctx.supabase.from("base_arco").insert([
    { pai_id: topo.id, titulo: "Encontros", conteudo: "", ordem: 1, atualizado_por: ctx.meuId },
    { pai_id: topo.id, titulo: "Entre encontros", conteudo: "", ordem: 2, atualizado_por: ctx.meuId },
  ]);
  if (e2) return { erro: "A página foi criada, mas faltaram as subpáginas. Atualize e tente de novo." };
  revalidatePath("/base-arco");
  return { id: topo.id };
}

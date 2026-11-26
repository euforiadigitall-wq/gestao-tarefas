"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export type Resultado = { erro?: string; aviso?: string };

type Cliente = Awaited<ReturnType<typeof supabaseServer>>;

// A regra de verdade está no banco (RLS). Esta checagem só dá uma mensagem clara.
async function exigirAdmin(): Promise<{ supabase: Cliente; meuId: string } | { erro: string }> {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erro: "Sua sessão expirou. Entre de novo." };
  const { data } = await supabase.from("pessoas").select("papel,ativo").eq("id", auth.user.id).maybeSingle();
  if (!data || !data.ativo || data.papel !== "admin") return { erro: "Só admin pode fazer isso." };
  return { supabase, meuId: auth.user.id };
}

function traduzir(msg: string | undefined): string {
  if (!msg) return "Não foi possível salvar. Tente de novo.";
  if (msg.includes("duplicate key") || msg.includes("unique")) return "Já existe um cliente com esse nome.";
  if (msg.includes("row-level security")) return "Você não tem permissão para isso.";
  return "Não foi possível salvar. Atualize a página e tente de novo.";
}

const limpar = (t: string) => t.replace(/\s+/g, " ").trim();

export async function adicionarClientes(texto: string): Promise<Resultado> {
  const ctx = await exigirAdmin();
  if ("erro" in ctx) return ctx;
  const vistos = new Set<string>();
  const nomes = texto.split("\n").map((l) => limpar(l).slice(0, 120)).filter((n) => {
    const k = n.toLowerCase();
    if (!n || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  if (nomes.length === 0) return { erro: "Escreva pelo menos um nome." };
  if (nomes.length > 200) return { erro: "Adicione no máximo 200 de uma vez." };

  const { data: existentes, error: e1 } = await ctx.supabase.from("clientes").select("nome");
  if (e1) return { erro: traduzir(e1.message) };
  const ja = new Set((existentes ?? []).map((c) => c.nome.toLowerCase()));
  const novos = nomes.filter((n) => !ja.has(n.toLowerCase()));
  if (novos.length === 0) return { aviso: "Todos esses clientes já estavam cadastrados." };

  const { error } = await ctx.supabase.from("clientes").insert(novos.map((nome) => ({ nome })));
  if (error) return { erro: traduzir(error.message) };
  revalidatePath("/admin");
  const repetidos = nomes.length - novos.length;
  return { aviso: `${novos.length} adicionado${novos.length > 1 ? "s" : ""}${repetidos ? `, ${repetidos} já existia${repetidos > 1 ? "m" : ""}` : ""}.` };
}

export async function renomearCliente(id: string, nome: string): Promise<Resultado> {
  const ctx = await exigirAdmin();
  if ("erro" in ctx) return ctx;
  const n = limpar(nome).slice(0, 120);
  if (!n) return { erro: "O nome não pode ficar vazio." };
  const { error } = await ctx.supabase.from("clientes").update({ nome: n }).eq("id", id);
  if (error) return { erro: traduzir(error.message) };
  revalidatePath("/admin");
  return {};
}

export async function alternarCliente(id: string, ativo: boolean): Promise<Resultado> {
  const ctx = await exigirAdmin();
  if ("erro" in ctx) return ctx;
  const { error } = await ctx.supabase.from("clientes").update({ ativo }).eq("id", id);
  if (error) return { erro: traduzir(error.message) };
  revalidatePath("/admin");
  return {};
}

export async function atualizarPessoa(
  id: string,
  campos: { nome?: string; apelido?: string; papel?: "admin" | "membro"; ativo?: boolean },
): Promise<Resultado> {
  const ctx = await exigirAdmin();
  if ("erro" in ctx) return ctx;
  const mudanca: Record<string, unknown> = {};
  if (campos.nome !== undefined) {
    const n = limpar(campos.nome).slice(0, 120);
    if (!n) return { erro: "O nome não pode ficar vazio." };
    mudanca.nome = n;
  }
  if (campos.apelido !== undefined) mudanca.apelido = limpar(campos.apelido).slice(0, 60) || null;
  if (campos.papel !== undefined) mudanca.papel = campos.papel;
  if (campos.ativo !== undefined) mudanca.ativo = campos.ativo;
  if (id === ctx.meuId && (campos.papel === "membro" || campos.ativo === false)) {
    return { erro: "Você não pode tirar o próprio acesso de admin nem se desativar. Peça para outro admin fazer isso." };
  }
  if (Object.keys(mudanca).length === 0) return {};
  const { error } = await ctx.supabase.from("pessoas").update(mudanca).eq("id", id);
  if (error) return { erro: traduzir(error.message) };
  revalidatePath("/admin");
  return {};
}

export async function definirAcesso(p: {
  pessoaId: string;
  clienteId: string;
  areaId: string;
  liberar: boolean;
}): Promise<Resultado> {
  const ctx = await exigirAdmin();
  if ("erro" in ctx) return ctx;
  const { supabase } = ctx;

  const { data: linhas, error: e1 } = await supabase
    .from("acessos")
    .select("area_id")
    .eq("pessoa_id", p.pessoaId)
    .eq("cliente_id", p.clienteId);
  if (e1) return { erro: traduzir(e1.message) };
  const temTodas = (linhas ?? []).some((l) => l.area_id === null);
  const temEssa = (linhas ?? []).some((l) => l.area_id === p.areaId);

  if (p.liberar) {
    if (temTodas || temEssa) return {};
    const { error } = await supabase.from("acessos").insert({ pessoa_id: p.pessoaId, cliente_id: p.clienteId, area_id: p.areaId });
    if (error) return { erro: traduzir(error.message) };
  } else if (temTodas) {
    // Existia "todas as áreas": troca por uma linha para cada área que continua liberada.
    const { data: areas, error: e2 } = await supabase.from("areas").select("id").neq("id", p.areaId);
    if (e2) return { erro: traduzir(e2.message) };
    const { error: e3 } = await supabase
      .from("acessos").delete().eq("pessoa_id", p.pessoaId).eq("cliente_id", p.clienteId).is("area_id", null);
    if (e3) return { erro: traduzir(e3.message) };
    const restantes = (areas ?? []).map((a) => ({ pessoa_id: p.pessoaId, cliente_id: p.clienteId, area_id: a.id }));
    if (restantes.length) {
      const { error: e4 } = await supabase.from("acessos").insert(restantes);
      if (e4) return { erro: traduzir(e4.message) };
    }
  } else if (temEssa) {
    const { error } = await supabase
      .from("acessos").delete().eq("pessoa_id", p.pessoaId).eq("cliente_id", p.clienteId).eq("area_id", p.areaId);
    if (error) return { erro: traduzir(error.message) };
  }
  revalidatePath("/admin");
  return {};
}

const PAPEIS_OK = ["copy", "aprovador", "design", "social", "site"];

export async function definirPapel(clienteId: string, papel: string, pessoaId: string): Promise<Resultado> {
  const ctx = await exigirAdmin();
  if ("erro" in ctx) return ctx;
  if (!PAPEIS_OK.includes(papel)) return { erro: "Função desconhecida." };
  if (!pessoaId) {
    const { error } = await ctx.supabase.from("cliente_papeis").delete().eq("cliente_id", clienteId).eq("papel", papel);
    if (error) return { erro: traduzir(error.message) };
  } else {
    const { error } = await ctx.supabase.from("cliente_papeis").upsert({ cliente_id: clienteId, papel, pessoa_id: pessoaId }, { onConflict: "cliente_id,papel" });
    if (error) return { erro: traduzir(error.message) };
  }
  revalidatePath("/admin");
  return {};
}

export async function definirPapelParaTodos(papel: string, pessoaId: string): Promise<Resultado> {
  const ctx = await exigirAdmin();
  if ("erro" in ctx) return ctx;
  if (!PAPEIS_OK.includes(papel) || !pessoaId) return { erro: "Escolha a função e a pessoa." };
  const { data: clientes, error: e1 } = await ctx.supabase.from("clientes").select("id").eq("ativo", true);
  if (e1) return { erro: traduzir(e1.message) };
  const linhas = (clientes ?? []).map((c) => ({ cliente_id: c.id, papel, pessoa_id: pessoaId }));
  if (linhas.length === 0) return { erro: "Não há clientes ativos." };
  const { error } = await ctx.supabase.from("cliente_papeis").upsert(linhas, { onConflict: "cliente_id,papel" });
  if (error) return { erro: traduzir(error.message) };
  revalidatePath("/admin");
  return { aviso: `Aplicado a ${linhas.length} clientes.` };
}

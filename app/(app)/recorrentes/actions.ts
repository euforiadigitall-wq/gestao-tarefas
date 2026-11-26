"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export type Resultado = { erro?: string; geradas?: number };

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export interface DadosRecorrente {
  titulo: string;
  clienteId: string;
  areaId: string;
  responsavelId: string;
  lancamentoId: string;
  frequencia: "diaria_util" | "semanal" | "mensal";
  diasSemana: number[];
  intervaloSemanas: number;
  diaMes: number;
  ultimoDiaUtil: boolean;
  prazoDiasUteis: number;
  inicio: string;
  fim: string;
  notas: string;
}

function traduzir(msg: string | undefined): string {
  if (!msg) return "Não foi possível salvar. Tente de novo.";
  if (msg.includes("row-level security")) return "Só admin gerencia recorrentes.";
  if (msg.includes("recorrentes_regra_check")) return "Confira os dias da repetição e as datas de início e fim.";
  if (msg.includes("apenas admin")) return "Só admin faz isso.";
  return "Não foi possível salvar. Atualize a página e tente de novo.";
}

function atualizar() {
  revalidatePath("/recorrentes");
}

export async function salvarRecorrente(d: DadosRecorrente, id?: string): Promise<Resultado> {
  const titulo = d.titulo.trim();
  if (!titulo) return { erro: "Escreva o que a tarefa precisa fazer." };
  if (titulo.length > 200) return { erro: "Use no máximo 200 caracteres no título." };
  if (!d.responsavelId) return { erro: "Escolha quem faz." };
  if (d.clienteId && !d.areaId) return { erro: "Escolha a área do cliente." };
  if (!DATA.test(d.inicio)) return { erro: "Informe a data de início." };
  if (d.fim && (!DATA.test(d.fim) || d.fim < d.inicio)) return { erro: "O fim precisa ser depois do início." };
  if (d.frequencia === "semanal" && d.diasSemana.length === 0) return { erro: "Marque ao menos um dia da semana." };
  if (d.frequencia === "mensal" && !d.ultimoDiaUtil && !(d.diaMes >= 1 && d.diaMes <= 28)) return { erro: "O dia do mês vai de 1 a 28." };
  if (!(d.prazoDiasUteis >= 0 && d.prazoDiasUteis <= 30)) return { erro: "O prazo vai de 0 a 30 dias úteis." };
  if ((d.notas ?? "").length > 600) return { erro: "A descrição passou de 600 caracteres." };

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erro: "Sua sessão expirou. Entre de novo." };

  const linha = {
    titulo,
    cliente_id: d.clienteId || null,
    area_id: d.clienteId ? d.areaId : null,
    responsavel_id: d.responsavelId,
    lancamento_id: d.lancamentoId || null,
    frequencia: d.frequencia,
    dias_semana: d.frequencia === "semanal" ? [...d.diasSemana].sort() : null,
    dia_semana: null,
    intervalo_semanas: d.frequencia === "semanal" ? Math.min(8, Math.max(1, d.intervaloSemanas || 1)) : 1,
    dia_mes: d.frequencia === "mensal" && !d.ultimoDiaUtil ? d.diaMes : null,
    ultimo_dia_util: d.frequencia === "mensal" && d.ultimoDiaUtil,
    prazo_dias_uteis: d.prazoDiasUteis,
    inicio: d.inicio,
    fim: d.fim || null,
    notas: d.notas.trim() || null,
  };
  const { error } = id
    ? await supabase.from("recorrentes").update(linha).eq("id", id)
    : await supabase.from("recorrentes").insert({ ...linha, criado_por: auth.user.id });
  if (error) return { erro: traduzir(error.message) };
  atualizar();
  return {};
}

export async function alternarRecorrente(id: string, ativo: boolean): Promise<Resultado> {
  const supabase = await supabaseServer();
  const { error } = await supabase.from("recorrentes").update({ ativo }).eq("id", id);
  if (error) return { erro: traduzir(error.message) };
  atualizar();
  return {};
}

export async function excluirRecorrente(id: string): Promise<Resultado> {
  const supabase = await supabaseServer();
  const { error } = await supabase.from("recorrentes").delete().eq("id", id);
  if (error) return { erro: traduzir(error.message) };
  atualizar();
  return {};
}

// Gera as de hoje sem esperar o fluxo das 8h. Cada recorrente gera no máximo uma vez por dia.
export async function gerarAgora(): Promise<Resultado> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("gerar_recorrentes_agora");
  if (error) return { erro: traduzir(error.message) };
  for (const p of ["/hoje", "/agenda", "/quadro", "/recorrentes"]) revalidatePath(p);
  return { geradas: Number(data ?? 0) };
}

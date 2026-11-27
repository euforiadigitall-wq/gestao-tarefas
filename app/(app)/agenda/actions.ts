"use server";

import { revalidatePath } from "next/cache";
import { ehData } from "@/lib/datas";
import { supabaseServer } from "@/lib/supabase/server";

export type Resultado = { erro?: string };

// Arrastar uma tarefa simples para outro dia. A permissão é do banco (RLS): só o responsável ou um admin altera.
// Tarefa com esteira fica de fora: o prazo das etapas é calculado pelo SLA.
export async function moverPrazo(id: string, novaData: string): Promise<Resultado> {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !ehData(novaData)) return { erro: "Não consegui mover. Atualize a página e tente de novo." };
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("tarefas")
    .update({ prazo: novaData })
    .eq("id", id)
    .is("etapa_atual", null)
    .neq("status", "concluida")
    .is("arquivada_em", null)
    .select("id");
  if (error) return { erro: "Não consegui mover. Atualize a página e tente de novo." };
  if (!data || data.length === 0) return { erro: "Só o responsável ou um admin move essa tarefa, e ela não pode estar concluída." };
  for (const p of ["/hoje", "/agenda", "/quadro"]) revalidatePath(p);
  return {};
}

import type { supabaseServer } from "@/lib/supabase/server";
import type { EtiquetaLanc } from "@/lib/tipos";

type Cliente = Awaited<ReturnType<typeof supabaseServer>>;

// Etiquetas de várias tarefas. Em pedaços, para o endereço da consulta não ficar grande demais.
export async function etiquetasDeTarefas(supabase: Cliente, ids: string[]): Promise<Map<string, EtiquetaLanc[]>> {
  const unicos = Array.from(new Set(ids));
  const mapa = new Map<string, EtiquetaLanc[]>();
  const TAM = 80;
  const lotes: string[][] = [];
  for (let i = 0; i < unicos.length; i += TAM) lotes.push(unicos.slice(i, i + TAM));
  const respostas = await Promise.all(lotes.map((l) => supabase.from("v_tarefas").select("id,lancamentos").in("id", l)));
  for (const r of respostas) {
    for (const t of (r.data ?? []) as unknown as { id: string; lancamentos: EtiquetaLanc[] | null }[]) {
      if (t.lancamentos && t.lancamentos.length > 0) mapa.set(t.id, t.lancamentos);
    }
  }
  return mapa;
}

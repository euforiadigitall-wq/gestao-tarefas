import { NextResponse, type NextRequest } from "next/server";
import { dataBr, escreverCsv } from "@/lib/csv";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Exporta as tarefas visíveis para a pessoa (a regra de acesso é do banco), com os mesmos filtros da tela.
export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse("Entre para exportar.", { status: 401 });

  const q = req.nextUrl.searchParams;
  let consulta = supabase
    .from("v_tarefas")
    .select("titulo,cliente,area,lancamentos,responsavel,status,estado_atual,proxima_acao,bloco,prazo,prazo_vez,atrasada,concluida_em")
    .is("arquivada_em", null)
    .order("prazo_vez", { ascending: true, nullsFirst: false })
    .limit(5000);
  const lanc = q.get("lanc");
  if (lanc && uuid.test(lanc)) consulta = consulta.contains("lancamento_ids", [lanc]);
  for (const [param, coluna] of [["pessoa", "responsavel_id"], ["cliente", "cliente_id"], ["area", "area_id"]] as const) {
    const v = q.get(param);
    if (v && uuid.test(v)) consulta = consulta.eq(coluna, v);
  }
  if (q.get("concluidas") !== "1") consulta = consulta.neq("status", "concluida");

  const { data, error } = await consulta;
  if (error) return new NextResponse("Não consegui exportar agora. Tente de novo.", { status: 500 });

  const status: Record<string, string> = { a_fazer: "A fazer", em_andamento: "Em andamento", concluida: "Concluída" };
  const linhas: unknown[][] = [["Título", "Cliente", "Área", "Lançamento", "Responsável", "Status", "Estado", "Próxima ação", "Bloco", "Prazo", "Prazo da vez", "Atrasada", "Concluída em"]];
  for (const t of (data ?? []) as unknown as Record<string, unknown>[]) {
    const etiquetas = ((t.lancamentos as { codigo: string }[] | null) ?? []).map((e) => e.codigo).join(" + ");
    linhas.push([
      t.titulo, t.cliente, t.area, etiquetas, t.responsavel, status[t.status as string] ?? t.status, t.estado_atual, t.proxima_acao, t.bloco,
      dataBr(t.prazo as string | null), dataBr(t.prazo_vez as string | null), t.atrasada ? "Sim" : "Não", dataBr(t.concluida_em as string | null),
    ]);
  }
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return new NextResponse(escreverCsv(linhas), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="tarefas-${hoje}.csv"`,
      "cache-control": "no-store",
    },
  });
}

import { NextResponse } from "next/server";
import { hojeSP } from "@/lib/datas";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TABELAS = [
  "clientes", "areas", "pessoas", "acessos", "cliente_papeis", "modelos_peca", "tarefas", "tarefa_etapas", "historico",
  "comentarios", "recorrentes", "lancamentos", "lancamento_etapas", "lancamento_papeis", "lancamento_checklist",
  "tarefa_lancamentos", "debriefing",
] as const;

// Cópia completa em JSON. Só admin; a regra de acesso é do banco (RLS), então quem não é admin recebe 403.
export async function GET() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse("Entre para baixar.", { status: 401 });
  const { data: eu } = await supabase.from("pessoas").select("papel,ativo").eq("id", auth.user.id).maybeSingle();
  if (!eu || !eu.ativo || eu.papel !== "admin") return new NextResponse("Só admin pode baixar a cópia.", { status: 403 });

  const tabelas: Record<string, unknown[]> = {};
  const falhas: string[] = [];
  for (const nome of TABELAS) {
    const linhas: unknown[] = [];
    // pagina de 1000 em 1000 para não cortar tabelas grandes
    for (let de = 0; de < 200000; de += 1000) {
      const { data, error } = await supabase.from(nome).select("*").range(de, de + 999);
      if (error) { falhas.push(nome); break; }
      linhas.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
    tabelas[nome] = linhas;
  }
  // e-mail de login não entra na cópia
  tabelas.pessoas = (tabelas.pessoas as Record<string, unknown>[]).map(({ email: _e, ...resto }) => resto);

  const corpo = JSON.stringify({ gerado_em: new Date().toISOString(), tabelas_com_falha: falhas, tabelas }, null, 1);
  return new NextResponse(corpo, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="euforia-tarefas-copia-${hojeSP()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

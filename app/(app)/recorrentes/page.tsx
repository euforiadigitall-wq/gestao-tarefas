import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Recorrentes, type LinhaRecorrente } from "@/components/Recorrentes";
import { hojeSP } from "@/lib/datas";
import { pessoaAtual, supabaseServer } from "@/lib/supabase/server";
import type { Area, LancamentoOpcao, Opcao } from "@/lib/tipos";

export const metadata: Metadata = { title: "Recorrentes" };
export const dynamic = "force-dynamic";

export default async function PaginaRecorrentes() {
  const eu = await pessoaAtual();
  if (!eu) redirect("/login");
  if (eu.papel !== "admin") redirect("/hoje");
  const supabase = await supabaseServer();

  const [recRes, pesRes, cliRes, areRes, lanRes] = await Promise.all([
    supabase.from("recorrentes").select("id,titulo,cliente_id,area_id,responsavel_id,responsaveis_extras,lancamento_id,frequencia,dias_semana,intervalo_semanas,dia_mes,ultimo_dia_util,prazo_dias_uteis,horario,inicio,fim,notas,ativo,ultima_geracao").order("ativo", { ascending: false }).order("titulo"),
    supabase.from("pessoas").select("id,nome").eq("ativo", true).order("nome"),
    supabase.from("clientes").select("id,nome").eq("ativo", true).order("nome"),
    supabase.from("areas").select("id,codigo,nome").eq("ativo", true).order("nome"),
    supabase.from("lancamentos").select("id,codigo,cor,nome").neq("status", "encerrado").order("codigo"),
  ]);

  return (
    <div className="mx-auto max-w-[1000px]">
      <p className="label">Geradas sozinhas todo dia útil às 8h</p>
      <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight">Recorrentes</h1>
      <div className="mt-6">
        {recRes.error && (
          <p role="alert" className="mb-4 rounded-lg bg-dangerbg px-4 py-3 text-sm text-danger">
            Não consegui carregar as recorrentes. Confira se o script 10 foi rodado no Supabase.
          </p>
        )}
        <Recorrentes
          itens={(recRes.data ?? []) as LinhaRecorrente[]}
          pessoas={(pesRes.data ?? []) as Opcao[]}
          clientes={(cliRes.data ?? []) as Opcao[]}
          areas={(areRes.data ?? []) as Area[]}
          lancamentos={((lanRes.data ?? []) as LancamentoOpcao[]).filter((l) => l.codigo)}
          meuId={eu.id}
          hoje={hojeSP()}
          socia={!!eu.socia}
        />
      </div>
    </div>
  );
}

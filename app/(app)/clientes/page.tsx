import type { Metadata } from "next";
import Link from "next/link";
import { Etiqueta } from "@/components/Etiqueta";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

export default async function Clientes() {
  const supabase = await supabaseServer();
  const [cliRes, tarRes, lanRes] = await Promise.all([
    supabase.from("clientes").select("id,nome").eq("ativo", true).order("nome"),
    supabase.from("v_tarefas").select("cliente_id,atrasada").not("cliente_id", "is", null).neq("status", "concluida").is("arquivada_em", null).limit(5000),
    supabase.from("lancamentos").select("id,codigo,cor,cliente_id").neq("status", "encerrado"),
  ]);
  const clientes = (cliRes.data ?? []) as { id: string; nome: string }[];
  const tarefas = (tarRes.data ?? []) as { cliente_id: string; atrasada: boolean }[];
  const lancs = (lanRes.data ?? []) as { id: string; codigo: string | null; cor: string; cliente_id: string }[];

  return (
    <div className="mx-auto max-w-[1000px]">
      <p className="label">Tudo de cada cliente em um lugar</p>
      <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight">Clientes</h1>
      {(cliRes.error || tarRes.error) && (
        <p role="alert" className="mt-6 rounded-lg bg-dangerbg px-4 py-3 text-sm text-danger">Não consegui carregar os clientes agora. Atualize a página; se continuar, avise a Iza.</p>
      )}
      {clientes.length === 0 && !cliRes.error ? (
        <div className="panel mt-8 px-6 py-12 text-center">
          <p className="text-[15px] font-medium">Nenhum cliente liberado para você</p>
          <p className="mt-1 text-sm text-tx2">Peça a uma admin para liberar o acesso em Admin.</p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {clientes.map((c) => {
            const ts = tarefas.filter((t) => t.cliente_id === c.id);
            const atrasadas = ts.filter((t) => t.atrasada).length;
            const ls = lancs.filter((l) => l.cliente_id === c.id && l.codigo);
            return (
              <li key={c.id}>
                <Link href={`/clientes/${c.id}`} className="panel block px-5 py-4 transition-colors hover:border-[var(--line-strong)]">
                  <p className="text-[16px] font-medium leading-snug">{c.nome}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-tx2">
                    <span><b className="mono font-medium text-tx">{ts.length}</b> abertas</span>
                    {atrasadas > 0 && <span className="chip bg-dangerbg text-danger">{atrasadas} atrasada{atrasadas > 1 ? "s" : ""}</span>}
                  </p>
                  {ls.length > 0 && <p className="mt-2 flex flex-wrap gap-1">{ls.map((l) => <Etiqueta key={l.id} codigo={l.codigo!} cor={l.cor} />)}</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

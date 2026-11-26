import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminAcessos } from "@/components/AdminAcessos";
import { AdminClientes } from "@/components/AdminClientes";
import { AdminPapeis } from "@/components/AdminPapeis";
import { AdminPessoas } from "@/components/AdminPessoas";
import { ReatribuirTarefas } from "@/components/ReatribuirTarefas";
import { pessoaAtual, supabaseServer, usuarioAtual } from "@/lib/supabase/server";
import type { Acesso, Area, ClienteAdmin, PapelCliente, PessoaAdmin } from "@/lib/tipos";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

const ABAS = [
  { id: "clientes", nome: "Clientes" },
  { id: "pessoas", nome: "Pessoas" },
  { id: "acessos", nome: "Acessos" },
  { id: "papeis", nome: "Papéis" },
] as const;

export default async function Admin({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const supabase = await supabaseServer();
  const { data: auth } = await usuarioAtual();
  if (!auth.user) redirect("/login");
  const meuId = auth.user.id;

  const { data: eu } = await supabase.from("pessoas").select("papel,ativo").eq("id", meuId).maybeSingle();
  if (!eu || !eu.ativo || eu.papel !== "admin") redirect("/hoje");

  const { aba: pedida } = await searchParams;
  const aba = ABAS.some((a) => a.id === pedida) ? (pedida as (typeof ABAS)[number]["id"]) : "clientes";

  const [clientesRes, pessoasRes, areasRes, acessosRes, papeisRes] = await Promise.all([
    supabase.from("clientes").select("id,nome,ativo").order("nome"),
    supabase.from("pessoas").select("id,nome,apelido,email,papel,ativo").order("nome"),
    supabase.from("areas").select("id,codigo,nome").eq("ativo", true).order("nome"),
    supabase.from("acessos").select("pessoa_id,cliente_id,area_id"),
    supabase.from("cliente_papeis").select("cliente_id,papel,pessoa_id"),
  ]);

  const clientes = (clientesRes.data ?? []) as ClienteAdmin[];
  const pessoas = (pessoasRes.data ?? []) as PessoaAdmin[];
  const areas = (areasRes.data ?? []) as Area[];
  const acessos = (acessosRes.data ?? []) as Acesso[];
  const papeis = (papeisRes.data ?? []) as PapelCliente[];
  const falhou = clientesRes.error || pessoasRes.error || areasRes.error || acessosRes.error || papeisRes.error;

  return (
    <div className="mx-auto max-w-[920px]">
      <p className="label">Gestão do sistema</p>
      <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight">Admin</h1>

      <nav className="mt-6 flex gap-1 border-b border-[var(--line)]" aria-label="Seções do admin">
        {ABAS.map((a) => (
          <Link
            key={a.id}
            href={`/admin?aba=${a.id}`}
            aria-current={a.id === aba ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors ${
              a.id === aba ? "border-[var(--accent)] font-medium text-tx" : "border-transparent text-tx2 hover:text-tx"
            }`}
          >
            {a.nome}
          </Link>
        ))}
      </nav>

      {falhou && (
        <p role="alert" className="mt-6 rounded-lg bg-dangerbg px-4 py-3 text-sm text-danger">
          Não consegui carregar os dados agora. Atualize a página; se continuar, avise a Iza.
        </p>
      )}

      <div className="mt-6">
        {aba === "clientes" && <AdminClientes clientes={clientes} />}
        {aba === "pessoas" && (
          <>
            <AdminPessoas pessoas={pessoas} meuId={meuId} />
            <ReatribuirTarefas pessoas={pessoas.filter((p) => p.ativo).map((p) => ({ id: p.id, nome: p.nome }))} />
          </>
        )}
        {aba === "papeis" && <AdminPapeis clientes={clientes} pessoas={pessoas} papeis={papeis} />}
        {aba === "acessos" && (
          <AdminAcessos
            membros={pessoas.filter((p) => p.papel === "membro" && p.ativo)}
            clientes={clientes}
            areas={areas}
            acessos={acessos}
          />
        )}
      </div>
    </div>
  );
}

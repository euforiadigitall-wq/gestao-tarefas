import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BaseArcoEditor } from "@/components/BaseArcoEditor";
import { NovoClienteBase } from "@/components/NovoClienteBase";
import { pessoaAtual, supabaseServer } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Base Arco" };
export const dynamic = "force-dynamic";

interface Pagina { id: string; pai_id: string | null; titulo: string; conteudo: string; ordem: number; atualizado_em: string }

export default async function BaseArco({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const eu = await pessoaAtual();
  if (!eu) redirect("/login");
  if (eu.papel !== "admin") redirect("/hoje");
  const { p } = await searchParams;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from("base_arco").select("id,pai_id,titulo,conteudo,ordem,atualizado_em").order("ordem").order("titulo").limit(500);
  const paginas = (data ?? []) as Pagina[];
  const topo = paginas.filter((x) => !x.pai_id);
  const filhas = (id: string) => paginas.filter((x) => x.pai_id === id);
  const atual = paginas.find((x) => x.id === p) ?? topo[0];
  const clienteAtual = atual ? (atual.pai_id ? paginas.find((x) => x.id === atual.pai_id) : atual) : undefined;
  const subpaginas = clienteAtual ? filhas(clienteAtual.id) : [];
  const abas = clienteAtual ? [clienteAtual, ...subpaginas] : [];

  return (
    <div className="mx-auto max-w-[1100px]">
      <p className="label">Só admin</p>
      <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight">Base Arco</h1>
      <p className="mt-2 max-w-[640px] text-sm text-tx2">Uma página por cliente da Consultoria Arco: ficha, encontros e o que acontece entre os encontros. Não coloque dados de pacientes, senhas ou dados bancários.</p>

      {error && <p role="alert" className="mt-6 rounded-lg bg-dangerbg px-4 py-3 text-sm text-danger">Não consegui abrir a Base Arco agora. Atualize a página; se continuar, avise a Iza.</p>}

      <div className="mt-6 grid gap-6 md:grid-cols-[240px_1fr]">
        <aside aria-label="Clientes">
          <nav className="panel p-2">
            {topo.length === 0 && <p className="px-3 py-4 text-sm text-tx3">Nenhuma página ainda.</p>}
            <ul className="space-y-0.5">
              {topo.map((c) => (
                <li key={c.id}>
                  <Link href={`/base-arco?p=${c.id}`} aria-current={clienteAtual?.id === c.id ? "page" : undefined}
                    className={`block rounded-md px-3 py-2 text-sm transition-colors ${clienteAtual?.id === c.id ? "bg-goldbg font-medium text-gold" : "text-tx2 hover:bg-panel2 hover:text-tx"}`}>
                    {c.titulo}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <NovoClienteBase />
        </aside>

        <div className="min-w-0 space-y-4">
          {abas.length > 1 && (
            <nav className="flex gap-1 border-b border-[var(--line)]" aria-label="Páginas do cliente">
              {abas.map((a) => (
                <Link key={a.id} href={`/base-arco?p=${a.id}`} aria-current={atual?.id === a.id ? "page" : undefined}
                  className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors ${atual?.id === a.id ? "border-[var(--accent)] font-medium text-tx" : "border-transparent text-tx2 hover:text-tx"}`}>
                  {a.pai_id ? a.titulo : "Ficha"}
                </Link>
              ))}
            </nav>
          )}
          {atual && <BaseArcoEditor key={atual.id + atual.atualizado_em} id={atual.id} titulo={atual.pai_id ? `${clienteAtual?.titulo}: ${atual.titulo}` : atual.titulo} conteudo={atual.conteudo} acordeao={!!atual.pai_id} />}
        </div>
      </div>
    </div>
  );
}

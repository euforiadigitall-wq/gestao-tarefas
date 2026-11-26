import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarRange, History, KanbanSquare, Repeat, Rocket, ShieldCheck, Sun, UserRound, Users } from "lucide-react";
import { Logo } from "@/components/Logo";
import { NavLink } from "@/components/NavLink";
import { SairBtn } from "@/components/SairBtn";
import { ThemeToggle } from "@/components/ThemeToggle";
import { pessoaAtual, supabaseServer, usuarioAtual } from "@/lib/supabase/server";
import type { Pessoa } from "@/lib/tipos";

function EmBreve({ icone, nome }: { icone: React.ReactNode; nome: string }) {
  return (
    <span className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-tx3" aria-disabled="true">
      {icone}
      <span className="flex-1">{nome}</span>
      <span className="label !text-[10px]">em breve</span>
    </span>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const { data: auth } = await usuarioAtual();
  if (!auth.user) redirect("/login");

  const pessoa = await pessoaAtual();

  if (!pessoa || !pessoa.ativo) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5">
        <div className="panel w-full max-w-[420px] p-7 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Acesso ainda não liberado</h1>
          <p className="mt-2 text-sm text-tx2">
            Seu login existe, mas ainda não foi liberado neste sistema. Peça para a Iza ou a Isa ativarem o seu acesso.
          </p>
          <div className="mt-5 flex justify-center"><SairBtn rotulo /></div>
        </div>
      </main>
    );
  }

  const primeiro = (pessoa.apelido || pessoa.nome).split(" ")[0];
  const iniciais = (pessoa.apelido || pessoa.nome).slice(0, 2).toUpperCase();

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px]">
      <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col border-r border-[var(--line)] px-4 py-5 md:flex">
        <div className="px-2"><Logo /></div>
        <nav className="mt-8 space-y-1" aria-label="Principal">
          <NavLink href="/hoje"><Sun size={17} /> Hoje</NavLink>
          <NavLink href="/historico"><History size={17} /> Histórico</NavLink>
          <NavLink href="/quadro"><KanbanSquare size={17} /> Quadro</NavLink>
          <NavLink href="/agenda"><CalendarRange size={17} /> Agenda</NavLink>
          <NavLink href="/lancamentos"><Rocket size={17} /> Lançamentos</NavLink>
          <EmBreve icone={<Users size={17} />} nome="Clientes" />
          {pessoa.papel === "admin" && <NavLink href="/recorrentes"><Repeat size={17} /> Recorrentes</NavLink>}
          {pessoa.papel === "admin" && <NavLink href="/admin"><ShieldCheck size={17} /> Admin</NavLink>}
          <NavLink href="/conta"><UserRound size={17} /> Minha conta</NavLink>
        </nav>
        <div className="mt-auto rounded-xl border border-[var(--line)] bg-panel p-3">
          <div className="flex items-center gap-3">
            <span className="mono flex h-9 w-9 items-center justify-center rounded-lg bg-goldbg text-xs font-medium text-gold">{iniciais}</span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium">{primeiro}</span>
              <span className="label block !text-[10px]">{pessoa.papel === "admin" ? "admin" : "membro"}</span>
            </span>
            <SairBtn />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3 md:justify-end">
          <div className="md:hidden"><Logo compacto /></div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Link href="/quadro" className="btn btn-ghost !h-9 !w-9 !px-0 md:hidden" aria-label="Quadro" title="Quadro">
              <KanbanSquare size={16} />
            </Link>
            <Link href="/agenda" className="btn btn-ghost !h-9 !w-9 !px-0 md:hidden" aria-label="Agenda" title="Agenda">
              <CalendarRange size={16} />
            </Link>
            <Link href="/lancamentos" className="btn btn-ghost !h-9 !w-9 !px-0 md:hidden" aria-label="Lançamentos" title="Lançamentos">
              <Rocket size={16} />
            </Link>
            <Link href="/historico" className="btn btn-ghost !h-9 !w-9 !px-0 md:hidden" aria-label="Histórico" title="Histórico">
              <History size={16} />
            </Link>
            {pessoa.papel === "admin" && (
              <Link href="/admin" className="btn btn-ghost !h-9 !w-9 !px-0 md:hidden" aria-label="Admin" title="Admin">
                <ShieldCheck size={16} />
              </Link>
            )}
            <Link href="/conta" className="btn btn-ghost !h-9 !w-9 !px-0 md:hidden" aria-label="Minha conta" title="Minha conta">
              <UserRound size={16} />
            </Link>
            <div className="md:hidden"><SairBtn /></div>
          </div>
        </header>
        <main className="flex-1 px-5 py-7 md:px-9">{children}</main>
      </div>
    </div>
  );
}

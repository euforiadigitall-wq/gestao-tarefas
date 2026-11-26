import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

export function AuthShell({ titulo, subtitulo, children }: { titulo: string; subtitulo: string; children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-5 py-10">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          <span className="chip border border-[var(--line)] text-tx2">
            <span className="dot-live" /> interno
          </span>
        </div>
        <section className="panel p-7">
          <h1 className="text-[22px] font-semibold tracking-tight">{titulo}</h1>
          <p className="mt-1.5 text-sm text-tx2">{subtitulo}</p>
          <div className="mt-6">{children}</div>
        </section>
        <p className="label mt-6 text-center">EuforIA Digital · uso da equipe</p>
      </div>
    </main>
  );
}

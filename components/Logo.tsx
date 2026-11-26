export function Logo({ compacto = false }: { compacto?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <rect x="1" y="1" width="26" height="26" rx="7" fill="var(--panel-2)" stroke="var(--line-strong)" />
        <path d="M9 9h10M9 14h7M9 19h10" stroke="var(--tx)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="20.5" cy="14" r="2.2" fill="var(--gold)" />
      </svg>
      {!compacto && (
        <span className="leading-none">
          <span className="block text-[15px] font-semibold tracking-tight">EuforIA</span>
          <span className="label block pt-1 !text-[10px]">tarefas</span>
        </span>
      )}
    </span>
  );
}

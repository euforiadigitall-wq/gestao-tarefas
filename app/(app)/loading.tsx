// Aparece na hora ao trocar de tela, enquanto os dados chegam.
export default function Carregando() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="animate-pulse">
      <span className="sr-only">Carregando</span>
      <div className="h-3 w-40 rounded bg-panel2" />
      <div className="mt-3 h-8 w-64 rounded bg-panel2" />
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <div className="h-20 rounded-xl bg-panel2" />
        <div className="h-20 rounded-xl bg-panel2" />
        <div className="h-20 rounded-xl bg-panel2" />
      </div>
      <div className="mt-6 space-y-3">
        <div className="h-24 rounded-xl bg-panel2" />
        <div className="h-24 rounded-xl bg-panel2" />
      </div>
    </div>
  );
}

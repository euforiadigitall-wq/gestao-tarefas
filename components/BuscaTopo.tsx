import { Search } from "lucide-react";

// Caixa de busca do topo: envia para /busca. No celular fica só o ícone, que abre a página de busca.
export function BuscaTopo() {
  return (
    <>
      <form action="/busca" role="search" className="mr-auto hidden w-full max-w-[340px] items-center gap-2 md:flex">
        <label htmlFor="topo-q" className="sr-only">Buscar tarefa, cliente ou lançamento</label>
        <span className="relative block w-full">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tx3" />
          <input id="topo-q" name="q" type="search" maxLength={60} placeholder="Buscar tarefa, cliente ou lançamento" className="field !h-9 !pl-9" />
        </span>
      </form>
    </>
  );
}

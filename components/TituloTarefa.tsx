import { Lock } from "lucide-react";
import { ehPessoal, semMarca } from "@/lib/pessoal";

// Título de tarefa. Se for pessoal, mostra o cadeado e esconde a marca [P] do texto.
export function TituloTarefa({ titulo }: { titulo: string }) {
  if (!ehPessoal(titulo)) return <>{titulo}</>;
  return (
    <>
      <Lock size={12} className="mr-1 inline-block align-[-1px] text-tx3" aria-label="Pessoal, só você e a outra sócia veem" />
      {semMarca(titulo)}
    </>
  );
}

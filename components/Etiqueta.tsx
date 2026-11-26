import { corTag } from "@/lib/lancamentos";
import type { EtiquetaLanc } from "@/lib/tipos";

export function Etiqueta({ codigo, cor }: { codigo: string; cor: string }) {
  const c = corTag(cor);
  return (
    <span className="chip mono" style={{ color: `var(--tag-${c})`, background: `var(--tag-${c}-bg)` }} title={`Lançamento ${codigo}`}>
      {codigo}
    </span>
  );
}

export function Etiquetas({ itens }: { itens?: EtiquetaLanc[] | null }) {
  if (!itens || itens.length === 0) return null;
  return (
    <>
      {itens.map((e) => <Etiqueta key={e.id} codigo={e.codigo} cor={e.cor} />)}
    </>
  );
}

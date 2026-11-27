"use client";

import { useState, useTransition, type DragEvent, type ElementType, type ReactNode } from "react";
import { moverPrazo } from "@/app/(app)/agenda/actions";

const TIPO = "application/x-gestao-tarefa";

// Cartão que pode ser arrastado para outro dia.
export function Arrastavel({ id, de, children }: { id: string; de: string; children: ReactNode }) {
  const [arrastando, setArrastando] = useState(false);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(TIPO, JSON.stringify({ id, de }));
        e.dataTransfer.effectAllowed = "move";
        setArrastando(true);
      }}
      onDragEnd={() => setArrastando(false)}
      className={`cursor-grab active:cursor-grabbing ${arrastando ? "opacity-40" : ""}`}
    >
      {children}
    </div>
  );
}

// Dia que recebe o cartão solto.
export function DiaAlvo({
  data, as = "div", className = "", children, ...resto
}: { data: string; as?: "div" | "section"; className?: string; children: ReactNode; "aria-label"?: string }) {
  const Tag = as as ElementType;
  const [sobre, setSobre] = useState(false);
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();

  function permitir(e: DragEvent) {
    if (!e.dataTransfer.types.includes(TIPO)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setSobre(true);
  }
  function sair(e: DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setSobre(false);
  }
  function soltar(e: DragEvent) {
    const bruto = e.dataTransfer.getData(TIPO);
    setSobre(false);
    if (!bruto) return;
    e.preventDefault();
    let p: { id: string; de: string };
    try { p = JSON.parse(bruto); } catch { return; }
    if (p.de === data) return;
    setErro("");
    iniciar(async () => {
      const r = await moverPrazo(p.id, data);
      if (r.erro) {
        setErro(r.erro);
        setTimeout(() => setErro(""), 6000);
      }
    });
  }

  return (
    <Tag
      {...resto}
      onDragOver={permitir}
      onDragEnter={permitir}
      onDragLeave={sair}
      onDrop={soltar}
      className={`${className} ${sobre ? "bg-goldbg/40 ring-2 ring-inset ring-[var(--gold)]" : ""} ${pendente ? "opacity-60" : ""}`}
    >
      {children}
      {erro && <p role="alert" className="mt-1 rounded-md bg-dangerbg px-1.5 py-1 text-[11px] leading-snug text-danger">{erro}</p>}
    </Tag>
  );
}

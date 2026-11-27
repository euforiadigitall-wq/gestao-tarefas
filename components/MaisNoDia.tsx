"use client";

import { useState, type ReactNode } from "react";

// Abre o resto das tarefas do dia dentro da própria célula do mês, sem sair da visão de agenda.
export function MaisNoDia({ total, rotulo, children }: { total: number; rotulo: string; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      {aberto && children}
      <button
        type="button"
        aria-expanded={aberto}
        aria-label={aberto ? `Mostrar menos tarefas em ${rotulo}` : `Mostrar mais ${total} tarefas em ${rotulo}`}
        onClick={() => setAberto((v) => !v)}
        className="block w-full px-1 text-left text-[11px] text-tx2 hover:underline"
      >
        {aberto ? "mostrar menos" : `+${total} mais`}
      </button>
    </>
  );
}

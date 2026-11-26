"use client";

import { useRouter } from "next/navigation";
import type { Opcao } from "@/lib/tipos";

export function TrocarPessoa({ pessoas, atual, meuId }: { pessoas: Opcao[]; atual: string; meuId: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="ver-como" className="label">Ver o dia de</label>
      <select
        id="ver-como"
        className="field !h-9 !w-auto min-w-[150px]"
        value={atual}
        onChange={(e) => router.push(e.target.value === meuId ? "/hoje" : `/hoje?pessoa=${e.target.value}`)}
      >
        {pessoas.map((p) => <option key={p.id} value={p.id}>{p.id === meuId ? `${p.nome} (eu)` : p.nome}</option>)}
      </select>
    </div>
  );
}

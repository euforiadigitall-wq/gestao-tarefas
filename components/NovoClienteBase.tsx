"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { criarClienteBase } from "@/app/(app)/base-arco/actions";

export function NovoClienteBase() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();
  function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    iniciar(async () => {
      const r = await criarClienteBase(nome);
      if (r.erro) return setErro(r.erro);
      setNome("");
      if (r.id) router.push(`/base-arco?p=${r.id}`);
    });
  }
  return (
    <form onSubmit={criar} className="mt-4 space-y-2">
      <label htmlFor="base-novo" className="label block">Cliente novo da Arco</label>
      <div className="flex gap-2">
        <input id="base-novo" className="field" maxLength={120} placeholder="Nome do cliente" value={nome} onChange={(e) => setNome(e.target.value)} />
        <button type="submit" className="btn btn-primary !px-3" disabled={pendente || !nome.trim()} aria-label="Criar página">
          {pendente ? <Loader2 size={15} className="animate-spin" /> : <Plus size={16} />}
        </button>
      </div>
      {erro && <p role="alert" className="text-[13px] text-danger">{erro}</p>}
    </form>
  );
}

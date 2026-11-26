"use client";

import { ExternalLink, Plus, X } from "lucide-react";
import { useState } from "react";
import { normalizarUrl, rotuloLink } from "@/lib/links";

export interface ItemLink {
  chave: string;
  titulo: string;
  url: string;
}

// Lista de links com campo para colar mais um. Serve para criar e para editar.
export function LinksCampo({
  itens, onAdicionar, onRemover, ocupado,
}: {
  itens: ItemLink[];
  onAdicionar: (l: { titulo: string; url: string }) => Promise<string | void> | string | void;
  onRemover: (chave: string) => void;
  ocupado?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [titulo, setTitulo] = useState("");
  const [erro, setErro] = useState("");

  async function adicionar() {
    const limpa = normalizarUrl(url);
    if (!limpa) return setErro("Cole um endereço válido, como https://docs.google.com/...");
    if (itens.length >= 20) return setErro("Use no máximo 20 links por tarefa.");
    setErro("");
    const r = await onAdicionar({ titulo: titulo.trim().slice(0, 80), url: limpa });
    if (typeof r === "string" && r) return setErro(r);
    setUrl(""); setTitulo("");
  }

  return (
    <div>
      {itens.length > 0 && (
        <ul className="mb-2.5 flex flex-wrap gap-2">
          {itens.map((i) => (
            <li key={i.chave} className="chip bg-infobg text-info !pr-1">
              <a href={i.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:underline">
                <ExternalLink size={12} aria-hidden="true" /> {rotuloLink(i.url, i.titulo)}
              </a>
              <button type="button" className="ml-1 rounded p-0.5 hover:bg-[var(--line)]" aria-label={`Remover link ${rotuloLink(i.url, i.titulo)}`} disabled={ocupado} onClick={() => onRemover(i.chave)}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
        <input className="field !h-9" aria-label="Endereço do link" placeholder="Cole o link do Docs, Drive, Canva..." value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void adicionar(); } }} />
        <input className="field !h-9" aria-label="Nome do link (opcional)" placeholder="Nome (opcional)" maxLength={80} value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void adicionar(); } }} />
        <button type="button" className="btn !h-9" disabled={ocupado || !url.trim()} onClick={() => void adicionar()}>
          <Plus size={15} /> Adicionar
        </button>
      </div>
      {erro && <p role="alert" className="mt-2 text-[13px] text-danger">{erro}</p>}
    </div>
  );
}

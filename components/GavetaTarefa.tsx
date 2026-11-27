"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Abre a tarefa em cima da agenda, sem tirar o usuário de onde estava.
export function GavetaTarefa({ fecharHref, children }: { fecharHref: string; children: React.ReactNode }) {
  const router = useRouter();
  const fechar = () => router.push(fecharHref, { scroll: false });
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") router.push(fecharHref, { scroll: false }); };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [router, fecharHref]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <aside role="dialog" aria-modal="true" aria-label="Tarefa" className="h-full w-full max-w-[560px] overflow-y-auto border-l border-[var(--line)] bg-[var(--bg)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--line)] bg-[var(--bg)] px-5 py-3">
          <span className="label">Tarefa</span>
          <button type="button" className="btn btn-ghost !h-8 !w-8 !px-0" onClick={fechar} aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </aside>
    </div>
  );
}

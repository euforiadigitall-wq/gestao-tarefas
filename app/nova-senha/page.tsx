"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function NovaSenha() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [repete, setRepete] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (senha.length < 10) return setErro("Use pelo menos 10 caracteres.");
    if (senha !== repete) return setErro("As duas senhas precisam ser iguais.");
    setCarregando(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: senha });
    if (error) {
      setErro("Não foi possível salvar. Peça um link novo em “Esqueci minha senha”.");
      setCarregando(false);
      return;
    }
    router.replace("/hoje");
    router.refresh();
  }

  return (
    <AuthShell titulo="Crie sua senha" subtitulo="Escolha uma senha só sua, com pelo menos 10 caracteres.">
      <form onSubmit={salvar} className="space-y-4">
        <div>
          <label htmlFor="s1" className="label mb-1.5 block">Senha nova</label>
          <input id="s1" type="password" required autoComplete="new-password" className="field" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </div>
        <div>
          <label htmlFor="s2" className="label mb-1.5 block">Repita a senha</label>
          <input id="s2" type="password" required autoComplete="new-password" className="field" value={repete} onChange={(e) => setRepete(e.target.value)} />
        </div>
        {erro && <p role="alert" className="rounded-lg bg-dangerbg px-3 py-2 text-[13px] text-danger">{erro}</p>}
        <button type="submit" disabled={carregando} className="btn btn-primary w-full !h-10">
          {carregando ? <Loader2 size={16} className="animate-spin" /> : null}
          Salvar senha
        </button>
      </form>
    </AuthShell>
  );
}

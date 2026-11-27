"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { CampoSenha } from "@/components/CampoSenha";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function NovaSenha() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [repete, setRepete] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  // Link do e-mail (fluxo implícito) traz a sessão no #: assume a sessão e limpa o endereço
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const access_token = h.get("access_token");
    const refresh_token = h.get("refresh_token");
    if (!access_token || !refresh_token) return;
    supabaseBrowser().auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      window.history.replaceState(null, "", "/nova-senha");
      if (error) setErro("Esse link venceu ou já foi usado. Peça um link novo em “Esqueci minha senha”.");
    });
  }, []);

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
          <CampoSenha id="s1" required autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </div>
        <div>
          <label htmlFor="s2" className="label mb-1.5 block">Repita a senha</label>
          <CampoSenha id="s2" required autoComplete="new-password" value={repete} onChange={(e) => setRepete(e.target.value)} />
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

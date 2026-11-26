"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { CampoSenha } from "@/components/CampoSenha";
import { supabaseBrowser } from "@/lib/supabase/client";

function Formulario() {
  const router = useRouter();
  const linkFalhou = useSearchParams().get("erro") === "link";
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) {
      setErro("E-mail ou senha incorretos. Confira e tente de novo.");
      setCarregando(false);
      return;
    }
    router.replace("/hoje");
    router.refresh();
  }

  return (
    <form onSubmit={entrar} className="space-y-4">
      <div>
        <label htmlFor="email" className="label mb-1.5 block">E-mail</label>
        <input id="email" type="email" required autoComplete="email" className="field" placeholder="voce@euforiadigital.com"
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="senha" className="label">Senha</label>
          <Link href="/esqueci" className="text-xs text-tx2 underline-offset-4 hover:text-tx hover:underline">Esqueci minha senha</Link>
        </div>
        <CampoSenha id="senha" required autoComplete="current-password" placeholder="Sua senha"
          value={senha} onChange={(e) => setSenha(e.target.value)} />
      </div>
      {linkFalhou && !erro && (
        <p role="alert" className="rounded-lg bg-dangerbg px-3 py-2 text-[13px] text-danger">
          Esse link não funcionou. Ele vale uma vez só, vence com o tempo e precisa abrir no mesmo navegador em que você pediu. Peça um novo em “Esqueci minha senha” e abra logo.
        </p>
      )}
      {erro && <p role="alert" className="rounded-lg bg-dangerbg px-3 py-2 text-[13px] text-danger">{erro}</p>}
      <button type="submit" disabled={carregando} className="btn btn-primary w-full !h-10">
        {carregando ? <Loader2 size={16} className="animate-spin" /> : null}
        Entrar
      </button>
    </form>
  );
}

export default function Login() {
  return (
    <AuthShell titulo="Entrar" subtitulo="Use o e-mail e a senha que a Iza criou para você.">
      <Suspense>
        <Formulario />
      </Suspense>
    </AuthShell>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Esqueci() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [carregando, setCarregando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${base}/auth/callback?next=/nova-senha`,
    });
    // Resposta igual com ou sem cadastro, para nao revelar quem tem login.
    setEnviado(true);
    setCarregando(false);
  }

  return (
    <AuthShell titulo="Esqueci minha senha" subtitulo="Informe seu e-mail e enviamos um link para criar uma senha nova.">
      {enviado ? (
        <div className="space-y-4">
          <p className="flex gap-2.5 rounded-lg bg-okbg px-3 py-3 text-[13px] text-ok">
            <MailCheck size={18} className="mt-0.5 shrink-0" />
            Se esse e-mail tiver cadastro, o link chega em alguns minutos. Olhe também o spam.
          </p>
          <Link href="/login" className="btn w-full !h-10">Voltar para o login</Link>
        </div>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          <div>
            <label htmlFor="email" className="label mb-1.5 block">E-mail</label>
            <input id="email" type="email" required autoComplete="email" className="field" placeholder="voce@euforiadigital.com"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button type="submit" disabled={carregando} className="btn btn-primary w-full !h-10">
            {carregando ? <Loader2 size={16} className="animate-spin" /> : null}
            Enviar link
          </button>
          <Link href="/login" className="block text-center text-xs text-tx2 hover:text-tx">Voltar para o login</Link>
        </form>
      )}
    </AuthShell>
  );
}

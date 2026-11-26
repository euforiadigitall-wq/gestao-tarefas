"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { CampoSenha } from "@/components/CampoSenha";
import { supabaseBrowser } from "@/lib/supabase/client";

export function TrocarSenha({ email }: { email: string }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [repete, setRepete] = useState("");
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);
  const [carregando, setCarregando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setOk(false);
    if (nova.length < 10) return setErro("A senha nova precisa ter pelo menos 10 caracteres.");
    if (nova !== repete) return setErro("As duas senhas novas precisam ser iguais.");
    if (nova === atual) return setErro("A senha nova precisa ser diferente da atual.");

    setCarregando(true);
    const supabase = supabaseBrowser();
    // Confere a senha atual antes de trocar, para que uma sessão esquecida aberta não consiga mudar a senha.
    const { error: erroAtual } = await supabase.auth.signInWithPassword({ email, password: atual });
    if (erroAtual) {
      setErro("A senha atual não confere.");
      setCarregando(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: nova });
    setCarregando(false);
    if (error) {
      setErro("Não foi possível salvar. Tente uma senha mais longa ou com letras, números e símbolos misturados.");
      return;
    }
    setAtual("");
    setNova("");
    setRepete("");
    setOk(true);
  }

  return (
    <form onSubmit={salvar} className="space-y-4">
      <div>
        <label htmlFor="atual" className="label mb-1.5 block">Senha atual</label>
        <CampoSenha id="atual" required autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} />
      </div>
      <div>
        <label htmlFor="nova" className="label mb-1.5 block">Senha nova</label>
        <CampoSenha id="nova" required autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} />
        <p className="mt-1.5 text-xs text-tx3">Pelo menos 10 caracteres.</p>
      </div>
      <div>
        <label htmlFor="repete" className="label mb-1.5 block">Repita a senha nova</label>
        <CampoSenha id="repete" required autoComplete="new-password" value={repete} onChange={(e) => setRepete(e.target.value)} />
      </div>
      {erro && <p role="alert" className="rounded-lg bg-dangerbg px-3 py-2 text-[13px] text-danger">{erro}</p>}
      {ok && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-okbg px-3 py-2 text-[13px] text-ok">
          <CheckCircle2 size={16} className="shrink-0" />
          Senha trocada. Use a nova no próximo login.
        </p>
      )}
      <button type="submit" disabled={carregando} className="btn btn-primary !h-10">
        {carregando ? <Loader2 size={16} className="animate-spin" /> : null}
        Salvar senha nova
      </button>
    </form>
  );
}

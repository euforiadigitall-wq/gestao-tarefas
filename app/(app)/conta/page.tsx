import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TrocarSenha } from "@/components/TrocarSenha";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Minha conta" };
export const dynamic = "force-dynamic";

export default async function Conta() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user?.email) redirect("/login");

  return (
    <div className="max-w-[460px]">
      <p className="label">Minha conta</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Trocar minha senha</h1>
      <p className="mt-1.5 text-sm text-tx2">
        Você está entrando com <span className="font-medium text-tx">{data.user.email}</span>.
      </p>
      <div className="panel mt-6 p-6">
        <TrocarSenha email={data.user.email} />
      </div>
    </div>
  );
}

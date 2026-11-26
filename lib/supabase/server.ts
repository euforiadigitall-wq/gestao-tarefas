import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Pessoa } from "@/lib/tipos";

// Um cliente por requisição: layout e tela dividem a mesma conexão e as mesmas respostas.
export const supabaseServer = cache(async () => {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "gestao" },
      cookies: {
        getAll: () => store.getAll(),
        setAll: (lista) => {
          try {
            lista.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Server Component: o proxy ja renova a sessao.
          }
        },
      },
    },
  );
});

// Quem está logado e a ficha dessa pessoa, buscados uma única vez por requisição.
export const usuarioAtual = cache(async () => (await supabaseServer()).auth.getUser());

export const pessoaAtual = cache(async (): Promise<Pessoa | null> => {
  const { data: auth } = await usuarioAtual();
  if (!auth.user) return null;
  const { data } = await (await supabaseServer())
    .from("pessoas")
    .select("id,nome,apelido,email,papel,ativo")
    .eq("id", auth.user.id)
    .maybeSingle<Pessoa>();
  return data ?? null;
});

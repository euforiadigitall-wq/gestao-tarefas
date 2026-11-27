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
// Lê quem é pelo token (getClaims), sem ir ao servidor de login a cada tela. O proxy.ts continua conferindo
// o login no servidor em toda requisição, e o banco confere o token de novo em cada consulta (RLS).
export const usuarioAtual = cache(async () => {
  const { data } = await (await supabaseServer()).auth.getClaims();
  const sub = data?.claims?.sub;
  return { data: { user: sub ? { id: sub } : null } };
});

export const pessoaAtual = cache(async (): Promise<Pessoa | null> => {
  const { data: auth } = await usuarioAtual();
  if (!auth.user) return null;
  const { data } = await (await supabaseServer())
    .from("pessoas")
    .select("id,nome,apelido,email,papel,ativo,socia")
    .eq("id", auth.user.id)
    .maybeSingle<Pessoa>();
  return data ?? null;
});

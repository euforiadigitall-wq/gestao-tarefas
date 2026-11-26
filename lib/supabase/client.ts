import { createBrowserClient } from "@supabase/ssr";

// Cliente do navegador. Usa so a chave publica; quem protege os dados e o RLS do banco.
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "gestao" } },
  );
}

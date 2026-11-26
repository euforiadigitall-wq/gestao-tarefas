import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Recebe o link de e-mail (redefinir senha), troca o codigo por sessao e segue para a proxima tela.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/hoje";
  // So caminhos internos, para ninguem montar um link que leve para outro site.
  const destino = next.startsWith("/") && !next.startsWith("//") ? next : "/hoje";

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${destino}`);
  }
  return NextResponse.redirect(`${origin}/login`);
}

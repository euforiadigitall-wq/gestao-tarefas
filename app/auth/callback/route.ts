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
  // Link do fluxo implicito: os tokens vem depois do # (o servidor nao enxerga). Uma paginazinha repassa para /nova-senha.
  const html = `<!doctype html><meta charset="utf-8"><title>Entrando...</title><p style="font-family:sans-serif">Entrando...</p>
<script>
var h = location.hash || "";
if (h.indexOf("access_token=") > -1 && h.indexOf("refresh_token=") > -1) location.replace("/nova-senha" + h);
else location.replace("/login?erro=link");
</script>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

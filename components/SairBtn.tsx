"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export function SairBtn({ rotulo = false }: { rotulo?: boolean }) {
  const router = useRouter();
  async function sair() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  return (
    <button type="button" onClick={sair} className={`btn btn-ghost ${rotulo ? "" : "!h-9 !w-9 !px-0"}`} aria-label="Sair" title="Sair">
      <LogOut size={16} />
      {rotulo && "Sair"}
    </button>
  );
}

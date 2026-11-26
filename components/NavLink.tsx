"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const ativo = usePathname().startsWith(href);
  return (
    <Link
      href={href}
      aria-current={ativo ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
        ativo ? "bg-panel2 font-medium text-tx ring-1 ring-[var(--line-strong)]" : "text-tx2 hover:bg-panel2 hover:text-tx"
      }`}
    >
      {children}
    </Link>
  );
}

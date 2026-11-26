"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [tema, setTema] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    setTema(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  function alternar() {
    const novo = tema === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = novo;
    try {
      localStorage.setItem("tema", novo);
    } catch {}
    setTema(novo);
  }

  return (
    <button
      type="button"
      onClick={alternar}
      className="btn btn-ghost !h-9 !w-9 !px-0"
      aria-label={tema === "dark" ? "Mudar para o modo claro" : "Mudar para o modo escuro"}
      title={tema === "dark" ? "Modo claro" : "Modo escuro"}
    >
      {tema === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

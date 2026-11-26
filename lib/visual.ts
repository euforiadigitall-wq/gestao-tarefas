import type { TomPrazo } from "@/lib/datas";

export const corPrazo: Record<TomPrazo, string> = {
  atrasada: "bg-dangerbg text-danger",
  hoje: "bg-goldbg text-gold",
  breve: "bg-infobg text-info",
  neutro: "bg-panel2 text-tx2",
};

export const trilhoPrazo: Record<TomPrazo, string> = {
  atrasada: "bg-[var(--danger)]",
  hoje: "bg-[var(--gold)]",
  breve: "bg-[var(--info)]",
  neutro: "bg-[var(--line-strong)]",
};

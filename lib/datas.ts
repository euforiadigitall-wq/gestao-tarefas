const TZ = "America/Sao_Paulo";

// Data de hoje em Sao Paulo no formato AAAA-MM-DD
export function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function dias(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(ya, ma - 1, da) - Date.UTC(yb, mb - 1, db)) / 86400000);
}

export function ddmm(d: string | null): string {
  if (!d) return "sem prazo";
  const [, m, dia] = d.split("-");
  return `${dia}/${m}`;
}

export type TomPrazo = "atrasada" | "hoje" | "breve" | "neutro";

export function descreverPrazo(prazo: string | null, hoje = hojeSP()): { texto: string; tom: TomPrazo } {
  if (!prazo) return { texto: "sem prazo", tom: "neutro" };
  const d = dias(prazo, hoje);
  if (d < 0) return { texto: d === -1 ? "1 dia de atraso" : `${-d} dias de atraso`, tom: "atrasada" };
  if (d === 0) return { texto: "hoje", tom: "hoje" };
  if (d === 1) return { texto: "amanhã", tom: "breve" };
  return { texto: ddmm(prazo), tom: "neutro" };
}

export function dataExtensa(hoje = hojeSP()): string {
  const [y, m, d] = hoje.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

// Dia (AAAA-MM-DD) de um instante, em Sao Paulo
export function diaSP(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}

// "26/11 às 14:32", em Sao Paulo
export function dataHoraSP(iso: string): string {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${dia} às ${hora}`;
}

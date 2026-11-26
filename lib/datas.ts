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

export function somarDias(d: string, n: number): string {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
}

// Segunda-feira da semana de d
export function segundaDe(d: string): string {
  const [y, m, dd] = d.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
  return somarDias(d, w === 0 ? -6 : 1 - w);
}

export function diaSemanaLongo(d: string): string {
  const [y, m, dd] = d.split("-").map(Number);
  const nome = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, dd)));
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

export const ehData = (d: string | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

export function inicioMes(d: string): string {
  return `${d.slice(0, 7)}-01`;
}

export function fimMes(d: string): string {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function domingoDe(d: string): string {
  return somarDias(segundaDe(d), 6);
}

export function rotuloMes(d: string): string {
  const [y, m] = d.split("-").map(Number);
  const t = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function diaDoMes(d: string): number {
  return Number(d.slice(8, 10));
}

export function somarMeses(d: string, n: number): string {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}

import { somarDias } from "@/lib/datas";

// Espelha gestao._gerar_recorrentes: em que dias a regra vai gerar tarefa e em que dia cai o prazo.
export interface RegraRecorrente {
  id: string;
  titulo: string;
  cliente_id: string | null;
  area_id: string | null;
  responsavel_id: string;
  responsaveis_extras: string[] | null;
  lancamento_id: string | null;
  frequencia: "diaria_util" | "semanal" | "mensal";
  dias_semana: number[] | null;
  intervalo_semanas: number;
  dia_mes: number | null;
  ultimo_dia_util: boolean;
  prazo_dias_uteis: number;
  horario: string | null;
  inicio: string;
  fim: string | null;
  ultima_geracao: string | null;
}

const isodow = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
  return w === 0 ? 7 : w;
};
const util = (d: string) => isodow(d) <= 5;
const dia = (d: string) => Number(d.slice(8, 10));
const mes = (d: string) => d.slice(0, 7);

function proximoUtil(d: string): string {
  let x = d;
  while (!util(x)) x = somarDias(x, 1);
  return x;
}
export function somarDiasUteis(d: string, n: number): string {
  let x = d;
  let falta = n;
  while (falta > 0) {
    x = somarDias(x, 1);
    if (util(x)) falta--;
  }
  return x;
}

// Dias de geração da regra entre a e b (inclusive), como o gerador das 8h faria
function geracoes(r: RegraRecorrente, a: string, b: string): string[] {
  const out: string[] = [];
  const semanaDe = (d: string) => somarDias(d, 1 - isodow(d));
  for (let d = a; d <= b; d = somarDias(d, 1)) {
    if (d < r.inicio || (r.fim && d > r.fim)) continue;
    if (!util(d) && r.frequencia !== "semanal") continue; // sábado e domingo só para quem marcou o dia
    if (r.frequencia === "semanal") {
      if (!(r.dias_semana ?? []).includes(isodow(d))) continue;
      const semanas = Math.round((Date.parse(semanaDe(d)) - Date.parse(semanaDe(r.inicio))) / (7 * 864e5));
      if (semanas % Math.max(1, r.intervalo_semanas) !== 0) continue;
    } else if (r.frequencia === "mensal") {
      if (r.ultimo_dia_util) {
        if (mes(proximoUtil(somarDias(d, 1))) === mes(d)) continue;
      } else {
        // primeiro dia útil em que o dia do mês já chegou
        const alvo = proximoUtil(`${mes(d)}-${String(r.dia_mes ?? 1).padStart(2, "0")}`);
        if (d !== alvo) continue;
      }
    }
    out.push(d);
  }
  return out;
}

// Prévia: ocorrências que ainda vão virar tarefa, com o dia do prazo dentro de [ini, fim]
export function previaRecorrente(r: RegraRecorrente, ini: string, fim: string, hoje: string): { geracao: string; prazo: string }[] {
  const de = somarDias(ini, -45); // prazo pode cair depois da geração
  return geracoes(r, de, fim)
    .filter((g) => g > hoje || (g === hoje && r.ultima_geracao !== hoje))
    .map((g) => ({ geracao: g, prazo: somarDiasUteis(g, r.prazo_dias_uteis) }))
    .filter((o) => o.prazo >= ini && o.prazo <= fim);
}

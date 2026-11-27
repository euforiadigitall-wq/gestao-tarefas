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
  frequencia: "diaria_util" | "semanal" | "mensal" | "a_cada_n_dias";
  dias_semana: number[] | null;
  intervalo_semanas: number;
  dia_mes: number | null;
  ultimo_dia_util: boolean;
  prazo_dias_uteis: number;
  horario: string | null;
  inicio: string;
  fim: string | null;
  ultima_geracao: string | null;
  ultima_ocorrencia?: string | null;
  intervalo_dias?: number | null;
  mensal_semana?: number | null;
  mensal_dia_semana?: number | null;
  prazo_corridos?: boolean;
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

// Dias de geração da regra entre a e b (inclusive), como o gerador das 8h faria.
// "base" é a data da ocorrência: o prazo conta a partir dela. No dia útil, geração e ocorrência são o mesmo dia;
// nas regras por dia corrido, uma ocorrência de sábado ou domingo é gerada na sexta anterior.
function geracoes(r: RegraRecorrente, a: string, b: string): { g: string; base: string }[] {
  const out: { g: string; base: string }[] = [];
  const semanaDe = (d: string) => somarDias(d, 1 - isodow(d));
  const corrida = r.frequencia === "a_cada_n_dias" || (r.frequencia === "mensal" && !!r.mensal_semana);
  for (let d = a; d <= b; d = somarDias(d, 1)) {
    if (d < r.inicio || (r.fim && d > r.fim)) continue;
    if (corrida) {
      let ok: boolean;
      if (r.frequencia === "a_cada_n_dias") {
        const n = Math.max(1, r.intervalo_dias ?? 1);
        ok = Math.round((Date.parse(d) - Date.parse(r.inicio)) / 864e5) % n === 0;
      } else {
        const sem = r.mensal_semana as number;
        ok = isodow(d) === r.mensal_dia_semana && (sem <= 4 ? Math.floor((dia(d) - 1) / 7) + 1 === sem : mes(somarDias(d, 7)) !== mes(d));
      }
      if (ok) out.push({ g: util(d) ? d : somarDias(d, 5 - isodow(d)), base: d });
      continue;
    }
    if (!util(d)) continue;
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
    out.push({ g: d, base: d });
  }
  return out;
}

// Prévia: ocorrências que ainda vão virar tarefa, com o dia do prazo dentro de [ini, fim]
export function previaRecorrente(r: RegraRecorrente, ini: string, fim: string, hoje: string): { geracao: string; prazo: string }[] {
  const de = somarDias(ini, -100); // o prazo pode cair bem depois da geração (dias corridos)
  const ate = somarDias(fim, 0);
  return geracoes(r, de, ate)
    .filter((o) => o.g > hoje || (o.g === hoje && r.ultima_geracao !== hoje))
    .filter((o) => !r.ultima_ocorrencia || o.base > r.ultima_ocorrencia)
    .map((o) => ({ geracao: o.g, prazo: r.prazo_corridos ? somarDias(o.base, r.prazo_dias_uteis) : somarDiasUteis(o.base, r.prazo_dias_uteis) }))
    .filter((o) => o.prazo >= ini && o.prazo <= fim);
}

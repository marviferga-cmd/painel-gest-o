/* Conversões entre o que o formulário envia e o que o banco guarda. */

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

/* "2026-08-18" -> Date UTC 00:00 (colunas @db.Date) */
export function parseDate(value, label) {
  if (value === null || value === undefined || value === "") return null;
  const s = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ValidationError(`${label}: data inválida`);
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${label}: data inválida`);
  return d;
}
export const toDateString = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/* ISO completo vindo do navegador (já convertido do fuso local) */
export function parseDateTime(value, label) {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${label}: data/hora inválida`);
  return d;
}

/* "2026-08" -> 2026-08-01 */
export function parseMonth(value, label) {
  if (!value) return null;
  const s = String(value).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(s)) throw new ValidationError(`${label}: mês inválido (use AAAA-MM)`);
  return new Date(`${s}-01T00:00:00.000Z`);
}
export const toMonthString = (d) => (d ? new Date(d).toISOString().slice(0, 7) : null);
export function monthLabel(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return `${MESES[dt.getUTCMonth()]}/${dt.getUTCFullYear()}`;
}

/* "+3h20", "-2h", "1:45", "-0h30", "90" (min) -> minutos inteiros */
export function parseHours(value, label) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Math.round(value);
  const s = String(value).trim().replace(/\s+/g, "").toLowerCase();
  const m = s.match(/^([+-])?(\d+)(?:h|:)(\d{1,2})?(?:min|m)?$/) || s.match(/^([+-])?()(\d+)(?:min|m)?$/);
  if (!m) throw new ValidationError(`${label}: use o formato +3h20, -1h30 ou 45min`);
  const sign = m[1] === "-" ? -1 : 1;
  const h = Number(m[2] || 0);
  const min = Number(m[3] || 0);
  if (min >= 60 && m[2] !== "") throw new ValidationError(`${label}: minutos devem ser menores que 60`);
  return sign * (h * 60 + min);
}
export function formatHours(min) {
  const sign = min < 0 ? "-" : "+";
  const abs = Math.abs(min);
  return `${sign}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}`;
}

export function parseMoney(value, label) {
  if (value === null || value === undefined || value === "") return null;
  let s = String(value).replace(/[R$\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); // formato BR
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) throw new ValidationError(`${label}: valor inválido`);
  return n.toFixed(2);
}

export function parseInteger(value, label) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n)) throw new ValidationError(`${label}: número inteiro inválido`);
  return n;
}

export function daysBetween(inicio, fim) {
  if (!inicio || !fim) return null;
  return Math.round((new Date(fim) - new Date(inicio)) / DAY_MS) + 1;
}

/* ---------- SLA ---------- */
export const SLA_LIMITES = { criticoHoras: 4, atencaoHoras: 24 };

export function slaStatus(chamado, now = new Date()) {
  if (chamado.concluidoEm) {
    return new Date(chamado.concluidoEm) <= new Date(chamado.prazoEm)
      ? "Concluído no prazo"
      : "Concluído com atraso";
  }
  const diff = new Date(chamado.prazoEm) - now;
  if (diff < 0) return "Atrasado";
  if (diff < SLA_LIMITES.criticoHoras * 3600e3) return "Crítico";
  if (diff < SLA_LIMITES.atencaoHoras * 3600e3) return "Atenção";
  return "No prazo";
}

export function tempoRestante(chamado, now = new Date()) {
  if (chamado.concluidoEm) return "Encerrado";
  const diffMin = Math.round((new Date(chamado.prazoEm) - now) / 60000);
  const abs = Math.abs(diffMin);
  const d = Math.floor(abs / 1440);
  const h = Math.floor((abs % 1440) / 60);
  const m = abs % 60;
  const txt = d ? `${d}d ${h}h` : h ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}min`;
  return diffMin < 0 ? `Vencido há ${txt}` : txt;
}


/* "Hoje" no fuso do negócio (o servidor de deploy roda em UTC). */
export const APP_TZ = process.env.APP_TZ || "America/Sao_Paulo";
export function todayDate() {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${s}T00:00:00.000Z`);
}

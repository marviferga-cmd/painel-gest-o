/* CRUD genérico dirigido pelas definições de src/modules.js */
import {
  formatHours, monthLabel, parseDate, parseDateTime, parseHours, parseInteger,
  parseMoney, parseMonth, toDateString, toMonthString, ValidationError,
} from "./lib/format.js";

const MAX_ROWS = 2000;

/* ---------- banco -> linha da tabela ---------- */
export function toRow(mod, rec) {
  const row = { id: rec.id, _labels: {} };
  for (const col of mod.columns) {
    if (col.compute) { row[col.key] = col.compute(rec); continue; }
    const v = rec[col.field || col.key];
    switch (col.type) {
      case "date": row[col.key] = toDateString(v); break;
      case "datetime": row[col.key] = v ? new Date(v).toISOString() : null; break;
      case "month":
        row[col.key] = toMonthString(v);
        row._labels[col.key] = monthLabel(v);
        break;
      case "money": row[col.key] = v === null || v === undefined ? null : Number(v); break;
      case "hours": row[col.key] = formatHours(v ?? 0); break;
      case "ref":
        row[col.key] = v ?? null;
        row._labels[col.key] = col.label_of ? col.label_of(rec) : (rec[col.relation]?.nome ?? null);
        break;
      default: row[col.key] = v ?? null;
    }
  }
  return row;
}

/* ---------- corpo da requisição -> dados do Prisma ---------- */
export function fromInput(mod, body, { partial = false } = {}) {
  if (!body || typeof body !== "object") throw new ValidationError("Corpo da requisição inválido");
  const data = {};
  for (const col of mod.columns) {
    if (col.compute) continue;
    if (!(col.key in body)) {
      if (!partial && col.required) throw new ValidationError(`${col.label} é obrigatório`);
      continue; // ausente: mantém o valor atual (update) ou o default do banco (create)
    }
    const raw = body[col.key];
    let val;
    switch (col.type) {
      case "number": val = parseInteger(raw, col.label); break;
      case "money": val = parseMoney(raw, col.label); break;
      case "date": val = parseDate(raw, col.label); break;
      case "datetime": val = parseDateTime(raw, col.label); break;
      case "month": val = parseMonth(raw, col.label); break;
      case "hours": val = parseHours(raw, col.label); break;
      case "ref": val = parseInteger(raw, col.label); break;
      case "bool": val = raw === true || raw === "true" || raw === 1 || raw === "1"; break;
      default: {
        const s = raw === null || raw === undefined ? "" : String(raw).trim();
        if (s.length > 500) throw new ValidationError(`${col.label}: texto muito longo`);
        val = s === "" ? null : s;
      }
    }
    if (col.type === "status" && val !== null && col.options && !col.options.includes(val)) {
      throw new ValidationError(`${col.label}: valor "${val}" não permitido`);
    }
    if (col.required && (val === null || val === undefined)) {
      throw new ValidationError(`${col.label} é obrigatório`);
    }
    // campos opcionais vazios: não sobrescrever defaults do banco (status etc.) na criação
    if (val === null && !partial && col.type === "status") continue;
    data[col.field || col.key] = val;
  }
  return data;
}

/* ---------- operações ---------- */
export async function listRows(prisma, mod) {
  if (mod.list) return mod.list(prisma);
  const recs = await prisma[mod.model].findMany({ include: mod.include, orderBy: mod.orderBy, take: MAX_ROWS });
  return recs.map((r) => toRow(mod, r));
}

async function fetchOne(prisma, mod, id) {
  const rec = await prisma[mod.model].findUnique({ where: { id }, include: mod.include });
  if (!rec) { const e = new Error("Registro não encontrado"); e.status = 404; throw e; }
  return rec;
}

export async function createRow(prisma, mod, body) {
  const data = fromInput(mod, body);
  mod.validate?.(data);
  await mod.beforeSave?.(data, prisma, null);
  const rec = await prisma[mod.model].create({ data, include: mod.include });
  return toRow(mod, rec);
}

export async function updateRow(prisma, mod, id, body) {
  const existing = await fetchOne(prisma, mod, id);
  const data = fromInput(mod, body, { partial: true });
  mod.validate?.({ ...existing, ...data });
  await mod.beforeSave?.(data, prisma, existing);
  const rec = await prisma[mod.model].update({ where: { id }, data, include: mod.include });
  return toRow(mod, rec);
}

export async function deleteRow(prisma, mod, id) {
  await fetchOne(prisma, mod, id);
  await prisma[mod.model].delete({ where: { id } });
}

/* ---------- listas para os <select> de chaves estrangeiras ---------- */
export const LOOKUPS = {
  colaboradores: (p) => p.colaborador.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } })
    .then((r) => r.map((x) => ({ value: x.id, label: x.nome }))),
  clientes: (p) => p.cliente.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } })
    .then((r) => r.map((x) => ({ value: x.id, label: x.nome }))),
  servicos: (p) => p.servico.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } })
    .then((r) => r.map((x) => ({ value: x.id, label: `${x.nome} (SLA ${x.slaHoras}h)` }))),
  cargos: (p) => p.cargo.findMany({ where: { ativo: true }, orderBy: [{ nome: "asc" }, { nivel: "asc" }] })
    .then((r) => r.map((x) => ({ value: x.id, label: `${x.nome} — ${x.nivel}` }))),
  ordens: (p) => p.ordemServico.findMany({ orderBy: { numero: "desc" }, take: 500, include: { cliente: { select: { nome: true } } } })
    .then((r) => r.map((x) => ({ value: x.id, label: `${x.numero} · ${x.cliente.nome}` }))),
  faturas: (p) => p.fatura.findMany({ orderBy: { vencimento: "desc" }, take: 500, include: { cliente: { select: { nome: true } } } })
    .then((r) => r.map((x) => ({ value: x.id, label: `#${x.id} · ${x.cliente.nome} · R$ ${Number(x.valor).toFixed(2)}` }))),
};

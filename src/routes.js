import { Router } from "express";
import { prisma } from "./db.js";
import { findModule, publicMeta } from "./modules.js";
import { createRow, deleteRow, listRows, LOOKUPS, updateRow } from "./crud.js";
import { slaStatus, tempoRestante, todayDate, ValidationError } from "./lib/format.js";
import { seed } from "../prisma/seed.js";

export const api = Router();

const allowReset = () => process.env.ALLOW_DEMO_RESET === "true";

function idParam(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError("id inválido");
  return id;
}

function tableModule(req, { write = false } = {}) {
  const mod = findModule(req.params.key);
  if (!mod || mod.type !== "table") {
    const e = new Error(`Módulo desconhecido: ${req.params.key}`); e.status = 404; throw e;
  }
  if (write && mod.readOnly) {
    const e = new Error("Este painel é calculado automaticamente e não aceita edição"); e.status = 405; throw e;
  }
  return mod;
}

/* ---------------- metadados ---------------- */
api.get("/meta", (req, res) => {
  res.json({ ...publicMeta(), allowReset: allowReset() });
});

api.get("/lookups/:name", async (req, res) => {
  const fn = LOOKUPS[req.params.name];
  if (!fn) return res.status(404).json({ error: "Lista desconhecida" });
  res.json(await fn(prisma));
});

/* ---------------- tabelas genéricas ---------------- */
api.get("/modules/:key", async (req, res) => {
  res.json(await listRows(prisma, tableModule(req)));
});

api.post("/modules/:key", async (req, res) => {
  res.status(201).json(await createRow(prisma, tableModule(req, { write: true }), req.body));
});

api.put("/modules/:key/:id", async (req, res) => {
  res.json(await updateRow(prisma, tableModule(req, { write: true }), idParam(req), req.body));
});

api.delete("/modules/:key/:id", async (req, res) => {
  await deleteRow(prisma, tableModule(req, { write: true }), idParam(req));
  res.status(204).end();
});

/* ---------------- kanban ---------------- */
api.get("/kanban/:board", async (req, res) => {
  const colunas = await prisma.kanbanColuna.findMany({
    where: { quadro: req.params.board },
    orderBy: { ordem: "asc" },
    include: { cards: { orderBy: [{ ordem: "asc" }, { id: "asc" }] } },
  });
  res.json({
    columns: colunas.map((c) => ({ id: c.id, titulo: c.titulo })),
    cards: colunas.flatMap((c) => c.cards.map((k) => ({ id: k.id, colunaId: k.colunaId, titulo: k.titulo, etiqueta: k.etiqueta, ordem: k.ordem }))),
  });
});

async function nextOrder(colunaId) {
  const agg = await prisma.kanbanCard.aggregate({ where: { colunaId }, _max: { ordem: true } });
  return (agg._max.ordem ?? -1) + 1;
}

api.post("/kanban/:board/cards", async (req, res) => {
  const titulo = String(req.body?.titulo ?? "").trim();
  const colunaId = Number(req.body?.colunaId);
  if (!titulo) throw new ValidationError("Título é obrigatório");
  const coluna = await prisma.kanbanColuna.findFirst({ where: { id: colunaId, quadro: req.params.board } });
  if (!coluna) throw new ValidationError("Coluna inválida");
  const card = await prisma.kanbanCard.create({
    data: { titulo: titulo.slice(0, 300), etiqueta: String(req.body?.etiqueta ?? "").trim() || null, colunaId, ordem: await nextOrder(colunaId) },
  });
  res.status(201).json(card);
});

api.patch("/kanban/cards/:id", async (req, res) => {
  const id = idParam(req);
  const data = {};
  if (req.body?.colunaId !== undefined) {
    data.colunaId = Number(req.body.colunaId);
    if (!(await prisma.kanbanColuna.findUnique({ where: { id: data.colunaId } }))) throw new ValidationError("Coluna inválida");
    data.ordem = await nextOrder(data.colunaId);
  }
  if (req.body?.titulo !== undefined) data.titulo = String(req.body.titulo).trim().slice(0, 300);
  if (req.body?.etiqueta !== undefined) data.etiqueta = String(req.body.etiqueta).trim() || null;
  res.json(await prisma.kanbanCard.update({ where: { id }, data }));
});

api.delete("/kanban/cards/:id", async (req, res) => {
  await prisma.kanbanCard.delete({ where: { id: idParam(req) } });
  res.status(204).end();
});

/* ---------------- eventos ---------------- */
api.get("/eventos", async (req, res) => {
  const de = new Date(req.query.de);
  const ate = new Date(req.query.ate);
  if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime())) throw new ValidationError("Parâmetros de/ate inválidos");
  const eventos = await prisma.evento.findMany({ where: { inicio: { gte: de, lt: ate } }, orderBy: { inicio: "asc" } });
  res.json(eventos);
});

api.post("/eventos", async (req, res) => {
  const titulo = String(req.body?.titulo ?? "").trim();
  const inicio = new Date(req.body?.inicio);
  if (!titulo) throw new ValidationError("Descrição é obrigatória");
  if (Number.isNaN(inicio.getTime())) throw new ValidationError("Data/hora inválida");
  const modulo = ["pessoas", "os", "sla"].includes(req.body?.modulo) ? req.body.modulo : null;
  res.status(201).json(await prisma.evento.create({ data: { titulo: titulo.slice(0, 300), inicio, modulo } }));
});

api.delete("/eventos/:id", async (req, res) => {
  await prisma.evento.delete({ where: { id: idParam(req) } });
  res.status(204).end();
});

/* ---------------- resumos calculados ---------------- */
api.get("/resumo/os", async (req, res) => {
  const [ordens, faturas, ativos] = await Promise.all([
    prisma.ordemServico.findMany({ include: { cliente: { select: { nome: true } }, servico: { select: { nome: true } }, responsavel: { select: { nome: true } } }, orderBy: { prazo: "asc" } }),
    prisma.fatura.findMany({ select: { valor: true, status: true, vencimento: true } }),
    prisma.colaborador.count({ where: { ativo: true } }),
  ]);
  const hoje = todayDate();
  const abertas = ordens.filter((o) => !["Concluída", "Cancelada"].includes(o.status));
  const atrasadas = abertas.filter((o) => o.prazo < hoje);
  const soma = (arr) => arr.reduce((s, f) => s + Number(f.valor), 0);
  const validas = faturas.filter((f) => f.status !== "Cancelado");
  res.json({
    kpis: {
      osAbertas: abertas.length,
      osConcluidas: ordens.filter((o) => o.status === "Concluída").length,
      osAtrasadas: atrasadas.length,
      faturado: soma(validas),
      recebido: soma(validas.filter((f) => f.status === "Pago")),
      emAberto: soma(validas.filter((f) => f.status === "Em aberto")),
      vencido: soma(validas.filter((f) => f.status === "Em aberto" && f.vencimento < hoje)),
      osPorColaborador: ativos ? abertas.length / ativos : 0,
    },
    ordens: ordens.map((o) => ({
      numero: o.numero, cliente: o.cliente.nome, servico: o.servico?.nome ?? "—",
      responsavel: o.responsavel?.nome ?? "—", prazo: o.prazo.toISOString().slice(0, 10),
      status: o.status, atrasada: !["Concluída", "Cancelada"].includes(o.status) && o.prazo < hoje,
    })),
  });
});

api.get("/resumo/clientes", async (req, res) => {
  const clientes = await prisma.cliente.findMany({
    orderBy: { nome: "asc" },
    include: {
      ordens: { select: { status: true } },
      faturas: { select: { valor: true, status: true } },
      chamados: { select: { prazoEm: true, concluidoEm: true } },
    },
  });
  res.json(clientes.map((c) => {
    const validas = c.faturas.filter((f) => f.status !== "Cancelado");
    const abertos = c.chamados.filter((x) => !x.concluidoEm);
    return {
      cliente: c.nome,
      osTotal: c.ordens.length,
      osAbertas: c.ordens.filter((o) => !["Concluída", "Cancelada"].includes(o.status)).length,
      faturado: validas.reduce((s, f) => s + Number(f.valor), 0),
      emAberto: validas.filter((f) => f.status === "Em aberto").reduce((s, f) => s + Number(f.valor), 0),
      chamadosAbertos: abertos.length,
      chamadosAtrasados: abertos.filter((x) => slaStatus(x) === "Atrasado").length,
    };
  }));
});

api.get("/resumo/sla", async (req, res) => {
  const desde = new Date(Date.now() - 30 * 86400e3);
  const [abertos, concluidos] = await Promise.all([
    prisma.chamado.findMany({ where: { concluidoEm: null }, include: { cliente: { select: { nome: true } }, responsavel: { select: { nome: true } } }, orderBy: { prazoEm: "asc" } }),
    prisma.chamado.findMany({ where: { concluidoEm: { gte: desde } }, select: { prazoEm: true, concluidoEm: true } }),
  ]);
  const rows = abertos.map((c) => ({
    id: c.id, chamado: c.codigo, cliente: c.cliente.nome, responsavel: c.responsavel?.nome ?? "—",
    prazoEm: c.prazoEm.toISOString(), tempoRestante: tempoRestante(c), status: slaStatus(c),
  }));
  const count = (s) => rows.filter((r) => r.status === s).length;
  res.json({
    abertos: rows.length,
    noPrazo: count("No prazo"),
    atencao: count("Atenção"),
    critico: count("Crítico"),
    atrasado: count("Atrasado"),
    concluidos30d: concluidos.length,
    concluidosNoPrazo30d: concluidos.filter((c) => c.concluidoEm <= c.prazoEm).length,
    rows,
  });
});

api.get("/resumo/alertas", async (req, res) => {
  const limite = new Date(Date.now() + 24 * 3600e3);
  const emRisco = await prisma.chamado.count({ where: { concluidoEm: null, prazoEm: { lt: limite } } });
  res.json({ chamadosEmRisco: emRisco });
});

/* ---------------- administração ---------------- */
api.post("/admin/reset", async (req, res) => {
  if (!allowReset()) return res.status(403).json({ error: "Restauração desativada neste ambiente (ALLOW_DEMO_RESET)" });
  await seed(prisma);
  res.json({ ok: true });
});

api.use((req, res) => res.status(404).json({ error: "Rota não encontrada" }));

/* ---------------- erros ---------------- */
// eslint-disable-next-line no-unused-vars
api.use((err, req, res, next) => {
  const prismaMsg = {
    P2002: [409, () => {
      const campos = [].concat(err.meta?.target ?? err.meta?.driverAdapterError?.cause?.constraint?.fields ?? []);
      return `Já existe um registro com esse valor${campos.length ? ` (${campos.join(", ")})` : ""}`;
    }],
    P2003: [409, () => "Não é possível excluir/alterar: há registros vinculados a este item"],
    P2025: [404, () => "Registro não encontrado"],
  }[err.code];
  if (prismaMsg) return res.status(prismaMsg[0]).json({ error: prismaMsg[1]() });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "JSON inválido" });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? "Erro interno no servidor" : err.message });
});


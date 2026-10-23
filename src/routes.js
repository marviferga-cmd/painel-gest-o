import { Router } from "express";
import { prisma } from "./db.js";
import { findModule, MODULES, OS_FINALIZADAS, publicMeta } from "./modules.js";
import { createRow, deleteRow, listRows, LOOKUPS, MAX_ROWS, updateRow } from "./crud.js";
import { slaStatus, tempoRestante, todayDate, ValidationError } from "./lib/format.js";
import { httpError, idParam } from "./lib/http.js";
import { seed } from "../prisma/seed.js";
import {
  authApi, carregarUsuario, exigirAdmin, exigirLogin, exigirTela,
  nivelAcesso, podeVer, usuarioPublico,
} from "./auth.js";
import { adminApi } from "./admin.js";
import { configPublica, registrar } from "./config.js";

export const api = Router();

/* login/cadastro ficam abertos; todo o resto exige sessão */
api.use("/auth", authApi);
api.use(carregarUsuario, exigirLogin);
api.use("/admin", adminApi);

const allowReset = () => process.env.ALLOW_DEMO_RESET === "true";

function tableModule(req, { write = false } = {}) {
  const mod = findModule(req.params.key);
  if (!mod || mod.type !== "table") throw httpError(404, `Módulo desconhecido: ${req.params.key}`);
  if (write && mod.readOnly) throw httpError(405, "Este painel é calculado automaticamente e não aceita edição");
  return mod;
}

/* qual tela (módulo) cada rota de dados alimenta, para checar permissão */
const telaDoQuadro = (board) => MODULES.find((m) => m.type === "kanban" && m.board === board)?.key ?? null;
const telaDoParam = (req) => req.params.key;
async function telaDoCard(req) {
  const card = await prisma.kanbanCard.findUnique({ where: { id: idParam(req) }, include: { coluna: { select: { quadro: true } } } });
  return card ? telaDoQuadro(card.coluna.quadro) : null;
}
const editar = { editar: true };

/* texto curto do registro para o histórico: valor da primeira coluna */
function rotulo(mod, row) {
  const col = mod.columns[0];
  return row._labels?.[col.key] ?? row[col.key] ?? `#${row.id}`;
}

/* ---------------- metadados ---------------- */
const ITENS_ADMIN = [
  { key: "usuarios", label: "Usuários e convites", icon: "usercheck", accent: "indigo", type: "users",
    desc: "Convidar colaboradores, aprovar cadastros e definir o que cada pessoa pode ver ou editar." },
  { key: "perfis", label: "Perfis de acesso", icon: "shield", accent: "violet", type: "profiles",
    desc: "Modelos de permissão reutilizáveis (RH, Financeiro, Consulta…)." },
  { key: "atividade", label: "Histórico", icon: "history", accent: "teal", type: "activity",
    desc: "Quem criou, alterou ou excluiu cada registro, e quando." },
  { key: "configuracoes", label: "Configurações", icon: "gear", accent: "slate", type: "settings",
    desc: "Nome e cor do painel, cadastro público e validade dos convites." },
];

api.get("/meta", async (req, res) => {
  const meta = publicMeta();
  meta.groups = meta.groups
    .map((g) => ({ ...g, items: g.items.filter((i) => podeVer(req.user, i.key)).map((i) => ({ ...i, nivel: nivelAcesso(req.user, i.key) })) }))
    .filter((g) => g.items.length);
  if (req.user.papel === "admin") {
    meta.groups.push({ key: "admin", label: "Administração", items: ITENS_ADMIN.map((i) => ({ ...i, nivel: "editar" })) });
    meta.pendentes = await prisma.usuario.count({ where: { status: "pendente" } });
  }
  res.json({
    ...meta,
    config: await configPublica(),
    maxRows: MAX_ROWS,
    user: { ...usuarioPublico(req.user), perfil: req.user.perfil?.nome ?? null },
    allowReset: allowReset() && req.user.papel === "admin",
  });
});

// a lista de faturas mostra valores: só para quem vê as telas financeiras
api.get("/lookups/:name", exigirTela((req) => (req.params.name === "faturas" ? ["faturamento", "notas-fiscais"] : null)), async (req, res) => {
  const fn = LOOKUPS[req.params.name];
  if (!fn) return res.status(404).json({ error: "Lista desconhecida" });
  res.json(await fn(prisma));
});

/* ---------------- tabelas genéricas ---------------- */
api.get("/modules/:key", exigirTela(telaDoParam), async (req, res) => {
  res.json(await listRows(prisma, tableModule(req)));
});

api.post("/modules/:key", exigirTela(telaDoParam, editar), async (req, res) => {
  const mod = tableModule(req, { write: true });
  const row = await createRow(prisma, mod, req.body);
  registrar(req, "criou", mod.key, `${mod.label}: ${rotulo(mod, row)}`);
  res.status(201).json(row);
});

api.put("/modules/:key/:id", exigirTela(telaDoParam, editar), async (req, res) => {
  const mod = tableModule(req, { write: true });
  const row = await updateRow(prisma, mod, idParam(req), req.body);
  registrar(req, "alterou", mod.key, `${mod.label}: ${rotulo(mod, row)}`);
  res.json(row);
});

api.delete("/modules/:key/:id", exigirTela(telaDoParam, editar), async (req, res) => {
  const mod = tableModule(req, { write: true });
  const row = await deleteRow(prisma, mod, idParam(req));
  registrar(req, "excluiu", mod.key, `${mod.label}: ${rotulo(mod, row)}`);
  res.status(204).end();
});

/* ---------------- kanban ---------------- */
api.get("/kanban/:board", exigirTela((req) => telaDoQuadro(req.params.board)), async (req, res) => {
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

api.post("/kanban/:board/cards", exigirTela((req) => telaDoQuadro(req.params.board), editar), async (req, res) => {
  const titulo = String(req.body?.titulo ?? "").trim();
  const colunaId = Number(req.body?.colunaId);
  if (!titulo) throw new ValidationError("Título é obrigatório");
  if (!Number.isInteger(colunaId) || colunaId <= 0) throw new ValidationError("Coluna inválida");
  const coluna = await prisma.kanbanColuna.findFirst({ where: { id: colunaId, quadro: req.params.board } });
  if (!coluna) throw new ValidationError("Coluna inválida");
  const card = await prisma.kanbanCard.create({
    data: { titulo: titulo.slice(0, 300), etiqueta: String(req.body?.etiqueta ?? "").trim() || null, colunaId, ordem: await nextOrder(colunaId) },
  });
  registrar(req, "criou", telaDoQuadro(req.params.board), `Card "${card.titulo}"`);
  res.status(201).json(card);
});

/* Mover: { colunaId, posicao? } — posicao é o índice na coluna de destino (sem ele, vai para o fim).
   Os outros cards da coluna são renumerados na mesma transação. */
api.patch("/kanban/cards/:id", exigirTela(telaDoCard, editar), async (req, res) => {
  const id = idParam(req);
  const data = {};
  const reordenar = [];
  let destino = null;
  if (req.body?.colunaId !== undefined) {
    // só move dentro do mesmo quadro: a permissão foi checada para o quadro de origem
    data.colunaId = Number(req.body.colunaId);
    const atual = await prisma.kanbanCard.findUnique({ where: { id }, include: { coluna: { select: { quadro: true } } } });
    if (!atual) throw httpError(404, "Registro não encontrado");
    destino = Number.isInteger(data.colunaId) && data.colunaId > 0
      ? await prisma.kanbanColuna.findFirst({ where: { id: data.colunaId, quadro: atual.coluna.quadro } })
      : null;
    if (!destino) throw new ValidationError("Coluna inválida");
    if (destino.id === atual.colunaId && req.body.posicao === undefined) destino = null; // nada a mover

    const outros = await prisma.kanbanCard.findMany({
      where: { colunaId: data.colunaId, id: { not: id } },
      orderBy: [{ ordem: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const pos = req.body.posicao === undefined || req.body.posicao === null ? NaN : Number(req.body.posicao);
    data.ordem = Number.isInteger(pos) ? Math.max(0, Math.min(pos, outros.length)) : outros.length;
    outros.forEach((c, i) => {
      const ordem = i < data.ordem ? i : i + 1;
      reordenar.push(prisma.kanbanCard.update({ where: { id: c.id }, data: { ordem } }));
    });
  }
  if (req.body?.titulo !== undefined) data.titulo = String(req.body.titulo).trim().slice(0, 300);
  if (req.body?.etiqueta !== undefined) data.etiqueta = String(req.body.etiqueta).trim() || null;
  const card = (await prisma.$transaction([...reordenar, prisma.kanbanCard.update({ where: { id }, data })])).at(-1);
  registrar(req, destino ? "moveu" : "alterou", await telaDoCard(req), destino ? `Card "${card.titulo}" → ${destino.titulo}` : `Card "${card.titulo}"`);
  res.json(card);
});

api.delete("/kanban/cards/:id", exigirTela(telaDoCard, editar), async (req, res) => {
  const tela = await telaDoCard(req);
  const card = await prisma.kanbanCard.delete({ where: { id: idParam(req) } });
  registrar(req, "excluiu", tela, `Card "${card.titulo}"`);
  res.status(204).end();
});

/* ---------------- eventos ---------------- */
api.get("/eventos", exigirTela("eventos-semana"), async (req, res) => {
  const de = new Date(req.query.de);
  const ate = new Date(req.query.ate);
  if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime())) throw new ValidationError("Parâmetros de/ate inválidos");
  const eventos = await prisma.evento.findMany({ where: { inicio: { gte: de, lt: ate } }, orderBy: { inicio: "asc" } });
  res.json(eventos);
});

api.post("/eventos", exigirTela("eventos-semana", editar), async (req, res) => {
  const titulo = String(req.body?.titulo ?? "").trim();
  const inicio = new Date(req.body?.inicio);
  if (!titulo) throw new ValidationError("Descrição é obrigatória");
  if (Number.isNaN(inicio.getTime())) throw new ValidationError("Data/hora inválida");
  const modulo = ["pessoas", "os", "sla"].includes(req.body?.modulo) ? req.body.modulo : null;
  const evento = await prisma.evento.create({ data: { titulo: titulo.slice(0, 300), inicio, modulo } });
  registrar(req, "criou", "eventos-semana", `Evento "${evento.titulo}"`);
  res.status(201).json(evento);
});

api.delete("/eventos/:id", exigirTela("eventos-semana", editar), async (req, res) => {
  const evento = await prisma.evento.delete({ where: { id: idParam(req) } });
  registrar(req, "excluiu", "eventos-semana", `Evento "${evento.titulo}"`);
  res.status(204).end();
});

/* ---------------- resumos calculados ---------------- */
api.get("/resumo/os", exigirTela("indicadores"), async (req, res) => {
  const [ordens, faturas, ativos] = await Promise.all([
    prisma.ordemServico.findMany({ include: { cliente: { select: { nome: true } }, servico: { select: { nome: true } }, responsavel: { select: { nome: true } } }, orderBy: { prazo: "asc" } }),
    prisma.fatura.findMany({ select: { valor: true, status: true, vencimento: true } }),
    prisma.colaborador.count({ where: { ativo: true } }),
  ]);
  const hoje = todayDate();
  const abertas = ordens.filter((o) => !OS_FINALIZADAS.includes(o.status));
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
      status: o.status, atrasada: !OS_FINALIZADAS.includes(o.status) && o.prazo < hoje,
    })),
  });
});

api.get("/resumo/clientes", exigirTela("relatorios"), async (req, res) => {
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
      osAbertas: c.ordens.filter((o) => !OS_FINALIZADAS.includes(o.status)).length,
      faturado: validas.reduce((s, f) => s + Number(f.valor), 0),
      emAberto: validas.filter((f) => f.status === "Em aberto").reduce((s, f) => s + Number(f.valor), 0),
      chamadosAbertos: abertos.length,
      chamadosAtrasados: abertos.filter((x) => slaStatus(x) === "Atrasado").length,
    };
  }));
});

api.get("/resumo/sla", exigirTela("dashboards-sla"), async (req, res) => {
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

api.get("/resumo/alertas", exigirTela(["chamados-risco", "dashboards-sla"]), async (req, res) => {
  const limite = new Date(Date.now() + 24 * 3600e3);
  const emRisco = await prisma.chamado.count({ where: { concluidoEm: null, prazoEm: { lt: limite } } });
  res.json({ chamadosEmRisco: emRisco });
});

/* ---------------- administração ---------------- */
api.post("/admin/reset", exigirAdmin, async (req, res) => {
  if (!allowReset()) return res.status(403).json({ error: "Restauração desativada neste ambiente (ALLOW_DEMO_RESET)" });
  await seed(prisma);
  registrar(req, "admin", null, "Restaurou os dados de exemplo");
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


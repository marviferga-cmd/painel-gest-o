/* =========================================================
   ADMINISTRAÇÃO: /api/admin (só administradores)
   - usuarios     convites, aprovação, bloqueio, nível de acesso
   - perfis       modelos de acesso reutilizáveis (RH, Financeiro…)
   - config       nome/cor do painel, cadastro público, validade do convite
   - atividades   histórico de alterações
   ========================================================= */
import { randomBytes } from "node:crypto";
import { Router } from "express";
import { prisma } from "./db.js";
import { ValidationError } from "./lib/format.js";
import { lerConfig, registrar, salvarConfig } from "./config.js";
import {
  exigirAdmin, gerarLink, hashSenha, normEmail, sanitizarAcessos,
  TELAS, usuarioPublico, validaSenha,
} from "./auth.js";

export const adminApi = Router();
adminApi.use(exigirAdmin);

function idParam(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError("id inválido");
  return id;
}

const STATUS = ["convidado", "pendente", "ativo", "bloqueado"];

async function outrosAdminsAtivos(id) {
  return prisma.usuario.count({ where: { papel: "admin", status: "ativo", id: { not: id } } });
}

/* Valida papel/perfil/acessos/colaborador vindos do formulário de acesso. */
async function dadosDeAcesso(body, usuarioId = null) {
  const data = {};
  if (body.papel !== undefined) {
    if (!["admin", "usuario"].includes(body.papel)) throw new ValidationError("Papel inválido");
    data.papel = body.papel;
  }
  if (body.perfilId !== undefined) {
    const id = body.perfilId === null || body.perfilId === "" ? null : Number(body.perfilId);
    if (id !== null && !(await prisma.perfil.findUnique({ where: { id } }))) throw new ValidationError("Perfil inválido");
    data.perfilId = id;
  }
  if (body.acessos !== undefined) data.acessos = sanitizarAcessos(body.acessos);
  if (body.colaboradorId !== undefined) {
    const id = body.colaboradorId === null || body.colaboradorId === "" ? null : Number(body.colaboradorId);
    if (id !== null) {
      if (!(await prisma.colaborador.findUnique({ where: { id } }))) throw new ValidationError("Colaborador inválido");
      const dono = await prisma.usuario.findUnique({ where: { colaboradorId: id } });
      if (dono && dono.id !== usuarioId) throw new ValidationError(`Esse colaborador já está vinculado à conta de ${dono.nome}`);
    }
    data.colaboradorId = id;
  }
  return data;
}

/* ---------------- usuários ---------------- */
adminApi.get("/usuarios", async (req, res) => {
  const [usuarios, perfis, colaboradores] = await Promise.all([
    prisma.usuario.findMany({ orderBy: [{ status: "asc" }, { nome: "asc" }], include: { colaborador: { select: { nome: true } } } }),
    prisma.perfil.findMany({ orderBy: { nome: "asc" } }),
    prisma.colaborador.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, email: true, usuario: { select: { id: true } } } }),
  ]);
  res.json({
    usuarios: usuarios.map((u) => ({ ...usuarioPublico(u), colaborador: u.colaborador?.nome ?? null })),
    perfis: perfis.map((p) => ({ id: p.id, nome: p.nome, descricao: p.descricao, acessos: p.acessos })),
    telas: TELAS,
    colaboradores: colaboradores.map((c) => ({ id: c.id, nome: c.nome, email: c.email, temAcesso: !!c.usuario })),
    perfilPadraoId: (await lerConfig()).perfilPadraoId,
  });
});

/* Cria a conta já com o acesso definido e devolve o link para a pessoa definir a senha. */
adminApi.post("/usuarios/convite", async (req, res) => {
  const body = req.body ?? {};
  const acesso = await dadosDeAcesso(body);
  let nome = String(body.nome ?? "").trim().slice(0, 120);
  let email = normEmail(body.email);
  if (acesso.colaboradorId) {
    const c = await prisma.colaborador.findUnique({ where: { id: acesso.colaboradorId } });
    nome ||= c.nome;
    email ||= normEmail(c.email);
  }
  if (!nome) throw new ValidationError("Informe o nome");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new ValidationError("E-mail inválido");
  if (await prisma.usuario.findUnique({ where: { email } })) throw new ValidationError("Já existe uma conta com esse e-mail");

  const usuario = await prisma.usuario.create({
    data: {
      nome, email, status: "convidado", papel: "usuario", acessos: {},
      senhaHash: await hashSenha(randomBytes(24).toString("hex")), // inutilizável até aceitar o convite
      ...acesso,
    },
  });
  const token = await gerarLink(usuario.id);
  registrar(req, "admin", null, `Convidou ${nome} (${email})`);
  res.status(201).json({ usuario: usuarioPublico(usuario), token, dias: (await lerConfig()).diasConvite });
});

/* Novo link: reenvio de convite ou redefinição de senha de quem já tem conta. */
adminApi.post("/usuarios/:id/link", async (req, res) => {
  const id = idParam(req);
  const u = await prisma.usuario.findUnique({ where: { id } });
  if (!u) return res.status(404).json({ error: "Usuário não encontrado" });
  if (!["convidado", "ativo"].includes(u.status)) throw new ValidationError("Só é possível gerar link para contas ativas ou convidadas");
  const token = await gerarLink(id);
  registrar(req, "admin", null, `${u.status === "convidado" ? "Gerou novo convite" : "Gerou link de redefinição de senha"} para ${u.nome}`);
  res.json({ token, tipo: u.status === "convidado" ? "convite" : "redefinicao", dias: (await lerConfig()).diasConvite });
});

adminApi.patch("/usuarios/:id", async (req, res) => {
  const id = idParam(req);
  const body = req.body ?? {};
  const alvo = await prisma.usuario.findUnique({ where: { id } });
  if (!alvo) return res.status(404).json({ error: "Usuário não encontrado" });

  const data = await dadosDeAcesso(body, id);
  if (body.nome !== undefined) {
    data.nome = String(body.nome ?? "").trim().slice(0, 120);
    if (!data.nome) throw new ValidationError("Informe o nome");
  }
  if (body.status !== undefined) {
    if (!STATUS.includes(body.status) || body.status === "convidado") throw new ValidationError("Status inválido");
    if (body.status === "ativo" && alvo.status === "convidado") throw new ValidationError("A pessoa precisa aceitar o convite para ativar a conta");
    data.status = body.status;
  }
  // aprovação de cadastro sem acesso escolhido: aplica o perfil padrão
  if (alvo.status === "pendente" && data.status === "ativo" && data.perfilId === undefined && data.acessos === undefined) {
    data.perfilId = (await lerConfig()).perfilPadraoId;
  }

  const perdeAdmin = (data.status && data.status !== "ativo") || data.papel === "usuario";
  if (perdeAdmin && alvo.papel === "admin" && alvo.status === "ativo" && !(await outrosAdminsAtivos(id))) {
    throw new ValidationError("O sistema precisa de pelo menos um administrador ativo");
  }
  if (id === req.user.id && (data.status === "bloqueado" || data.papel === "usuario")) {
    throw new ValidationError("Você não pode bloquear nem rebaixar a própria conta");
  }

  const usuario = await prisma.usuario.update({ where: { id }, data });
  if (data.status && data.status !== "ativo") await prisma.sessao.deleteMany({ where: { usuarioId: id } });

  const msgs = [];
  if (data.status === "ativo" && alvo.status === "pendente") msgs.push("aprovou o cadastro");
  else if (data.status === "bloqueado") msgs.push("bloqueou o acesso");
  else if (data.status === "ativo" && alvo.status === "bloqueado") msgs.push("desbloqueou o acesso");
  if (data.papel && data.papel !== alvo.papel) msgs.push(data.papel === "admin" ? "tornou administrador" : "removeu de administrador");
  if (data.perfilId !== undefined || data.acessos !== undefined) msgs.push("alterou as permissões");
  if (msgs.length) registrar(req, "admin", null, `${usuario.nome}: ${msgs.join(", ")}`);
  res.json(usuarioPublico(usuario));
});

adminApi.post("/usuarios/:id/senha", async (req, res) => {
  const id = idParam(req);
  validaSenha(req.body?.senha);
  const u = await prisma.usuario.update({ where: { id }, data: { senhaHash: await hashSenha(req.body.senha) } });
  if (id !== req.user.id) await prisma.sessao.deleteMany({ where: { usuarioId: id } });
  registrar(req, "admin", null, `Definiu nova senha para ${u.nome}`);
  res.json({ ok: true });
});

adminApi.delete("/usuarios/:id", async (req, res) => {
  const id = idParam(req);
  if (id === req.user.id) throw new ValidationError("Você não pode excluir a própria conta");
  const u = await prisma.usuario.findUnique({ where: { id } });
  if (u?.papel === "admin" && u.status === "ativo" && !(await outrosAdminsAtivos(id))) {
    throw new ValidationError("O sistema precisa de pelo menos um administrador ativo");
  }
  await prisma.usuario.delete({ where: { id } });
  registrar(req, "admin", null, `Excluiu a conta de ${u?.nome ?? `#${id}`}`);
  res.status(204).end();
});

/* ---------------- perfis de acesso ---------------- */
function dadosPerfil(body) {
  const nome = String(body?.nome ?? "").trim().slice(0, 60);
  if (!nome) throw new ValidationError("Informe o nome do perfil");
  return { nome, descricao: String(body?.descricao ?? "").trim().slice(0, 200) || null, acessos: sanitizarAcessos(body?.acessos ?? {}) };
}

const perfilP2002 = (err) => {
  if (err.code === "P2002") throw new ValidationError("Já existe um perfil com esse nome");
  throw err;
};

adminApi.get("/perfis", async (req, res) => {
  const perfis = await prisma.perfil.findMany({ orderBy: { nome: "asc" }, include: { _count: { select: { usuarios: true } } } });
  res.json({
    perfis: perfis.map((p) => ({ id: p.id, nome: p.nome, descricao: p.descricao, acessos: p.acessos, usuarios: p._count.usuarios })),
    telas: TELAS,
    perfilPadraoId: (await lerConfig()).perfilPadraoId,
  });
});

adminApi.post("/perfis", async (req, res) => {
  const perfil = await prisma.perfil.create({ data: dadosPerfil(req.body) }).catch(perfilP2002);
  registrar(req, "admin", null, `Criou o perfil "${perfil.nome}"`);
  res.status(201).json(perfil);
});

adminApi.put("/perfis/:id", async (req, res) => {
  const perfil = await prisma.perfil.update({ where: { id: idParam(req) }, data: dadosPerfil(req.body) }).catch(perfilP2002);
  registrar(req, "admin", null, `Alterou o perfil "${perfil.nome}"`);
  res.json(perfil);
});

/* Quem usava o perfil fica com uma cópia das mesmas permissões (ninguém perde acesso). */
adminApi.delete("/perfis/:id", async (req, res) => {
  const id = idParam(req);
  const perfil = await prisma.perfil.findUnique({ where: { id } });
  if (!perfil) return res.status(404).json({ error: "Perfil não encontrado" });
  await prisma.$transaction([
    prisma.usuario.updateMany({ where: { perfilId: id }, data: { perfilId: null, acessos: perfil.acessos } }),
    prisma.perfil.delete({ where: { id } }),
  ]);
  const cfg = await lerConfig();
  if (cfg.perfilPadraoId === id) await salvarConfig({ perfilPadraoId: null });
  registrar(req, "admin", null, `Excluiu o perfil "${perfil.nome}"`);
  res.status(204).end();
});

/* ---------------- configurações ---------------- */
adminApi.get("/config", async (req, res) => {
  const [config, perfis] = await Promise.all([lerConfig(), prisma.perfil.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } })]);
  res.json({ config, perfis });
});

adminApi.put("/config", async (req, res) => {
  const config = await salvarConfig(req.body ?? {});
  registrar(req, "admin", null, "Alterou as configurações do painel");
  res.json({ config });
});

/* ---------------- histórico ---------------- */
adminApi.get("/atividades", async (req, res) => {
  const where = {};
  const antes = Number(req.query.antes);
  if (Number.isInteger(antes) && antes > 0) where.id = { lt: antes };
  if (req.query.usuario) where.usuarioId = Number(req.query.usuario) || -1;
  if (req.query.tela) where.tela = String(req.query.tela);
  const itens = await prisma.atividade.findMany({
    where, orderBy: { id: "desc" }, take: 100,
    include: { usuario: { select: { nome: true } } },
  });
  res.json(itens.map((a) => ({
    id: a.id, acao: a.acao, tela: a.tela, descricao: a.descricao, quando: a.createdAt, usuario: a.usuario?.nome ?? "—",
  })));
});

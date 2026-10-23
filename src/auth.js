/* =========================================================
   AUTENTICAÇÃO E PERMISSÕES
   - Senhas com scrypt (node:crypto), sessão em cookie HttpOnly.
     No banco fica só o SHA-256 do token, nunca o token.
   - Cadastro livre, mas a conta nasce "pendente" até um admin aprovar.
   - Telas restritas (tabela telas_restritas) só abrem para admins e
     para usuários que tenham a chave da tela em `permissoes`.
   ========================================================= */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Router } from "express";
import { prisma } from "./db.js";
import { GROUPS, MODULES } from "./modules.js";
import { ValidationError } from "./lib/format.js";
import { idParam } from "./lib/http.js";

const scrypt = promisify(scryptCb);
const COOKIE = "painel_sessao";
const SESSAO_DIAS = 7;
const SENHA_MIN = 8;
const isProd = process.env.NODE_ENV === "production";

/* ---------------- senhas ---------------- */
export async function hashSenha(senha) {
  const salt = randomBytes(16);
  const hash = await scrypt(senha, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

async function confereSenha(senha, guardada) {
  const [saltHex, hashHex] = String(guardada).split(":");
  if (!saltHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, "hex");
  const obtido = await scrypt(senha, Buffer.from(saltHex, "hex"), esperado.length);
  return timingSafeEqual(obtido, esperado);
}

// usado quando o e-mail não existe, para o tempo de resposta não denunciar isso
const HASH_FALSO = await hashSenha(randomBytes(16).toString("hex"));

/* ---------------- sessões ---------------- */
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

function lerCookie(req, nome) {
  for (const parte of (req.headers.cookie || "").split(";")) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i).trim() === nome) {
      try { return decodeURIComponent(parte.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

const opcoesCookie = { httpOnly: true, sameSite: "lax", secure: isProd, path: "/" };

async function iniciarSessao(res, usuarioId) {
  const token = randomBytes(32).toString("base64url");
  const expiraEm = new Date(Date.now() + SESSAO_DIAS * 86400e3);
  await prisma.sessao.deleteMany({ where: { expiraEm: { lt: new Date() } } });
  await prisma.sessao.create({ data: { id: sha256(token), usuarioId, expiraEm } });
  await prisma.usuario.update({ where: { id: usuarioId }, data: { ultimoAcesso: new Date() } });
  res.cookie(COOKIE, token, { ...opcoesCookie, maxAge: SESSAO_DIAS * 86400e3 });
}

/* Preenche req.user se houver sessão válida de um usuário ativo. */
export async function carregarUsuario(req, res, next) {
  const token = lerCookie(req, COOKIE);
  if (token) {
    const sessao = await prisma.sessao.findUnique({ where: { id: sha256(token) }, include: { usuario: true } });
    if (sessao && sessao.expiraEm > new Date() && sessao.usuario.status === "ativo") req.user = sessao.usuario;
  }
  next();
}

export function exigirLogin(req, res, next) {
  if (req.user) return next();
  res.status(401).json({ error: "Faça login para continuar" });
}

export function exigirAdmin(req, res, next) {
  if (req.user?.papel === "admin") return next();
  res.status(403).json({ error: "Apenas administradores podem fazer isso" });
}

/* Encerra as sessões do usuário; passando `req`, mantém a sessão dessa requisição (quem trocou a própria senha). */
async function encerrarSessoes(usuarioId, req = null) {
  const token = req && lerCookie(req, COOKIE);
  await prisma.sessao.deleteMany({ where: { usuarioId, ...(token ? { id: { not: sha256(token) } } : {}) } });
}

/* ---------------- permissões por tela ----------------
   Consultada em toda requisição e quase nunca muda: cache curto, zerado ao salvar.
   (Com várias instâncias, as outras enxergam a mudança em até 30 s.) */
const CACHE_RESTRITAS_MS = 30e3;
let cacheRestritas = null;

export async function telasRestritas() {
  if (cacheRestritas && Date.now() - cacheRestritas.at < CACHE_RESTRITAS_MS) return cacheRestritas.chaves;
  const chaves = new Set((await prisma.telaRestrita.findMany()).map((t) => t.chave));
  cacheRestritas = { at: Date.now(), chaves };
  return chaves;
}

export function podeVer(user, chave, restritas) {
  return user.papel === "admin" || !restritas.has(chave) || user.permissoes.includes(chave);
}

/* Middleware: libera se o usuário puder ver ALGUMA das telas indicadas.
   `chaves` pode ser string, lista ou função (req) => string | lista. */
export function exigirTela(chaves) {
  return async (req, res, next) => {
    const lista = [].concat(typeof chaves === "function" ? await chaves(req) : chaves).filter(Boolean);
    const restritas = await telasRestritas();
    if (!lista.length || lista.some((k) => podeVer(req.user, k, restritas))) return next();
    res.status(403).json({ error: "Você não tem permissão para acessar esta tela" });
  };
}

export const usuarioPublico = (u) => ({
  id: u.id, nome: u.nome, email: u.email, papel: u.papel, status: u.status,
  permissoes: u.permissoes, ultimoAcesso: u.ultimoAcesso, createdAt: u.createdAt,
});

/* ---------------- limite de tentativas (no banco, por IP) ----------------
   No banco para valer entre reinícios/deploys e com mais de uma instância. */
const MSG_LIMITE = "Muitas tentativas. Aguarde alguns minutos e tente de novo.";

async function excedeuLimite(chave, max) {
  const t = await prisma.limiteTentativa.findUnique({ where: { chave } });
  return !!t && t.ate > new Date() && t.n >= max;
}

async function registrarTentativa(chave, janelaMin) {
  const agora = new Date();
  const t = await prisma.limiteTentativa.findUnique({ where: { chave } });
  if (t && t.ate > agora) {
    await prisma.limiteTentativa.update({ where: { chave }, data: { n: { increment: 1 } } });
    return;
  }
  const ate = new Date(agora.getTime() + janelaMin * 60e3);
  await prisma.limiteTentativa.upsert({ where: { chave }, create: { chave, n: 1, ate }, update: { n: 1, ate } });
}

setInterval(() => {
  prisma.limiteTentativa.deleteMany({ where: { ate: { lt: new Date() } } }).catch(() => {});
}, 10 * 60e3).unref();

/* ---------------- validação ---------------- */
const normEmail = (v) => String(v ?? "").trim().toLowerCase();

function validaSenha(senha) {
  if (typeof senha !== "string" || senha.length < SENHA_MIN) throw new ValidationError(`A senha deve ter pelo menos ${SENHA_MIN} caracteres`);
  if (senha.length > 200) throw new ValidationError("Senha longa demais");
}

/* =========================================================
   ROTAS PÚBLICAS: /api/auth
   ========================================================= */
export const authApi = Router();

// login: só as tentativas que erram a senha contam para o limite
authApi.post("/login", async (req, res) => {
  const chave = `login|${req.ip}`;
  if (await excedeuLimite(chave, 10)) return res.status(429).json({ error: MSG_LIMITE });
  const email = normEmail(req.body?.email);
  const senha = String(req.body?.senha ?? "");
  const usuario = email ? await prisma.usuario.findUnique({ where: { email } }) : null;
  const ok = await confereSenha(senha, usuario?.senhaHash ?? HASH_FALSO);
  if (!usuario || !ok) {
    await registrarTentativa(chave, 15);
    return res.status(401).json({ error: "E-mail ou senha incorretos" });
  }
  if (usuario.status === "pendente") return res.status(403).json({ error: "Seu cadastro ainda aguarda aprovação do administrador." });
  if (usuario.status !== "ativo") return res.status(403).json({ error: "Seu acesso está bloqueado. Fale com o administrador." });
  await iniciarSessao(res, usuario.id);
  res.json({ user: usuarioPublico(usuario) });
});

authApi.post("/cadastro", async (req, res) => {
  const chave = `cadastro|${req.ip}`;
  if (await excedeuLimite(chave, 5)) return res.status(429).json({ error: MSG_LIMITE });
  await registrarTentativa(chave, 60);
  const nome = String(req.body?.nome ?? "").trim().slice(0, 120);
  const email = normEmail(req.body?.email);
  const senha = req.body?.senha;
  if (!nome) throw new ValidationError("Informe seu nome");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new ValidationError("E-mail inválido");
  validaSenha(senha);

  // Fora de produção, o primeiro cadastro de um banco vazio vira admin (facilita o desenvolvimento).
  // Em produção o admin vem de ADMIN_EMAIL/ADMIN_PASSWORD (garantirAdmin).
  const primeiro = !isProd && (await prisma.usuario.count()) === 0;
  const usuario = await prisma.usuario.create({
    data: { nome, email, senhaHash: await hashSenha(senha), papel: primeiro ? "admin" : "usuario", status: primeiro ? "ativo" : "pendente" },
  }).catch((err) => {
    if (err.code === "P2002") throw new ValidationError("Já existe uma conta com esse e-mail");
    throw err;
  });

  if (primeiro) {
    await iniciarSessao(res, usuario.id);
    return res.status(201).json({ pendente: false, user: usuarioPublico(usuario) });
  }
  res.status(201).json({ pendente: true });
});

authApi.post("/logout", async (req, res) => {
  const token = lerCookie(req, COOKIE);
  if (token) await prisma.sessao.deleteMany({ where: { id: sha256(token) } });
  res.clearCookie(COOKIE, opcoesCookie);
  res.status(204).end();
});

authApi.post("/senha", carregarUsuario, exigirLogin, async (req, res) => {
  if (!(await confereSenha(String(req.body?.atual ?? ""), req.user.senhaHash))) throw new ValidationError("Senha atual incorreta");
  validaSenha(req.body?.nova);
  await prisma.usuario.update({ where: { id: req.user.id }, data: { senhaHash: await hashSenha(req.body.nova) } });
  await encerrarSessoes(req.user.id, req); // desconecta os outros aparelhos
  res.json({ ok: true });
});

/* =========================================================
   ADMINISTRAÇÃO: /api/usuarios (montado depois de exigirLogin)
   ========================================================= */
export const usuariosApi = Router();
usuariosApi.use(exigirAdmin);

const CHAVES_TELAS = new Set(MODULES.map((m) => m.key));

async function outrosAdminsAtivos(id) {
  return prisma.usuario.count({ where: { papel: "admin", status: "ativo", id: { not: id } } });
}

usuariosApi.get("/", async (req, res) => {
  const [usuarios, restritas] = await Promise.all([
    prisma.usuario.findMany({ orderBy: [{ status: "asc" }, { nome: "asc" }] }),
    telasRestritas(),
  ]);
  res.json({
    usuarios: usuarios.map(usuarioPublico),
    telas: MODULES.map((m) => ({
      key: m.key, label: m.label, grupo: GROUPS.find((g) => g.key === m.group)?.label ?? m.group, restrita: restritas.has(m.key),
    })),
  });
});

usuariosApi.patch("/:id", async (req, res) => {
  const id = idParam(req);
  const data = {};
  const { status, papel, permissoes } = req.body ?? {};
  if (status !== undefined) {
    if (!["pendente", "ativo", "bloqueado"].includes(status)) throw new ValidationError("Status inválido");
    data.status = status;
  }
  if (papel !== undefined) {
    if (!["admin", "usuario"].includes(papel)) throw new ValidationError("Papel inválido");
    data.papel = papel;
  }
  if (permissoes !== undefined) {
    if (!Array.isArray(permissoes)) throw new ValidationError("Permissões inválidas");
    data.permissoes = [...new Set(permissoes.map(String))].filter((k) => CHAVES_TELAS.has(k));
  }
  const perdeAdmin = (data.status && data.status !== "ativo") || data.papel === "usuario";
  if (perdeAdmin) {
    const alvo = await prisma.usuario.findUnique({ where: { id } });
    if (alvo?.papel === "admin" && alvo.status === "ativo" && !(await outrosAdminsAtivos(id))) {
      throw new ValidationError("O sistema precisa de pelo menos um administrador ativo");
    }
  }
  const usuario = await prisma.usuario.update({ where: { id }, data });
  if (data.status && data.status !== "ativo") await encerrarSessoes(id);
  res.json(usuarioPublico(usuario));
});

usuariosApi.post("/:id/senha", async (req, res) => {
  const id = idParam(req);
  validaSenha(req.body?.senha);
  await prisma.usuario.update({ where: { id }, data: { senhaHash: await hashSenha(req.body.senha) } });
  await encerrarSessoes(id, id === req.user.id ? req : null);
  res.json({ ok: true });
});

usuariosApi.delete("/:id", async (req, res) => {
  const id = idParam(req);
  if (id === req.user.id) throw new ValidationError("Você não pode excluir a própria conta");
  await prisma.usuario.delete({ where: { id } });
  res.status(204).end();
});

usuariosApi.put("/telas-restritas", async (req, res) => {
  const chaves = req.body?.chaves;
  if (!Array.isArray(chaves)) throw new ValidationError("Lista de telas inválida");
  const validas = [...new Set(chaves.map(String))].filter((k) => CHAVES_TELAS.has(k));
  await prisma.$transaction([
    prisma.telaRestrita.deleteMany(),
    prisma.telaRestrita.createMany({ data: validas.map((chave) => ({ chave })) }),
  ]);
  cacheRestritas = null;
  res.json({ chaves: validas });
});

/* =========================================================
   ADMIN INICIAL (ADMIN_EMAIL / ADMIN_PASSWORD)
   Cria a conta se não existir; se existir, garante que é admin ativo.
   A senha só é usada na criação; depois vale a que estiver no banco.
   ========================================================= */
export async function garantirAdmin() {
  const email = normEmail(process.env.ADMIN_EMAIL);
  const senha = process.env.ADMIN_PASSWORD;
  if (!email || !senha) {
    if (isProd && !(await prisma.usuario.count({ where: { papel: "admin" } }))) {
      console.warn("⚠ Nenhum administrador cadastrado. Defina ADMIN_EMAIL e ADMIN_PASSWORD e reinicie.");
    }
    return;
  }
  validaSenha(senha);
  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) {
    if (existente.papel !== "admin" || existente.status !== "ativo") {
      await prisma.usuario.update({ where: { email }, data: { papel: "admin", status: "ativo" } });
    }
    return;
  }
  await prisma.usuario.create({
    data: { nome: process.env.ADMIN_NOME?.trim() || "Administrador", email, senhaHash: await hashSenha(senha), papel: "admin", status: "ativo" },
  });
  console.log(`Administrador inicial criado: ${email}`);
}

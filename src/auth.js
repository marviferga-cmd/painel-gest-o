/* =========================================================
   AUTENTICAÇÃO E PERMISSÕES
   - Senhas com scrypt (node:crypto), sessão em cookie HttpOnly.
     No banco fica só o SHA-256 do token, nunca o token.
   - Contas chegam de dois jeitos: convite do admin (link para definir
     a senha) ou cadastro público, que nasce "pendente" até a aprovação.
   - Cada tela tem um nível por usuário: nenhum | ver | editar.
     Admin edita tudo; os demais seguem o perfil (ou acessos próprios).
   ========================================================= */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Router } from "express";
import { prisma } from "./db.js";
import { GROUPS, MODULES } from "./modules.js";
import { ValidationError } from "./lib/format.js";
import { configPublica, lerConfig, registrar } from "./config.js";

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

export async function confereSenha(senha, guardada) {
  const [saltHex, hashHex] = String(guardada).split(":");
  if (!saltHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, "hex");
  const obtido = await scrypt(senha, Buffer.from(saltHex, "hex"), esperado.length);
  return timingSafeEqual(obtido, esperado);
}

// usado quando o e-mail não existe, para o tempo de resposta não denunciar isso
const HASH_FALSO = await hashSenha(randomBytes(16).toString("hex"));

/* ---------------- sessões ---------------- */
export const sha256 = (s) => createHash("sha256").update(s).digest("hex");

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
    const sessao = await prisma.sessao.findUnique({ where: { id: sha256(token) }, include: { usuario: { include: { perfil: true } } } });
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

/* ---------------- acesso por tela ---------------- */
export const NIVEIS = ["nenhum", "ver", "editar"];

// telas calculadas (relatórios, dashboards…) só fazem sentido como "ver"
const editavel = (m) => (m.type === "table" && !m.readOnly) || m.type === "kanban" || m.type === "week";

export const TELAS = MODULES.map((m) => ({
  key: m.key, label: m.label, icon: m.icon,
  grupo: GROUPS.find((g) => g.key === m.group)?.label ?? m.group,
  editavel: editavel(m),
}));
const TELA = new Map(TELAS.map((t) => [t.key, t]));

/* Limpa um mapa { tela: nivel } vindo do navegador. */
export function sanitizarAcessos(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new ValidationError("Acessos inválidos");
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const tela = TELA.get(k);
    if (!tela || !["ver", "editar"].includes(v)) continue;
    out[k] = v === "editar" && !tela.editavel ? "ver" : v;
  }
  return out;
}

export function nivelAcesso(user, chave) {
  if (user.papel === "admin") return TELA.get(chave)?.editavel ? "editar" : "ver";
  const mapa = (user.perfilId && user.perfil ? user.perfil.acessos : user.acessos) ?? {};
  return ["ver", "editar"].includes(mapa[chave]) ? mapa[chave] : "nenhum";
}
export const podeVer = (user, chave) => nivelAcesso(user, chave) !== "nenhum";
export const podeEditar = (user, chave) => nivelAcesso(user, chave) === "editar";

/* Middleware: libera se o usuário puder ver (ou editar) ALGUMA das telas indicadas.
   `chaves` pode ser string, lista ou função (req) => string | lista. */
export function exigirTela(chaves, { editar = false } = {}) {
  const pode = editar ? podeEditar : podeVer;
  return async (req, res, next) => {
    const lista = [].concat(typeof chaves === "function" ? await chaves(req) : chaves).filter(Boolean);
    if (!lista.length || lista.some((k) => pode(req.user, k))) return next();
    res.status(403).json({ error: editar ? "Você só tem permissão de consulta nesta tela" : "Você não tem permissão para acessar esta tela" });
  };
}

export const usuarioPublico = (u) => ({
  id: u.id, nome: u.nome, email: u.email, papel: u.papel, status: u.status,
  perfilId: u.perfilId, acessos: u.acessos, colaboradorId: u.colaboradorId,
  conviteExpira: u.conviteExpira, ultimoAcesso: u.ultimoAcesso, createdAt: u.createdAt,
});

/* ---------------- links de convite / redefinição ---------------- */
/* Gera um token novo para o usuário (invalida o anterior) e devolve o token
   em claro, que só é mostrado ao admin para ser repassado. */
export async function gerarLink(usuarioId) {
  const token = randomBytes(24).toString("base64url");
  const { diasConvite } = await lerConfig();
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { conviteHash: sha256(token), conviteExpira: new Date(Date.now() + diasConvite * 86400e3) },
  });
  return token;
}

async function usuarioDoLink(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const u = await prisma.usuario.findUnique({ where: { conviteHash: sha256(token) } });
  if (!u || !u.conviteExpira || u.conviteExpira < new Date() || !["convidado", "ativo"].includes(u.status)) return null;
  return u;
}

/* ---------------- limite de tentativas (memória, por IP) ---------------- */
const tentativas = new Map();
function limiteTentativas(max, janelaMin) {
  return (req, res, next) => {
    const agora = Date.now();
    const chave = `${req.path}|${req.ip}`;
    const t = tentativas.get(chave);
    if (!t || t.ate < agora) tentativas.set(chave, { n: 1, ate: agora + janelaMin * 60e3 });
    else if (++t.n > max) return res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." });
    next();
  };
}
setInterval(() => {
  const agora = Date.now();
  for (const [k, t] of tentativas) if (t.ate < agora) tentativas.delete(k);
}, 10 * 60e3).unref();

/* ---------------- validação ---------------- */
export const normEmail = (v) => String(v ?? "").trim().toLowerCase();

export function validaSenha(senha) {
  if (typeof senha !== "string" || senha.length < SENHA_MIN) throw new ValidationError(`A senha deve ter pelo menos ${SENHA_MIN} caracteres`);
  if (senha.length > 200) throw new ValidationError("Senha longa demais");
}

/* =========================================================
   ROTAS PÚBLICAS: /api/auth
   ========================================================= */
export const authApi = Router();

authApi.get("/config", async (req, res) => {
  res.json(await configPublica());
});

authApi.post("/login", limiteTentativas(10, 15), async (req, res) => {
  const email = normEmail(req.body?.email);
  const senha = String(req.body?.senha ?? "");
  const usuario = email ? await prisma.usuario.findUnique({ where: { email } }) : null;
  const ok = await confereSenha(senha, usuario?.senhaHash ?? HASH_FALSO);
  if (!usuario || !ok) return res.status(401).json({ error: "E-mail ou senha incorretos" });
  if (usuario.status === "pendente") return res.status(403).json({ error: "Seu cadastro ainda aguarda aprovação do administrador." });
  if (usuario.status === "convidado") return res.status(403).json({ error: "Você ainda não ativou seu convite. Abra o link recebido para definir sua senha." });
  if (usuario.status !== "ativo") return res.status(403).json({ error: "Seu acesso está bloqueado. Fale com o administrador." });
  await iniciarSessao(res, usuario.id);
  res.json({ user: usuarioPublico(usuario) });
});

authApi.post("/cadastro", limiteTentativas(5, 60), async (req, res) => {
  const nome = String(req.body?.nome ?? "").trim().slice(0, 120);
  const email = normEmail(req.body?.email);
  const senha = req.body?.senha;
  if (!nome) throw new ValidationError("Informe seu nome");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new ValidationError("E-mail inválido");
  validaSenha(senha);

  // Fora de produção, o primeiro cadastro de um banco vazio vira admin (facilita o desenvolvimento).
  // Em produção o admin vem de ADMIN_EMAIL/ADMIN_PASSWORD (garantirAdmin).
  const primeiro = !isProd && (await prisma.usuario.count()) === 0;
  if (!primeiro && !(await lerConfig()).cadastroAberto) {
    return res.status(403).json({ error: "O cadastro público está desativado. Peça um convite ao administrador." });
  }
  const usuario = await prisma.usuario.create({
    data: { nome, email, senhaHash: await hashSenha(senha), papel: primeiro ? "admin" : "usuario", status: primeiro ? "ativo" : "pendente" },
  }).catch((err) => {
    if (err.code === "P2002") throw new ValidationError("Já existe uma conta com esse e-mail");
    throw err;
  });

  req.user = usuario;
  registrar(req, "admin", null, primeiro ? "Primeiro acesso: conta de administrador criada" : "Pediu acesso pelo cadastro público");
  if (primeiro) {
    await iniciarSessao(res, usuario.id);
    return res.status(201).json({ pendente: false, user: usuarioPublico(usuario) });
  }
  res.status(201).json({ pendente: true });
});

/* convite ou redefinição de senha por link */
authApi.get("/convite/:token", limiteTentativas(30, 15), async (req, res) => {
  const u = await usuarioDoLink(req.params.token);
  if (!u) return res.status(404).json({ error: "Link inválido ou expirado. Peça um novo ao administrador." });
  res.json({ nome: u.nome, email: u.email, tipo: u.status === "convidado" ? "convite" : "redefinicao", ...(await configPublica()) });
});

authApi.post("/convite", limiteTentativas(10, 15), async (req, res) => {
  const u = await usuarioDoLink(req.body?.token);
  if (!u) return res.status(404).json({ error: "Link inválido ou expirado. Peça um novo ao administrador." });
  validaSenha(req.body?.senha);
  const usuario = await prisma.usuario.update({
    where: { id: u.id },
    data: { senhaHash: await hashSenha(req.body.senha), status: "ativo", conviteHash: null, conviteExpira: null },
  });
  await prisma.sessao.deleteMany({ where: { usuarioId: u.id } });
  await iniciarSessao(res, u.id);
  req.user = usuario;
  registrar(req, "admin", null, u.status === "convidado" ? "Aceitou o convite e ativou a conta" : "Redefiniu a senha pelo link");
  res.json({ user: usuarioPublico(usuario) });
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
  // desconecta os outros dispositivos; a sessão atual continua
  const atual = sha256(lerCookie(req, COOKIE) ?? "");
  await prisma.sessao.deleteMany({ where: { usuarioId: req.user.id, id: { not: atual } } });
  res.json({ ok: true });
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

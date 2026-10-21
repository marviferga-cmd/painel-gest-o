/* =========================================================
   CONFIGURAÇÕES GERAIS E HISTÓRICO DE ATIVIDADES
   - Configurações ficam na tabela `configuracoes` (chave → JSON).
     O que não estiver gravado usa o valor de PADRAO.
   - registrar() grava quem fez o quê; nunca derruba a requisição.
   ========================================================= */
import { prisma } from "./db.js";
import { ValidationError } from "./lib/format.js";

export const CORES = ["indigo", "azul", "verde", "violeta", "laranja", "rosa"];

const PADRAO = {
  nomePainel: "Painel de Gestão",
  subtitulo: "operação & serviços",
  corDestaque: "indigo",
  cadastroAberto: true,   // tela de login mostra "Criar conta" (com aprovação do admin)
  perfilPadraoId: null,   // perfil aplicado ao aprovar um cadastro
  diasConvite: 7,         // validade dos links de convite / redefinição de senha
};

/* cache curto: a configuração é lida em quase toda requisição de meta/login */
let cache = null;
let cacheAt = 0;

export async function lerConfig() {
  if (cache && Date.now() - cacheAt < 30e3) return cache;
  const rows = await prisma.configuracao.findMany();
  cache = { ...PADRAO, ...Object.fromEntries(rows.filter((r) => r.chave in PADRAO).map((r) => [r.chave, r.valor])) };
  cacheAt = Date.now();
  return cache;
}

/* Versão segura para a tela de login (sem autenticação). */
export async function configPublica() {
  const c = await lerConfig();
  return { nomePainel: c.nomePainel, subtitulo: c.subtitulo, corDestaque: c.corDestaque, cadastroAberto: c.cadastroAberto };
}

const texto = (v, label, max) => {
  const s = String(v ?? "").trim();
  if (!s) throw new ValidationError(`${label} é obrigatório`);
  if (s.length > max) throw new ValidationError(`${label}: máximo de ${max} caracteres`);
  return s;
};

export async function salvarConfig(body) {
  const novo = {};
  if (body.nomePainel !== undefined) novo.nomePainel = texto(body.nomePainel, "Nome do painel", 40);
  if (body.subtitulo !== undefined) novo.subtitulo = String(body.subtitulo ?? "").trim().slice(0, 60);
  if (body.corDestaque !== undefined) {
    if (!CORES.includes(body.corDestaque)) throw new ValidationError("Cor inválida");
    novo.corDestaque = body.corDestaque;
  }
  if (body.cadastroAberto !== undefined) novo.cadastroAberto = body.cadastroAberto === true;
  if (body.perfilPadraoId !== undefined) {
    const id = body.perfilPadraoId === null || body.perfilPadraoId === "" ? null : Number(body.perfilPadraoId);
    if (id !== null && !(await prisma.perfil.findUnique({ where: { id } }))) throw new ValidationError("Perfil padrão inválido");
    novo.perfilPadraoId = id;
  }
  if (body.diasConvite !== undefined) {
    const n = Number(body.diasConvite);
    if (!Number.isInteger(n) || n < 1 || n > 30) throw new ValidationError("Validade do convite: entre 1 e 30 dias");
    novo.diasConvite = n;
  }
  await prisma.$transaction(Object.entries(novo).map(([chave, valor]) =>
    prisma.configuracao.upsert({ where: { chave }, create: { chave, valor }, update: { valor } })));
  cache = null;
  return lerConfig();
}

/* ---------------- histórico ---------------- */
export function registrar(req, acao, tela, descricao) {
  prisma.atividade.create({
    data: { usuarioId: req.user?.id ?? null, acao, tela: tela ?? null, descricao: String(descricao).slice(0, 300) },
  }).catch((err) => console.error("Falha ao registrar atividade:", err.message));
}

/* mantém só o último ano de histórico */
export async function limparHistorico() {
  await prisma.atividade.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 365 * 86400e3) } } });
}

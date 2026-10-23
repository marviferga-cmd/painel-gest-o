/* =========================================================
   IMPORTAÇÃO DE COLABORADORES (CSV)
   Uso:
     node --env-file-if-exists=.env prisma/importar-colaboradores.js equipe.csv [--dominio stf.jus.br] [--simular]

   - CSV salvo pelo Excel ("CSV UTF-8"), separado por ; ou ,
   - Cabeçalhos reconhecidos (sem diferenciar acento/maiúscula):
       Nome / Nome completo, Matrícula, Login, E-mail, Setor / Lotação, Função,
       Ramal, Celular / Tel. Celular, Nascimento / Dt. Nascimento, Formação / Curso,
       Home Office, Situação da vaga
   - Quem já existe (mesma matrícula, login ou e-mail) é ATUALIZADO; os demais são criados.
   - --dominio monta o e-mail como login@dominio quando a coluna de e-mail vier vazia.
   - --simular mostra o que seria feito sem gravar nada.
   ========================================================= */
import fs from "node:fs";

const CAMPOS = {
  nome: ["nome", "nome completo", "colaborador"],
  matricula: ["matricula"],
  login: ["login", "usuario de rede"],
  email: ["email", "e-mail"],
  setor: ["setor", "lotacao"],
  funcao: ["funcao"],
  ramal: ["ramal"],
  celular: ["celular", "tel. celular", "telefone", "tel celular"],
  nascimento: ["nascimento", "dt. nascimento", "data de nascimento", "dt nascimento"],
  formacao: ["formacao", "curso"],
  homeOffice: ["home office", "homeoffice"],
  situacaoVaga: ["situacao da vaga", "situacao vaga"],
};

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/* CSV com aspas, separador ; ou , (detectado pela 1ª linha) */
function lerCSV(texto) {
  texto = texto.replace(/^﻿/, "");
  const sep = (texto.split(/\r?\n/)[0].match(/;/g) || []).length >= (texto.split(/\r?\n/)[0].match(/,/g) || []).length ? ";" : ",";
  const linhas = [];
  let linha = [], campo = "", aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = "";
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.some((v) => v.trim()));
}

function data(v) {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return null;
}

const vazio = (v) => (v === "" || v === "-" ? null : v);

export function converter(linhas, { dominio } = {}) {
  const [cab, ...dados] = linhas;
  const indice = {};
  cab.forEach((h, i) => {
    const n = norm(h);
    for (const [campo, nomes] of Object.entries(CAMPOS)) if (nomes.includes(n) && !(campo in indice)) indice[campo] = i;
  });
  if (!("nome" in indice)) throw new Error(`Coluna de nome não encontrada. Cabeçalhos lidos: ${cab.join(" | ")}`);

  return dados.map((l) => {
    const get = (campo) => (campo in indice ? vazio(String(l[indice[campo]] ?? "").replace(/\s+/g, " ").trim()) : null);
    const c = {
      nome: get("nome"),
      matricula: get("matricula"),
      login: get("login")?.toLowerCase() ?? null,
      email: get("email")?.toLowerCase() ?? null,
      setor: get("setor"),
      funcao: get("funcao"),
      ramal: get("ramal"),
      celular: get("celular"),
      nascimento: data(get("nascimento")),
      formacao: get("formacao"),
      homeOffice: get("homeOffice"),
      situacaoVaga: get("situacaoVaga"),
    };
    if (c.homeOffice) c.homeOffice = /^s/i.test(c.homeOffice) ? "Sim" : /^n/i.test(c.homeOffice) ? "Não" : null;
    if (!c.email && c.login && dominio) c.email = `${c.login}@${dominio}`;
    // só envia ao banco o que veio preenchido (não apaga dados já cadastrados)
    return Object.fromEntries(Object.entries(c).filter(([, v]) => v !== null && v !== undefined));
  }).filter((c) => c.nome);
}

export async function importar(prisma, colaboradores, { simular = false } = {}) {
  const res = { criados: 0, atualizados: 0 };
  for (const c of colaboradores) {
    const ou = ["matricula", "login", "email"].filter((k) => c[k]).map((k) => ({ [k]: c[k] }));
    const existente = ou.length ? await prisma.colaborador.findFirst({ where: { OR: ou } }) : null;
    if (existente) {
      res.atualizados++;
      if (!simular) await prisma.colaborador.update({ where: { id: existente.id }, data: c });
    } else {
      res.criados++;
      if (!simular) await prisma.colaborador.create({ data: c });
    }
  }
  return res;
}

/* Execução direta */
const args = process.argv.slice(2);
const arquivo = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--dominio");
if (arquivo) {
  const dominio = args.includes("--dominio") ? args[args.indexOf("--dominio") + 1] : null;
  const simular = args.includes("--simular");
  const colaboradores = converter(lerCSV(fs.readFileSync(arquivo, "utf8")), { dominio });
  const { prisma } = await import("../src/db.js");
  try {
    const r = await importar(prisma, colaboradores, { simular });
    console.log(`${simular ? "[simulação] " : ""}${colaboradores.length} linha(s): ${r.criados} criado(s), ${r.atualizados} atualizado(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

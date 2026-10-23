/* Teste de fumaça contra um servidor rodando (de preferência com o seed aplicado).
   Exercita login, permissões, todas as telas, CRUD + histórico, Kanban e sessões.

   Uso: BASE_URL=http://localhost:3000 ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/smoke.js */
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const EMAIL = process.env.ADMIN_EMAIL;
const SENHA = process.env.ADMIN_PASSWORD;
assert.ok(EMAIL && SENHA, "Defina ADMIN_EMAIL e ADMIN_PASSWORD");

/* Cada cliente guarda o próprio cookie de sessão (simula um navegador). */
function cliente() {
  let cookie = "";
  async function call(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      redirect: "manual",
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    let data = null;
    try { data = JSON.parse(await res.text()); } catch { /* sem JSON */ }
    return { status: res.status, data };
  }
  async function expect(status, method, path, body) {
    const r = await call(method, path, body);
    assert.ok([].concat(status).includes(r.status), `${method} ${path}: esperado ${status}, veio ${r.status} ${JSON.stringify(r.data)}`);
    console.log(`✓ ${method} ${path} → ${r.status}`);
    return r.data;
  }
  return { call, expect };
}

const a = cliente();

await a.expect(200, "GET", "/healthz");
await a.expect(401, "GET", "/api/meta");
await a.expect(401, "POST", "/api/auth/login", { email: EMAIL, senha: "senha-errada" });
await a.expect(200, "POST", "/api/auth/login", { email: EMAIL, senha: SENHA });

/* ---------- todas as telas ---------- */
const meta = await a.expect(200, "GET", "/api/meta");
assert.ok(meta.maxRows > 0, "meta.maxRows ausente");
const itens = meta.groups.flatMap((g) => g.items);
for (const i of itens.filter((i) => i.type === "table")) await a.expect(200, "GET", `/api/modules/${i.key}`);
for (const r of ["os", "clientes", "sla", "alertas"]) await a.expect(200, "GET", `/api/resumo/${r}`);
for (const l of ["colaboradores", "clientes", "servicos", "cargos", "ordens", "faturas"]) await a.expect(200, "GET", `/api/lookups/${l}`);
const de = new Date(Date.now() - 30 * 86400e3).toISOString();
const ate = new Date(Date.now() + 30 * 86400e3).toISOString();
await a.expect(200, "GET", `/api/eventos?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`);
await a.expect(200, "GET", "/api/usuarios");

/* ---------- CRUD + histórico ---------- */
const nome = `Cliente smoke ${Date.now()}`;
const criado = await a.expect(201, "POST", "/api/modules/clientes", { nome, documento: "", contato: "" });
await a.expect(200, "PUT", `/api/modules/clientes/${criado.id}`, { nome, documento: "00.000.000/0001-00", contato: "" });
await a.expect(204, "DELETE", `/api/modules/clientes/${criado.id}`);
const hist = await a.expect(200, "GET", "/api/auditoria?modulo=clientes&limite=10");
const doRegistro = hist.filter((h) => h.registroId === criado.id).map((h) => h.acao);
assert.deepEqual(doRegistro, ["excluiu", "alterou", "criou"], "histórico do cliente incompleto");
const alterou = hist.find((h) => h.registroId === criado.id && h.acao === "alterou");
assert.equal(alterou.antes.documento, null);
assert.equal(alterou.depois.documento, "00.000.000/0001-00");

/* ---------- OS concluída mantém a data de conclusão ao reeditar ---------- */
const os = await a.expect(200, "GET", "/api/modules/controle-os");
const clientes = await a.expect(200, "GET", "/api/lookups/clientes");
if (clientes.length) {
  const nova = await a.expect(201, "POST", "/api/modules/controle-os", {
    numero: `SMOKE-${Date.now()}`, clienteId: clientes[0].value, prazo: "2030-01-01", status: "Concluída",
  });
  await a.expect(200, "PUT", `/api/modules/controle-os/${nova.id}`, { status: "Concluída", prazo: "2030-02-01" });
  await a.expect(204, "DELETE", `/api/modules/controle-os/${nova.id}`);
}
assert.ok(Array.isArray(os));

/* ---------- Kanban: mover para o topo de outra coluna ---------- */
const kb = await a.expect(200, "GET", "/api/kanban/pessoas");
if (kb.cards.length && kb.columns.length > 1) {
  const card = kb.cards[0];
  const destino = kb.columns.find((c) => c.id !== card.colunaId);
  await a.expect(200, "PATCH", `/api/kanban/cards/${card.id}`, { colunaId: destino.id, posicao: 0 });
  const depois = await a.expect(200, "GET", "/api/kanban/pessoas");
  const naColuna = depois.cards.filter((c) => c.colunaId === destino.id);
  assert.equal(naColuna[0].id, card.id, "card não ficou no topo da coluna");
  assert.deepEqual(naColuna.map((c) => c.ordem), naColuna.map((_, i) => i), "ordem não foi renumerada");
  await a.expect(400, "PATCH", `/api/kanban/cards/${card.id}`, { colunaId: "abc" });
  await a.expect(200, "PATCH", `/api/kanban/cards/${card.id}`, { colunaId: card.colunaId });
}

/* ---------- trocar a senha derruba as outras sessões ---------- */
const b = cliente();
await b.expect(200, "POST", "/api/auth/login", { email: EMAIL, senha: SENHA });
await b.expect(200, "GET", "/api/meta");
const nova = `${SENHA}-smoke`;
await a.expect(200, "POST", "/api/auth/senha", { atual: SENHA, nova });
await a.expect(200, "GET", "/api/meta");
await b.expect(401, "GET", "/api/meta");
await a.expect(200, "POST", "/api/auth/senha", { atual: nova, nova: SENHA });

await a.expect(204, "POST", "/api/auth/logout");
await a.expect(401, "GET", "/api/meta");
console.log("\nSmoke test OK");

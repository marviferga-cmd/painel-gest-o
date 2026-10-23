import { test } from "node:test";
import assert from "node:assert/strict";
import { findModule } from "../src/modules.js";
import { fromInput } from "../src/crud.js";

const os = findModule("controle-os");
const fatura = findModule("faturamento");

test("OS: concluir grava a data de conclusão", () => {
  const d = { status: "Concluída" };
  os.beforeSave(d, null, null);
  assert.ok(d.concluidaEm instanceof Date);
});

test("OS: reeditar uma OS concluída mantém a data original", () => {
  const original = new Date("2026-01-15T10:00:00Z");
  const d = { status: "Concluída", clienteId: 2 };
  os.beforeSave(d, null, { status: "Concluída", concluidaEm: original });
  assert.equal(d.concluidaEm, original);
});

test("OS: reabrir limpa a data de conclusão", () => {
  const d = { status: "Em execução" };
  os.beforeSave(d, null, { status: "Concluída", concluidaEm: new Date() });
  assert.equal(d.concluidaEm, null);
});

test("Fatura: reeditar uma fatura paga mantém a data de pagamento", () => {
  const original = new Date("2026-02-01T00:00:00Z");
  const d = { status: "Pago", valor: "100.00" };
  fatura.beforeSave(d, null, { status: "Pago", pagoEm: original });
  assert.equal(d.pagoEm, original);
});

test("Fatura: marcar como paga grava a data e cancelar limpa", () => {
  const pago = { status: "Pago" };
  fatura.beforeSave(pago, null, { status: "Em aberto", pagoEm: null });
  assert.ok(pago.pagoEm instanceof Date);

  const cancelado = { status: "Cancelado" };
  fatura.beforeSave(cancelado, null, { status: "Pago", pagoEm: new Date() });
  assert.equal(cancelado.pagoEm, null);
});

test("fromInput: status fora da lista é recusado", () => {
  assert.throws(() => fromInput(os, { numero: "1", clienteId: 1, prazo: "2026-01-01", status: "Qualquer" }), /não permitido/);
});

test("fromInput: obrigatório ausente é recusado só na criação", () => {
  assert.throws(() => fromInput(os, { clienteId: 1, prazo: "2026-01-01" }), /obrigatório/);
  assert.deepEqual(fromInput(os, { status: "Aberta" }, { partial: true }), { status: "Aberta" });
});

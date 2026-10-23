import { test } from "node:test";
import assert from "node:assert/strict";
import {
  daysBetween, formatHours, parseDate, parseHours, parseMoney, parseMonth,
  slaStatus, tempoRestante, ValidationError,
} from "../src/lib/format.js";

test("parseHours aceita os formatos do formulário", () => {
  assert.equal(parseHours("+3h20", "x"), 200);
  assert.equal(parseHours("-1h30", "x"), -90);
  assert.equal(parseHours("2h", "x"), 120);
  assert.equal(parseHours("1:45", "x"), 105);
  assert.equal(parseHours("45min", "x"), 45);
  assert.equal(parseHours("90", "x"), 90);
  assert.equal(parseHours("", "x"), 0);
  assert.throws(() => parseHours("1h75", "x"), ValidationError);
  assert.throws(() => parseHours("abc", "x"), ValidationError);
});

test("formatHours volta ao formato que parseHours entende", () => {
  for (const min of [0, 45, -90, 200, -5]) assert.equal(parseHours(formatHours(min), "x"), min);
  assert.equal(formatHours(0), "+0h00");
});

test("parseMoney entende formato BR e numérico", () => {
  assert.equal(parseMoney("R$ 4.200,50", "x"), "4200.50");
  assert.equal(parseMoney("1234.5", "x"), "1234.50");
  assert.equal(parseMoney(10, "x"), "10.00");
  assert.equal(parseMoney("", "x"), null);
  assert.throws(() => parseMoney("-1", "x"), ValidationError);
});

test("parseDate e parseMonth gravam em UTC 00:00", () => {
  assert.equal(parseDate("2026-08-18", "x").toISOString(), "2026-08-18T00:00:00.000Z");
  assert.equal(parseMonth("2026-08", "x").toISOString(), "2026-08-01T00:00:00.000Z");
  assert.throws(() => parseDate("18/08/2026", "x"), ValidationError);
});

test("daysBetween conta os dois extremos", () => {
  assert.equal(daysBetween(new Date("2026-01-01"), new Date("2026-01-10")), 10);
  assert.equal(daysBetween(new Date("2026-01-01"), new Date("2026-01-01")), 1);
  assert.equal(daysBetween(null, new Date()), null);
});

test("slaStatus classifica pelo tempo até o prazo", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const em = (h) => new Date(now.getTime() + h * 3600e3);
  assert.equal(slaStatus({ prazoEm: em(-1) }, now), "Atrasado");
  assert.equal(slaStatus({ prazoEm: em(2) }, now), "Crítico");
  assert.equal(slaStatus({ prazoEm: em(10) }, now), "Atenção");
  assert.equal(slaStatus({ prazoEm: em(48) }, now), "No prazo");
  assert.equal(slaStatus({ prazoEm: em(1), concluidoEm: em(0) }, now), "Concluído no prazo");
  assert.equal(slaStatus({ prazoEm: em(-2), concluidoEm: em(0) }, now), "Concluído com atraso");
});

test("tempoRestante descreve o prazo", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  assert.equal(tempoRestante({ prazoEm: new Date("2026-10-23T14:05:00Z") }, now), "2h 05min");
  assert.equal(tempoRestante({ prazoEm: new Date("2026-10-25T15:00:00Z") }, now), "2d 3h");
  assert.equal(tempoRestante({ prazoEm: new Date("2026-10-23T11:30:00Z") }, now), "Vencido há 30min");
  assert.equal(tempoRestante({ prazoEm: now, concluidoEm: now }, now), "Encerrado");
});

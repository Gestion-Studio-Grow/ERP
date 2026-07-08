// Tests de la contabilidad PURA del dead-letter del cron de recordatorios (sin DB).
// Blinda: un fallo no reduce los enviados y no se pierde. Patrón node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeReminderRun, type ReminderOutcome } from "./reminder-batch";

test("todos OK → sent = due, sin fallos", () => {
  const outcomes: ReminderOutcome[] = [
    { ok: true, appointmentId: "a1" },
    { ok: true, appointmentId: "a2" },
  ];
  const s = summarizeReminderRun(10, outcomes);
  assert.deepEqual(s, { checked: 10, due: 2, sent: 2, failed: 0, failures: [] });
});

test("un fallo NO aborta el lote: los demás cuentan como enviados y el fallo se surfacea", () => {
  const outcomes: ReminderOutcome[] = [
    { ok: true, appointmentId: "a1" },
    { ok: false, appointmentId: "a2", tenantId: "t1", error: "SMTP timeout" },
    { ok: true, appointmentId: "a3" },
  ];
  const s = summarizeReminderRun(20, outcomes);
  assert.equal(s.sent, 2);
  assert.equal(s.failed, 1);
  assert.equal(s.due, 3);
  assert.deepEqual(s.failures, [
    { ok: false, appointmentId: "a2", tenantId: "t1", error: "SMTP timeout" },
  ]);
});

test("lote vacío → todo en cero", () => {
  assert.deepEqual(summarizeReminderRun(0, []), {
    checked: 0,
    due: 0,
    sent: 0,
    failed: 0,
    failures: [],
  });
});

test("ningún fallo se pierde: failed + sent = due", () => {
  const outcomes: ReminderOutcome[] = [
    { ok: false, appointmentId: "a1", tenantId: "t1", error: "e1" },
    { ok: false, appointmentId: "a2", tenantId: "t2", error: "e2" },
    { ok: true, appointmentId: "a3" },
  ];
  const s = summarizeReminderRun(3, outcomes);
  assert.equal(s.sent + s.failed, s.due);
});

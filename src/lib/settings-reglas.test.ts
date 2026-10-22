/**
 * Reglas del mostrador en «Mi negocio» (reingeniería CH, Tanda 3 · M2) — la parte PURA de
 * src/lib/settings.ts: cómo se resuelve la fila (o su ausencia) y qué acepta la carga de la dueña.
 * La lectura/escritura contra Postgres, con y sin la migración, está en
 * src/lib/turnos/ch-t3-migraciones-postgres.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { REGLAS_POR_DEFECTO, resolverReglas, validarReglas } from "./settings";

test("CH-053 · sin la migración: el placeholder D2/D5 (24 h, se retiene, tope $0) y `activas: false`", () => {
  assert.deepEqual(resolverReglas(null, false), { ...REGLAS_POR_DEFECTO, activas: false });
  assert.deepEqual(REGLAS_POR_DEFECTO, {
    aliasSenia: null,
    cbuSenia: null,
    cancelacionHoras: 24,
    seniaCancelaTarde: "retener",
    seniaNoVino: "retener",
    topeBajaSaldoRecepcion: 0,
  });
});

test("con la migración y la fila cargada: se leen tal cual (Decimal → número)", () => {
  const r = resolverReglas(
    {
      aliasSenia: " ch.estetica.mp ",
      cbuSenia: "0000003100 012345678901",
      cancelacionHoras: 12,
      seniaCancelaTarde: "a-favor",
      seniaNoVino: "devolver",
      topeBajaSaldoRecepcion: { toString: () => "2500.50" },
    },
    true,
  );
  assert.deepEqual(r, {
    aliasSenia: "ch.estetica.mp",
    cbuSenia: "0000003100012345678901",
    cancelacionHoras: 12,
    seniaCancelaTarde: "a-favor",
    seniaNoVino: "devolver",
    topeBajaSaldoRecepcion: 2500.5,
    activas: true,
  });
});

test("lo que no se entiende cae al placeholder, nunca a algo más permisivo", () => {
  const r = resolverReglas(
    {
      aliasSenia: "   ",
      cbuSenia: null,
      cancelacionHoras: null,
      seniaCancelaTarde: "regalar",
      seniaNoVino: null,
      topeBajaSaldoRecepcion: "no-es-plata",
    },
    true,
  );
  assert.equal(r.aliasSenia, null);
  assert.equal(r.cancelacionHoras, 24);
  assert.equal(r.seniaCancelaTarde, "retener");
  assert.equal(r.seniaNoVino, "retener");
  assert.equal(r.topeBajaSaldoRecepcion, 0); // ilegible = $0: sólo la dueña da de baja
  assert.equal(resolverReglas({ ...base(), cancelacionHoras: -3 }, true).cancelacionHoras, 24);
  assert.equal(resolverReglas({ ...base(), cancelacionHoras: 1000 }, true).cancelacionHoras, 24);
  assert.equal(resolverReglas({ ...base(), topeBajaSaldoRecepcion: -500 }, true).topeBajaSaldoRecepcion, 0);
  assert.equal(resolverReglas({ ...base(), cancelacionHoras: 0 }, true).cancelacionHoras, 0); // «sin aviso mínimo» es válido
});

function base() {
  return { aliasSenia: null, cbuSenia: null, cancelacionHoras: 24, seniaCancelaTarde: "retener", seniaNoVino: "retener", topeBajaSaldoRecepcion: 0 };
}

test("validarReglas: acepta lo que carga la dueña y lo normaliza", () => {
  const v = validarReglas({
    aliasSenia: " ch.estetica.mp ",
    cbuSenia: "0000003100 012345678901",
    cancelacionHoras: 24,
    seniaCancelaTarde: "retener",
    seniaNoVino: "a-favor",
    topeBajaSaldoRecepcion: 1000.004,
  });
  assert.equal(v.ok, true);
  assert.ok(v.ok);
  assert.equal(v.reglas.aliasSenia, "ch.estetica.mp");
  assert.equal(v.reglas.cbuSenia, "0000003100012345678901");
  assert.equal(v.reglas.topeBajaSaldoRecepcion, 1000);
  assert.equal(v.reglas.seniaNoVino, "a-favor");
});

test("validarReglas: rechaza con un mensaje que dice qué corregir", () => {
  const ok = { cancelacionHoras: 24, seniaCancelaTarde: "retener", seniaNoVino: "retener", topeBajaSaldoRecepcion: 0 };
  const err = (o: Partial<Parameters<typeof validarReglas>[0]>) => {
    const v = validarReglas({ ...ok, ...o });
    return v.ok ? null : v.error;
  };
  assert.match(err({ aliasSenia: "ab" })!, /alias/);
  assert.match(err({ cbuSenia: "123" })!, /22 números/);
  assert.match(err({ cancelacionHoras: 2.5 })!, /horas/);
  assert.match(err({ cancelacionHoras: 500 })!, /0 a 168/);
  assert.match(err({ seniaNoVino: "regalar" })!, /seña/);
  assert.match(err({ topeBajaSaldoRecepcion: -1 })!, /desde \$0/);
  assert.match(err({ topeBajaSaldoRecepcion: Number.NaN })!, /pesos/);
  assert.equal(err({}), null); // sin alias ni CBU es válido (la seña se pide sin alias)
});

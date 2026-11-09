// fechaOrigen (T0): la partida no monetaria guarda su fecha de origen para el ajuste por inflación.

import { test } from "node:test";
import assert from "node:assert/strict";
import { contraAsiento, validarAsiento, type CuentaParaValidar, type LineaAsiento } from "./asiento";

const cuentas: CuentaParaValidar[] = [
  { id: "caja", tenantId: "t", codigo: "1.1.1.01", nombre: "Caja", imputable: true, activa: true },
  { id: "bdu", tenantId: "t", codigo: "1.2.1.06", nombre: "Aparatología", imputable: true, activa: true },
];
const dia = (s: string) => new Date(`${s}T00:00:00Z`);
const ejercicio = { fechaInicio: dia("2026-01-01"), fechaCierre: dia("2026-12-31"), estado: "ABIERTO" as const };
const lineas = (fechaOrigen?: Date | null): LineaAsiento[] => [
  { cuentaId: "bdu", debe: BigInt(150000), haber: BigInt(0), fechaOrigen },
  { cuentaId: "caja", debe: BigInt(0), haber: BigInt(150000) },
];

test("fechaOrigen: anterior o igual a la del asiento es válida; ausente también", () => {
  for (const f of [undefined, null, dia("2025-07-01"), dia("2026-03-10")]) {
    assert.equal(validarAsiento(lineas(f), cuentas, { tenantId: "t", fecha: dia("2026-03-10"), ejercicio }).ok, true, String(f));
  }
});

test("fechaOrigen: posterior al asiento o inválida → FECHA_ORIGEN_INVALIDA en esa línea", () => {
  for (const f of [dia("2026-03-11"), new Date("no")]) {
    const r = validarAsiento(lineas(f), cuentas, { tenantId: "t", fecha: dia("2026-03-10"), ejercicio });
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.errores.some((e) => e.codigo === "FECHA_ORIGEN_INVALIDA" && e.linea === 0));
  }
});

test("contra-asiento: conserva la fecha de origen de cada partida", () => {
  const ca = contraAsiento({ fecha: dia("2026-03-10"), descripcion: "Compra", lineas: lineas(dia("2026-02-01")) });
  assert.equal(ca.lineas[0].fechaOrigen?.toISOString(), dia("2026-02-01").toISOString());
  assert.equal(ca.lineas[0].haber, BigInt(150000));
  assert.equal("fechaOrigen" in ca.lineas[1], false, "la monetaria sigue sin fecha de origen");
});

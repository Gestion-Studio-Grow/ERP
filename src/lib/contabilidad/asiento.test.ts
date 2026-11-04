import { test } from "node:test";
import assert from "node:assert/strict";
import { contraAsiento, formatearCentavos, naturalezaPorTipo, validarAsiento, type CuentaParaValidar, type LineaAsiento } from "./asiento";

const c = (id: string, extra: Partial<CuentaParaValidar> = {}): CuentaParaValidar => ({
  id,
  tenantId: "A",
  codigo: id,
  nombre: `Cuenta ${id}`,
  imputable: true,
  activa: true,
  ...extra,
});
const CUENTAS = [c("caja"), c("ventas"), c("iva"), c("activo", { imputable: false }), c("vieja", { activa: false }), c("deB", { tenantId: "B" })];
const L = (cuentaId: string, debe: number, haber: number): LineaAsiento => ({ cuentaId, debe: BigInt(debe), haber: BigInt(haber) });
const codigos = (r: ReturnType<typeof validarAsiento>) => (r.ok ? [] : r.errores.map((e) => e.codigo));

test("un asiento que cuadra pasa y devuelve los totales en centavos", () => {
  const r = validarAsiento([L("caja", 121000, 0), L("ventas", 0, 100000), L("iva", 0, 21000)], CUENTAS, { tenantId: "A" });
  assert.deepEqual(r, { ok: true, totalDebe: BigInt(121000), totalHaber: BigInt(121000) });
});

test("descuadrado: lo dice con los dos totales en pesos", () => {
  const r = validarAsiento([L("caja", 100000, 0), L("ventas", 0, 99999)], CUENTAS);
  assert.deepEqual(codigos(r), ["DESCUADRADO"]);
  assert.match(!r.ok ? r.errores[0].mensaje : "", /\$ 1\.000,00.*\$ 999,99.*\$ 0,01/);
});

test("menos de dos líneas", () => {
  assert.deepEqual(codigos(validarAsiento([L("caja", 100, 0)], CUENTAS)), ["POCAS_LINEAS"]);
  assert.deepEqual(codigos(validarAsiento([], CUENTAS)), ["POCAS_LINEAS"]);
});

test("cada línea sólo debe o sólo haber, mayor que cero y no negativa", () => {
  assert.deepEqual(codigos(validarAsiento([L("caja", 100, 100), L("ventas", 0, 0)], CUENTAS)), ["LINEA_DEBE_Y_HABER", "LINEA_EN_CERO"]);
  assert.deepEqual(codigos(validarAsiento([L("caja", -100, 0), L("ventas", 0, -100)], CUENTAS)).slice(0, 2), ["MONTO_NEGATIVO", "MONTO_NEGATIVO"]);
});

test("total en cero", () => {
  assert.ok(codigos(validarAsiento([L("caja", 0, 0), L("ventas", 0, 0)], CUENTAS)).includes("TOTAL_EN_CERO"));
});

test("cuenta inexistente, agrupadora, inactiva o de otro negocio", () => {
  const r = validarAsiento([L("nada", 100, 0), L("activo", 100, 0), L("vieja", 0, 100), L("deB", 0, 100)], CUENTAS, { tenantId: "A" });
  assert.deepEqual(codigos(r), ["CUENTA_INEXISTENTE", "CUENTA_NO_IMPUTABLE", "CUENTA_INACTIVA", "CUENTA_DE_OTRO_NEGOCIO"]);
  assert.equal(!r.ok && r.errores[1].linea, 1);
});

test("sin tenantId explícito, todas las cuentas tienen que ser del mismo negocio", () => {
  assert.deepEqual(codigos(validarAsiento([L("caja", 100, 0), L("deB", 0, 100)], CUENTAS)), ["CUENTA_DE_OTRO_NEGOCIO"]);
});

test("fecha: válida y dentro de un ejercicio ABIERTO", () => {
  const lineas = [L("caja", 100, 0), L("ventas", 0, 100)];
  const ej = { fechaInicio: new Date("2026-01-01T00:00:00Z"), fechaCierre: new Date("2026-12-31T00:00:00Z"), estado: "ABIERTO" as const };
  assert.equal(validarAsiento(lineas, CUENTAS, { fecha: new Date("2026-12-31T00:00:00Z"), ejercicio: ej }).ok, true);
  assert.deepEqual(codigos(validarAsiento(lineas, CUENTAS, { fecha: new Date("nada") })), ["FECHA_INVALIDA"]);
  assert.deepEqual(codigos(validarAsiento(lineas, CUENTAS, { fecha: new Date("2027-01-01T00:00:00Z"), ejercicio: ej })), ["FECHA_FUERA_DEL_EJERCICIO"]);
  assert.deepEqual(codigos(validarAsiento(lineas, CUENTAS, { fecha: new Date("2026-05-01T00:00:00Z"), ejercicio: { ...ej, estado: "CERRADO" } })), ["EJERCICIO_CERRADO"]);
  assert.deepEqual(codigos(validarAsiento(lineas, CUENTAS, { fecha: new Date("2026-05-01T00:00:00Z"), ejercicio: null })), ["SIN_EJERCICIO"]);
});

test("contraAsiento invierte debe y haber y sigue cuadrando", () => {
  const original = { numero: 7, fecha: new Date("2026-03-01T00:00:00Z"), descripcion: "Venta", lineas: [L("caja", 121000, 0), L("ventas", 0, 100000), L("iva", 0, 21000)] };
  const contra = contraAsiento(original);
  assert.deepEqual(contra.lineas, [L("caja", 0, 121000), L("ventas", 100000, 0), L("iva", 21000, 0)]);
  assert.match(contra.descripcion, /N° 7/);
  assert.equal(validarAsiento(contra.lineas, CUENTAS).ok, true);
});

test("montos enormes no pierden precisión (bigint)", () => {
  const grande = BigInt("90071992547409930"); // > Number.MAX_SAFE_INTEGER
  const r = validarAsiento([{ cuentaId: "caja", debe: grande, haber: BigInt(0) }, { cuentaId: "ventas", debe: BigInt(0), haber: grande }], CUENTAS);
  assert.equal(r.ok, true);
  assert.equal(formatearCentavos(BigInt(123456)), "$ 1.234,56");
});

test("naturaleza habitual por tipo", () => {
  assert.equal(naturalezaPorTipo("ACTIVO"), "DEUDORA");
  assert.equal(naturalezaPorTipo("RESULTADO_NEGATIVO"), "DEUDORA");
  assert.equal(naturalezaPorTipo("PASIVO"), "ACREEDORA");
  assert.equal(naturalezaPorTipo("PATRIMONIO_NETO"), "ACREEDORA");
});

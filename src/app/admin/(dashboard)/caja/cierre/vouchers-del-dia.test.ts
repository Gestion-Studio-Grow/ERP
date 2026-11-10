// QA vouchers (FALLA 1): el cierre del día del diseño nuevo no mostraba «A cobrar a la
// administración (vouchers)». Suma al total del día y NUNCA a una columna que se cuenta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ETIQUETA_VOUCHERS_A_COBRAR, renglonDeVouchers } from "./vouchers-del-dia";

const porColumna = {
  EFECTIVO: { ingresos: 10000.1, expected: 15000 },
  MP: { ingresos: 5000.2, expected: 5000.2 },
  TRANSFERENCIA: { ingresos: 0, expected: 0 },
  TARJETA: { ingresos: 0, expected: 0 },
};

test("con vouchers: el renglón suma al total del día, al centavo, y no toca el efectivo", () => {
  const antes = structuredClone(porColumna);
  const r = renglonDeVouchers(porColumna, ["EFECTIVO", "MP", "TRANSFERENCIA"], {
    cantidad: 2,
    monto: 28000,
    anulados: { cantidad: 1, monto: 14000 },
  })!;
  assert.equal(r.etiqueta, "A cobrar a la administración (vouchers)");
  assert.equal(r.entroPorCaja, 15000.3);
  assert.equal(r.aCobrar, 14000);
  assert.equal(r.totalDelDia, 29000.3);
  assert.equal(r.cantidad, 2);
  assert.deepEqual(porColumna, antes, "el esperado de cada medio no cambia");
});

test("sin vouchers (o interruptor apagado): no hay renglón", () => {
  assert.equal(renglonDeVouchers(porColumna, ["EFECTIVO"], null), null);
  assert.equal(renglonDeVouchers(porColumna, ["EFECTIVO"], undefined), null);
});

test("el cierre del diseño nuevo pinta el renglón con el total, aparte de lo que se cuenta", () => {
  const src = readFileSync(new URL("./CierreRenglon.tsx", import.meta.url), "utf8");
  assert.match(src, /renglonDeVouchers\(d\.preview\.porColumna, d\.columnas, d\.vouchersACobrar\)/);
  assert.match(src, /<VouchersDelDia d=\{d\} \/>/);
  assert.match(src, /concepto=\{r\.etiqueta\}/);
  assert.match(src, /concepto="Total del día" importe=\{<Plata valor=\{r\.totalDelDia\} \/>\}/);
  // Lo que se cuenta (ContarYCerrar) sigue saliendo de porColumna, sin vouchers.
  assert.match(src, /esperado: x\.expected,/);
  assert.ok(ETIQUETA_VOUCHERS_A_COBRAR.includes("administración"));
  assert.ok(!/OpenKey/.test(ETIQUETA_VOUCHERS_A_COBRAR));
});

test("el cierre señala los pagos de la administración en su medio, y las pantallas de vouchers ofrecen confirmar la acreditación", () => {
  const cierre = readFileSync(new URL("./CierreRenglon.tsx", import.meta.url), "utf8");
  assert.match(cierre, /pagosDeLaAdministracion\(d\.movements\)/);
  assert.match(cierre, /<PagosDeLaAdministracion d=\{d\} \/>/);
  const forms = readFileSync(new URL("../../vouchers/LiquidacionFormularios.tsx", import.meta.url), "utf8");
  assert.match(forms, /Confirmar acreditación en Mercado Pago/);
  assert.match(forms, /confirmarAcreditacion\(fd\)/);
  const lista = readFileSync(new URL("../../vouchers/page.tsx", import.meta.url), "utf8");
  assert.match(lista, /cuenta\.pendientesDeAcreditacion\.map/);
  const detalle = readFileSync(new URL("../../vouchers/liquidacion/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(detalle, /<AcreditacionDelPago pagoId=\{l\.pago\.id\}/);
});

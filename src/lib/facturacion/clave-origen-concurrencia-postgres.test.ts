// Certificación PR1 (C2): una sola factura viva por clave de origen, con carreras reales en
// Postgres (app_rls + RLS). Antes del candado por (negocio, clave), 15/15 rondas daban doble.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";

const HOY = fechaFiscalDelDia();
const laBase = baseEfimeraDelArchivo();

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "10" });
  const duenio = await prismaComoDuenio(base);
  const cf = await import("@/lib/facturacion/cobros-facturados");
  return { base, duenio, cf };
}

const entrada = (tenantId: string, total: number) => ({
  tenantId,
  concepto: 1,
  fecha: HOY,
  emisor: { cuit: 20111111112, condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta: 1 },
  receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
  neto: total / 1.21,
  iva: [{ alicuotaId: 5, base: total / 1.21, importe: total - total / 1.21 }],
  total,
  ivaPorProducto: true,
  vencimientoPago: HOY,
});

test("origen con factura RECHAZADA + dos refacturaciones a la vez → una sola viva", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  let dobles = 0;
  for (let i = 0; i < 15; i++) {
    const total = 1000 + i;
    const origen = { tipo: "mp_payment" as const, id: randomUUID() };
    const primera = await p.cf.facturarOrigen(entrada(a, total) as never, origen);
    await p.duenio.invoice.update({ where: { id: primera }, data: { status: "REJECTED", rechazoMotivo: "10015: x" } });
    await Promise.all([p.cf.facturarOrigen(entrada(a, total) as never, origen), p.cf.facturarOrigen(entrada(a, total) as never, origen)]);
    const vivas = await p.duenio.invoice.count({ where: { tenantId: a, total, status: { not: "REJECTED" } } });
    if (vivas > 1) dobles++;
  }
  assert.equal(dobles, 0, "dos facturas vivas por el mismo origen");
});

test("mp:payment:X y claveCobroMP(X) son la misma fila del libro", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const x = String(Date.now());
  const [i1, i2] = await Promise.all([
    p.cf.facturarOrigen(entrada(a, 2001) as never, { tipo: "mp_payment", id: x }),
    p.cf.facturarCobros(entrada(a, 2001) as never, [{ clave: p.cf.claveCobroMP(x), importe: 2001 }]),
  ]);
  const filas = await p.duenio.cobroFacturado.findMany({ where: { tenantId: a } , select: { clave: true, invoiceId: true } });
  const facts = await p.duenio.invoice.findMany({ where: { tenantId: a, total: 2001 }, select: { id: true, status: true } });
  assert.equal(i1, i2);
  assert.equal(facts.length, 1);
});

test("10 facturarOrigen a la vez sobre el mismo origen → una factura", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const origen = { tipo: "mp_payment" as const, id: randomUUID() };
  const ids = await Promise.all(Array.from({ length: 10 }, () => p.cf.facturarOrigen(entrada(a, 4001) as never, origen)));
  const filas = await p.duenio.cobroFacturado.findMany({ where: { tenantId: a, clave: "mp:" + origen.id } });
  const facts = await p.duenio.invoice.findMany({ where: { tenantId: a, total: 4001 }, select: { id: true, status: true, createdAt: true } });
  assert.equal(new Set(ids).size, 1);
  assert.equal(facts.length, 1);
});

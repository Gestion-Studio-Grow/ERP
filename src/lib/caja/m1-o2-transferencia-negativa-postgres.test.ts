// N2 · M1 · cert v9 O2 contra Postgres (decisión del orquestador 30/10): con F2 la Transferencia del
// cierre es un NETO del período y puede dar negativo (se pagó por transferencia más de lo que entró).
// Con el paquete aplicado: venta por transferencia 5.000 y un pago a proveedor por transferencia
// 6.000 → neto −1.000. `cerrarDia` acepta «-1.000» en Transferencia (y sólo ahí), no asienta nada y
// el comprobante dice que es un neto. (Que MP no acepte signo lo prueba m1-caja-medios: validateCierre.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba, type UsuarioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("contra Postgres: O2 · Transferencia con neto negativo se declara y cuadra", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  apuntarLaAppA(laBase);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: process.env.ERP_TEST_DB_CONNECTION_LIMIT ?? "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(laBase);
  const { a } = laBase;
  const { createOrder } = await import("@/lib/order-actions");
  const { cerrarDia, getCierreDiarioData } = await import("@/lib/cierre-diario-actions");
  const { olvidarSchemaProbe } = await import("@/lib/schema-probe");
  const { olvidarTransferenciaEnElLibro } = await import("@/lib/caja/transferencia-en-el-libro");
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const { cierreMarker } = await import("@/lib/caja/cierre-marca");
  const { resumenCierre } = await import("@/lib/caja/cierre-resumen");

  const como = async <R>(n: NegocioDePrueba, u: UsuarioDePrueba, f: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: n, usuario: u }, f);
    assert.equal(r.tipo, "respuesta", `la acción cortó con ${r.tipo}`);
    return (r as { valor: R }).valor;
  };
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };

  // Con el paquete: TRANSFERENCIA es un medio del libro.
  const sql = readFileSync(path.join(process.cwd(), "prisma/pending-gate2/N2_enums.sql"), "utf8");
  for (const paso of sql.split("\n").filter((l) => /^ALTER TYPE/.test(l.trim()))) await duenio.$executeRawUnsafe(paso);
  olvidarSchemaProbe();
  olvidarTransferenciaEnElLibro();

  const corte = await duenio.product.create({ data: { tenantId: a.id, name: "Bife", saleUnit: "UNIT", price: 5_000, unit: "u", trackStock: true, stock: 10 } });
  const fd = new FormData();
  for (const [k, v] of Object.entries({ channel: "COUNTER", fulfillment: "PICKUP", customerName: "Mostrador", paid: "on", paymentMethod: "TRANSFERENCIA", idempotencyKey: "o2:venta" })) fd.set(k, v);
  fd.append("productId", corte.id);
  fd.append("quantity", "1");
  const v = await como(a, a.duenia, () => createOrder(fd));
  assert.ok(v && v.ok, JSON.stringify(v));
  // El pago al proveedor por transferencia, como lo deja el libro (EGRESO a mano).
  await duenio.cashMovement.create({ data: { tenantId: a.id, type: "EGRESO", method: "TRANSFERENCIA", amount: 6_000, reason: "Pago a proveedor", createdBy: `user:${a.duenia.id}`, occurredAt: new Date() } });

  const hoy = todayInBusinessTz();
  const hoja = await como(a, a.duenia, () => getCierreDiarioData(hoy));
  assert.equal(hoja.preview.porColumna.TRANSFERENCIA.expected, -1_000, "neto del período: 5.000 − 6.000");

  const r = await como(a, a.duenia, () => cerrarDia(form({ day: hoy, columnas: "x", declarado_EFECTIVO: "0", declarado_TRANSFERENCIA: "-1.000" })));
  assert.ok(r && r.ok, JSON.stringify(r));
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: a.id, createdBy: cierreMarker(hoy) } }), 0, "cuadra: sin ajuste");
  const fila = await duenio.auditLog.findFirst({ where: { tenantId: a.id, action: "caja.cierre-diario", entityId: hoy }, orderBy: { createdAt: "desc" } });
  const linea = resumenCierre(fila?.changes)?.medios.find((m) => m.startsWith("Transferencia"));
  assert.match(String(linea), /cuadra \(neto del período: salió más de lo que entró por transferencia\)/);
});

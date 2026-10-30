// N2 · M1 · F2 contra Postgres (decisión del dueño 29/10/2026): la Transferencia se cuenta como lo que
// ENTRÓ en el período, no como saldo. Es el caso de HOY en producción (sin N2_enums.sql: las
// transferencias se asientan en `MP`), con ventas reales (`createOrder`) y cierres reales (`cerrarDia`):
//   · día 1: Mercado Pago 5.000 + transferencia 5.000; al banco llegaron 4.000 → ajuste de 1.000
//     en `MP` con el detalle de la columna Transferencia;
//   · día 2: Mercado Pago 5.000 + transferencia 5.000. Mercado Pago abre con lo de la app (5.000,
//     sin la transferencia del día 1 ni su ajuste) y Transferencia con 0: el día 2 cuadra.
// Antes de F2, el día 2 daba un faltante FALSO en MP (las transferencias viejas en su saldo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba, type UsuarioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("contra Postgres: F2 · dos días con transferencias guardadas en MP, el día 2 cuadra", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  apuntarLaAppA(laBase);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: process.env.ERP_TEST_DB_CONNECTION_LIMIT ?? "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(laBase);
  const { a, b } = laBase;
  const { createOrder } = await import("@/lib/order-actions");
  const { cerrarDia, getCierreDiarioData } = await import("@/lib/cierre-diario-actions");
  const { olvidarSchemaProbe } = await import("@/lib/schema-probe");
  const { olvidarTransferenciaEnElLibro } = await import("@/lib/caja/transferencia-en-el-libro");
  const { todayInBusinessTz, businessWallTimeToUtc } = await import("@/lib/datetime");
  const { cierreMarker } = await import("@/lib/caja/cierre-marca");

  const como = async <R>(n: NegocioDePrueba, u: UsuarioDePrueba, f: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: n, usuario: u }, f);
    assert.equal(r.tipo, "respuesta", `la acción cortó con ${r.tipo}`);
    return (r as { valor: R }).valor;
  };
  const corte = await duenio.product.create({
    data: { tenantId: a.id, name: "Bife", saleUnit: "UNIT", price: 5_000, unit: "u", trackStock: true, stock: 10 },
  });
  const venta = async (medio: "MERCADOPAGO" | "TRANSFERENCIA", clave: string) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ channel: "COUNTER", fulfillment: "PICKUP", customerName: "Mostrador", paid: "on", paymentMethod: medio, idempotencyKey: clave })) fd.set(k, v);
    fd.append("productId", corte.id);
    fd.append("quantity", "1");
    const r = await como(a, a.duenia, () => createOrder(fd));
    assert.ok(r && r.ok, JSON.stringify(r));
  };
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const libroDeB = await duenio.cashMovement.findMany({ where: { tenantId: b.id }, orderBy: { createdAt: "asc" } });

  // Sin el paquete (producción hoy): las transferencias van a `MP`.
  olvidarSchemaProbe();
  olvidarTransferenciaEnElLibro();
  const hoy = todayInBusinessTz();
  const ayer = new Date(new Date(`${hoy}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);

  // ── Día 1 (ayer) ───────────────────────────────────────────────────────────
  await venta("MERCADOPAGO", "f2:d1:mp");
  await venta("TRANSFERENCIA", "f2:d1:transf");
  await duenio.cashMovement.updateMany({ where: { tenantId: a.id }, data: { occurredAt: businessWallTimeToUtc(ayer, "12:00") } });
  const hoja1 = await como(a, a.duenia, () => getCierreDiarioData(ayer));
  assert.equal(hoja1.preview.porColumna.MP.expected, 5_000);
  assert.equal(hoja1.preview.porColumna.TRANSFERENCIA.expected, 5_000);
  const c1 = await como(a, a.duenia, () =>
    cerrarDia(form({ day: ayer, columnas: "x", declarado_EFECTIVO: "0", declarado_MP: "5.000", declarado_TRANSFERENCIA: "4.000", note: "una transferencia no llegó" })),
  );
  assert.ok(c1 && c1.ok, JSON.stringify(c1));
  const ajuste1 = await duenio.cashMovement.findMany({ where: { tenantId: a.id, createdBy: cierreMarker(ayer) }, select: { type: true, method: true, amount: true, reason: true } });
  assert.deepEqual(
    ajuste1.map((m) => [m.type, m.method, Number(m.amount)]),
    [["EGRESO", "MP", 1_000]],
    "sin el paquete, la diferencia del banco se asienta en MP",
  );
  assert.match(String(ajuste1[0].reason), /faltante en Transferencia$/);

  // ── Día 2 (hoy) ────────────────────────────────────────────────────────────
  await venta("MERCADOPAGO", "f2:d2:mp");
  await venta("TRANSFERENCIA", "f2:d2:transf");
  const hoja2 = await como(a, a.duenia, () => getCierreDiarioData(hoy));
  const mp = hoja2.preview.porColumna.MP;
  const tr = hoja2.preview.porColumna.TRANSFERENCIA;
  assert.equal(mp.opening, 5_000, "MP abre con lo de la app: sin la transferencia de ayer ni su ajuste");
  assert.equal(mp.expected, 10_000);
  assert.equal(tr.opening, 0, "Transferencia no arrastra saldo");
  assert.equal(tr.expected, 5_000, "lo que entró hoy");
  assert.equal(hoja2.preview.porMedio.MP.expected, 19_000, "el libro no cambia: 5.000 + 5.000 − 1.000 + 5.000 + 5.000");
  assert.deepEqual(hoja2.mediosDelLibro, ["EFECTIVO", "MP", "TARJETA"], "la de siempre sigue con «MP / Transf.» junto");
  assert.equal(hoja2.preview.porMedio.MP.expected, 19_000);

  const c2 = await como(a, a.duenia, () => cerrarDia(form({ day: hoy, columnas: "x", declarado_EFECTIVO: "0", declarado_MP: "10.000", declarado_TRANSFERENCIA: "5.000" })));
  assert.ok(c2 && c2.ok, JSON.stringify(c2));
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: a.id, createdBy: cierreMarker(hoy) } }), 0, "el día 2 cuadra: sin ajuste");

  // ── B no se mezcló ─────────────────────────────────────────────────────────
  assert.deepEqual(await duenio.cashMovement.findMany({ where: { tenantId: b.id }, orderBy: { createdAt: "asc" } }), libroDeB, "el libro de B no cambió");
});

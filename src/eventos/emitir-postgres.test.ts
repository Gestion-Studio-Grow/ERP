// ============================================================================
// emitirEvento contra un Postgres LOCAL efímero (P2-C1, C3, C4, C5) — dos negocios, doble envío
// ============================================================================
//   node --import tsx --test src/eventos/emitir-postgres.test.ts
//
// Una base propia (src/test/base-efimera.ts: puerto 5433, se borra al terminar; nunca Neon), la
// app como `app_rls` (RLS aplicada), dos negocios A y B. Dos fases en la MISMA base:
//   1. Como Neon hoy: SIN N2_hub.sql → la clave viaja en payload._clave.
//   2. Se aplica prisma/pending-gate2/N2_hub.sql (como dueño, sólo en esta base efímera) → columnas
//      `version` y `clave` con el UNIQUE (tenantId, clave).
// En cada fase: rollback del hecho = sin evento; doble emisión (seguida y simultánea) = una fila;
// el evento de A nunca se ve desde B; y el Core real (alta, cobro, anulación, factura) emite.
// ============================================================================

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";

type Fila = { id: string; tenantId: string; type: string; payload: Record<string, unknown>; clave?: string | null; version?: number };

test("P2 · outbox de eventos con y sin N2_hub, dos negocios, rollback y doble envío", { timeout: 300_000 }, async (t: TestContext) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  env.FORCE_TENANT_SLUG = base.a.slug;

  const duenio = await prismaComoDuenio(base);
  const { tenantTransaction } = await import("@/lib/rls");
  const { emitirEvento, olvidarColumnasDelOutbox } = await import("@/eventos/emitir");
  const { basePrisma } = await import("@/lib/prisma-base");
  const rol = await basePrisma.$queryRaw<{ bypass: boolean }[]>`SELECT rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`;
  assert.equal(rol[0]?.bypass, false, "la app corre con un rol SIN bypass de RLS");

  const A = base.a.id;
  const B = base.b.id;
  const COBRO = { pedidoId: "o1", codigo: 7, monto: 1500.5, medio: "EFECTIVO" as const, cobradoEn: "2026-10-28T10:00:00.000Z" };

  /** Lo que hay en el outbox, visto como DUEÑO (sin RLS): la verdad de la base. */
  const todas = async (conColumnas: boolean): Promise<Fila[]> =>
    duenio.$queryRawUnsafe<Fila[]>(
      `SELECT "id", "tenantId", "type", "payload"${conColumnas ? `, "clave", "version"` : ""} FROM "OutboxEvent" WHERE "type" LIKE '%@%' ORDER BY "createdAt"`,
    );
  const conClave = (filas: Fila[], tenantId: string, clave: string, conColumnas: boolean) =>
    filas.filter((f) => f.tenantId === tenantId && (conColumnas ? f.clave === clave : f.payload._clave === clave));
  const emitir = (tenantId: string, clave: string, opts: { comoNegocio?: string; falla?: boolean } = {}) =>
    tenantTransaction(
      async (tx) => {
        const r = await emitirEvento(tx, { tenantId, tipo: "pedido.cobrado", version: 1, clave, datos: COBRO });
        if (opts.falla) throw new Error("el hecho falló después de emitir");
        return r;
      },
      { tenantId: opts.comoNegocio ?? tenantId },
    );

  async function fase(nombre: string, conColumnas: boolean, pedidoA: string) {
    const modo = conColumnas ? "columnas" : "payload";
    const k = `${nombre}:hecho-1`;

    // C3 · el hecho vuelve atrás → no queda el evento.
    await assert.rejects(emitir(A, `${nombre}:rollback`, { falla: true }), /falló después de emitir/);
    assert.equal(conClave(await todas(conColumnas), A, `${nombre}:rollback`, conColumnas).length, 0, `${nombre}: rollback dejó fila`);

    // C1 · se escribe con type tipo@N, versión y clave en el lugar que corresponde.
    const r1 = await emitir(A, k);
    assert.deepEqual({ escrito: r1.escrito, modo: "modo" in r1 ? r1.modo : null }, { escrito: true, modo });
    const [f] = conClave(await todas(conColumnas), A, k, conColumnas);
    assert.ok(f, `${nombre}: no está la fila`);
    assert.equal(f.type, "pedido.cobrado@1");
    assert.equal(f.payload.version, 1);
    assert.equal(f.payload.negocio, A);
    assert.deepEqual(f.payload.datos, COBRO);
    if (conColumnas) {
      assert.equal(f.version, 1);
      assert.equal(f.payload._clave, undefined, "con columnas la clave no va en el payload");
    }

    // C4 · doble emisión: seguida y simultánea → una fila.
    assert.deepEqual(await emitir(A, k), { escrito: false, motivo: "duplicado", modo });
    const kDoble = `${nombre}:doble`;
    const juntas = await Promise.all([emitir(A, kDoble), emitir(A, kDoble), emitir(A, kDoble)]);
    assert.equal(juntas.filter((r) => r.escrito).length, 1, `${nombre}: simultáneas escribieron ${JSON.stringify(juntas)}`);
    assert.equal(conClave(await todas(conColumnas), A, kDoble, conColumnas).length, 1);

    // Dos negocios: la misma clave en B es OTRO hecho (su fila), y nunca se cruzan.
    assert.equal((await emitir(B, k)).escrito, true);
    const deA = await tenantTransaction((tx) => tx.outboxEvent.findMany({ select: { tenantId: true, type: true } }), { tenantId: A });
    const deB = await tenantTransaction((tx) => tx.outboxEvent.findMany({ select: { tenantId: true, type: true } }), { tenantId: B });
    assert.ok(deA.length > 0 && deA.every((x) => x.tenantId === A), `${nombre}: A ve filas de B`);
    assert.ok(deB.length > 0 && deB.every((x) => x.tenantId === B), `${nombre}: B ve filas de A`);
    // Emitir un evento de B desde la transacción de A: la RLS lo rechaza y no queda nada.
    await assert.rejects(emitir(B, `${nombre}:cruzado`, { comoNegocio: A }));
    assert.equal(conClave(await todas(conColumnas), B, `${nombre}:cruzado`, conColumnas).length, 0);

    // El Core real: cobrar emite pedido.cobrado@1 una sola vez; anular emite pedido.cancelado@1.
    const { cobrarPedidoEnTx } = await import("@/lib/order-core");
    const cobrar = () =>
      tenantTransaction((tx) => cobrarPedidoEnTx(tx, A, { orderId: pedidoA, method: "MERCADOPAGO", actor: "mercadopago:pago-77" }), { tenantId: A });
    assert.equal((await cobrar()).tipo, "cobrado");
    assert.equal((await cobrar()).tipo, "ya-cobrado");
    const cobros = conClave(await todas(conColumnas), A, `pedido:${pedidoA}:cobrado`, conColumnas);
    assert.equal(cobros.length, 1, `${nombre}: cobro duplicado`);
    assert.equal((cobros[0].payload.datos as { medio: string; pagoExterno: string }).medio, "MP");
    assert.equal((cobros[0].payload.datos as { pagoExterno: string }).pagoExterno, "pago-77");

    const { anularVentaInTx } = await import("@/lib/order-anulacion");
    const anular = () =>
      tenantTransaction(
        (tx) =>
          anularVentaInTx(tx, A, {
            orderId: pedidoA,
            motivo: "Se arrepintió, llamó al 11 5566-7788",
            actor: "user:qa",
            devuelveStock: false,
            diaCerradoHasta: null,
            esDiaCerrado: () => false,
            diaDe: (d) => d.toISOString().slice(0, 10),
          }),
        { tenantId: A },
      );
    assert.equal((await anular()).applied, true);
    assert.equal((await anular()).applied, false);
    const anuladas = conClave(await todas(conColumnas), A, `pedido:${pedidoA}:cancelado`, conColumnas);
    assert.equal(anuladas.length, 1);
    assert.ok(!JSON.stringify(anuladas[0].payload).includes("5566-7788"), "el teléfono del motivo quedó en claro");
  }

  // ── Fase 1: como Neon hoy (sin N2_hub) ──
  olvidarColumnasDelOutbox();
  const columnasAntes = await duenio.$queryRawUnsafe<unknown[]>(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'OutboxEvent' AND column_name = 'clave'`,
  );
  assert.equal(columnasAntes.length, 0, "la base efímera arranca sin N2_hub");
  await fase("sin-n2", false, base.a.pedidos[0]);

  // ── Fase 2: con N2_hub aplicada (sólo en esta base efímera) ──
  aplicarN2Hub(base);
  olvidarColumnasDelOutbox();
  await fase("con-n2", true, base.a.pedidos[1]);

  // ── Alta real (insertOrder) y factura (C5: InvoiceCreated sigue igual + factura.autorizada@1) ──
  const producto = await duenio.product.create({
    data: { tenantId: A, name: "Vacío", saleUnit: "WEIGHT", pricePerKg: 12500, unit: "kg", trackStock: false },
  });
  const { insertOrder } = await import("@/lib/order-core");
  const venta = await insertOrder(
    A,
    {
      channel: "ONLINE", fulfillment: "PICKUP", customerName: "Cliente API", customerPhone: "11 4000 0000", address: null,
      notes: null, scheduledFor: null, paid: false, paymentMethod: null, items: [{ productId: producto.id, qty: 1 }],
    },
    { idempotencyKey: "ext:WC-981" },
  );
  const otraVez = await insertOrder(
    A,
    {
      channel: "ONLINE", fulfillment: "PICKUP", customerName: "Cliente API", customerPhone: "11 4000 0000", address: null,
      notes: null, scheduledFor: null, paid: false, paymentMethod: null, items: [{ productId: producto.id, qty: 1 }],
    },
    { idempotencyKey: "ext:WC-981" },
  );
  assert.equal(otraVez.id, venta.id);
  const creados = conClave(await todas(true), A, `pedido:${venta.id}:creado`, true);
  assert.equal(creados.length, 1);
  const datosAlta = creados[0].payload.datos as { canal: string; externalRef: string; total: number; items: unknown[] };
  assert.equal(datosAlta.canal, "API");
  assert.equal(datosAlta.externalRef, "WC-981");
  assert.equal(datosAlta.total, 12500);
  assert.ok(!JSON.stringify(creados[0].payload).includes("4000 0000"));

  const { createInvoice, registerFiscalDocument, markInvoiceRejected, OUTBOX_INVOICE_CREATED } = await import("@/lib/invoice-core");
  const factura = (orderId: string) =>
    createInvoice({
      tenantId: A, concepto: 1, fecha: "20261028",
      emisor: { cuit: 20111111112, condicionIva: "MONOTRIBUTO", puntoVenta: 3 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: 12500, iva: [], total: 12500, origin: { type: "ORDER", id: orderId },
    });
  const invoiceId = await factura(venta.id);
  const envios = await duenio.outboxEvent.findMany({ where: { tenantId: A, type: OUTBOX_INVOICE_CREATED } });
  assert.equal(envios.length, 1, "InvoiceCreated sigue saliendo igual");
  assert.equal((envios[0].payload as { invoiceId: string }).invoiceId, invoiceId);
  const doc = { invoiceId, tenantId: A, cae: "76123456789012", caeVencimiento: "20261107", numero: 12, puntoVenta: 3, tipoComprobante: 11 };
  assert.equal(await registerFiscalDocument(doc, envios[0].id), true);
  assert.equal(await registerFiscalDocument(doc, envios[0].id), false, "envío ya cerrado");
  const autorizadas = conClave(await todas(true), A, `factura:${invoiceId}:autorizada`, true);
  assert.equal(autorizadas.length, 1);
  assert.deepEqual(autorizadas[0].payload.datos, {
    facturaId: invoiceId, tipoComprobante: 11, puntoVenta: 3, numero: 12, cae: "76123456789012", caeVencimiento: "20261107", total: 12500, pedidoId: venta.id,
  });

  // Rechazo: con el envío en la clave; si el envío ya estaba cerrado no se escribe nada.
  const venta2 = await insertOrder(A, {
    channel: "COUNTER", fulfillment: "PICKUP", customerName: "Mostrador", customerPhone: "", address: null,
    notes: null, scheduledFor: null, paid: true, paymentMethod: "EFECTIVO", items: [{ productId: producto.id, qty: 2 }],
  });
  const filasVenta2 = await todas(true);
  assert.equal(conClave(filasVenta2, A, `pedido:${venta2.id}:creado`, true).length, 1);
  assert.equal(conClave(filasVenta2, A, `pedido:${venta2.id}:cobrado`, true).length, 1, "la venta de mostrador cobrada emite pedido.cobrado");
  const factura2 = await factura(venta2.id);
  const envio2 = (await duenio.outboxEvent.findMany({ where: { tenantId: A, type: OUTBOX_INVOICE_CREATED } })).find(
    (x) => (x.payload as { invoiceId: string }).invoiceId === factura2,
  )!;
  assert.equal(await markInvoiceRejected(factura2, A, "10015: DocNro 20301234567 inválido", envio2.id), true);
  assert.equal(await markInvoiceRejected(factura2, A, "otra vez", envio2.id), false);
  const rechazos = conClave(await todas(true), A, `factura:${factura2}:rechazada:${envio2.id}`, true);
  assert.equal(rechazos.length, 1);
  assert.ok(!JSON.stringify(rechazos[0].payload).includes("20301234567"));

  // Nada de A en B, al final de todo.
  const deB = await tenantTransaction((tx) => tx.outboxEvent.findMany({ select: { tenantId: true } }), { tenantId: B });
  assert.ok(deB.every((x) => x.tenantId === B));
});

function aplicarN2Hub(base: BaseEfimera): void {
  const archivo = path.join(process.cwd(), "prisma", "pending-gate2", "N2_hub.sql");
  execFileSync("psql", [base.urlDuenio, "-v", "ON_ERROR_STOP=1", "-q", "-f", archivo], { stdio: ["ignore", "ignore", "pipe"] });
}

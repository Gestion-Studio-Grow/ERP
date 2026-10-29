// ============================================================================
// P2 · vuelta 5 de la certificación (F6, P2-C2): los eventos retail que faltaban, contra una base
// efímera (PGlite o el Postgres del arnés). Nunca Neon.
// ============================================================================
//   node scripts/qa/p2-pglite.mjs src/eventos/vuelta5-postgres.test.ts
//   node --import tsx --test src/eventos/vuelta5-postgres.test.ts          # Postgres local (5433)
//
// Cada evento se prueba por la función del Core que lo emite (la misma que llama la acción), en
// los dos estados de la base (sin y con N2_hub):
//   · sale en la transacción del hecho: si la transacción vuelve atrás, no queda la fila;
//   · con su clave: repetir el mismo hecho deja una fila;
//   · con su forma del catálogo y los datos personales enmascarados.
// Más la regla de `pedido.cobrado` después de `pedido.cancelado` (O-v4-5) y el sustituto suelto en
// la entrada (O-v4-3, X5 del certificador).
// PGlite corre como superusuario y atiende de a una consulta: no prueba RLS ni carreras.
// ============================================================================

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";

const PGLITE = process.env.ERP_TEST_MOTOR === "pglite";
type Fila = { id: string; type: string; payload: { clave: string; datos: Record<string, unknown> } };

class Deshacer extends Error {}

test("P2 vuelta 5 · pedido.confirmado/listo/entregado, stock.*, producto.actualizado, cliente.creado, caja.*", { timeout: 600_000 }, async (t: TestContext) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  env.FORCE_TENANT_SLUG = base.a.slug;

  const duenio = await prismaComoDuenio(base);
  const { tenantTransaction } = await import("@/lib/rls");
  const { recordMovement, registrarConteoSinDiferencia } = await import("@/lib/stock/ledger");
  const { crearFichaEnTx } = await import("@/lib/clientes/crear-ficha");
  const { registrarCambiosDePrecio } = await import("@/lib/catalogo/precios-auditoria");
  const { entregarAlFiadoEnTx, registrarFiadoDelPedidoEnTx } = await import("@/lib/clientes/fiado");
  const { cobrarFiadoInTx } = await import("@/lib/debts/receivable-service");
  const { anularVentaInTx } = await import("@/lib/order-anulacion");
  const del = await import("@/eventos/del-core");
  const { olvidarColumnasDelOutbox } = await import("@/eventos/emitir");

  const A = base.a.id;
  const cliente = base.a.clientes[0];
  let codigo = 5000;
  let sku = 0;
  const tx = <T>(fn: (tx: never) => Promise<T>) => tenantTransaction((x) => fn(x as never), { tenantId: A });
  const pedido = async (extra: { status?: "PENDING" | "CONFIRMED" | "PREPARING" | "READY" | "DELIVERED"; fulfillment?: "PICKUP" | "DELIVERY"; clientId?: string } = {}) =>
    (
      await duenio.order.create({
        data: {
          tenantId: A, code: codigo++, customerName: "QA", customerPhone: "", total: 6000, status: extra.status ?? "PENDING",
          fulfillment: extra.fulfillment ?? "PICKUP", clientId: extra.clientId ?? null,
        },
        select: { id: true },
      })
    ).id;
  const eventos = (tipo: string, campo: string, valor: string) =>
    duenio.$queryRawUnsafe<Fila[]>(
      `SELECT "id", "type", "payload" FROM "OutboxEvent" WHERE "tenantId" = $1 AND "type" = $2 AND "payload"->'datos'->>$3 = $4 ORDER BY "createdAt", "id"`,
      A, `${tipo}@1`, campo, valor,
    );
  const delPedido = async (pedidoId: string) =>
    (await duenio.$queryRawUnsafe<Fila[]>(
      `SELECT "id", "type", "payload" FROM "OutboxEvent" WHERE "tenantId" = $1 AND "payload"->'datos'->>'pedidoId' = $2 ORDER BY "createdAt", "id"`,
      A, pedidoId,
    )).map((e) => e.type);
  const deshecho = async (fn: (x: never) => Promise<unknown>) => {
    await assert.rejects(tx(async (x) => { await fn(x); throw new Deshacer(); }), Deshacer);
  };

  async function fase(nombre: string) {
    // ── pedido.confirmado / listo / entregado (moverPedidoConEventoEnTx: advanceOrderStatus, entregarPedido, nace entregada)
    const p1 = await pedido({ fulfillment: "DELIVERY" });
    assert.equal(await tx((x) => del.moverPedidoConEventoEnTx(x, { tenantId: A, pedidoId: p1, de: "PENDING", a: "PREPARING" })), true);
    assert.equal(await tx((x) => del.moverPedidoConEventoEnTx(x, { tenantId: A, pedidoId: p1, de: "PREPARING", a: "READY" })), true);
    assert.equal(await tx((x) => del.moverPedidoConEventoEnTx(x, { tenantId: A, pedidoId: p1, de: "READY", a: "DELIVERED" })), true);
    // Doble toque: el compare-and-set no se da y no hay evento de más.
    assert.equal(await tx((x) => del.moverPedidoConEventoEnTx(x, { tenantId: A, pedidoId: p1, de: "READY", a: "DELIVERED" })), false);
    assert.deepEqual(await delPedido(p1), ["pedido.confirmado@1", "pedido.listo@1", "pedido.entregado@1"], `${nombre}: pasos`);
    const [listo] = await eventos("pedido.listo", "pedidoId", p1);
    assert.equal(listo.payload.datos.entrega, "DELIVERY");
    assert.equal(listo.payload.clave, `pedido:${p1}:listo`);
    // Servicios: PENDING → CONFIRMED también es «confirmado»; CONFIRMED → PREPARING no tiene evento.
    const p2 = await pedido();
    await tx((x) => del.moverPedidoConEventoEnTx(x, { tenantId: A, pedidoId: p2, de: "PENDING", a: "CONFIRMED" }));
    await tx((x) => del.moverPedidoConEventoEnTx(x, { tenantId: A, pedidoId: p2, de: "CONFIRMED", a: "PREPARING" }));
    assert.deepEqual(await delPedido(p2), ["pedido.confirmado@1"], `${nombre}: CONFIRMED→PREPARING emitió`);
    // Venta de mostrador que nace entregada (createOrder / caja con lector): CONFIRMED → DELIVERED.
    const p3 = await pedido({ status: "CONFIRMED" });
    await tx((x) => del.moverPedidoConEventoEnTx(x, { tenantId: A, pedidoId: p3, de: "CONFIRMED", a: "DELIVERED" }));
    assert.deepEqual(await delPedido(p3), ["pedido.entregado@1"]);
    // Rollback: ni paso ni evento.
    const p4 = await pedido({ status: "READY" });
    await deshecho((x) => del.moverPedidoConEventoEnTx(x, { tenantId: A, pedidoId: p4, de: "READY", a: "DELIVERED" }));
    assert.deepEqual(await delPedido(p4), [], `${nombre}: el rollback dejó el evento`);
    assert.equal((await duenio.order.findUnique({ where: { id: p4 }, select: { status: true } }))?.status, "READY");
    // Entregar al fiado: entregado sí, cobrado no.
    const p5 = await pedido({ status: "READY", clientId: cliente });
    const e5 = await tx((x) => entregarAlFiadoEnTx(x, A, { orderId: p5, actor: "user:qa" }));
    assert.equal(e5.entregado, true);
    assert.deepEqual(await delPedido(p5), ["pedido.entregado@1"], `${nombre}: fiado`);

    // ── O-v4-5 · fiado → anulación → el cliente paga: cancelado SÍ, cobrado NO (repro X1 del certificador)
    const p6 = await pedido({ status: "DELIVERED", clientId: cliente });
    const f6 = await tx((x) => registrarFiadoDelPedidoEnTx(x, A, { orderId: p6, actor: "user:qa" }));
    assert.equal(f6.tipo, "creado");
    const deuda = f6.tipo === "creado" ? f6.receivableId : "";
    await tx((x) => anularVentaInTx(x, A, {
      orderId: p6, motivo: "se arrepintió", actor: "user:qa", devuelveStock: false, diaCerradoHasta: null,
      esDiaCerrado: () => false, diaDe: (d: Date) => d.toISOString().slice(0, 10),
    } as never));
    await tx((x) => cobrarFiadoInTx(x, A, deuda, { amount: 6_000, method: "EFECTIVO", by: "user:qa" }, new Date(), false));
    const seq6 = await delPedido(p6);
    assert.ok(seq6.includes("pedido.cancelado@1"), `${nombre}: X1 sin cancelado: ${seq6}`);
    assert.ok(!seq6.includes("pedido.cobrado@1"), `${nombre}: X1 cobrado después de cancelado: ${seq6}`);
    // El cobro se registra igual (la deuda queda saldada por su Collection): sólo no hay evento de pedido.
    assert.equal(await duenio.collection.count({ where: { tenantId: A, originType: "RECEIVABLE", originId: deuda } }), 1, "el cobro no se registró");

    // ── O-v4-3 · un sustituto suelto en el motivo ya no tumba la anulación (X5 del certificador)
    const p7 = await pedido();
    await tx((x) => del.emitirPedidoCancelado(x, { tenantId: A, pedidoId: p7, codigo: 1, motivo: "cliente \ud83d se fue al 11 5566-7788", reintegro: 0 }));
    const [c7] = await eventos("pedido.cancelado", "pedidoId", p7);
    assert.equal(c7.payload.datos.motivo, "cliente � se fue al ******7788");

    // ── stock.bajo / stock.ajustado (recordMovement, el único mutador del stock)
    const prod = (
      await duenio.product.create({
        data: { tenantId: A, name: `Vacío ${nombre}`, stock: 7, lowStockAt: 5, trackStock: true, price: 1000, codigo: `V-${nombre}-${sku++}` },
        select: { id: true },
      })
    ).id;
    const mov = (type: "VENTA" | "AJUSTE" | "COMPRA", qty: number, reason?: string) =>
      tx((x) => recordMovement(x, { tenantId: A, productId: prod, type, qty, reason: reason ?? null, createdBy: "user:qa" }));
    await mov("VENTA", 1); // 6: no cruza
    assert.equal((await eventos("stock.bajo", "productoId", prod)).length, 0, `${nombre}: 6 > 5 emitió`);
    await mov("VENTA", 2); // 4: cruza
    await mov("VENTA", 1); // 3: ya estaba abajo, no vuelve a avisar
    const bajos = await eventos("stock.bajo", "productoId", prod);
    assert.equal(bajos.length, 1, `${nombre}: stock.bajo emitió ${bajos.length}`);
    assert.deepEqual(
      { disponible: bajos[0].payload.datos.disponible, minimo: bajos[0].payload.datos.minimo, sku: bajos[0].payload.datos.sku },
      { disponible: 4, minimo: 5, sku: `V-${nombre}-${sku - 1}` },
    );
    await mov("COMPRA", 10); // 13: sube
    await mov("AJUSTE", -9, "Merma: avisó Juan al 11 5566-7788"); // 4: cruza de nuevo, y es un ajuste
    assert.equal((await eventos("stock.bajo", "productoId", prod)).length, 2, `${nombre}: el segundo cruce no avisó`);
    const [aj] = await eventos("stock.ajustado", "productoId", prod);
    assert.equal(aj.payload.datos.delta, -9);
    assert.equal(aj.payload.datos.motivo, "Merma: avisó Juan al ******7788");
    assert.equal(aj.payload.clave, `stock:movimiento:${aj.payload.datos.movimientoId}`);
    // Un recuento que coincide no ajusta nada: no emite. Un ajuste que vuelve atrás tampoco deja fila.
    await tx((x) => registrarConteoSinDiferencia(x, { tenantId: A, productId: prod, reason: "Recuento", createdBy: "user:qa" }));
    await deshecho((x) => recordMovement(x, { tenantId: A, productId: prod, type: "AJUSTE", qty: 1, reason: "no va", createdBy: "user:qa" }));
    assert.equal((await eventos("stock.ajustado", "productoId", prod)).length, 1, `${nombre}: recuento o rollback emitió`);

    // ── producto.actualizado (registrarCambiosDePrecio y el cuerpo de toggleProductActive)
    await tx(async (x) => {
      await (x as unknown as typeof duenio).product.updateMany({ where: { id: prod, tenantId: A }, data: { price: 1200 } });
      await registrarCambiosDePrecio(x, { tenantId: A, actor: "user:qa", origen: "catalogo", cambios: [{ productId: prod, nombre: "Vacío", saleUnit: "UNIT", antes: 1000, despues: 1200 }] });
    });
    await tx(async (x) => {
      const r = await (x as unknown as typeof duenio).product.updateMany({ where: { id: prod, tenantId: A }, data: { active: false } });
      if (r.count === 1) await del.emitirProductosActualizados(x, { tenantId: A, productIds: [prod], cambio: "estado" });
    });
    const prods = await eventos("producto.actualizado", "productoId", prod);
    assert.deepEqual(prods.map((e) => [e.payload.datos.precio, e.payload.datos.activo, e.payload.datos.cambios]), [[1200, true, ["precio"]], [1200, false, ["estado"]]]);
    // Un cambio general con lote: reemitir el mismo lote no duplica.
    for (let i = 0; i < 2; i++) await tx((x) => del.emitirProductosActualizados(x, { tenantId: A, productIds: [prod], cambio: "precio", loteId: `lote-${nombre}` }));
    assert.equal((await eventos("producto.actualizado", "productoId", prod)).length, 3, `${nombre}: el mismo lote duplicó`);

    // ── cliente.creado (crearFichaEnTx: Clientes y Vender)
    const tel = `11 4${String(codigo).padStart(3, "0")}-${nombre === "sin-n2" ? "1234" : "5678"}`;
    const ficha = await tx((x) => crearFichaEnTx(x, A, { name: "Marta (11 5566-7788)", phone: tel, email: null, notes: null, birthDate: null }));
    assert.ok(ficha.ok);
    const fichaId = ficha.ok ? ficha.id : "";
    const [cc] = await eventos("cliente.creado", "clienteId", fichaId);
    assert.equal(cc.payload.datos.telefonoEnmascarado, `******${tel.replace(/\D/g, "").slice(-4)}`);
    assert.equal(cc.payload.datos.nombre, "Marta (******7788)");
    assert.ok(!JSON.stringify(cc.payload).includes(tel));
    // El mismo teléfono otra vez: no hay ficha nueva ni evento.
    const otra = await tx((x) => crearFichaEnTx(x, A, { name: "Otra", phone: tel, email: null, notes: null, birthDate: null }));
    assert.equal(otra.ok, false);
    await deshecho((x) => crearFichaEnTx(x, A, { name: "No queda", phone: `11 3${codigo}-0000`, email: null, notes: null, birthDate: null }));
    assert.equal((await duenio.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "OutboxEvent" WHERE "tenantId" = $1 AND "type" = 'cliente.creado@1' AND "payload"->'datos'->>'nombre' = 'No queda'`, A))[0].n.toString(), "0");

    // ── caja.abierta / caja.turno.cerrada / caja.cerrada (las líneas de openCashSession, closeCashSession, cerrarDia)
    const abierta = new Date();
    const sesion = (await duenio.cashSession.create({ data: { tenantId: A, openedBy: "user:qa", openingFloat: 20_000, openedAt: abierta }, select: { id: true } })).id;
    for (let i = 0; i < 2; i++) await tx((x) => del.emitirCajaAbierta(x, { tenantId: A, sesionId: sesion, abiertaEn: abierta, inicial: 20_000 }));
    await tx((x) => del.emitirCajaTurnoCerrada(x, { tenantId: A, sesionId: sesion, quien: "user:qa", esperado: 120_000, contado: 119_500, diferencia: -500, motivo: "Faltó cambio, llamar al 11 5566-7788" }));
    const ab = await eventos("caja.abierta", "cierreId", sesion);
    assert.equal(ab.length, 1, `${nombre}: caja.abierta duplicó`);
    assert.equal(ab[0].payload.datos.inicial, 20_000);
    const [tc] = await eventos("caja.turno.cerrada", "cierreId", sesion);
    assert.equal(tc.payload.datos.turno, abierta.toISOString());
    assert.equal(tc.payload.datos.motivo, "Faltó cambio, llamar al ******7788");
    const cierreId = `cierre-${nombre}`;
    await tx((x) => del.emitirCajaCerrada(x, {
      tenantId: A, cierreId, dia: "2026-10-28",
      porMedio: { EFECTIVO: { expected: 210_300, declared: 210_000, diff: -300 }, MP: { expected: 202_000, declared: 202_000, diff: 0 }, TARJETA: { expected: 50_000, declared: null, diff: null } },
    }));
    const [cd] = await eventos("caja.cerrada", "cierreId", cierreId);
    assert.deepEqual(cd.payload.datos, { cierreId, fecha: "2026-10-28", esperado: 412_300, contado: 412_000, diferencia: -300, porMedio: { EFECTIVO: 210_000, MP: 202_000 } });
    await deshecho((x) => del.emitirCajaAbierta(x, { tenantId: A, sesionId: `${sesion}-x`, abiertaEn: abierta, inicial: 1 }));
    assert.equal((await eventos("caja.abierta", "cierreId", `${sesion}-x`)).length, 0);
  }

  olvidarColumnasDelOutbox();
  await fase("sin-n2");
  await aplicarN2Hub(base);
  olvidarColumnasDelOutbox();
  await fase("con-n2");
  if (PGLITE) t.diagnostic("PGlite: sin RLS (superusuario) y sin concurrencia real");
});

async function aplicarN2Hub(base: BaseEfimera): Promise<void> {
  const archivo = path.join(process.cwd(), "prisma", "pending-gate2", "N2_hub.sql");
  if (!PGLITE) {
    execFileSync("psql", [base.urlDuenio, "-v", "ON_ERROR_STOP=1", "-q", "-f", archivo], { stdio: ["ignore", "ignore", "pipe"] });
    return;
  }
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    await c.query(readFileSync(archivo, "utf8"));
  } finally {
    await c.end();
  }
}

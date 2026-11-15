// ============================================================================
// GSG-FACT-011 · Tarea B — el cupo, la fecha y el concepto de la emisión AUTOMÁTICA, contra Postgres
// ============================================================================
//
// La emisión automática (el lote del extracto y el aviso/sincronización de Mercado Pago) contaba el
// tope UNA vez, fuera de la transacción de la factura: dos lotes a la vez, o un lote y una emisión
// manual, pasaban los dos con el último lugar. Acá corre el código real con dos (o tres) conexiones:
//   · C3  dos lotes a la vez con un solo lugar → pasa uno.
//   · C4  lote vs. manual con el cupo de Factoque en tope−1 → pasa exactamente una.
//   · C20 Factoque Gratis con 5 emitidas + Mercado Pago automático → ninguna más; el pago a revisión.
//   · C15 aviso de MP + lote + manual a la vez → sin abrazo mortal, las tres salen.
//   · C13 la fecha del lote nunca queda antes de la última factura (la manual de hoy); fuera de la
//         ventana de ARCA, a revisión; con servicios, período y vencimiento.
//   · H8  la referencia de un extracto BANCARIO igual a un id de MP no se ata a la factura de MP.
//
// Deterministas: el reloj se inyecta (`ahora`) y la carrera se arma con un candado de fila que el
// test toma y suelta cuando ve a los dos esperando (pg_locks), sin sleep ni azar.

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { fechaFiscalDelDia, restarDiasFiscal } from "@/lib/libros/fecha-fiscal";
import type { PagoMP } from "@/plugins/mercadopago";

const AHORA = new Date();
const HOY = fechaFiscalDelDia(AHORA);
const laBase = baseEfimeraDelArchivo();

type Negocio = { blueprintId?: string; plan?: string | null; cap?: number | null };

async function preparar(t: TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "5000" });
  delete env.ARCA_INVOICING_ENABLED;
  delete env.ARCA_MODO;
  delete env.MP_ACCESS_TOKEN;
  delete env.MP_MODO_LEGADO;
  env.INTEGRACIONES_MASTER_KEY ??= randomBytes(32).toString("base64");
  const duenio = await prismaComoDuenio(base);
  return { base, duenio };
}

type P = NonNullable<Awaited<ReturnType<typeof preparar>>>;

/** Un negocio NUEVO por escenario: el cupo del mes arranca en cero. */
async function negocio(p: P, n: Negocio = {}) {
  const sufijo = randomUUID().slice(0, 8);
  const t = await p.duenio.tenant.create({
    data: {
      name: `Negocio ${sufijo}`,
      slug: `cupo-${sufijo}`,
      subdomain: `cupo-${sufijo}`,
      arcaCuit: "20111111112",
      arcaPuntoVenta: 1,
      arcaCondicionIva: "MONOTRIBUTO",
      arcaHomologacion: true,
      modules: ["arca"],
      ...(n.blueprintId ? { blueprintId: n.blueprintId } : {}),
      plan: n.plan ?? null,
      bancosCapFacturasMes: n.cap ?? null,
    },
    select: { id: true },
  });
  return t.id;
}

/** Facturas del mes que ya ocupan cupo (no rechazadas, sin comprobante asociado). */
async function sembrarFacturas(p: P, tenantId: string, cuantas: number, fecha = HOY) {
  for (let i = 0; i < cuantas; i++) {
    await p.duenio.invoice.create({
      data: { tenantId, puntoVenta: 1, concepto: 1, docTipo: 99, docNro: "0", fecha, neto: 100, iva: 0, total: 100, status: "PENDING" },
    });
  }
}

async function importacion(p: P, tenantId: string, origen: "banco" | "mercadopago" = "banco") {
  return p.duenio.importacionBancaria.create({
    data: { tenantId, nombreArchivo: `extracto-${randomUUID().slice(0, 6)}.csv`, mapeoJson: {}, origen, archivo: Buffer.from("fecha;monto\n") },
    select: { id: true },
  });
}

async function movimiento(
  p: P,
  tenantId: string,
  importacionId: string,
  m: { monto?: number; fecha?: string; referencia?: string; concepto?: number } = {},
) {
  return p.duenio.movimientoImportado.create({
    data: {
      tenantId,
      importacionId,
      hash: `h-${randomUUID()}`,
      fecha: m.fecha ?? HOY,
      monto: (m.monto ?? 1000).toFixed(2),
      descripcion: "Transferencia recibida",
      referencia: m.referencia ?? null,
      clasificacion: "venta",
      estadoPropuesta: "auto",
      ...(m.concepto ? { concepto: m.concepto } : {}),
    },
    select: { id: true },
  });
}

const cupoUsado = (p: P, tenantId: string) =>
  p.duenio.invoice.count({ where: { tenantId, status: { not: "REJECTED" }, comprobanteAsociadoId: null } });

/**
 * Toma (FOR UPDATE, como dueño) las filas de `ids`, arranca `correr`, espera a ver `esperando`
 * conexiones trabadas en la base y suelta. Así los lotes leen lo que leen ANTES de la carrera.
 */
async function conFilasTomadas<T>(base: BaseEfimera, ids: string[], esperando: number, correr: () => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT 1 FROM "MovimientoImportado" WHERE id = ANY($1) FOR UPDATE`, [ids]);
    let termino = false;
    const enCurso = correr().finally(() => {
      termino = true;
    });
    enCurso.catch(() => undefined);
    let vistos = 0;
    // Tope de espera generoso (la primera corrida compila los módulos); no es un sleep: se sale apenas se ven.
    for (const hasta = Date.now() + 60_000; Date.now() < hasta && vistos < esperando && !termino; ) {
      const r = await c.query(
        `SELECT count(*)::int AS n FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
          WHERE NOT l.granted AND a.datname = current_database() AND l.locktype IN ('transactionid', 'tuple')`,
      );
      vistos = r.rows[0].n;
    }
    if (vistos < esperando) console.log('DIAG', JSON.stringify((await c.query(`SELECT pid, usename, state, wait_event_type, wait_event, left(query, 120) q FROM pg_stat_activity WHERE datname = current_database()`)).rows), JSON.stringify((await c.query(`SELECT locktype, granted, mode, pid FROM pg_locks WHERE NOT granted`)).rows));
    if (termino) await enCurso; // si falló antes de trabarse, que se vea el error
    assert.ok(vistos >= esperando, `esperaba ${esperando} conexiones trabadas en la fila; vi ${vistos}`);
    await c.query("COMMIT");
    return await enCurso;
  } finally {
    await c.end();
  }
}

async function lote(tenantId: string, seleccion: string[] | "auto") {
  const { emitirPropuestas } = await import("@/lib/bancos-glue");
  return emitirPropuestas(tenantId, seleccion, { ahora: AHORA });
}

async function manual(tenantId: string, total = 1000) {
  const { emitirComprobanteManual } = await import("@/lib/facturacion/emision-manual.server");
  const { runInTenantContext } = await import("@/lib/tenant-context");
  return runInTenantContext(tenantId, () =>
    emitirComprobanteManual(
      { tenantId, actor: "user:prueba", revalidar: [] },
      { descripcion: "Venta en el mostrador", total, concepto: "productos" },
    ),
  );
}

const pagoMP = (id: string, monto = 1500, extra: Partial<PagoMP> = {}): PagoMP => ({
  id,
  estado: "approved",
  monto,
  externalReference: "",
  fechaAcreditacion: HOY,
  descripcion: `Cobro ${id}`,
  ...extra,
});

/** El camino automático REAL de Mercado Pago (aviso / sincronización) con una cuenta de prueba. */
async function conectarMP(tenantId: string) {
  const { crearConexion } = await import("@/integraciones/conexiones.server");
  await crearConexion(tenantId, "mercadopago", {
    cuentaExterna: `mp-cupo-${randomUUID().slice(0, 8)}`,
    credenciales: { access_token: `APP_USR-${randomUUID().slice(0, 8)}`, webhook_secret: "secreto" },
    conectadaPor: "cli",
  });
}

async function avisoMP(tenantId: string, pago: PagoMP, opciones: { forzarFacturable?: boolean } = {}) {
  const { crearEntornoReal } = await import("@/lib/mercadopago-auto");
  const { facturarPagoSiCorresponde, StubMercadoPagoClient } = await import("@/plugins/mercadopago");
  const { runInTenantContext } = await import("@/lib/tenant-context");
  const cuenta = new StubMercadoPagoClient();
  cuenta.simularPago(pago);
  return runInTenantContext(tenantId, async () => {
    const { deps, reconciliacion } = await crearEntornoReal(tenantId, { ahora: AHORA });
    reconciliacion.recordarPago(pago);
    const resumen = { leidos: 1, facturados: 0, noFacturables: 0, aRevisar: 0, rechazados: 0, saltados: 0, errores: 0 };
    await facturarPagoSiCorresponde(
      pago,
      {
        ...deps,
        client: cuenta,
        ...(opciones.forzarFacturable ? { clasificador: { clasificar: async () => ({ clasificacion: "FACTURABLE" as const }) } } : {}),
      },
      resumen,
    );
    return resumen;
  });
}

// ── C3 · dos lotes a la vez con UN lugar ──────────────────────────────────────
test("C3 · dos lotes a la vez con un solo lugar en el cupo: pasa uno, el otro queda bloqueado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await negocio(p, { cap: 3 });
  await sembrarFacturas(p, id, 2);
  const imp = await importacion(p, id);
  const m1 = await movimiento(p, id, imp.id);
  const m2 = await movimiento(p, id, imp.id);
  const m3 = await movimiento(p, id, imp.id);
  const m4 = await movimiento(p, id, imp.id);
  const [r1, r2] = await conFilasTomadas(p.base, [m1.id, m3.id], 2, () =>
    Promise.all([lote(id, [m1.id, m2.id]), lote(id, [m3.id, m4.id])]),
  );
  assert.equal(r1.emitidas + r2.emitidas, 1, `emitieron ${r1.emitidas} + ${r2.emitidas} con un solo lugar`);
  assert.equal(await cupoUsado(p, id), 3);
  assert.equal(r1.bloqueadasPorCap + r2.bloqueadasPorCap, 3);
  // Lo bloqueado vuelve a `auto` (se emite el mes próximo o con más cupo), no queda «emitida» sin factura.
  const sinFactura = await p.duenio.movimientoImportado.count({ where: { tenantId: id, estadoPropuesta: "emitida", invoiceId: null } });
  assert.equal(sinFactura, 0);
});

// ── C4 · lote vs. manual en un Factoque con el cupo en tope−1 ───────────────────
test("C4 · Factoque Gratis en 4/5: el lote y la emisión manual a la vez → pasa exactamente una", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await negocio(p, { blueprintId: "facturita", plan: null });
  await sembrarFacturas(p, id, 4);
  const imp = await importacion(p, id);
  const m = await movimiento(p, id, imp.id);
  let respuestaManual: Awaited<ReturnType<typeof manual>> | null = null;
  const r = await conFilasTomadas(p.base, [m.id], 1, async () => {
    const enCurso = lote(id, "auto");
    respuestaManual = await manual(id);
    return enCurso;
  });
  assert.ok(respuestaManual, "la manual contestó");
  const pasaron = r.emitidas + ((respuestaManual as { ok: boolean } | null)?.ok ? 1 : 0);
  assert.equal(pasaron, 1, `pasaron ${pasaron} con un solo lugar (lote ${r.emitidas})`);
  assert.equal(await cupoUsado(p, id), 5);
  assert.equal(r.capAlcanzado, true);
  assert.match(r.mensaje ?? "", /5 por mes/);
});

// ── C20 · Factoque Gratis lleno + Mercado Pago automático ─────────────────────
test("C20 · Factoque Gratis con 5 emitidas: Mercado Pago automático no emite más; el pago va a revisión", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await negocio(p, { blueprintId: "facturita", plan: null });
  await conectarMP(id);
  await sembrarFacturas(p, id, 5);
  const pago = pagoMP(`mp-c20-${randomUUID().slice(0, 6)}`);
  const r = await avisoMP(id, pago);
  assert.equal(r.facturados, 0);
  assert.equal(r.aRevisar, 1);
  assert.equal(await cupoUsado(p, id), 5);
  const mov = await p.duenio.movimientoImportado.findFirst({ where: { tenantId: id, referencia: pago.id }, select: { estadoPropuesta: true } });
  assert.equal(mov?.estadoPropuesta, "revision");
});

test("C20 · el tope bajo el candado: aunque la clasificación lo deje pasar, la factura no sale y el pago va a revisión (no reintento)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await negocio(p, { blueprintId: "facturita", plan: null });
  await conectarMP(id);
  await sembrarFacturas(p, id, 5);
  const pago = pagoMP(`mp-c20b-${randomUUID().slice(0, 6)}`);
  const r = await avisoMP(id, pago, { forzarFacturable: true });
  assert.equal(r.facturados, 0);
  assert.equal(r.errores, 0, "no se trata como fallo transitorio (no se reintenta)");
  assert.equal(r.aRevisar, 1);
  assert.equal(await cupoUsado(p, id), 5);
  const mov = await p.duenio.movimientoImportado.findFirst({
    where: { tenantId: id, referencia: pago.id },
    select: { estadoPropuesta: true, motivoRevision: true },
  });
  assert.equal(mov?.estadoPropuesta, "revision");
  assert.match(mov?.motivoRevision ?? "", /límite|tope/i);
});

// ── C15 · aviso de MP + lote + manual a la vez ─────────────────────────────────
test("C15 · aviso de MP, lote y emisión manual a la vez: sin abrazo mortal, las tres salen", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await negocio(p, { blueprintId: "facturita", plan: "factoque-plus" });
  await conectarMP(id);
  const imp = await importacion(p, id);
  for (let ronda = 0; ronda < 3; ronda++) {
    await movimiento(p, id, imp.id, { monto: 2000 + ronda });
    const pago = pagoMP(`mp-c15-${randomUUID().slice(0, 6)}`, 3000 + ronda);
    const [aviso, l, m] = await Promise.all([avisoMP(id, pago, { forzarFacturable: true }), lote(id, "auto"), manual(id, 4000 + ronda)]);
    assert.equal(aviso.facturados, 1, `ronda ${ronda}: aviso ${JSON.stringify(aviso)}`);
    assert.equal(l.emitidas, 1, `ronda ${ronda}: lote ${JSON.stringify(l)}`);
    assert.ok(m.ok, `ronda ${ronda}: manual ${JSON.stringify(m)}`);
  }
  assert.equal(await cupoUsado(p, id), 9);
});

// ── C13 · la fecha del lote y la ventana de ARCA ───────────────────────────────
test("C13 · el lote nunca fecha antes de la última factura del punto de venta (la manual de hoy)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await negocio(p);
  const m = await manual(id);
  assert.ok(m.ok, JSON.stringify(m));
  const fechaManual = (await p.duenio.invoice.findUniqueOrThrow({ where: { id: m.invoiceId }, select: { fecha: true } })).fecha;
  const imp = await importacion(p, id);
  const mov = await movimiento(p, id, imp.id, { fecha: restarDiasFiscal(HOY, 2) });
  const r = await lote(id, "auto");
  assert.equal(r.emitidas, 1);
  const fila = await p.duenio.movimientoImportado.findUniqueOrThrow({ where: { id: mov.id }, select: { invoiceId: true } });
  const f = await p.duenio.invoice.findUniqueOrThrow({ where: { id: fila.invoiceId! }, select: { fecha: true } });
  assert.ok(f.fecha >= fechaManual, `la factura del lote (${f.fecha}) quedó antes de la manual (${fechaManual})`);
});

test("C13 · movimiento fuera de la ventana de ARCA → revisión con motivo; con servicios (10 días) sale con período y vencimiento", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await negocio(p);
  const imp = await importacion(p, id);
  const viejo = await movimiento(p, id, imp.id, { fecha: restarDiasFiscal(HOY, 7) });
  const servicio = await movimiento(p, id, imp.id, { fecha: restarDiasFiscal(HOY, 7), concepto: 2 });
  const r = await lote(id, "auto");
  assert.equal(r.emitidas, 1, JSON.stringify(r));
  const v = await p.duenio.movimientoImportado.findUniqueOrThrow({ where: { id: viejo.id }, select: { estadoPropuesta: true, motivoRevision: true, invoiceId: true } });
  assert.equal(v.estadoPropuesta, "revision");
  assert.equal(v.invoiceId, null);
  assert.match(v.motivoRevision ?? "", /ARCA/);
  const s = await p.duenio.movimientoImportado.findUniqueOrThrow({ where: { id: servicio.id }, select: { invoiceId: true } });
  const f = await p.duenio.invoice.findUniqueOrThrow({ where: { id: s.invoiceId! }, select: { concepto: true, fecha: true } });
  assert.equal(f.concepto, 2);
  const envio = await p.duenio.outboxEvent.findFirstOrThrow({ where: { tenantId: id, payload: { path: ["invoiceId"], equals: s.invoiceId! } }, select: { payload: true } });
  const pl = envio.payload as { servicioDesde?: string; servicioHasta?: string; vencimientoPago?: string; fecha: string };
  const cobro = restarDiasFiscal(HOY, 7);
  assert.equal(pl.servicioDesde, `${cobro.slice(0, 6)}01`);
  assert.ok(pl.servicioHasta && pl.servicioHasta.slice(0, 6) === cobro.slice(0, 6));
  assert.ok(pl.vencimientoPago && pl.vencimientoPago >= pl.fecha && pl.vencimientoPago >= cobro);
});

// ── H8 · la referencia bancaria no es un id de Mercado Pago ────────────────────
test("H8 · un extracto BANCARIO con referencia igual a un id de MP no se ata a la factura de ese pago (ni al revés)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await negocio(p);
  const { facturarPagoMP } = await import("@/lib/invoice-from-mp");
  const { runInTenantContext } = await import("@/lib/tenant-context");
  // 1. El pago de MP «123» se factura; después llega un crédito del BANCO con referencia «123».
  const ref = `${Date.now() % 1_000_000}`;
  const deMP = await runInTenantContext(id, () => facturarPagoMP(pagoMP(ref), id));
  assert.ok(deMP);
  const imp = await importacion(p, id, "banco");
  const mov = await movimiento(p, id, imp.id, { referencia: ref, monto: 800 });
  const r = await lote(id, "auto");
  assert.equal(r.yaFacturadas ?? 0, 0, "una referencia bancaria no es el id del pago de MP");
  assert.equal(r.emitidas, 1);
  const fila = await p.duenio.movimientoImportado.findUniqueOrThrow({ where: { id: mov.id }, select: { invoiceId: true } });
  assert.notEqual(fila.invoiceId, deMP);
  // 2. Al revés: un crédito del banco con referencia «456» facturado; el aviso del pago de MP «456» factura el suyo.
  const ref2 = `${(Date.now() + 1) % 1_000_000}9`;
  const mov2 = await movimiento(p, id, imp.id, { referencia: ref2, monto: 900 });
  await lote(id, "auto");
  const delBanco = (await p.duenio.movimientoImportado.findUniqueOrThrow({ where: { id: mov2.id }, select: { invoiceId: true } })).invoiceId;
  assert.ok(delBanco);
  const propio = await runInTenantContext(id, () => facturarPagoMP(pagoMP(ref2, 900), id));
  assert.ok(propio && propio !== delBanco, "el pago de MP no se ata a la factura de un crédito bancario");
});

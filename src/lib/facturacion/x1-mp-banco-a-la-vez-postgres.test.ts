// GSG-FACT-011 · X1 (certificación final, plata): el lote de un extracto «banco» con la referencia de un
// pago de MP y el aviso / la sincronización del MISMO pago facturan con claves distintas (`banco:<hash>` y
// `mp:<id>`): el índice único no los arbitra. Los dos repiten su mirada bajo el candado del cupo
// (`facturarCobros(…, { facturaPrevia })`) y el segundo ATA en vez de emitir.
//   node --import tsx --test src/lib/facturacion/x1-mp-banco-a-la-vez-postgres.test.ts | grep -E "^# (pass|fail)|^not ok"

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
      // Las conexiones de la app (app_rls) no se ven en pg_stat_activity desde el dueño: se cuentan
      // las que esperan a ESTA conexión (pg_blocking_pids), sin mirar otras bases del servidor.
      const r = await c.query(
        `SELECT count(DISTINCT l.pid)::int AS n FROM pg_locks l
          WHERE NOT l.granted AND pg_backend_pid() = ANY(pg_blocking_pids(l.pid))`,
      );
      vistos = r.rows[0].n;
    }
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

async function avisoMP(tenantId: string, pago: PagoMP, opciones: { forzarFacturable?: boolean; respaldo?: boolean } = {}) {
  const { crearEntornoReal } = await import("@/lib/mercadopago-auto");
  const { facturarPagoSiCorresponde, StubMercadoPagoClient } = await import("@/plugins/mercadopago");
  const { runInTenantContext } = await import("@/lib/tenant-context");
  const cuenta = new StubMercadoPagoClient();
  cuenta.simularPago(pago);
  return runInTenantContext(tenantId, async () => {
    const { deps, reconciliacion } = await crearEntornoReal(tenantId, { ahora: AHORA });
    reconciliacion.recordarPago(pago);
    const resumen = { leidos: 1, facturados: 0, noFacturables: 0, aRevisar: 0, rechazados: 0, saltados: 0, errores: 0 };
    const depsDelTest = {
      ...deps,
      client: cuenta,
      ...(opciones.forzarFacturable ? { clasificador: { clasificar: async () => ({ clasificacion: "FACTURABLE" as const, motivo: "forzado por el test" }) } } : {}),
    };
    // El respaldo (sincronización) pasa por el mismo `deps.facturar`, paginando la cuenta.
    if (opciones.respaldo) {
      const { sincronizarPagos } = await import("@/plugins/mercadopago");
      return sincronizarPagos(depsDelTest, {});
    }
    await facturarPagoSiCorresponde(pago, depsDelTest, resumen);
    return resumen;
  });
}



/** Toma el candado del cupo desde afuera, corre `correr`, espera `esperando` conexiones trabadas y suelta. */
async function conCupoTomado<T>(base: BaseEfimera, tenantId: string, esperando: number, correr: () => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    await c.query("SELECT pg_advisory_lock(hashtext($1))", [`facturita-cupo:${tenantId}`]);
    let termino = false;
    const enCurso = correr().finally(() => { termino = true; });
    enCurso.catch(() => undefined);
    let vistos = 0;
    for (const hasta = Date.now() + 60_000; Date.now() < hasta && vistos < esperando && !termino; ) {
      const r = await c.query(`SELECT count(DISTINCT l.pid)::int AS n FROM pg_locks l WHERE NOT l.granted AND pg_backend_pid() = ANY(pg_blocking_pids(l.pid))`);
      vistos = r.rows[0].n;
    }
    if (termino) await enCurso;
    assert.ok(vistos >= esperando, `esperaba ${esperando} trabadas; vi ${vistos}`);
    await c.query("SELECT pg_advisory_unlock(hashtext($1))", [`facturita-cupo:${tenantId}`]);
    return await enCurso;
  } finally {
    await c.end();
  }
}

// ── X1 · R8 a la vez: export de MP reconocido como banco + aviso del mismo pago, en paralelo ──
test("X1 · lote del export de MP (origen banco) y aviso del mismo pago A LA VEZ: una sola factura", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await negocio(p);
  await conectarMP(id);
  const ref = `${(Date.now() + 31) % 1_000_000_000}`;
  const imp = await importacion(p, id, "banco");
  await movimiento(p, id, imp.id, { referencia: ref, monto: 1500 });
  const [r1, r2] = await conCupoTomado(p.base, id, 2, () =>
    Promise.all([lote(id, "auto"), avisoMP(id, pagoMP(ref, 1500), { forzarFacturable: true })]),
  );
  const facturas = await p.duenio.invoice.count({ where: { tenantId: id, status: { not: "REJECTED" } } });
  assert.equal(facturas, 1, `mismo pago de MP, ${facturas} facturas (lote ${JSON.stringify(r1)}, aviso ${JSON.stringify(r2)})`);
});

/**
 * Toma el candado del cupo y arranca los caminos EN ORDEN: cada uno después de ver trabado al anterior
 * (la fila de espera del candado es FIFO), así el primero factura y el segundo lo encuentra bajo el candado.
 */
async function conCupoEnFila<T>(base: BaseEfimera, tenantId: string, caminos: (() => Promise<T>)[]): Promise<T[]> {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    await c.query("SELECT pg_advisory_lock(hashtext($1))", [`facturita-cupo:${tenantId}`]);
    const enCurso: Promise<T>[] = [];
    let terminados = 0;
    for (const [i, camino] of caminos.entries()) {
      const p = camino().finally(() => { terminados++; });
      p.catch(() => undefined);
      enCurso.push(p);
      let vistos = 0;
      for (const hasta = Date.now() + 60_000; Date.now() < hasta && vistos < i + 1 && terminados === 0; ) {
        const r = await c.query(`SELECT count(DISTINCT l.pid)::int AS n FROM pg_locks l WHERE NOT l.granted AND pg_backend_pid() = ANY(pg_blocking_pids(l.pid))`);
        vistos = r.rows[0].n;
      }
      if (terminados > 0) await Promise.all(enCurso);
      assert.ok(vistos >= i + 1, `esperaba ${i + 1} trabadas; vi ${vistos}`);
    }
    await c.query("SELECT pg_advisory_unlock(hashtext($1))", [`facturita-cupo:${tenantId}`]);
    return await Promise.all(enCurso);
  } finally {
    await c.end();
  }
}

async function escenario(p: P) {
  const id = await negocio(p);
  await conectarMP(id);
  const ref = `${randomUUID().replace(/\D/g, "").slice(0, 9) || "123456789"}`;
  const imp = await importacion(p, id, "banco");
  const mov = await movimiento(p, id, imp.id, { referencia: ref, monto: 1500 });
  return { id, ref, movId: mov.id };
}

const vivas = (p: P, tenantId: string) => p.duenio.invoice.findMany({ where: { tenantId, status: { not: "REJECTED" } }, select: { id: true } });

/** Una factura viva, y el movimiento y el cobro `mp:<ref>` atados a ELLA. */
async function unaSolaYAtada(p: P, e: { id: string; ref: string; movId: string }, contexto: string) {
  const v = await vivas(p, e.id);
  assert.equal(v.length, 1, `${contexto}: ${v.length} facturas vivas`);
  const mov = await p.duenio.movimientoImportado.findUnique({ where: { id: e.movId }, select: { invoiceId: true } });
  assert.equal(mov?.invoiceId, v[0].id, `${contexto}: el movimiento no quedó atado a la factura viva`);
  const cobroMP = await p.duenio.cobroFacturado.findFirst({ where: { tenantId: e.id, clave: `mp:${e.ref}` }, select: { invoiceId: true } });
  assert.equal(cobroMP?.invoiceId, v[0].id, `${contexto}: el cobro de MP no quedó atado a la factura viva`);
}

test("X1 · en fila: el LOTE factura primero y el aviso, ya bajo el candado, se ata a esa factura", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const e = await escenario(p);
  const [rLote] = await conCupoEnFila<unknown>(p.base, e.id, [
    () => lote(e.id, "auto"),
    () => avisoMP(e.id, pagoMP(e.ref, 1500), { forzarFacturable: true }),
  ]);
  assert.equal((rLote as { emitidas: number }).emitidas, 1);
  await unaSolaYAtada(p, e, "lote → aviso");
});

test("X1 · en fila: el AVISO factura primero y el lote, ya bajo el candado, se ata (no cuenta como emitida)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const e = await escenario(p);
  const [, rLote] = await conCupoEnFila<unknown>(p.base, e.id, [
    () => avisoMP(e.id, pagoMP(e.ref, 1500), { forzarFacturable: true }),
    () => lote(e.id, "auto"),
  ]);
  assert.equal((rLote as { emitidas: number }).emitidas, 0, `el lote no emitió: se ató (${JSON.stringify(rLote)})`);
  await unaSolaYAtada(p, e, "aviso → lote");
});

test("X1 · el RESPALDO (sincronización) y el lote, en fila los dos órdenes: una sola factura", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  for (const primero of ["lote", "respaldo"] as const) {
    const e = await escenario(p);
    const respaldo = () => avisoMP(e.id, pagoMP(e.ref, 1500), { forzarFacturable: true, respaldo: true });
    const delLote = () => lote(e.id, "auto");
    await conCupoEnFila<unknown>(p.base, e.id, primero === "lote" ? [delLote, respaldo] : [respaldo, delLote]);
    await unaSolaYAtada(p, e, `${primero} primero (respaldo)`);
  }
});

test("X1 · con la factura del pago RECHAZADA (no cuenta): lote y aviso a la vez emiten UNA viva nueva", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  for (const primero of ["lote", "aviso"] as const) {
    const id = await negocio(p);
    await conectarMP(id);
    const ref = `${randomUUID().replace(/\D/g, "").slice(0, 9) || "987654321"}`;
    // El aviso facturó antes y esa factura quedó RECHAZADA por ARCA (sin CAE): el cobro `mp:<ref>`
    // apunta a ella. Se siembra el estado (el simulador de ARCA aprueba, y con CAE no se edita).
    const rechazada = await p.duenio.invoice.create({
      data: { tenantId: id, puntoVenta: 1, concepto: 1, docTipo: 99, docNro: "0", fecha: HOY, neto: 1500, iva: 0, total: 1500, status: "REJECTED" },
      select: { id: true },
    });
    await p.duenio.cobroFacturado.create({ data: { tenantId: id, clave: `mp:${ref}`, invoiceId: rechazada.id, importe: 1500 } });
    const imp = await importacion(p, id, "banco");
    const mov = await movimiento(p, id, imp.id, { referencia: ref, monto: 1500 });
    const aviso = () => avisoMP(id, pagoMP(ref, 1500), { forzarFacturable: true });
    const delLote = () => lote(id, "auto");
    await conCupoEnFila<unknown>(p.base, id, primero === "lote" ? [delLote, aviso] : [aviso, delLote]);
    await unaSolaYAtada(p, { id, ref, movId: mov.id }, `rechazada, ${primero} primero`);
  }
});


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

// ───────────── Certificador X1 ─────────────

async function turno(p: P, tenantId: string) {
  const cli = await p.duenio.client.create({ data: { tenantId, name: "Ana", phone: `11${Date.now() % 100000000}` }, select: { id: true } });
  const box = await p.duenio.box.create({ data: { tenantId, name: `Gab ${randomUUID().slice(0, 4)}` }, select: { id: true } });
  const prof = await p.duenio.professional.create({ data: { tenantId, name: "Lucía" }, select: { id: true } });
  const serv = await p.duenio.service.create({ data: { tenantId, name: "Facial", durationMin: 60, price: 1500 }, select: { id: true } });
  const a = await p.duenio.appointment.create({
    data: {
      tenantId, clientId: cli.id, professionalId: prof.id, serviceId: serv.id, boxId: box.id,
      startsAt: new Date(Date.now() - 2 * 3600_000), endsAt: new Date(Date.now() - 3600_000), status: "COMPLETED", priceAtBooking: 1500,
    },
    select: { id: true },
  });
  return a.id;
}

async function avisoMPDelTurno(tenantId: string, appointmentId: string, pago: PagoMP) {
  const { facturarCobroMPDelTurno } = await import("@/lib/invoice-from-appointment");
  const { runInTenantContext } = await import("@/lib/tenant-context");
  return runInTenantContext(tenantId, () => facturarCobroMPDelTurno(appointmentId, tenantId, pago));
}

/** Traba la fila del turno (como el candado del turno), arranca `primero`, espera verlo trabado, corre `mientras` y suelta. */
async function conTurnoTomado<T, U>(base: BaseEfimera, appointmentId: string, primero: () => Promise<T>, mientras: () => Promise<U>) {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT 1 FROM "Appointment" WHERE id = $1 FOR UPDATE`, [appointmentId]);
    let termino = false;
    const enCurso = primero().finally(() => { termino = true; });
    enCurso.catch(() => undefined);
    let vistos = 0;
    for (const hasta = Date.now() + 60_000; Date.now() < hasta && vistos < 1 && !termino; ) {
      const r = await c.query(`SELECT count(DISTINCT l.pid)::int AS n FROM pg_locks l WHERE NOT l.granted AND pg_backend_pid() = ANY(pg_blocking_pids(l.pid))`);
      vistos = r.rows[0].n;
    }
    if (termino) await enCurso;
    assert.ok(vistos >= 1, "el aviso del turno no llegó a trabarse en el turno");
    const r2 = await mientras();
    await c.query("COMMIT");
    return [await enCurso, r2] as const;
  } finally {
    await c.end();
  }
}

test("CERT X1-T · pago de MP de un TURNO trabado en su turno + lote del extracto banco del mismo pago: una sola factura", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await negocio(p);
  await conectarMP(id);
  const ref = `${randomUUID().replace(/\D/g, "").slice(0, 9) || "555666777"}`;
  const turnoId = await turno(p, id);
  const imp = await importacion(p, id, "banco");
  const mov = await movimiento(p, id, imp.id, { referencia: ref, monto: 1500 });
  const [rAviso, rLote] = await conTurnoTomado(p.base, turnoId, () => avisoMPDelTurno(id, turnoId, pagoMP(ref, 1500)), () => lote(id, "auto"));
  const v = await p.duenio.invoice.findMany({ where: { tenantId: id, status: { not: "REJECTED" } }, select: { id: true, appointmentId: true } });
  const m = await p.duenio.movimientoImportado.findUnique({ where: { id: mov.id }, select: { invoiceId: true } });
  assert.equal(v.length, 1, `mismo pago de MP del turno: ${v.length} facturas vivas (aviso ${rAviso}, lote ${JSON.stringify(rLote)}, mov→${m?.invoiceId})`);
});

test("CERT X1-T control · el aviso del turno termina ANTES del lote: el lote se ata", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await negocio(p);
  await conectarMP(id);
  const ref = `${randomUUID().replace(/\D/g, "").slice(0, 9) || "555666778"}`;
  const turnoId = await turno(p, id);
  const imp = await importacion(p, id, "banco");
  await movimiento(p, id, imp.id, { referencia: ref, monto: 1500 });
  await avisoMPDelTurno(id, turnoId, pagoMP(ref, 1500));
  const r = await lote(id, "auto");
  const v = await p.duenio.invoice.count({ where: { tenantId: id, status: { not: "REJECTED" } } });
  assert.equal(v, 1, `secuencial: ${v} facturas (lote ${JSON.stringify(r)})`);
});

test("CERT X1-2P · dos pagos de MP del mismo importe y día + un crédito de banco con la referencia de UNO, todo a la vez: 2 facturas, el banco atado al suyo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await negocio(p);
  await conectarMP(id);
  const base9 = Number(randomUUID().replace(/\D/g, "").slice(0, 8) || "12345678");
  const refA = `${base9}1`, refB = `${base9}2`;
  const imp = await importacion(p, id, "banco");
  const mov = await movimiento(p, id, imp.id, { referencia: refA, monto: 1500 });
  await conCupoTomado(p.base, id, 3, () =>
    Promise.all([
      avisoMP(id, pagoMP(refB, 1500), { forzarFacturable: true }),
      lote(id, "auto"),
      avisoMP(id, pagoMP(refA, 1500), { forzarFacturable: true }),
    ]),
  );
  const v = await p.duenio.invoice.count({ where: { tenantId: id, status: { not: "REJECTED" } } });
  assert.equal(v, 2, `${v} facturas vivas (esperaba 2: A y B)`);
  const m = await p.duenio.movimientoImportado.findUnique({ where: { id: mov.id }, select: { invoiceId: true } });
  const a = await p.duenio.cobroFacturado.findFirst({ where: { tenantId: id, clave: `mp:${refA}` }, select: { invoiceId: true } });
  const b = await p.duenio.cobroFacturado.findFirst({ where: { tenantId: id, clave: `mp:${refB}` }, select: { invoiceId: true } });
  assert.equal(m?.invoiceId, a?.invoiceId, "el banco quedó atado al pago A");
  assert.notEqual(a?.invoiceId, b?.invoiceId, "A y B no comparten factura");
});

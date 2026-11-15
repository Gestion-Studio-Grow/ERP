// GSG-FACT-011 · certificación plata/fiscal (vuelta 3): H4 en Mercado Pago (F1, F2, F4) y H8/R8 (F3, F3b, F3c).
//   node --import tsx --test src/lib/facturacion/certif-fact011-postgres.test.ts | grep -E "^# (pass|fail)|^not ok"

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
        ...(opciones.forzarFacturable ? { clasificador: { clasificar: async () => ({ clasificacion: "FACTURABLE" as const, motivo: "forzado por el test" }) } } : {}),
      },
      resumen,
    );
    return resumen;
  });
}


// ── F1 · H4 no cubre Mercado Pago: el aviso fecha ANTES de la última factura del punto de venta ──
test("F1 · MP automático después de una manual de hoy: la factura de MP no puede quedar con fecha anterior", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await negocio(p);
  await conectarMP(id);
  const m = await manual(id);
  assert.ok(m.ok, JSON.stringify(m));
  const fechaManual = (await p.duenio.invoice.findUniqueOrThrow({ where: { id: (m as { invoiceId: string }).invoiceId }, select: { fecha: true } })).fecha;
  const pago = pagoMP(`mp-f1-${randomUUID().slice(0, 6)}`, 1500, { fechaAcreditacion: restarDiasFiscal(HOY, 2) });
  const r = await avisoMP(id, pago, { forzarFacturable: true });
  assert.equal(r.facturados, 1, JSON.stringify(r));
  const f = await p.duenio.invoice.findFirstOrThrow({ where: { tenantId: id, total: 1500 }, select: { fecha: true } });
  assert.ok(f.fecha >= fechaManual, `la factura de MP (${f.fecha}) quedó antes de la manual (${fechaManual}): ARCA la rechaza`);
});

// ── F2 · ventana de ARCA en la sincronización de MP ───────────────────────────
test("F2 · pago de MP de hace 20 días (sincronización): no debe emitirse solo fuera de la ventana de ARCA", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await negocio(p);
  await conectarMP(id);
  const pago = pagoMP(`mp-f2-${randomUUID().slice(0, 6)}`, 1700, { fechaAcreditacion: restarDiasFiscal(HOY, 20) });
  const r = await avisoMP(id, pago, { forzarFacturable: true });
  const f = await p.duenio.invoice.findFirst({ where: { tenantId: id, total: 1700 }, select: { fecha: true } });
  assert.equal(f, null, `se emitió con fecha ${f?.fecha} (hoy ${HOY}), fuera de la ventana de 5 días; resumen ${JSON.stringify(r)}`);
});

// ── F3 · H8: un export de MP que no calza exacto con la plantilla queda como «banco» ──────────
test("F3 · export de MP con una columna extra: mapeado como banco, y el lote factura OTRA VEZ un pago ya facturado por el aviso", async (t) => {
  const { mapearColumnas } = await import("@/plugins/bancos/domain/mapeador");
  const matriz = [
    ["Fecha", "Descripción", "ID de la operación", "Contraparte", "Monto", "Saldo", "Estado"],
    ["10/11/2026", "Cobro con QR", "123456789", "Juan", "1500,00", "1500,00", "Aprobado"],
  ];
  const mapeo = mapearColumnas(matriz as never);
  assert.ok(mapeo, "se mapea");
  assert.ok(mapeo!.columnas.referencia !== undefined, "la columna del id de la operación queda como referencia");
  const origenDetectado = mapeo!.origen;

  const p = await preparar(t);
  if (!p) return;
  const id = await negocio(p);
  await conectarMP(id);
  const ref = `${Date.now() % 1_000_000_000}`;
  const r1 = await avisoMP(id, pagoMP(ref, 1500), { forzarFacturable: true });
  assert.equal(r1.facturados, 1);
  const imp = await importacion(p, id, origenDetectado);
  await movimiento(p, id, imp.id, { referencia: ref, monto: 1500 });
  const r2 = await lote(id, "auto");
  const facturas = await p.duenio.invoice.count({ where: { tenantId: id, status: { not: "REJECTED" } } });
  assert.equal(facturas, 1, `origen detectado «${origenDetectado}»: dos facturas para el mismo pago de MP (lote ${JSON.stringify(r2)})`);
});

// ── F3b · H8 al revés: el lote factura primero el export de MP mal reconocido; después llega el aviso ──
test("F3b · export de MP reconocido como banco, facturado por el lote: el aviso del mismo pago no factura otra vez", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await negocio(p);
  await conectarMP(id);
  const ref = `${(Date.now() + 7) % 1_000_000_000}`;
  const imp = await importacion(p, id, "banco");
  await movimiento(p, id, imp.id, { referencia: ref, monto: 1500 });
  const r1 = await lote(id, "auto");
  assert.equal(r1.emitidas, 1, JSON.stringify(r1));
  const r2 = await avisoMP(id, pagoMP(ref, 1500), { forzarFacturable: true });
  const facturas = await p.duenio.invoice.count({ where: { tenantId: id, status: { not: "REJECTED" } } });
  assert.equal(facturas, 1, `dos facturas para el mismo pago (aviso ${JSON.stringify(r2)})`);
});

// ── F3c · H8 sin falsos positivos: una transferencia de banco cuya referencia choca con un pago de MP ──
test("F3c · referencia de banco igual a un pago de MP pero con OTRO importe: es otra venta y se factura", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await negocio(p);
  await conectarMP(id);
  const ref = `${(Date.now() + 13) % 1_000_000_000}`;
  const r1 = await avisoMP(id, pagoMP(ref, 1500), { forzarFacturable: true });
  assert.equal(r1.facturados, 1);
  const imp = await importacion(p, id, "banco");
  await movimiento(p, id, imp.id, { referencia: ref, monto: 2300 });
  const r2 = await lote(id, "auto");
  assert.equal(r2.emitidas, 1, JSON.stringify(r2));
  assert.equal(await p.duenio.invoice.count({ where: { tenantId: id, status: { not: "REJECTED" } } }), 2);
});

// ── F4 · fecha futura en Mercado Pago: no se emite sola ──
test("F4 · pago de MP con fecha posterior a hoy: va a revisión", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await negocio(p);
  await conectarMP(id);
  const manana = fechaFiscalDelDia(new Date(AHORA.getTime() + 2 * 86_400_000));
  const r = await avisoMP(id, pagoMP(`mp-f4-${randomUUID().slice(0, 6)}`, 1900, { fechaAcreditacion: manana }), { forzarFacturable: true });
  assert.equal(r.aRevisar, 1, JSON.stringify(r));
  assert.equal(await p.duenio.invoice.count({ where: { tenantId: id, total: 1900 } }), 0);
});

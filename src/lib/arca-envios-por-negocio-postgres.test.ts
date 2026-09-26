// ============================================================================
// ENG-012 · Cada negocio procesa sólo sus propios envíos a ARCA, contra Postgres real con RLS.
// ============================================================================
//
// Con `OPERATOR_DATABASE_URL` apuntando al rol dueño (el caso medido en la auditoría: esa
// conexión ve los envíos de TODOS los negocios), la acción "Procesar facturación pendiente" del
// panel de A se ejecuta TAL CUAL (Server Action real, sesión real de la dueña de A, ARCA en modo
// simulado por defecto). Antes tomaba también los envíos de B y los contaba en el resumen de A.
//
// El arnés conecta la consola como en producción (`app_rls`); este test la pone a propósito como
// dueño, el peor caso: el aislamiento de la acción no puede depender de que la consola no vea.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, {
    NODE_ENV: "development",
    DB_CONNECTION_LIMIT: "2",
    DB_CONNECT_TIMEOUT_MS: "3000",
    ARCA_MODO: "", // simulado (stub): lo que se mide es qué envíos se toman, no ARCA
    OPERATOR_DATABASE_URL: base.urlDuenio, // el peor caso: la consola ve todos los negocios
  });
  prepararAccionesDeServidor();
  const { operatorPrisma } = await import("@/lib/operator-db");
  const [rol] = await operatorPrisma.$queryRaw<{ duenio: boolean }[]>`
    SELECT pg_has_role(current_user, c.relowner, 'USAGE') AS duenio FROM pg_class AS c WHERE c.oid = '"OutboxEvent"'::regclass`;
  assert.equal(rol?.duenio, true, "la consola es el rol dueño: ve todos los negocios");
  const duenio = await prismaComoDuenio(base);
  const invoiceCore = await import("@/lib/invoice-core");
  const facturacion = await import("@/lib/facturacion-actions");
  await duenio.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });

  let venta = 0;
  const facturar = (tenantId: string) =>
    invoiceCore.createInvoice({
      tenantId,
      concepto: 1,
      fecha: "20260924",
      emisor: { cuit: 20111111112, condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: 1000,
      iva: [{ alicuotaId: 5, base: 1000, importe: 210 }],
      total: 1210,
      ivaPorProducto: true, // ENG-024: IVA de cada producto; sin esto un inscripto no emite.
      vencimientoPago: "20260924",
      origin: { type: "MP_PAYMENT" as const, id: `mp_eng012_${++venta}` },
    });
  const enviosDe = (tenantId: string) =>
    duenio.outboxEvent.findMany({
      where: { tenantId },
      orderBy: { id: "asc" },
      select: { id: true, attempts: true, lastError: true, processedAt: true, payload: true },
    });
  /** Los pendientes de un negocio, contados como dueño (ve todos): la verdad contra la que va `quedan`. */
  const pendientesDe = (tenantId: string) => duenio.invoice.count({ where: { tenantId, status: "PENDING" } });
  return { base, duenio, facturacion, facturar, enviosDe, pendientesDe };
}

test("ENG-012 · la acción de A procesa sólo los envíos de A: los de B quedan intactos y el resumen cuenta sólo los de A", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const [a, b] = [p.base.a, p.base.b];
  // Uno de A y dos de B. (Con ARCA simulado por defecto, cada envío arma un simulador nuevo; desde
  // el arreglo del QA del 26/09 sigue la numeración guardada del negocio, así que el segundo envío
  // de B ya no choca con el primero.)
  const deA = [await p.facturar(a.id)];
  const deB = [await p.facturar(b.id), await p.facturar(b.id)];
  const enviosDeBAntes = await p.enviosDe(b.id);

  const r = await ejecutarAccion({ negocio: a, usuario: a.duenia }, () => p.facturacion.procesarFacturacionPendiente());
  assert.equal(r.tipo, "respuesta");
  if (r.tipo !== "respuesta") return;
  // `quedan: 0` con 2 pendientes de B: lo que le queda a A no cuenta nada de B.
  assert.deepEqual(r.valor, { procesados: 1, autorizados: 1, rechazados: 0, fallidos: 0, descartados: 0, quedan: 0, conErrorDelSistema: [] });
  assert.equal(await p.pendientesDe(b.id), 2, "B tenía pendientes mientras A contaba los suyos");

  assert.deepEqual(await p.enviosDe(b.id), enviosDeBAntes, "intentos, error, fecha de proceso y payload de B sin cambio");
  for (const id of deB) {
    assert.equal((await p.duenio.invoice.findUniqueOrThrow({ where: { id } })).status, "PENDING");
  }
  for (const id of deA) {
    assert.equal((await p.duenio.invoice.findUniqueOrThrow({ where: { id } })).status, "AUTHORIZED");
  }

  // Y al revés: la acción de B toma el suyo y nada de A.
  const enviosDeAAntes = await p.enviosDe(a.id);
  const rb = await ejecutarAccion({ negocio: b, usuario: b.duenia }, () => p.facturacion.procesarFacturacionPendiente());
  assert.equal(rb.tipo, "respuesta");
  if (rb.tipo !== "respuesta") return;
  // El resumen de B cuenta sus dos envíos y nada más: los dos autorizados, con números 1 y 2.
  assert.equal(rb.valor.autorizados, 2);
  assert.equal(rb.valor.procesados + rb.valor.fallidos + rb.valor.descartados, 2);
  const numerosDeB = await Promise.all(deB.map(async (id) => (await p.duenio.invoice.findUniqueOrThrow({ where: { id } })).numero));
  assert.deepEqual(numerosDeB.sort(), [1, 2], "correlativos, sin repetir el 1");
  // Lo que le queda a B son SUS pendientes, y lo que falló por error nuestro son SUS envíos.
  assert.equal(rb.valor.quedan, await p.pendientesDe(b.id));
  const idsDeB = new Set((await p.enviosDe(b.id)).map((e) => e.id));
  assert.equal(rb.valor.conErrorDelSistema.length, rb.valor.fallidos, "con ARCA simulado, toda falla es nuestra (la base), no de ARCA");
  for (const id of rb.valor.conErrorDelSistema) assert.ok(idsDeB.has(id), "sólo envíos de B");
  assert.deepEqual(await p.enviosDe(a.id), enviosDeAAntes);
  await p.duenio.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });
});

test("ENG-012 · la acción de A no toma un envío de B aunque sea el único pendiente (0 procesados, B sin intentos)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const [a, b] = [p.base.a, p.base.b];
  await p.facturar(b.id);
  const antes = await p.enviosDe(b.id);
  const r = await ejecutarAccion({ negocio: a, usuario: a.duenia }, () => p.facturacion.procesarFacturacionPendiente());
  assert.equal(r.tipo, "respuesta");
  if (r.tipo !== "respuesta") return;
  assert.deepEqual(r.valor, { procesados: 0, autorizados: 0, rechazados: 0, fallidos: 0, descartados: 0, quedan: 0, conErrorDelSistema: [] });
  assert.deepEqual(await p.enviosDe(b.id), antes);
  // Pedir que saltee un envío de B no le da nada sobre B ni lo toca (sólo excluye, dentro de A).
  const conIdDeB = await ejecutarAccion({ negocio: a, usuario: a.duenia }, () => p.facturacion.procesarFacturacionPendiente(antes.map((e) => e.id)));
  assert.equal(conIdDeB.tipo, "respuesta");
  if (conIdDeB.tipo !== "respuesta") return;
  assert.deepEqual(conIdDeB.valor, r.valor);
  assert.deepEqual(await p.enviosDe(b.id), antes);
  await p.duenio.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });
});

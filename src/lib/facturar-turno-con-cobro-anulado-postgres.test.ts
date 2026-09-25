// ============================================================================
// ENG-023 · Del lado de la factura, turno: facturar y anular el cobro a la vez (contra Postgres)
// ============================================================================
//
// La anulación del cobro de un turno ya rechaza el turno con factura autorizada o en camino
// (porción 2). Faltaba la carrera: `anularCobroTurnoInTx` corre en Serializable sobre una foto
// anterior y la facturación del turno (`createInvoiceInTx`, origen APPOINTMENT) no tocaba el
// turno, así que las dos podían terminar: cobro devuelto y factura viva. Además, el monto se leía
// fuera de la transacción (`facturarAppointment`), así que la facturación no se enteraba de un
// cobro anulado mientras esperaba.
// Ahora:
//   · la facturación escribe la fila del turno y, ya con la fila tomada, relee el cobro del turno:
//     si quedó en 0 o cambió, no factura con el monto viejo;
//   · la anulación toma la fila del turno FOR UPDATE antes de leer las facturas. Si la facturación
//     confirmó después de su foto, Postgres aborta la anulación (40001), `tenantTransaction` la
//     reintenta y ahí ve la factura.
// Se ejecuta el código real (facturarAppointment, anularCobroTurnoInTx, la Server Action
// `anularCobroTurno`) contra una base efímera con RLS; la otra transacción de cada carrera se
// sostiene abierta a mano para fijar el orden.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { runInTenantContext } from "@/lib/tenant-context";

const laBase = baseEfimeraDelArchivo();

/** Una puerta que el test abre cuando quiere. */
function puerta() {
  let abrir!: () => void;
  const abierta = new Promise<void>((r) => (abrir = r));
  return { abrir, abierta };
}

/** true si la promesa sigue sin resolverse después de `ms`: está esperando el bloqueo. */
async function sigueEsperando(p: Promise<unknown>, ms = 400): Promise<boolean> {
  const marca = Symbol("esperando");
  const r = await Promise.race([p.then(() => null, () => null), new Promise((ok) => setTimeout(() => ok(marca), ms))]);
  return r === marca;
}

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000", ARCA_INVOICING_ENABLED: "true" });
  delete env.ARCA_MODO; // stub: nada sale a la red
  const { operatorPrisma } = await import("@/lib/operator-db");
  const tenant = await operatorPrisma.tenant.findUniqueOrThrow({ where: { id: base.a.id }, select: { modules: true } });
  await operatorPrisma.tenant.update({
    where: { id: base.a.id },
    data: {
      arcaCuit: "20111111112",
      arcaPuntoVenta: 1,
      arcaHomologacion: true,
      modules: [...new Set([...tenant.modules, "arca"])],
    },
  });
  const a = base.a;
  const box = await operatorPrisma.box.create({ data: { tenantId: a.id, name: "Gabinete 1" } });
  const prof = await operatorPrisma.professional.create({ data: { tenantId: a.id, name: "Lucía" } });
  const serv = await operatorPrisma.service.create({ data: { tenantId: a.id, name: "Limpieza facial", durationMin: 60, price: 18000 } });

  /** Un turno completado, con su `Payment` (el agregado) y un cobro por cada importe. */
  async function turnoCobrado(cobros: number[], hora: number) {
    const turno = await operatorPrisma.appointment.create({
      data: {
        tenantId: a.id,
        clientId: a.clientes[0],
        professionalId: prof.id,
        serviceId: serv.id,
        boxId: box.id,
        startsAt: new Date(`2026-09-24T${String(hora).padStart(2, "0")}:00:00Z`),
        endsAt: new Date(`2026-09-24T${String(hora + 1).padStart(2, "0")}:00:00Z`),
        status: "COMPLETED",
      },
    });
    const total = cobros.reduce((s, c) => s + c, 0);
    await operatorPrisma.payment.create({
      data: { tenantId: a.id, appointmentId: turno.id, amount: total, method: "EFECTIVO", status: "APPROVED" },
    });
    const ids: string[] = [];
    for (const c of cobros) {
      const cobro = await operatorPrisma.collection.create({
        data: {
          tenantId: a.id,
          originType: "APPOINTMENT",
          originId: turno.id,
          appointmentId: turno.id,
          amount: `${c}.00`,
          method: "EFECTIVO",
          collectedBy: `user:${a.duenia.id}`,
        },
      });
      ids.push(cobro.id);
    }
    return { turno: turno.id, cobros: ids };
  }

  const cuentas = async (appointmentId: string) => ({
    facturas: await operatorPrisma.invoice.findMany({ where: { tenantId: a.id, appointmentId }, select: { status: true, total: true } }),
    envios: await operatorPrisma.outboxEvent.count({ where: { tenantId: a.id } }),
  });
  return { base, operatorPrisma, turnoCobrado, cuentas };
}

/** La anulación del cobro, con el código real, sostenida abierta hasta que el test la suelte. */
async function anulacionSostenida(
  p: NonNullable<Awaited<ReturnType<typeof preparar>>>,
  turno: string,
  collectionId: string,
) {
  const { anularCobroTurnoInTx } = await import("@/lib/turnos/anulacion");
  const { Prisma } = await import("@/generated/prisma/client");
  const soltar = puerta();
  const tomada = puerta();
  const tenantId = p.base.a.id;
  const anulacion = p.operatorPrisma.$transaction(
    async (tx) => {
      const r = await anularCobroTurnoInTx(tx as never, tenantId, {
        collectionId,
        appointmentId: turno,
        precio: 18000,
        motivo: "La clienta pidió la devolución",
        actor: `user:${p.base.a.duenia.id}`,
        diaCerradoHasta: null,
        esDiaCerrado: () => false,
        diaDe: () => "2026-09-24",
        withSchema: false,
      });
      tomada.abrir();
      await soltar.abierta;
      return r;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 },
  );
  await tomada.abierta;
  return { anulacion, soltar: soltar.abrir };
}

test("anulación del cobro primero: la facturación del turno espera el bloqueo y termina sin factura", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base } = p;
  const { facturarAppointment } = await import("@/lib/invoice-from-appointment");
  const { CobroDelTurnoCambioError } = await import("@/lib/invoice-core");
  const { turno, cobros } = await p.turnoCobrado([18000], 13);
  const enviosAntes = (await p.cuentas(turno)).envios;

  const { anulacion, soltar } = await anulacionSostenida(p, turno, cobros[0]);
  const facturacion = runInTenantContext(base.a.id, () => facturarAppointment(turno, base.a.id));
  assert.equal(await sigueEsperando(facturacion), true, "la facturación tiene que esperar a la anulación");
  soltar();
  const anulada = await anulacion;
  assert.equal(anulada.applied, true, "la anulación terminó");

  await assert.rejects(facturacion, (e: unknown) => e instanceof CobroDelTurnoCambioError && /anulado/.test(e.message));
  const tras = await p.cuentas(turno);
  assert.deepEqual(tras.facturas, [], "el turno con el cobro devuelto quedó sin factura");
  assert.equal(tras.envios, enviosAntes, "ningún envío a ARCA");
});

test("se anula una parte del cobro mientras se factura: no sale la factura por el monto viejo; al volver a facturar, sale por lo cobrado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base } = p;
  const { facturarAppointment } = await import("@/lib/invoice-from-appointment");
  const { CobroDelTurnoCambioError } = await import("@/lib/invoice-core");
  const { turno, cobros } = await p.turnoCobrado([5000, 13000], 15);

  const { anulacion, soltar } = await anulacionSostenida(p, turno, cobros[0]);
  const facturacion = runInTenantContext(base.a.id, () => facturarAppointment(turno, base.a.id));
  assert.equal(await sigueEsperando(facturacion), true, "la facturación tiene que esperar a la anulación");
  soltar();
  await anulacion;
  await assert.rejects(facturacion, (e: unknown) => e instanceof CobroDelTurnoCambioError && /cambió/.test(e.message));
  assert.deepEqual((await p.cuentas(turno)).facturas, [], "ninguna factura por $18.000");

  // Sin carrera, la facturación lee el cobro de ahora: $13.000.
  const id = await runInTenantContext(base.a.id, () => facturarAppointment(turno, base.a.id));
  assert.ok(id, "se facturó");
  const facturas = (await p.cuentas(turno)).facturas.map((f) => Number(f.total));
  assert.deepEqual(facturas, [13000], "una factura, por lo que quedó cobrado");
});

test("facturación del turno primero: «Anular cobro» espera, ve la factura en camino y no anula", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, operatorPrisma } = p;
  const { createInvoiceInTx } = await import("@/lib/invoice-core");
  const { anularCobroTurno } = await import("@/lib/actions");
  const a = base.a;
  const { turno, cobros } = await p.turnoCobrado([18000], 17);

  // La facturación creó la factura (con la fila del turno tomada) y todavía no confirmó.
  const soltar = puerta();
  const creada = puerta();
  const facturacion = operatorPrisma.$transaction(async (tx) => {
    await createInvoiceInTx(tx as never, {
      tenantId: a.id,
      concepto: 2,
      fecha: "20260924",
      emisor: { cuit: 20111111112, condicionIva: "MONOTRIBUTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: 18000,
      iva: [{ alicuotaId: 3, base: 18000, importe: 0 }],
      total: 18000,
      servicioDesde: "20260924",
      servicioHasta: "20260924",
      vencimientoPago: "20260924",
      origin: { type: "APPOINTMENT", id: turno },
    });
    creada.abrir();
    await soltar.abierta;
  }, { timeout: 15_000 });
  await creada.abierta;

  const fd = new FormData();
  fd.set("collectionId", cobros[0]);
  fd.set("appointmentId", turno);
  fd.set("motivo", "La clienta pidió la devolución");
  const anulacion = ejecutarAccion({ negocio: a, usuario: a.duenia }, () => anularCobroTurno(fd));
  assert.equal(await sigueEsperando(anulacion), true, "la anulación tiene que esperar a la facturación");
  soltar.abrir();
  await facturacion;

  const r = await anulacion;
  assert.equal(r.tipo, "respuesta", JSON.stringify(r));
  if (r.tipo !== "respuesta") return;
  assert.equal(r.valor?.ok, false, JSON.stringify(r.valor));
  assert.match(String((r.valor as { error?: string }).error), /esperando la respuesta de ARCA/);
  assert.equal(await operatorPrisma.collection.count({ where: { tenantId: a.id, originId: turno } }), 1, "ninguna contrapartida");
  assert.equal((await operatorPrisma.payment.findUniqueOrThrow({ where: { appointmentId: turno } })).amount, 18000);
  assert.deepEqual((await p.cuentas(turno)).facturas.map((f) => f.status), ["PENDING"], "una sola factura, en camino");
});

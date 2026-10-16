/**
 * D4 (UAT 16/10) — ⚠️ REQUIERE OK DEL DUEÑO O DE LA CONTADORA ANTES DE PUBLICAR.
 *
 * Un turno de $20.000 con $5.000 de seña que se termina con "dejar saldo a cobrar", EJECUTADO
 * contra Postgres con RLS y ARCA en modo stub, con las Server Actions reales:
 *   · antes: al terminar se facturaban $5.000 y los $15.000 del saldo nunca;
 *   · ahora: al terminar no se factura; al cobrar el saldo sale UNA factura por $20.000;
 *   · si el saldo se da de baja, sale una factura por lo que sí se cobró ($5.000);
 *   · si al terminar se eligió "No facturar", cobrar el saldo tampoco factura.
 * Por qué una sola factura y no dos (seña + saldo): turnos/momento-factura.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
let preparado: { base: BaseEfimera; turno: () => Promise<string> } | null = null;

async function preparar(t: import("node:test").TestContext) {
  if (preparado) return preparado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000", ARCA_INVOICING_ENABLED: "true" });
  delete env.ARCA_MODO; // stub: nada sale a la red
  const duenio = await prismaComoDuenio(base);
  const tenantId = base.a.id;
  await duenio.tenant.update({ where: { id: tenantId }, data: { arcaCuit: "20111111112", arcaPuntoVenta: 1, arcaHomologacion: true } });
  const box = await duenio.box.create({ data: { tenantId, name: "Box 1" } });
  const service = await duenio.service.create({ data: { tenantId, name: "Limpieza facial", durationMin: 60, price: 20_000 } });
  const pro = await duenio.professional.create({ data: { tenantId, name: "Carla", boxId: box.id, services: { connect: [{ id: service.id }] } } });
  let horas = 2;
  /** Un turno de $20.000 que ya pasó, sin cobros. */
  const turno = async () => {
    const startsAt = new Date(Date.now() - horas++ * 3_600_000);
    const ap = await duenio.appointment.create({
      data: {
        tenantId,
        clientId: base.a.clientes[0],
        professionalId: pro.id,
        serviceId: service.id,
        boxId: box.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3_600_000),
        status: "CONFIRMED",
        priceAtBooking: 20_000,
      },
    });
    return ap.id;
  };
  preparado = { base, turno };
  return preparado;
}

function acciones(base: BaseEfimera) {
  const sesion = { negocio: base.a, usuario: base.a.duenia };
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const valor = <T,>(r: { tipo: string; valor?: T }) => {
    assert.equal(r.tipo, "respuesta");
    return r.valor as T;
  };
  return {
    async cobrar(appointmentId: string, amount: number) {
      const { registrarCobroTurno } = await import("@/lib/actions");
      return valor(await ejecutarAccion(sesion, () => registrarCobroTurno(fd({ appointmentId, amount: String(amount), method: "EFECTIVO" }))));
    },
    async terminarDejandoSaldo(appointmentId: string, extra: Record<string, string> = {}) {
      const { completeAppointment } = await import("@/lib/actions");
      return valor(await ejecutarAccion(sesion, () => completeAppointment(fd({ appointmentId, saldo: "a-cobrar", ...extra }))));
    },
    async darDeBaja(appointmentId: string) {
      const { condonarSaldoTurno } = await import("@/lib/actions");
      return valor(await ejecutarAccion(sesion, () => condonarSaldoTurno(fd({ appointmentId, motivo: "Descuento de la dueña por demora" }))));
    },
  };
}

async function facturas(base: BaseEfimera, appointmentId: string) {
  const duenio = await prismaComoDuenio(base);
  const fs = await duenio.invoice.findMany({ where: { tenantId: base.a.id, appointmentId }, select: { total: true, status: true } });
  return fs.map((f) => ({ total: Number(f.total), status: f.status }));
}

test("D4 · seña de $5.000, terminar con saldo: no factura; cobrar el saldo: UNA factura por $20.000", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = acciones(p.base);
  const id = await p.turno();
  assert.deepEqual(await a.cobrar(id, 5_000), { ok: true }, "la seña de un turno sin terminar no factura");
  assert.deepEqual(await a.terminarDejandoSaldo(id), { ok: true });
  assert.deepEqual(await facturas(p.base, id), [], "con saldo pendiente la factura espera");
  assert.deepEqual(await a.cobrar(id, 10_000), { ok: true });
  assert.deepEqual(await facturas(p.base, id), [], "un cobro que no salda todavía no factura");
  assert.deepEqual(await a.cobrar(id, 5_000), { ok: true });
  assert.deepEqual(await facturas(p.base, id), [{ total: 20_000, status: "AUTHORIZED" }], "toda la plata, una sola factura");
});

test("D4 · terminar con saldo y darlo de baja: se factura lo que sí se cobró", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = acciones(p.base);
  const id = await p.turno();
  await a.cobrar(id, 5_000);
  await a.terminarDejandoSaldo(id);
  assert.deepEqual(await a.darDeBaja(id), { ok: true });
  assert.deepEqual(await facturas(p.base, id), [{ total: 5_000, status: "AUTHORIZED" }]);
});

test("D4 · 'No facturar' al terminar vale también para cuando se cobra el saldo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = acciones(p.base);
  const id = await p.turno();
  await a.cobrar(id, 5_000);
  await a.terminarDejandoSaldo(id, { facturar: "false" });
  await a.cobrar(id, 15_000);
  assert.deepEqual(await facturas(p.base, id), []);
});

test("D4 · sin ningún cobro, dar de baja el saldo no factura (no entró plata)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = acciones(p.base);
  const id = await p.turno();
  await a.terminarDejandoSaldo(id);
  assert.deepEqual(await a.darDeBaja(id), { ok: true });
  assert.deepEqual(await facturas(p.base, id), []);
});

test("D4 · turno saldado sin la elección de facturar registrada (completado antes del cambio): no se factura solo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = acciones(p.base);
  const id = await p.turno();
  await a.cobrar(id, 5_000);
  await a.terminarDejandoSaldo(id);
  // Como un turno completado con el código anterior: su auditoría no tiene la marca `facturar`.
  const duenio = await prismaComoDuenio(p.base);
  const log = await duenio.auditLog.findFirstOrThrow({ where: { entity: "Appointment", entityId: id, action: "complete" } });
  const { facturar: _sacada, ...sinMarca } = log.changes as Record<string, unknown>;
  void _sacada;
  await duenio.auditLog.update({ where: { id: log.id }, data: { changes: sinMarca as object } });
  await a.cobrar(id, 15_000);
  assert.deepEqual(await facturas(p.base, id), []);
});

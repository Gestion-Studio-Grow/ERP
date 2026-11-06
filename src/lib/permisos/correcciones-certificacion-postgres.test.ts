/**
 * Adversariales de la certificación de la matriz de permisos, EJECUTADOS contra Postgres con RLS: las
 * Server Actions reales con la sesión de una persona a la que la matriz le cambió una casilla.
 *
 *   · A1: recepción con «cargar cobranzas» apagada no cobra al terminar un turno (`completeAppointment`
 *     con medio) ni en el cierre en lote; no queda ningún cobro ni se cierra con plata.
 *   · M2: recepción con «manejar la caja» apagada no carga un asiento manual en el libro.
 *   · Bajas: una PROFESSIONAL con «editar turnos» prendido no lee los huecos ni marca la seña de un
 *     turno de otra profesional.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const MIN = 60_000;

type Sembrado = {
  base: BaseEfimera;
  duenio: Awaited<ReturnType<typeof prismaComoDuenio>>;
  caro: string;
  lu: string;
  /** Usuario PROFESSIONAL vinculado a Lu, con «editar turnos» prendido por la matriz. */
  usuarioLu: { id: string };
  turnoPasado: (profesional?: string) => Promise<string>;
};
let sembrado: Sembrado | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Sembrado | null> {
  if (sembrado) return sembrado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  const tenantId = base.a.id;
  const box = await duenio.box.create({ data: { tenantId, name: "Box 1" } });
  const box2 = await duenio.box.create({ data: { tenantId, name: "Box 2" } });
  const servicio = await duenio.service.create({ data: { tenantId, name: "Piernas", durationMin: 60, price: 14000 } });
  const caro = await duenio.professional.create({ data: { tenantId, name: "Caro", boxId: box.id, services: { connect: [{ id: servicio.id }] } } });
  const lu = await duenio.professional.create({ data: { tenantId, name: "Lu", boxId: box2.id, services: { connect: [{ id: servicio.id }] } } });
  const usuarioLu = await duenio.user.create({
    data: { tenantId, name: "Lu", email: "lu@negocio-a.erp.test", passwordHash: "x", role: "PROFESSIONAL", professionalId: lu.id },
  });
  await duenio.userPermissionOverride.create({ data: { tenantId, userId: usuarioLu.id, capability: "agenda:manage", allowed: true } });
  // La recepción de A, con «cargar cobranzas» y «manejar la caja» apagadas.
  for (const capability of ["agenda:collect", "cash:manage"]) {
    await duenio.userPermissionOverride.create({ data: { tenantId, userId: base.a.recepcion.id, capability, allowed: false } });
  }
  let n = 0;
  const turnoPasado = async (profesional = caro.id) => {
    const client = await duenio.client.create({ data: { tenantId, name: `Clienta ${n}`, phone: `11400040${String(n++).padStart(2, "0")}` } });
    const startsAt = new Date(Date.now() - 3 * 60 * MIN);
    const t = await duenio.appointment.create({
      data: {
        tenantId,
        clientId: client.id,
        professionalId: profesional,
        serviceId: servicio.id,
        boxId: profesional === caro.id ? box.id : box2.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * MIN),
        status: "PENDING",
        priceAtBooking: 14000,
      },
    });
    return t.id;
  };
  sembrado = { base, duenio, caro: caro.id, lu: lu.id, usuarioLu, turnoPasado };
  return sembrado;
}

function fd(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

test("A1: recepción sin «cargar cobranzas» no cobra al terminar un turno", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const id = await s.turnoPasado();
  const { completeAppointment } = await import("@/lib/actions");
  const r = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () =>
    completeAppointment(fd({ appointmentId: id, method: "EFECTIVO", vino: "on", facturar: "false" })),
  );
  assert.equal(r.tipo, "respuesta");
  assert.match(r.tipo === "respuesta" && !r.valor.ok ? r.valor.error : "", /cargar cobranzas/);
  assert.equal(await s.duenio.collection.count({ where: { appointmentId: id } }), 0, "no quedó ningún cobro");
  assert.equal((await s.duenio.appointment.findUniqueOrThrow({ where: { id } })).status, "PENDING");
});

test("A1: recepción sin «cargar cobranzas» no cobra en el cierre en lote", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const id = await s.turnoPasado();
  const { cerrarTurnosEnLote } = await import("@/lib/turnos/cierre-lote-actions");
  const { formDataDelLote } = await import("@/lib/turnos/cierre-lote");
  const r = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () =>
    cerrarTurnosEnLote(formDataDelLote([{ id, accion: "vino", method: "EFECTIVO" }])),
  );
  assert.equal(r.tipo, "respuesta");
  assert.match((r.tipo === "respuesta" && r.valor.resultados[0]?.error) || "", /cargar cobranzas/);
  assert.equal(await s.duenio.collection.count({ where: { appointmentId: id } }), 0, "no quedó ningún cobro");
});

test("M2: recepción sin «manejar la caja» no carga un asiento manual en el libro", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const antes = await s.duenio.cashMovement.count({ where: { tenantId: s.base.a.id } });
  const { addLibroEntry } = await import("@/lib/libro-caja-actions");
  const r = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () =>
    addLibroEntry(null, fd({ type: "EGRESO", amount: "5000", method: "EFECTIVO", detail: "Retiro" })),
  );
  assert.equal(r.tipo, "respuesta");
  assert.match(r.tipo === "respuesta" && r.valor && !r.valor.ok ? r.valor.error : "", /manejar la caja/);
  assert.equal(await s.duenio.cashMovement.count({ where: { tenantId: s.base.a.id } }), antes);
});

test("bajas: una PROFESSIONAL con «editar turnos» no lee huecos ni marca la seña de un turno ajeno", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const ajeno = await s.turnoPasado(s.caro);
  const { huecosParaMover } = await import("@/lib/turnos/mover-actions");
  const { marcarSeniaPedida } = await import("@/lib/turnos/senia-actions");
  const hoy = new Date().toISOString().slice(0, 10);
  const h = await ejecutarAccion({ negocio: s.base.a, usuario: s.usuarioLu }, () => huecosParaMover(ajeno, [hoy], null));
  assert.equal(h.tipo, "respuesta");
  assert.equal(h.tipo === "respuesta" && h.valor.ok, false);
  const m = await ejecutarAccion({ negocio: s.base.a, usuario: s.usuarioLu }, () => marcarSeniaPedida(fd({ appointmentId: ajeno })));
  assert.equal(m.tipo, "respuesta");
  assert.equal(m.tipo === "respuesta" && m.valor.ok, false);
  // Control: el suyo sí se consulta.
  const propio = await s.turnoPasado(s.lu);
  const hp = await ejecutarAccion({ negocio: s.base.a, usuario: s.usuarioLu }, () => huecosParaMover(propio, [hoy], null));
  assert.equal(hp.tipo === "respuesta" && hp.valor.ok === false && /no existe/.test(hp.valor.error), false);
});

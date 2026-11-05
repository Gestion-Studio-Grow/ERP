/**
 * Box que abre sólo los días que CH elige (NAIL-ARTIST.md §2), EJECUTADO contra Postgres con RLS.
 *   · día abierto ofrece horarios; día cerrado no, y el servidor rechaza aunque se fuerce;
 *   · otro box del mismo negocio y otro negocio (interruptor apagado) sin efecto;
 *   · una fila de OTRO negocio no abre el box;
 *   · la pantalla: la dueña abre/cierra, recepción no;
 *   · migración ausente (columna y tabla borradas): no rompe, el box ofrece como siempre.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const TELEFONO = "11 4000 7921";
const DIA = 86_400_000;

type S = {
  base: BaseEfimera;
  servicio: Record<"a" | "b", string>;
  mica: Record<"a" | "b", string>;
  carla: string;
  boxUnias: Record<"a" | "b", string>;
  abierto: string;
  cerrado: string;
  intruso: string;
};
let s: S | null = null;

async function preparar(t: import("node:test").TestContext): Promise<S | null> {
  if (s) return s;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const d = await prismaComoDuenio(base);
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const hoy = new Date(`${todayInBusinessTz()}T12:00:00Z`).getTime();
  const abierto = new Date(hoy + 2 * DIA).toISOString().slice(0, 10);
  const cerrado = new Date(hoy + 3 * DIA).toISOString().slice(0, 10);
  const parcial: Partial<S> = { base, abierto, cerrado, servicio: {} as S["servicio"], mica: {} as S["mica"], boxUnias: {} as S["boxUnias"] };
  for (const [k, tenantId] of [["a", base.a.id], ["b", base.b.id]] as const) {
    const box = await d.box.create({ data: { tenantId, name: "Uñas", soloDiasAbiertos: true } });
    const svc = await d.service.create({ data: { tenantId, name: "Kapping", durationMin: 60, price: 20000 } });
    const mica = await d.professional.create({ data: { tenantId, name: "Mica", boxId: box.id, services: { connect: [{ id: svc.id }] } } });
    const pros = [mica.id];
    if (k === "a") {
      const box2 = await d.box.create({ data: { tenantId, name: "Box 2" } });
      const carla = await d.professional.create({ data: { tenantId, name: "Carla", boxId: box2.id, services: { connect: [{ id: svc.id }] } } });
      parcial.carla = carla.id;
      pros.push(carla.id);
    }
    for (const professionalId of pros) {
      await d.workingHours.createMany({
        data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ tenantId, professionalId, dayOfWeek, startTime: "09:00", endTime: "18:00" })),
      });
    }
    // Las dos uñas abren el mismo día; B tiene el interruptor apagado.
    await d.boxDiaAbierto.create({ data: { tenantId, boxId: box.id, fecha: new Date(`${abierto}T00:00:00Z`), createdBy: "test" } });
    parcial.servicio![k] = svc.id;
    parcial.mica![k] = mica.id;
    parcial.boxUnias![k] = box.id;
  }
  // Fila de B que apunta al box de A otro día (sembrada como dueño, saltando RLS): no tiene que
  // abrirlo (la lectura filtra por tenantId).
  const intruso = new Date(hoy + 4 * DIA).toISOString().slice(0, 10);
  await d.boxDiaAbierto.create({ data: { tenantId: base.b.id, boxId: parcial.boxUnias!.a, fecha: new Date(`${intruso}T00:00:00Z`), createdBy: "intruso" } });
  parcial.intruso = intruso;
  const { filaDeInterruptor } = await import("@/cambios/interruptores-core");
  const { NAIL_ARTIST } = await import("@/cambios/interruptores");
  await d.auditLog.create({ data: filaDeInterruptor({ tenantId: base.a.id, interruptor: NAIL_ARTIST, accion: "encender", operador: "test" }) });
  s = parcial as S;
  return s;
}

async function libres(neg: "a" | "b", pro: string, svc: string, fecha: string): Promise<string[]> {
  const { getAvailableSlots } = await import("@/lib/actions");
  const r = await ejecutarAccion({ negocio: s!.base[neg] }, () => getAvailableSlots(pro, svc, fecha));
  assert.equal(r.tipo, "respuesta");
  return r.tipo === "respuesta" ? r.valor : [];
}

function hora(fecha: string): string {
  return new Date(`${fecha}T15:00:00Z`).toISOString(); // 12:00 en Buenos Aires
}

test("día abierto ofrece horarios; día cerrado no", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  assert.ok((await libres("a", c.mica.a, c.servicio.a, c.abierto)).length > 0);
  assert.deepEqual(await libres("a", c.mica.a, c.servicio.a, c.cerrado), []);
  assert.deepEqual(await libres("a", c.mica.a, c.servicio.a, c.intruso), [], "una fila de otro negocio no abre el box");
});

test("el servidor rechaza un turno forzado el día cerrado (web y mostrador)", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const { createBookingFromModal, createManualAppointment } = await import("@/lib/actions");
  const { RECHAZO_BOX_CERRADO } = await import("@/lib/turnos/box-dias");
  const d = await prismaComoDuenio(c.base);
  const antes = await d.appointment.count({ where: { tenantId: c.base.a.id } });
  const web = await ejecutarAccion({ negocio: c.base.a }, () =>
    createBookingFromModal({ professionalId: c.mica.a, serviceId: c.servicio.a, startsAtIso: hora(c.cerrado), clientName: "Ana", clientPhone: TELEFONO }),
  );
  assert.deepEqual(web.tipo === "respuesta" && web.valor, { ok: false, error: RECHAZO_BOX_CERRADO });
  const fd = new FormData();
  for (const [k, v] of Object.entries({ professionalId: c.mica.a, serviceId: c.servicio.a, startsAt: hora(c.cerrado), clientName: "Ana", clientPhone: TELEFONO, status: "CONFIRMED" })) fd.set(k, v);
  const mostrador = await ejecutarAccion({ negocio: c.base.a, usuario: c.base.a.duenia }, () => createManualAppointment(fd));
  assert.deepEqual(mostrador.tipo === "respuesta" && mostrador.valor, { ok: false, error: RECHAZO_BOX_CERRADO });
  assert.equal(await d.appointment.count({ where: { tenantId: c.base.a.id } }), antes);
  // El día abierto, la misma reserva sale.
  const ok = await ejecutarAccion({ negocio: c.base.a, usuario: c.base.a.duenia }, () => {
    fd.set("startsAt", hora(c.abierto));
    return createManualAppointment(fd);
  });
  assert.equal(ok.tipo === "respuesta" && ok.valor.ok, true);
});

test("otro box del negocio y otro negocio (interruptor apagado): sin efecto", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  assert.ok((await libres("a", c.carla, c.servicio.a, c.cerrado)).length > 0, "Carla (otro box) trabaja igual");
  assert.ok((await libres("b", c.mica.b, c.servicio.b, c.cerrado)).length > 0, "B con el interruptor apagado: como siempre");
});

test("pantalla: la dueña abre y cierra un día; recepción no puede", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const { alternarDiaAbierto } = await import("@/lib/turnos/box-dias-actions");
  const fd = new FormData();
  fd.set("boxId", c.boxUnias.a);
  fd.set("fecha", c.cerrado);
  const rec = await ejecutarAccion({ negocio: c.base.a, usuario: c.base.a.recepcion }, () => alternarDiaAbierto(fd));
  assert.equal(rec.tipo === "respuesta" && rec.valor.ok, false);
  const abre = await ejecutarAccion({ negocio: c.base.a, usuario: c.base.a.duenia }, () => alternarDiaAbierto(fd));
  assert.equal(abre.tipo === "respuesta" && abre.valor.ok, true);
  assert.ok((await libres("a", c.mica.a, c.servicio.a, c.cerrado)).length > 0);
  const cierra = await ejecutarAccion({ negocio: c.base.a, usuario: c.base.a.duenia }, () => alternarDiaAbierto(fd));
  assert.equal(cierra.tipo === "respuesta" && cierra.valor.ok, true);
  assert.deepEqual(await libres("a", c.mica.a, c.servicio.a, c.cerrado), []);
  // El box de A no se toca desde B.
  const ajeno = await ejecutarAccion({ negocio: c.base.b, usuario: c.base.b.duenia }, () => alternarDiaAbierto(fd));
  assert.equal(ajeno.tipo === "respuesta" && ajeno.valor.ok, false);
});

test("migración ausente (columna y tabla borradas): no rompe y ofrece como siempre", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const d = await prismaComoDuenio(c.base);
  await d.$executeRawUnsafe(`DROP TABLE "BoxDiaAbierto"`);
  await d.$executeRawUnsafe(`ALTER TABLE "Box" DROP COLUMN "soloDiasAbiertos"`);
  assert.ok((await libres("a", c.mica.a, c.servicio.a, c.cerrado)).length > 0);
  const { getCatalog } = await import("@/lib/catalog-actions");
  const cat = await ejecutarAccion({ negocio: c.base.a, usuario: c.base.a.duenia }, () => getCatalog());
  assert.equal(cat.tipo, "respuesta");
});

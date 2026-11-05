/**
 * Ficha completa del servicio, CON la migración 20261104120000_servicio_completo aplicada (la base
 * efímera corre todas las de prisma/migrations), contra Postgres con RLS y las Server Actions reales:
 *
 *   · alta con la ficha: seña 30 % guardada también como monto, agenda 90', online, con cupos, nota;
 *   · validación: agenda menor que la duración se rechaza con su motivo, y no se escribe nada;
 *   · precio a definir: precio 0, sin seña; el cobro fija el precio del turno una sola vez;
 *   · huecos y alta: bloquean calendarMin (90'), no la duración (60');
 *   · «Dar turno» devuelve la aclaración para el WhatsApp;
 *   · fotos: hasta 4; las de A no se ven desde B (ruta 404, lectura vacía, alta rechazada).
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor, type PedidoDePrueba } from "@/test/accion-de-servidor";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { camposDelAlta, inicioDeLaHora } from "@/app/admin/(dashboard)/turnos/_agenda/alta-core";
import { aFormData } from "@/app/admin/(dashboard)/turnos/_agenda/campos";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
// Un JPEG chiquito (1×1) en data URL: alcanza para guardar, servir y comparar bytes.
const JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

type Negocio = { pro: string; box: string };
type Sembrado = { base: BaseEfimera; a: Negocio; b: Negocio; manana: string };
let sembrado: Sembrado | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Sembrado | null> {
  if (sembrado) return sembrado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  const negocio = async (tenantId: string): Promise<Negocio> => {
    const box = await duenio.box.create({ data: { tenantId, name: "Box 1" } });
    const pro = await duenio.professional.create({ data: { tenantId, name: "Caro", boxId: box.id } });
    await duenio.workingHours.createMany({
      data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ tenantId, professionalId: pro.id, dayOfWeek, startTime: "00:00", endTime: "23:59" })),
    });
    return { pro: pro.id, box: box.id };
  };
  sembrado = { base, a: await negocio(base.a.id), b: await negocio(base.b.id), manana: dateStrInBusinessTz(new Date(Date.now() + DIA)) };
  return sembrado;
}

async function como<R>(pedido: PedidoDePrueba, fn: () => Promise<R>): Promise<R> {
  const r = await ejecutarAccion(pedido, fn);
  assert.equal(r.tipo, "respuesta", `la acción no respondió: ${JSON.stringify(r)}`);
  if (r.tipo !== "respuesta") throw new Error("sin respuesta");
  return r.valor;
}
const duenaA = (s: Sembrado): PedidoDePrueba => ({ negocio: s.base.a, usuario: s.base.a.duenia });
const duenaB = (s: Sembrado): PedidoDePrueba => ({ negocio: s.base.b, usuario: s.base.b.duenia });

const fd = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

/** Da de alta un servicio con la acción real y se lo asigna a la profesional del negocio. */
async function alta(s: Sembrado, pedido: PedidoDePrueba, negocio: Negocio, campos: Record<string, string>): Promise<string> {
  const { crearServicioConAviso } = await import("@/lib/catalog-actions");
  const r = await como(pedido, () => crearServicioConAviso(fd({ ficha: "1", durationMin: "60", ...campos })));
  assert.deepEqual(r, { ok: true });
  const duenio = await prismaComoDuenio(s.base);
  const sv = await duenio.service.findFirstOrThrow({ where: { tenantId: pedido.negocio!.id, name: campos.name }, select: { id: true } });
  await duenio.professional.update({ where: { id: negocio.pro }, data: { services: { connect: [{ id: sv.id }] } } });
  return sv.id;
}

test("alta con la ficha completa: seña %, agenda, modalidad, tipo y aclaración", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const id = await alta(s, duenaA(s), s.a, {
    name: "Facial profundo",
    price: "20000",
    calendarMin: "90",
    depositKind: "porcentaje",
    depositPercent: "30",
    modality: "ONLINE",
    kind: "CUPOS",
    reminderNote: "Vení bañada",
  });
  const duenio = await prismaComoDuenio(s.base);
  const sv = await duenio.service.findUniqueOrThrow({ where: { id }, select: { price: true, depositAmount: true, tenantId: true } });
  assert.deepEqual(sv, { price: 20000, depositAmount: 6000, tenantId: s.base.a.id });
  const det = await duenio.serviceDetail.findUniqueOrThrow({ where: { serviceId: id } });
  assert.equal(det.tenantId, s.base.a.id);
  assert.deepEqual(
    { p: det.priceToDefine, c: det.calendarMin, d: det.depositPercent, m: det.modality, k: det.kind, n: det.reminderNote },
    { p: false, c: 90, d: 30, m: "ONLINE", k: "CUPOS", n: "Vení bañada" },
  );

  // El catálogo la lee; el de B no ve la ficha de A.
  const { getCatalog } = await import("@/lib/catalog-actions");
  const catA = await como(duenaA(s), () => getCatalog());
  assert.equal(catA.fichaDisponible, true);
  assert.equal(catA.services.find((x) => x.id === id)?.ficha.calendarMin, 90);
  const catB = await como(duenaB(s), () => getCatalog());
  assert.equal(catB.services.some((x) => x.id === id), false);
});

test("validación: agenda menor que la duración se rechaza con su motivo y no escribe", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { crearServicioConAviso } = await import("@/lib/catalog-actions");
  const r = await como(duenaA(s), () => crearServicioConAviso(fd({ ficha: "1", name: "Mal cargado", durationMin: "60", price: "1000", calendarMin: "30" })));
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /no puede ser menor que la duración/);
  const duenio = await prismaComoDuenio(s.base);
  assert.equal(await duenio.service.count({ where: { name: "Mal cargado" } }), 0);
});

test("huecos y alta bloquean calendarMin (90') y no la duración (60'); «Dar turno» trae la aclaración", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const con = await alta(s, duenaA(s), s.a, { name: "Con preparación", price: "10000", calendarMin: "90", reminderNote: "Traé toalla" });
  const sin = await alta(s, duenaA(s), s.a, { name: "Sin preparación", price: "10000" });
  const { getAvailableSlots } = await import("@/lib/actions");
  const publico: PedidoDePrueba = { negocio: s.base.a };
  const huecosCon = await como(publico, () => getAvailableSlots(s.a.pro, con, s.manana));
  const huecosSin = await como(publico, () => getAvailableSlots(s.a.pro, sin, s.manana));
  const ultima = (h: string[]) => new Date(h[h.length - 1]).getTime();
  // Ventana 00:00-23:59: con 60' la última franja es 22:30; con 90', 22:00.
  assert.equal(ultima(huecosSin) - ultima(huecosCon), 30 * 60_000);

  const { darTurno } = await import("@/lib/turnos/alta-actions");
  const inicio = inicioDeLaHora(s.manana, "10:00");
  const r = await como({ negocio: s.base.a, usuario: s.base.a.recepcion }, () =>
    darTurno(aFormData(camposDelAlta({ profesionalId: s.a.pro, servicioId: con, inicio, nombre: "Laura Gómez", telefono: "11 5566-7788", deLaZona: false, cupon: "", cobro: null, estado: "PENDING", notas: "" }))),
  );
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.ok && r.aclaracion, "Traé toalla");
  const duenio = await prismaComoDuenio(s.base);
  const turno = await duenio.appointment.findFirstOrThrow({ where: { tenantId: s.base.a.id, serviceId: con } });
  assert.equal(turno.endsAt.getTime() - turno.startsAt.getTime(), 90 * 60_000);
  // Las 10:30 ya no se ofrecen para el servicio sin preparación (el turno ocupa hasta las 11:30 + buffer).
  const despues = await como(publico, () => getAvailableSlots(s.a.pro, sin, s.manana));
  assert.equal(despues.includes(new Date(inicioDeLaHora(s.manana, "11:00")).toISOString()), false);
});

test("precio a definir: precio 0 sin seña, el cobro fija el precio del turno una sola vez y sólo en su negocio", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const id = await alta(s, duenaA(s), s.a, { name: "Consulta", priceToDefine: "on", depositAmount: "5000" });
  const duenio = await prismaComoDuenio(s.base);
  const sv = await duenio.service.findUniqueOrThrow({ where: { id }, select: { price: true, depositAmount: true } });
  assert.deepEqual(sv, { price: 0, depositAmount: null });
  const cli = await duenio.client.create({ data: { tenantId: s.base.a.id, name: "Ana", phone: "1140001111" } });
  const desde = new Date(Date.now() + 2 * DIA);
  const turno = await duenio.appointment.create({
    data: { tenantId: s.base.a.id, clientId: cli.id, professionalId: s.a.pro, serviceId: id, boxId: s.a.box, startsAt: desde, endsAt: new Date(desde.getTime() + 3_600_000), status: "CONFIRMED", priceAtBooking: 0 },
  });
  const { fijarPrecioDelTurno } = await import("./precio-a-definir-actions");
  const enB = await como(duenaB(s), () => fijarPrecioDelTurno(fd({ appointmentId: turno.id, monto: "15000" })));
  assert.deepEqual(enB, { ok: false, error: "Ese turno ya no existe. Recargá la agenda." });
  assert.equal(await como(duenaA(s), () => fijarPrecioDelTurno(fd({ appointmentId: turno.id, monto: "0" }))).then((r) => r.ok), false);
  const ok = await como(duenaA(s), () => fijarPrecioDelTurno(fd({ appointmentId: turno.id, monto: "15000" })));
  assert.deepEqual(ok, { ok: true, precio: 15000 });
  const otra = await como(duenaA(s), () => fijarPrecioDelTurno(fd({ appointmentId: turno.id, monto: "99999" })));
  assert.deepEqual(otra, { ok: false, error: "Este turno ya tiene precio." });
  const leido = await duenio.appointment.findUniqueOrThrow({ where: { id: turno.id }, select: { priceAtBooking: true } });
  assert.equal(leido.priceAtBooking, 15000);
});

test("fotos: hasta 4 por servicio; las de A no se ven ni se tocan desde B", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const id = await alta(s, duenaA(s), s.a, { name: "Con fotos", price: "8000" });
  const { agregarFotoServicio, quitarFotoServicio } = await import("@/lib/catalog-actions");
  for (let i = 0; i < 4; i++) assert.deepEqual(await como(duenaA(s), () => agregarFotoServicio(id, JPEG)), { ok: true });
  assert.deepEqual(await como(duenaA(s), () => agregarFotoServicio(id, JPEG)), { ok: false, error: "Hasta 4 fotos por servicio." });
  assert.equal((await como(duenaA(s), () => agregarFotoServicio(id, "data:image/svg+xml;base64,PHN2Zz4="))).ok, false);
  // B no puede sumarle fotos a un servicio de A.
  assert.deepEqual(await como(duenaB(s), () => agregarFotoServicio(id, JPEG)), { ok: false, error: "Ese servicio no existe." });

  const { fichasDeServicios } = await import("./ficha.server");
  const deA = await como(duenaA(s), () => fichasDeServicios(s.base.a.id, [id]));
  const fotos = deA.fotos.get(id) ?? [];
  assert.equal(fotos.length, 4);
  const desdeB = await como(duenaB(s), () => fichasDeServicios(s.base.b.id, [id]));
  assert.equal(desdeB.fotos.size, 0);

  const { GET } = await import("@/app/(site)/servicios/foto/[id]/route");
  const pedir = (p: PedidoDePrueba) => como(p, () => GET(new Request("http://x/servicios/foto/" + fotos[0]), { params: Promise.resolve({ id: fotos[0] }) }));
  const enA = await pedir({ negocio: s.base.a });
  assert.equal(enA.status, 200);
  assert.equal(enA.headers.get("content-type"), "image/jpeg");
  assert.equal((await pedir({ negocio: s.base.b })).status, 404);

  // B no borra la foto de A; A sí.
  await como(duenaB(s), () => quitarFotoServicio(fotos[0]));
  const duenio = await prismaComoDuenio(s.base);
  assert.equal(await duenio.serviceFoto.count({ where: { serviceId: id } }), 4);
  await como(duenaA(s), () => quitarFotoServicio(fotos[0]));
  assert.equal(await duenio.serviceFoto.count({ where: { serviceId: id } }), 3);
});

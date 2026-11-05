/**
 * Ficha completa del servicio SIN la migración 20261104120000_servicio_completo: la base efímera
 * corre todas las migraciones y después se le CORREN DE NOMBRE las dos tablas nuevas (es una base
 * propia del test, que se borra al terminar), así la app las ve como en Neon antes del Gate 2.
 *
 * Todo tiene que funcionar como hoy: catálogo (sin campos nuevos), alta y edición de un servicio con
 * los campos de siempre, huecos con la duración, «Dar turno», «Confirmar mañana» y el barrido de
 * recordatorios. Las fotos contestan «todavía no» y la ruta da 404.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor, type PedidoDePrueba } from "@/test/accion-de-servidor";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { camposDelAlta, inicioDeLaHora } from "@/app/admin/(dashboard)/turnos/_agenda/alta-core";
import { aFormData } from "@/app/admin/(dashboard)/turnos/_agenda/campos";
import { FICHA_VACIA } from "./ficha";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
type Sembrado = { base: BaseEfimera; pro: string; manana: string };
let sembrado: Sembrado | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Sembrado | null> {
  if (sembrado) return sembrado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  // Como si la migración no estuviera: las tablas nuevas no existen con su nombre.
  await duenio.$executeRawUnsafe(`ALTER TABLE "ServiceDetail" RENAME TO "ServiceDetail_sin_migrar"`);
  await duenio.$executeRawUnsafe(`ALTER TABLE "ServiceFoto" RENAME TO "ServiceFoto_sin_migrar"`);
  const tenantId = base.a.id;
  const box = await duenio.box.create({ data: { tenantId, name: "Box 1" } });
  const pro = await duenio.professional.create({ data: { tenantId, name: "Caro", boxId: box.id } });
  await duenio.workingHours.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ tenantId, professionalId: pro.id, dayOfWeek, startTime: "00:00", endTime: "23:59" })),
  });
  sembrado = { base, pro: pro.id, manana: dateStrInBusinessTz(new Date(Date.now() + DIA)) };
  return sembrado;
}

async function como<R>(pedido: PedidoDePrueba, fn: () => Promise<R>): Promise<R> {
  const r = await ejecutarAccion(pedido, fn);
  assert.equal(r.tipo, "respuesta", `la acción no respondió: ${JSON.stringify(r)}`);
  if (r.tipo !== "respuesta") throw new Error("sin respuesta");
  return r.valor;
}
const duena = (s: Sembrado): PedidoDePrueba => ({ negocio: s.base.a, usuario: s.base.a.duenia });
const fd = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

test("sin la migración: catálogo, alta, edición, huecos, «Dar turno», recordatorios y fotos, como hoy", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { crearServicioConAviso, guardarServicioConAviso, getCatalog, agregarFotoServicio } = await import("@/lib/catalog-actions");

  // Alta con los campos de siempre.
  assert.deepEqual(await como(duena(s), () => crearServicioConAviso(fd({ name: "Masaje", durationMin: "60", price: "12000", depositAmount: "3000" }))), { ok: true });
  // Un formulario viejo en caché que manda la ficha: se ignora (no hay dónde guardarla) y el precio se exige.
  const forjado = fd({ ficha: "1", name: "Forjado", durationMin: "60", price: "9000", priceToDefine: "on", calendarMin: "90", depositKind: "porcentaje", depositPercent: "50" });
  assert.deepEqual(await como(duena(s), () => crearServicioConAviso(forjado)), { ok: true });

  const duenio = await prismaComoDuenio(s.base);
  const masaje = await duenio.service.findFirstOrThrow({ where: { name: "Masaje" } });
  const forj = await duenio.service.findFirstOrThrow({ where: { name: "Forjado" } });
  assert.deepEqual({ p: forj.price, d: forj.depositAmount }, { p: 9000, d: null });
  await duenio.professional.update({ where: { id: s.pro }, data: { services: { connect: [{ id: masaje.id }, { id: forj.id }] } } });

  // Edición con los campos de siempre.
  assert.deepEqual(await como(duena(s), () => guardarServicioConAviso(fd({ id: masaje.id, name: "Masaje relajante", durationMin: "60", price: "13000", depositAmount: "3000" }))), { ok: true });
  assert.equal((await duenio.service.findUniqueOrThrow({ where: { id: masaje.id } })).price, 13000);

  // El catálogo: sin campos nuevos, ficha vacía.
  const cat = await como(duena(s), () => getCatalog());
  assert.equal(cat.fichaDisponible, false);
  assert.deepEqual(cat.services.find((x) => x.id === masaje.id)?.ficha, FICHA_VACIA);
  assert.deepEqual(cat.services.find((x) => x.id === masaje.id)?.fotos, []);

  // Huecos con la duración (60'): la última franja de 00:00-23:59 es 22:30.
  const { getAvailableSlots, getMananaConfirmar } = await import("@/lib/actions");
  const huecos = await como({ negocio: s.base.a }, () => getAvailableSlots(s.pro, forj.id, s.manana));
  assert.equal(huecos[huecos.length - 1], new Date(inicioDeLaHora(s.manana, "22:30")).toISOString());

  // «Dar turno»: 60', sin aclaración.
  const { darTurno } = await import("@/lib/turnos/alta-actions");
  const r = await como({ negocio: s.base.a, usuario: s.base.a.recepcion }, () =>
    darTurno(aFormData(camposDelAlta({ profesionalId: s.pro, servicioId: masaje.id, inicio: inicioDeLaHora(s.manana, "10:00"), nombre: "Laura Gómez", telefono: "11 5566-7788", deLaZona: false, cupon: "", cobro: null, estado: "CONFIRMED", notas: "" }))),
  );
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.ok && r.aclaracion, null);
  const turno = await duenio.appointment.findFirstOrThrow({ where: { serviceId: masaje.id } });
  assert.equal(turno.endsAt.getTime() - turno.startsAt.getTime(), 60 * 60_000);

  // «Confirmar mañana» y el barrido de recordatorios no se caen.
  const manana = await como(duena(s), () => getMananaConfirmar());
  assert.equal(manana.turnos.length, 1);
  assert.ok(!manana.turnos[0].texto.includes("📝"));
  const { runReminderSweep } = await import("@/lib/cron/reminder-sweep");
  // Parado justo 24 h antes del turno: le toca el recordatorio (y la lectura de las aclaraciones).
  const barrido = await runReminderSweep(turno.startsAt.getTime() - 24 * 3_600_000);
  assert.equal(barrido.due, 1, JSON.stringify(barrido));

  // Fotos: «todavía no»; la ruta, 404.
  assert.deepEqual(await como(duena(s), () => agregarFotoServicio(masaje.id, "data:image/jpeg;base64,/9j/4AAQ")), { ok: false, error: "Las fotos todavía no están habilitadas." });
  const { GET } = await import("@/app/(site)/servicios/foto/[id]/route");
  const res = await como({ negocio: s.base.a }, () => GET(new Request("http://x/servicios/foto/abcdefghijkl"), { params: Promise.resolve({ id: "abcdefghijkl" }) }));
  assert.equal(res.status, 404);
});

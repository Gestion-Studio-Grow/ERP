/**
 * Segunda vuelta de la matriz de permisos (hallazgos del QA), EJECUTADA contra Postgres con RLS y DOS
 * negocios: las Server Actions reales, anónimas (la web) o con la sesión de una persona.
 *
 *   · Casilla 1 (`booking:online`): Lu, con la casilla apagada, sale de la reserva online del negocio A
 *     (lista, huecos y reservar), pero sigue para el equipo (agenda, «Dar turno»). El negocio B, con su
 *     propia profesional, no se entera.
 *   · Alta con contacto oculto: el turno se ata a la ficha por id; nunca se crea una ficha con la
 *     máscara como teléfono.
 *   · Buscador sin `clients:contact`: sólo los últimos 4 completos, nunca un tramo del medio.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const TELEFONO = "11 4000 7919";

type Sembrado = {
  base: BaseEfimera;
  duenio: Awaited<ReturnType<typeof prismaComoDuenio>>;
  servicio: string;
  caro: string;
  lu: string;
  /** La profesional del negocio B. */
  bea: string;
  manana: string;
  valeria: string;
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

  const sembrarNegocio = async (tenantId: string, nombres: string[]) => {
    const servicio = await duenio.service.create({ data: { tenantId, name: "Piernas", durationMin: 60, price: 14000 } });
    const ids: string[] = [];
    for (const name of nombres) {
      const box = await duenio.box.create({ data: { tenantId, name: `Box ${name}` } });
      const p = await duenio.professional.create({ data: { tenantId, name, boxId: box.id, services: { connect: [{ id: servicio.id }] } } });
      await duenio.workingHours.createMany({
        data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ tenantId, professionalId: p.id, dayOfWeek, startTime: "00:00", endTime: "23:30" })),
      });
      ids.push(p.id);
    }
    return { servicio: servicio.id, ids };
  };
  const a = await sembrarNegocio(base.a.id, ["Caro", "Lu"]);
  const b = await sembrarNegocio(base.b.id, ["Bea"]);
  const [caro, lu] = a.ids;
  const [bea] = b.ids;

  // Lu tiene usuario PROFESSIONAL con la casilla 1 apagada. En B, Bea también tiene usuario, sin excepción.
  const usuarioLu = await duenio.user.create({
    data: { tenantId: base.a.id, name: "Lu", email: "lu@negocio-a.erp.test", passwordHash: "x", role: "PROFESSIONAL", professionalId: lu },
  });
  await duenio.userPermissionOverride.create({ data: { tenantId: base.a.id, userId: usuarioLu.id, capability: "booking:online", allowed: false } });
  await duenio.user.create({
    data: { tenantId: base.b.id, name: "Bea", email: "bea@negocio-b.erp.test", passwordHash: "x", role: "PROFESSIONAL", professionalId: bea },
  });

  // La recepción de A sin «ver datos de contacto»; una clienta con número conocido.
  await duenio.userPermissionOverride.create({ data: { tenantId: base.a.id, userId: base.a.recepcion.id, capability: "clients:contact", allowed: false } });
  const valeria = await duenio.client.create({ data: { tenantId: base.a.id, name: "Valeria Ríos", phone: "11 5555-1234" } });

  const { todayInBusinessTz } = await import("@/lib/datetime");
  const manana = new Date(new Date(`${todayInBusinessTz()}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  sembrado = { base, duenio, servicio: a.servicio, caro, lu, bea, manana, valeria: valeria.id };
  return sembrado;
}

test("casilla 1: el conjunto de fuera de la reserva online es por negocio", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { profesionalesFueraDeReservaOnline } = await import("@/lib/permisos/reserva-online");
  const enA = await ejecutarAccion({ negocio: s.base.a }, () => profesionalesFueraDeReservaOnline(s.base.a.id));
  assert.deepEqual(enA.tipo === "respuesta" && [...enA.valor], [s.lu]);
  const enB = await ejecutarAccion({ negocio: s.base.b }, () => profesionalesFueraDeReservaOnline(s.base.b.id));
  assert.deepEqual(enB.tipo === "respuesta" && [...enB.valor], []);
});

test("casilla 1: la reserva pública no ofrece a Lu; el equipo la sigue viendo", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { getProfessionalsWithServices, getPublicBookingData, getAvailableSlots } = await import("@/lib/actions");

  const publica = await ejecutarAccion({ negocio: s.base.a }, () => getProfessionalsWithServices({ reservaOnline: true }));
  assert.deepEqual(publica.tipo === "respuesta" && publica.valor.map((p) => p.id), [s.caro]);
  const vidriera = await ejecutarAccion({ negocio: s.base.a }, () => getPublicBookingData());
  assert.deepEqual(vidriera.tipo === "respuesta" && vidriera.valor.professionals.map((p) => p.id), [s.caro]);
  // La agenda interna y «Dar turno» (sin la opción) la siguen teniendo: la ficha no se apagó.
  const interna = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => getProfessionalsWithServices());
  assert.deepEqual(interna.tipo === "respuesta" && interna.valor.map((p) => p.id).sort(), [s.caro, s.lu].sort());
  assert.equal((await s.duenio.professional.findUniqueOrThrow({ where: { id: s.lu } })).active, true);

  // Huecos: anónimo, ninguno; la recepción (agenda:read), los de siempre.
  const anon = await ejecutarAccion({ negocio: s.base.a }, () => getAvailableSlots(s.lu, s.servicio, s.manana));
  assert.deepEqual(anon.tipo === "respuesta" && anon.valor, []);
  const equipo = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => getAvailableSlots(s.lu, s.servicio, s.manana));
  assert.ok(equipo.tipo === "respuesta" && equipo.valor.length > 0, "la recepción ve los huecos de Lu");
  // Control: Caro sigue con huecos públicos; en B, Bea también.
  const caro = await ejecutarAccion({ negocio: s.base.a }, () => getAvailableSlots(s.caro, s.servicio, s.manana));
  assert.ok(caro.tipo === "respuesta" && caro.valor.length > 0);
  const bea = await ejecutarAccion({ negocio: s.base.b }, () => getProfessionalsWithServices({ reservaOnline: true }));
  assert.deepEqual(bea.tipo === "respuesta" && bea.valor.map((p) => p.id), [s.bea]);
});

test("casilla 1: el servidor rechaza reservar online con Lu (modal y formulario) sin crear ficha", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { createBookingFromModal, createAppointment, getAvailableSlots } = await import("@/lib/actions");
  const { FUERA_DE_RESERVA_ONLINE } = await import("@/lib/permisos/reserva-online");
  const h = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => getAvailableSlots(s.lu, s.servicio, s.manana));
  const horario = h.tipo === "respuesta" ? h.valor[0] : "";
  const fichasAntes = await s.duenio.client.count({ where: { tenantId: s.base.a.id } });
  const turnosAntes = await s.duenio.appointment.count({ where: { tenantId: s.base.a.id } });

  const modal = await ejecutarAccion({ negocio: s.base.a }, () =>
    createBookingFromModal({ professionalId: s.lu, serviceId: s.servicio, startsAtIso: horario, clientName: "Ana", clientPhone: TELEFONO }),
  );
  assert.deepEqual(modal.tipo === "respuesta" && modal.valor, { ok: false, error: FUERA_DE_RESERVA_ONLINE });
  const fd = new FormData();
  for (const [k, v] of Object.entries({ professionalId: s.lu, serviceId: s.servicio, startsAt: horario, clientName: "Ana", clientPhone: TELEFONO })) fd.set(k, v);
  const form = await ejecutarAccion({ negocio: s.base.a }, () => createAppointment(fd));
  assert.deepEqual(form.tipo === "respuesta" && form.valor, { ok: false, error: FUERA_DE_RESERVA_ONLINE });

  assert.equal(await s.duenio.client.count({ where: { tenantId: s.base.a.id } }), fichasAntes);
  assert.equal(await s.duenio.appointment.count({ where: { tenantId: s.base.a.id } }), turnosAntes);
});

test("alta con contacto oculto: se ata por id; sin id no se da y nunca se graba la máscara", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { createManualAppointment, getFichasParaAlta } = await import("@/lib/actions");
  const fichas = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => getFichasParaAlta());
  const vale = fichas.tipo === "respuesta" ? fichas.valor.find((f) => f.id === s.valeria) : undefined;
  assert.equal(vale?.telefono, "•••• 1234", "getFichasParaAlta enmascara sin clients:contact");

  const dia = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const fd = (extra: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ professionalId: s.caro, serviceId: s.servicio, startsAt: `${dia}T15:00:00.000Z`, clientName: "Valeria Ríos", clientPhone: "•••• 1234", status: "PENDING", ...extra })) f.set(k, v);
    return f;
  };
  const sinId = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => createManualAppointment(fd({})));
  assert.equal(sinId.tipo === "respuesta" && sinId.valor.ok, false);
  const conId = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => createManualAppointment(fd({ clientId: s.valeria })));
  assert.equal(conId.tipo === "respuesta" && conId.valor.ok, true);
  assert.equal(await s.duenio.appointment.count({ where: { clientId: s.valeria } }), 1);
  // Un id de OTRO negocio no ata nada.
  const ajena = await s.duenio.client.create({ data: { tenantId: s.base.b.id, name: "Ajena", phone: "11 9999-1234" } });
  const cruzado = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () =>
    createManualAppointment(fd({ clientId: ajena.id, startsAt: `${dia}T17:00:00.000Z` })),
  );
  assert.equal(cruzado.tipo === "respuesta" && cruzado.valor.ok, false);
  assert.equal(await s.duenio.client.count({ where: { phone: { contains: "•" } } }), 0, "ninguna ficha con la máscara");
});

test("buscador sin clients:contact: últimos 4 completos o nombre, nunca un tramo del medio", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { buscarEnElNegocio } = await import("@/lib/buscador/buscar-en-el-negocio");
  const { buscarClientasYTurnos } = await import("@/lib/clientes/buscar-actions");
  const { buscarClientesParaVenta } = await import("@/lib/clientes/buscar-para-venta");
  const quien = { negocio: s.base.a, usuario: s.base.a.recepcion };
  const ids = (r: unknown) => JSON.stringify(r);

  for (const q of ["5551234", "5555", "555-12"]) {
    const g = await ejecutarAccion(quien, () => buscarEnElNegocio(q));
    assert.doesNotMatch(ids(g), new RegExp(s.valeria), `buscador global con «${q}»`);
    const c = await ejecutarAccion(quien, () => buscarClientasYTurnos(q));
    assert.doesNotMatch(ids(c), new RegExp(s.valeria), `buscador de turnos con «${q}»`);
    const v = await ejecutarAccion(quien, () => buscarClientesParaVenta(q));
    assert.doesNotMatch(ids(v), new RegExp(s.valeria), `buscador de la venta con «${q}»`);
  }
  for (const q of ["1234", "Valeria"]) {
    const g = await ejecutarAccion(quien, () => buscarEnElNegocio(q));
    assert.match(ids(g), new RegExp(s.valeria), `buscador global con «${q}»`);
    const c = await ejecutarAccion(quien, () => buscarClientasYTurnos(q));
    assert.match(ids(c), new RegExp(s.valeria), `buscador de turnos con «${q}»`);
    const v = await ejecutarAccion(quien, () => buscarClientesParaVenta(q));
    assert.match(ids(v), new RegExp(s.valeria), `buscador de la venta con «${q}»`);
  }
  // La dueña (con contacto) sí encuentra por el tramo.
  const duenia = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.duenia }, () => buscarClientasYTurnos("5555-12"));
  assert.match(ids(duenia), new RegExp(s.valeria));
});

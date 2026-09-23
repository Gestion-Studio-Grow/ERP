// Los números del Inicio de Clientes y Recepción EJECUTADOS contra una base falsa: que cada uno
// lea con el `where` de su pantalla, con el negocio adentro, y qué número sale de filas dadas.
// Y el registro de las apps nuevas: quién las ve y quién ve la plata.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agenda,
  clientes,
  confirmarManana,
  listaDeEspera,
  porRecuperar,
  recordatorios,
  resenas,
  resumirAgenda,
  resumirCobertura,
  resumirResenas,
  unificarFichas,
} from "@/apps/kpis/comercial.server";
import type { ContextoLoader, DbKpi } from "@/apps/kpis/nucleo.server";
import { appPorId, REGISTRO_APPS } from "@/apps/registro";
import { appsVisibles, motivoNoDisponible, partesDelKpi, proyectarMenuDeHoy, type NegocioApps } from "@/apps/visibles";
import { rangoDelDia } from "@/lib/turnos/turno-abierto";
import { whereEsperando, whereTurnosDeManana, whereTurnosDelDia } from "./wheres";

type Llamada = { modelo: string; op: string; args: { where?: Record<string, unknown> } & Record<string, unknown> };

function dbFalsa(respuestas: Record<string, unknown> = {}) {
  const llamadas: Llamada[] = [];
  const db = new Proxy(
    {},
    {
      get: (_, modelo) =>
        new Proxy(
          {},
          {
            get: (__, op) => async (args: Llamada["args"]) => {
              llamadas.push({ modelo: String(modelo), op: String(op), args });
              const r = respuestas[`${String(modelo)}.${String(op)}`];
              if (r !== undefined) return typeof r === "function" ? (r as (a: unknown) => unknown)(args) : r;
              return op === "count" ? 0 : [];
            },
          },
        ),
    },
  );
  return { db: db as unknown as DbKpi, llamadas };
}

function ctx(db: DbKpi, extra: Partial<ContextoLoader> = {}): ContextoLoader {
  return {
    db,
    tenantId: "t-qa",
    hoy: "2026-09-23",
    ahora: new Date("2026-09-23T15:00:00.000Z"),
    esMostrador: false,
    sustantivo: { uno: "producto", varios: "productos" },
    monto: true,
    ...extra,
  };
}

test("Agenda: '18 turnos hoy · 83% confirmados' con el where de getAgendaDay", async () => {
  const { db, llamadas } = dbFalsa({
    "appointment.groupBy": [
      { status: "PENDING", _count: { _all: 3 } },
      { status: "CONFIRMED", _count: { _all: 10 } },
      { status: "COMPLETED", _count: { _all: 5 } },
    ],
  });
  assert.deepEqual(await agenda(ctx(db)), { valor: "18", detalle: "turnos hoy · 83% confirmados" });
  const { desde, hasta } = rangoDelDia("2026-09-23");
  assert.deepEqual(llamadas[0].args.where, whereTurnosDelDia("t-qa", desde, hasta));
  assert.deepEqual(resumirAgenda([]), { valor: "0", detalle: "turnos hoy" });
});

test("Confirmar mañana: los de getMananaConfirmar sin aviso; Recordatorios: la cobertura, '—' sin turnos", async () => {
  const { db, llamadas } = dbFalsa({ "appointment.count": 7 });
  assert.deepEqual(await confirmarManana(ctx(db)), { valor: "7", detalle: "turnos de mañana sin avisar" });
  const { desde, hasta } = rangoDelDia("2026-09-24");
  assert.deepEqual(llamadas[0].args.where, { ...whereTurnosDeManana("t-qa", desde, hasta), reminderSentAt: null });

  const r = dbFalsa({ "appointment.findMany": [{ reminderSentAt: new Date() }, { reminderSentAt: null }, { reminderSentAt: new Date() }] });
  assert.deepEqual(await recordatorios(ctx(r.db)), { valor: "67%", detalle: "de los turnos de mañana ya avisados (2 de 3)" });
  assert.deepEqual(r.llamadas[0].args.where, whereTurnosDeManana("t-qa", desde, hasta));
  assert.deepEqual(resumirCobertura({ total: 0, avisados: 0 }), { sinDato: "Mañana no hay turnos reservados ni confirmados" });
});

test("Lista de espera: el where de getWaitlist", async () => {
  const { db, llamadas } = dbFalsa({ "waitlistEntry.count": 4 });
  assert.deepEqual(await listaDeEspera(ctx(db)), { valor: "4", detalle: "esperando un turno" });
  assert.deepEqual(llamadas[0].args.where, whereEsperando("t-qa"));
});

test("Reseñas: promedio ponderado y sin publicar; '—' si no hay", async () => {
  const { db } = dbFalsa({
    "review.groupBy": [
      { published: true, _count: { _all: 3 }, _avg: { rating: 5 } },
      { published: false, _count: { _all: 1 }, _avg: { rating: 4 } },
    ],
  });
  assert.deepEqual(await resenas(ctx(db)), { valor: "4,8★", detalle: "promedio de 4 · 1 sin publicar" });
  assert.deepEqual(resumirResenas([]), { sinDato: "Todavía no hay reseñas" });
});

test("Clientes nuevos del mes: primera visita de TODA la historia, por turnos o por pedidos según el rubro", async () => {
  const servicios = dbFalsa({
    "appointment.groupBy": [
      { clientId: "a", _min: { startsAt: new Date("2026-09-10T13:00:00Z") } },
      { clientId: "b", _min: { startsAt: new Date("2025-01-10T13:00:00Z") } }, // vieja que volvió: no es nueva
    ],
  });
  assert.deepEqual(await clientes(ctx(servicios.db)), { valor: "1", detalle: "cliente nuevo este mes" });
  assert.deepEqual(servicios.llamadas[0].args.where, { tenantId: "t-qa", status: "COMPLETED" });

  const mostrador = dbFalsa();
  await clientes(ctx(mostrador.db, { esMostrador: true }));
  assert.equal(mostrador.llamadas[0].modelo, "order");
  assert.equal(mostrador.llamadas[0].args.where?.tenantId, "t-qa");
});

test("Por recuperar: cuenta las en riesgo; la plata sólo con reports:read", async () => {
  const turno = (iso: string) => ({
    id: iso,
    status: "COMPLETED",
    startsAt: new Date(iso),
    serviceId: "s",
    priceAtBooking: 10000,
    service: { name: "Uñas", price: 10000 },
    review: null,
  });
  const fichas = [
    { id: "a", name: "Ana", phone: "1140007919", birthDate: null, appointments: [turno("2026-06-25T13:00:00Z"), turno("2026-07-25T13:00:00Z")] },
    { id: "b", name: "Bea", phone: "1150001111", birthDate: null, appointments: [turno("2026-09-01T13:00:00Z"), turno("2026-09-20T13:00:00Z")] },
  ];
  const conPlata = dbFalsa({ "client.findMany": fichas });
  const dato = await porRecuperar(ctx(conPlata.db));
  assert.ok(dato && "valor" in dato);
  assert.equal(dato.valor, "1");
  assert.match(dato.monto ?? "", /por año en juego/);
  assert.equal(conPlata.llamadas.length, 1, "una sola lectura");
  const sinPlata = dbFalsa({ "client.findMany": fichas });
  const dato2 = await porRecuperar(ctx(sinPlata.db, { monto: false }));
  assert.ok(dato2 && "valor" in dato2);
  assert.equal(dato2.monto, undefined);
});

test("Fichas duplicadas: grupos por la clave del teléfono", async () => {
  const { db } = dbFalsa({
    "client.findMany": [
      { id: "a", name: "Ana", phone: "11 4000-7919" },
      { id: "b", name: "Ana", phone: "+5491140007919" },
      { id: "c", name: "Bea", phone: "1150001111" },
    ],
  });
  assert.deepEqual(await unificarFichas(ctx(db)), { valor: "1", detalle: "persona con fichas duplicadas" });
});

// ── El registro de las apps nuevas ───────────────────────────────────────────

function negocio(extra: Partial<NegocioApps>): NegocioApps {
  return { role: "OWNER", contexto: null, modulosAsignados: [], perfil: null, esMostrador: false, carniceriaLista: false, ...extra };
}

test("apps nuevas: CH (sin gate) no las ve en su barra de hoy; en el Inicio, sí", () => {
  const nuevas = ["para-contactar-hoy", "clientas-por-recuperar", "unificar-fichas", "confirmar-manana"];
  for (const id of nuevas) assert.equal(REGISTRO_APPS.find((a) => a.id === id)?.menuDeHoy, undefined, id);
  const ch = negocio({ role: "OWNER" });
  const barra = proyectarMenuDeHoy(appsVisibles(ch)).map((i) => i.href);
  for (const id of nuevas) assert.ok(!barra.includes(appPorId(id as never).ruta), `${id} no puede aparecer en la barra de CH`);
  assert.deepEqual(
    appsVisibles(ch).filter((a) => nuevas.includes(a.id)).map((a) => a.id).sort(),
    [...nuevas].sort(),
  );
});

test("apps nuevas: la recepción abre la bandeja y Por recuperar sin plata; unificar es de la dueña", () => {
  const recepcion = negocio({ role: "RECEPTION" });
  assert.equal(motivoNoDisponible(appPorId("para-contactar-hoy"), recepcion), null);
  assert.equal(motivoNoDisponible(appPorId("clientas-por-recuperar"), recepcion), null);
  assert.equal(motivoNoDisponible(appPorId("confirmar-manana"), recepcion), null);
  assert.equal(motivoNoDisponible(appPorId("unificar-fichas"), recepcion), "rol");
  assert.deepEqual(partesDelKpi(appPorId("clientas-por-recuperar"), "RECEPTION"), { numero: true, monto: false });
  assert.deepEqual(partesDelKpi(appPorId("clientas-por-recuperar"), "OWNER"), { numero: true, monto: true });
  // El profesional abre la agenda, pero el número del negocio entero no es el de SU agenda.
  assert.deepEqual(partesDelKpi(appPorId("agenda"), "PROFESSIONAL"), { numero: false, monto: false });
  // Confirmar mañana es de turnos: en un mostrador no se ofrece.
  assert.equal(motivoNoDisponible(appPorId("confirmar-manana"), negocio({ esMostrador: true })), "rubro");
  assert.equal(motivoNoDisponible(appPorId("para-contactar-hoy"), negocio({ esMostrador: true })), null);
});

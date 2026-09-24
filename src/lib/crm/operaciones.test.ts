// Las decisiones de las pantallas comerciales EJECUTADAS con datos: qué turno se puede
// cancelar, huecos liberados para la lista de espera, el plan de unificar fichas, el resumen de
// la ficha única, las reseñas y los textos de WhatsApp.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ESTADOS_CANCELABLES, cancelarTurnoVivo, esCancelable, whereTurnoCancelable, whereTurnosDeManana, whereEsperando } from "./wheres";
import { anotadosConHueco, huecosLiberados, leSirve, type Anotado, type TurnoCancelado } from "./huecos";
import { idsUnicos, planUnificacion, type FichaAUnificar } from "./unificar";
import { avisarFaltazos, resumirFicha } from "./ficha";
import { resumirResenasDeLista } from "./resenas";
import { primerNombre, textoContacto, textoHuecoLiberado } from "./textos";
import { CRM_REGLAS } from "./reglas";
import { notaDeCondonacion } from "@/lib/turnos/anulacion";

// ── Cancelar un turno ────────────────────────────────────────────────────────

test("cancelar: sólo un turno Reservado o Confirmado; completado, ausente o cancelado se rechaza", () => {
  assert.equal(esCancelable("PENDING"), true);
  assert.equal(esCancelable("CONFIRMED"), true);
  assert.equal(esCancelable("COMPLETED"), false); // ya se prestó y se cobró
  assert.equal(esCancelable("NO_SHOW"), false);
  assert.equal(esCancelable("CANCELLED"), false);
  // El where del update lleva el negocio y los estados: un id de otro negocio o un turno
  // cobrado no matchea y el update no toca nada (count 0).
  assert.deepEqual(whereTurnoCancelable("t-qa", "a1"), { id: "a1", tenantId: "t-qa", status: { in: [...ESTADOS_CANCELABLES] } });
});

test("cancelar EJECUTADO: una base con turnos en todos los estados y de dos negocios; sólo cambian los vivos del negocio", async () => {
  const turnos = [
    { id: "p", tenantId: "t-qa", status: "PENDING" },
    { id: "c", tenantId: "t-qa", status: "CONFIRMED" },
    { id: "k", tenantId: "t-qa", status: "COMPLETED" },
    { id: "n", tenantId: "t-qa", status: "NO_SHOW" },
    { id: "x", tenantId: "t-qa", status: "CANCELLED" },
    { id: "ajeno", tenantId: "t-otro", status: "PENDING" },
  ];
  // Evalúa el `where` como lo evalúa Postgres: id, negocio (si está) y estado dentro de la lista.
  const db = {
    appointment: {
      updateMany: async (a: { where: { id?: string; tenantId?: string; status?: { in?: string[] } }; data: { status: "CANCELLED" } }) => {
        const hits = turnos.filter(
          (t) =>
            (a.where.id === undefined || t.id === a.where.id) &&
            (a.where.tenantId === undefined || t.tenantId === a.where.tenantId) &&
            (a.where.status?.in === undefined || a.where.status.in.includes(t.status)),
        );
        for (const t of hits) t.status = a.data.status;
        return { count: hits.length };
      },
    },
  };
  const cambiados: Record<string, number> = {};
  for (const id of ["p", "c", "k", "n", "x"]) cambiados[id] = await cancelarTurnoVivo(db as never, "t-qa", id);
  cambiados.ajeno = await cancelarTurnoVivo(db as never, "t-qa", "ajeno");
  assert.deepEqual(cambiados, { p: 1, c: 1, k: 0, n: 0, x: 0, ajeno: 0 });
  assert.deepEqual(
    turnos.map((t) => `${t.id}:${t.status}`),
    ["p:CANCELLED", "c:CANCELLED", "k:COMPLETED", "n:NO_SHOW", "x:CANCELLED", "ajeno:PENDING"],
  );
});

test("los where de las pantallas llevan el negocio", () => {
  const d = new Date("2026-09-24T03:00:00Z");
  const h = new Date("2026-09-25T03:00:00Z");
  assert.deepEqual(whereTurnosDeManana("t-qa", d, h), { tenantId: "t-qa", startsAt: { gte: d, lt: h }, status: { in: ["PENDING", "CONFIRMED"] } });
  assert.deepEqual(whereEsperando("t-qa"), { tenantId: "t-qa", status: { in: ["WAITING", "NOTIFIED"] } });
});

// ── Huecos liberados ─────────────────────────────────────────────────────────

const ahora = new Date("2026-09-23T15:00:00.000Z");
const cancelado = (id: string, iso: string, extra: Partial<TurnoCancelado> = {}): TurnoCancelado => ({
  appointmentId: id,
  startsAt: new Date(iso),
  endsAt: new Date(new Date(iso).getTime() + 60 * 60_000),
  serviceId: "depi",
  servicio: "Depilación",
  professionalId: "ana",
  profesional: "Ana",
  ...extra,
});
const anotado = (id: string, extra: Partial<Anotado> = {}): Anotado => ({
  id,
  clientName: `Anotada ${id}`,
  clientPhone: "11 4000-7919",
  serviceId: "depi",
  professionalId: null,
  status: "WAITING",
  notifiedAt: null,
  createdAt: new Date("2026-09-01T12:00:00Z"),
  ...extra,
});

test("hueco liberado: mismo servicio, y el profesional que pidió o cualquiera; el que más espera primero", () => {
  const huecos = huecosLiberados({
    cancelados: [cancelado("t1", "2026-09-25T13:00:00Z")],
    vivos: [],
    anotados: [
      anotado("cualquiera", { createdAt: new Date("2026-09-10T12:00:00Z") }),
      anotado("conAna", { professionalId: "ana", createdAt: new Date("2026-09-05T12:00:00Z") }),
      anotado("conOtra", { professionalId: "bea" }),
      anotado("otroServicio", { serviceId: "unias" }),
      anotado("yaReservo", { status: "BOOKED" }),
    ],
    ahora,
  });
  assert.equal(huecos.length, 1);
  assert.deepEqual(huecos[0].anotados.map((a) => a.id), ["conAna", "cualquiera"]);
  assert.equal(anotadosConHueco(huecos), 2);
  assert.equal(leSirve(anotado("x", { status: "NOTIFIED" }), { serviceId: "depi", professionalId: "ana" }), true);
});

test("hueco liberado: no se ofrece si ya pasó, si alguien volvió a ocupar el horario o si no le sirve a nadie", () => {
  const huecos = huecosLiberados({
    cancelados: [
      cancelado("pasado", "2026-09-23T12:00:00Z"),
      cancelado("ocupado", "2026-09-25T13:00:00Z"),
      cancelado("sinNadie", "2026-09-26T13:00:00Z", { serviceId: "masajes" }),
      cancelado("libre", "2026-09-27T13:00:00Z"),
    ],
    // Otro turno de Ana que pisa 13:30-14:30 del 25.
    vivos: [{ professionalId: "ana", startsAt: new Date("2026-09-25T13:30:00Z"), endsAt: new Date("2026-09-25T14:30:00Z") }],
    anotados: [anotado("a")],
    ahora,
  });
  assert.deepEqual(huecos.map((h) => h.appointmentId), ["libre"]);
});

// ── Unificar fichas ──────────────────────────────────────────────────────────

const ficha = (id: string, extra: Partial<FichaAUnificar> = {}): FichaAUnificar => ({
  id,
  name: `Ficha ${id}`,
  phone: "11 4000-7919",
  email: null,
  notes: null,
  birthDate: null,
  isResident: null,
  createdAt: new Date("2026-01-01T12:00:00Z"),
  ...extra,
});

test("unificar: completa lo que falta sin pisar, y suma las notas con de dónde vinieron", () => {
  const queda = ficha("queda", { email: "ana@x.com", notes: "Alérgica al látex" });
  const plan = planUnificacion(
    queda,
    [
      ficha("dup1", { phone: "+54 9 11 4000 7919", email: "otra@x.com", birthDate: new Date("1990-03-12T12:00:00Z"), notes: "Prefiere tarde", createdAt: new Date("2026-02-01T12:00:00Z") }),
      ficha("dup2", { phone: "1140007919", isResident: true, createdAt: new Date("2026-03-01T12:00:00Z") }),
    ],
    2,
  );
  assert.ok(plan.ok);
  assert.equal(plan.cambios.email, undefined, "el email de la que queda no se pisa");
  assert.equal(plan.cambios.birthDate?.toISOString(), "1990-03-12T12:00:00.000Z");
  assert.equal(plan.cambios.isResident, true);
  assert.equal(plan.cambios.notes, "Alérgica al látex\n\nDe la ficha unificada de Ficha dup1 (+54 9 11 4000 7919): Prefiere tarde");
});

test("unificar: rechaza otro teléfono, la misma ficha dos veces o fichas que ya no están", () => {
  const queda = ficha("queda");
  const otro = planUnificacion(queda, [ficha("x", { phone: "11 5555-0000" })], 1);
  assert.equal(otro.ok, false);
  assert.match(!otro.ok ? otro.error : "", /mismo teléfono/);
  assert.equal(planUnificacion(queda, [queda], 1).ok, false);
  assert.equal(planUnificacion(null, [ficha("x")], 1).ok, false);
  assert.equal(planUnificacion(queda, [ficha("x")], 2).ok, false, "pidió 2 y existe 1: alguien ya unificó");
  assert.equal(planUnificacion(queda, [], 0).ok, false);
  assert.deepEqual(idsUnicos([" a ", "a", "", null, "b"]), ["a", "b"]);
});

// ── La ficha única ───────────────────────────────────────────────────────────

test("ficha única: próximo turno, faltazos, lo que debe (como la agenda) y lo gastado en el año", () => {
  const t = (id: string, status: string, iso: string, precio: number, cobrado: number) => ({
    id,
    status,
    startsAt: new Date(iso),
    precio,
    cobros: cobrado > 0 ? [{ amount: cobrado, method: "EFECTIVO" }] : [],
    servicio: "Uñas",
    profesional: "Ana",
  });
  const r = resumirFicha({
    turnos: [
      t("a", "COMPLETED", "2026-09-01T13:00:00Z", 10000, 10000),
      t("b", "COMPLETED", "2026-09-10T13:00:00Z", 12000, 4000), // debe 8000
      t("c", "NO_SHOW", "2026-08-01T13:00:00Z", 10000, 0),
      t("d", "NO_SHOW", "2026-07-01T13:00:00Z", 10000, 0),
      t("e", "CONFIRMED", "2026-10-02T13:00:00Z", 10000, 3000), // seña de un turno futuro: plata que entró
      t("f", "PENDING", "2026-09-28T13:00:00Z", 10000, 0),
      t("g", "CANCELLED", "2026-09-05T13:00:00Z", 10000, 2000), // seña de uno cancelado: no cuenta
      t("h", "COMPLETED", "2024-01-10T13:00:00Z", 10000, 10000), // hace más de un año
    ],
    pedidos: [
      { id: "o1", status: "DELIVERED", createdAt: new Date("2026-09-15T13:00:00Z"), total: 5000, paid: true, paymentMethod: "EFECTIVO" },
      { id: "o2", status: "CANCELLED", createdAt: new Date("2026-09-16T13:00:00Z"), total: 9999, paid: true, paymentMethod: "EFECTIVO" },
      // A cuenta (fiado): vendida y saldada SIN medio. No entró plata: no es "gastó".
      { id: "o3", status: "DELIVERED", createdAt: new Date("2026-09-14T13:00:00Z"), total: 7000, paid: true, paymentMethod: null },
    ],
    fiado: [{ id: "f1", saldo: 1500 }],
    ahora,
  });
  assert.equal(r.proximoTurno?.startsAt.toISOString(), "2026-09-28T13:00:00.000Z");
  assert.equal(r.faltazos, 2);
  assert.equal(r.saldoTurnos, 8000);
  assert.equal(r.saldoFiado, 1500);
  assert.equal(r.gastadoAnio, 10000 + 4000 + 3000 + 5000, "sin los 7000 de la venta a cuenta (antes sumaban)");
  assert.equal(r.visitas, 3);
  assert.equal(r.pedidos, 2, "la venta a cuenta sí es un pedido");
  assert.equal(r.ultimaVisita?.toISOString(), "2026-09-15T13:00:00.000Z");
  assert.equal(resumirFicha({ turnos: [], pedidos: [], fiado: null, ahora }).saldoFiado, null, "sin la tabla del fiado: null, no 0");
  assert.equal(avisarFaltazos(2, CRM_REGLAS.faltazosParaAviso), true);
  assert.equal(avisarFaltazos(1, CRM_REGLAS.faltazosParaAviso), false);
});

test("ficha única: un saldo dado de baja no es plata que entró (no suma a lo gastado) y ya no se debe", () => {
  const r = resumirFicha({
    turnos: [
      {
        id: "a",
        status: "COMPLETED",
        startsAt: new Date("2026-09-01T13:00:00Z"),
        precio: 20000,
        cobros: [
          { amount: 17000, method: "EFECTIVO", note: null },
          { amount: 3000, method: "EFECTIVO", note: notaDeCondonacion("se le perdonó la diferencia") },
        ],
        servicio: "Uñas",
        profesional: "Ana",
      },
      // Un turno viejo sin cobros propios, con el pago legado aprobado: cuenta como antes.
      {
        id: "b",
        status: "COMPLETED",
        startsAt: new Date("2026-08-01T13:00:00Z"),
        precio: 5000,
        cobros: [],
        pagoLegado: { status: "APPROVED", amount: 5000 },
        servicio: "Uñas",
        profesional: "Ana",
      },
    ],
    pedidos: [],
    fiado: null,
    ahora,
  });
  assert.equal(r.gastadoAnio, 17000 + 5000, "antes daba 25.000: sumaba los $3.000 dados de baja");
  assert.equal(r.saldoTurnos, 0, "lo dado de baja ya no se debe");
});

// ── Reseñas ──────────────────────────────────────────────────────────────────

test("reseñas: promedio con un decimal, sin publicar, y por profesional (más reseñas primero)", () => {
  const r = resumirResenasDeLista([
    { rating: 5, published: true, professionalId: "ana", profesional: "Ana" },
    { rating: 4, published: false, professionalId: "ana", profesional: "Ana" },
    { rating: 5, published: false, professionalId: "bea", profesional: "Bea" },
  ]);
  assert.equal(r.total, 3);
  assert.equal(r.promedio, 4.7);
  assert.equal(r.sinPublicar, 2);
  assert.deepEqual(r.porProfesional.map((p) => [p.profesional, p.cantidad, p.promedio]), [
    ["Ana", 2, 4.5],
    ["Bea", 1, 5],
  ]);
  assert.equal(resumirResenasDeLista([]).promedio, null);
});

// ── Textos ───────────────────────────────────────────────────────────────────

test("textos de contacto: primer nombre, link de la reseña, y según el rubro", () => {
  assert.equal(primerNombre("  María José Pérez "), "María");
  const base = { nombre: "María José", negocio: "CH Estética", servicio: "Uñas", diasParaCumple: 0 };
  assert.match(textoContacto("cumpleanios", base, "servicios"), /^Hola María, ¡feliz cumpleaños!/);
  assert.match(textoContacto("cumpleanios", { ...base, diasParaCumple: 3 }, "servicios"), /se viene tu cumpleaños/);
  assert.match(textoContacto("resena", { ...base, linkResena: "https://ch.x/reserva/turno/t1" }, "servicios"), /con Uñas\?.*: https:\/\/ch\.x\/reserva\/turno\/t1$/);
  assert.match(textoContacto("resena", base, "servicios"), /ayuda mucho\.$/);
  assert.match(textoContacto("recuperar", base, "servicios"), /te buscamos un turno para Uñas/);
  assert.match(textoContacto("recuperar", { ...base, negocio: "Magra" }, "mostrador"), /no pasás por Magra.*te preparamos el pedido/);
  assert.match(
    textoHuecoLiberado({ nombre: "Ana López", negocio: "CH", servicio: "Depilación", profesional: "Bea", cuando: "el jueves 25 a las 10:00" }),
    /^Hola Ana, .*se liberó un turno de Depilación el jueves 25 a las 10:00 con Bea\./,
  );
});

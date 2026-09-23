// "Para contactar hoy" EJECUTADA con datos: motivos y su prioridad, exclusiones (baja, contacto
// reciente, turno futuro, sin celular), el tope del día y la bandeja leída con una base falsa
// por la MISMA función que usan la pantalla y el número del Inicio.

import { test } from "node:test";
import assert from "node:assert/strict";
import { armarBandeja, detallePorMotivo, exclusionDe } from "./bandeja";
import { leerConstancias, type EventoConstancia } from "./constancias";
import { cargarBandeja, type DbCrm } from "./lecturas";
import type { Persona } from "./personas";
import { evaluarPersona, type Evaluacion } from "./segmentos";
import { CRM_REGLAS } from "./reglas";

const HOY = "2026-09-23";

function persona(id: string, extra: Partial<Persona> = {}): Persona {
  return {
    id,
    nombre: `Clienta ${id}`,
    telefono: "11 4000-7919",
    cumple: null,
    visitas: [],
    proximoTurno: null,
    sinResena: [],
    ...extra,
  };
}

/** Frecuente cada 30 días que no viene hace 60: en riesgo (2 ciclos). */
function enRiesgo(id: string, monto = 10000, extra: Partial<Persona> = {}): Persona {
  return persona(id, {
    visitas: [
      { fecha: "2026-06-25", monto, servicioId: "s", servicio: "Uñas" },
      { fecha: "2026-07-25", monto, servicioId: "s", servicio: "Uñas" },
    ],
    ...extra,
  });
}

const evaluar = (ps: Persona[]) => ps.map((p) => ({ persona: p, ev: evaluarPersona(p, HOY, new Map()) }));
const ev = (entity: string, action: string, entityId: string, iso: string): EventoConstancia => ({
  entity,
  action,
  entityId,
  createdAt: new Date(iso),
});
const sinConstancias = () => leerConstancias([], HOY);

test("motivos: pasada > reseña de ayer > cumpleaños > por recuperar (una fila por clienta)", () => {
  const ps = [
    enRiesgo("recu"),
    persona("cumple", { cumple: "09-25", visitas: [{ fecha: "2026-09-01", monto: 1, servicioId: "s", servicio: "Uñas" }] }),
    persona("resena", {
      cumple: "09-23", // también cumple, pero la reseña va antes
      visitas: [{ fecha: "2026-09-22", monto: 1, servicioId: "s", servicio: "Uñas" }],
      sinResena: [{ appointmentId: "t1", fecha: "2026-09-22", servicio: "Uñas" }],
    }),
    enRiesgo("pasada"),
  ];
  const c = leerConstancias([ev("ContactoCliente", "a_bandeja", "pasada", "2026-09-23T13:00:00Z")], HOY);
  const b = armarBandeja({ evaluadas: evaluar(ps), constancias: c, hoy: HOY, pedirResenas: true });
  assert.deepEqual(
    b.filas.map((f) => [f.clientId, f.motivo]),
    [
      ["pasada", "pasada"],
      ["resena", "resena"],
      ["cumple", "cumpleanios"],
      ["recu", "recuperar"],
    ],
  );
  assert.equal(b.filas[1].appointmentId, "t1");
  assert.match(b.filas[2].explicacion, /25 de septiembre \(en 2 días\)/);
  assert.equal(detallePorMotivo(b.porMotivo), "1 cumpleaños · 2 por recuperar · 1 reseña");
});

test("sin reseñas en un mostrador; la reseña es sólo del turno de AYER", () => {
  const ps = [
    persona("ayer", { sinResena: [{ appointmentId: "t1", fecha: "2026-09-22", servicio: "Uñas" }] }),
    persona("antes", { sinResena: [{ appointmentId: "t2", fecha: "2026-09-20", servicio: "Uñas" }] }),
  ];
  assert.equal(armarBandeja({ evaluadas: evaluar(ps), constancias: sinConstancias(), hoy: HOY, pedirResenas: false }).filas.length, 0);
  const conResenas = armarBandeja({ evaluadas: evaluar(ps), constancias: sinConstancias(), hoy: HOY, pedirResenas: true });
  assert.deepEqual(conResenas.filas.map((f) => f.clientId), ["ayer"]);
});

test("cumpleaños que cruza el año entra en la bandeja del 30/12", () => {
  const b = armarBandeja({
    evaluadas: [{ persona: persona("x", { cumple: "01-02" }), ev: evaluarPersona(persona("x"), "2026-12-30", new Map()) }],
    constancias: leerConstancias([], "2026-12-30"),
    hoy: "2026-12-30",
    pedirResenas: false,
  });
  assert.deepEqual(b.filas.map((f) => [f.motivo, f.diasParaCumple]), [["cumpleanios", 3]]);
  // Fuera de la ventana de 7 días, no.
  const lejos = armarBandeja({
    evaluadas: [{ persona: persona("x", { cumple: "01-10" }), ev: evaluarPersona(persona("x"), "2026-12-30", new Map()) }],
    constancias: leerConstancias([], "2026-12-30"),
    hoy: "2026-12-30",
    pedirResenas: false,
  });
  assert.equal(lejos.filas.length, 0);
});

test("exclusiones: baja, contactada hace menos de 14 días, turno futuro y sin celular — y se cuentan", () => {
  const ps = [
    enRiesgo("baja"),
    enRiesgo("hace13"),
    enRiesgo("hace14"),
    // Con turno reservado ya no está "en riesgo" (segmentos.ts); lo que la saca es el motivo
    // que sí tiene, el cumpleaños: no se le escribe a quien viene la semana que viene.
    persona("conTurno", { cumple: "09-24", proximoTurno: { startsAt: new Date("2026-09-30T13:00:00Z"), servicio: "Uñas" } }),
    enRiesgo("fijo", 10000, { telefono: "4555-1234" }), // 8 dígitos: no es un celular
    enRiesgo("entra"),
  ];
  const c = leerConstancias(
    [
      ev("ConsentimientoCliente", "baja", "baja", "2026-05-01T12:00:00Z"),
      ev("ContactoCliente", "contacto", "hace13", "2026-09-10T15:00:00Z"),
      ev("ContactoCliente", "contacto", "hace14", "2026-09-09T15:00:00Z"),
    ],
    HOY,
  );
  const b = armarBandeja({ evaluadas: evaluar(ps), constancias: c, hoy: HOY, pedirResenas: true });
  assert.deepEqual(b.filas.map((f) => f.clientId).sort(), ["entra", "hace14"]);
  assert.deepEqual(b.excluidas, { baja: 1, contactoReciente: 1, conTurno: 1, sinCelular: 1 });
  assert.equal(b.candidatas, 6);
  // La baja manda sobre todo, incluso si alguien la pasó a mano a la bandeja.
  assert.equal(
    exclusionDe(persona("baja"), leerConstancias([ev("ConsentimientoCliente", "baja", "baja", "2026-05-01T12:00:00Z")], HOY), HOY),
    "baja",
  );
});

test("tope del día: 15 contando las ya contactadas hoy, las de más valor primero", () => {
  const ps = Array.from({ length: 20 }, (_, i) => enRiesgo(`c${String(i).padStart(2, "0")}`, 1000 * (i + 1)));
  const libre = armarBandeja({ evaluadas: evaluar(ps), constancias: sinConstancias(), hoy: HOY, pedirResenas: false });
  assert.equal(libre.filas.length, CRM_REGLAS.topeBandejaPorDia);
  assert.equal(libre.pendientes, 20);
  assert.equal(libre.filas[0].clientId, "c19"); // la que más gasta
  // Ya se contactaron 12 hoy (otras): quedan 3 lugares.
  const hoy12 = Array.from({ length: 12 }, (_, i) => ev("ContactoCliente", "contacto", `otra${i}`, "2026-09-23T13:00:00Z"));
  const b = armarBandeja({ evaluadas: evaluar(ps), constancias: leerConstancias(hoy12, HOY), hoy: HOY, pedirResenas: false });
  assert.equal(b.filas.length, 3);
  assert.equal(b.contactadasHoy, 12);
});

test("la bandeja leída con una base falsa: dos lecturas, el negocio en el where, y al contactar sale", async () => {
  const ahora = new Date("2026-09-23T15:00:00.000Z");
  const turno = (id: string, status: string, iso: string) => ({
    id,
    status,
    startsAt: new Date(iso),
    serviceId: "s1",
    priceAtBooking: 15000,
    service: { name: "Uñas", price: 15000 },
    review: null,
  });
  const fichas = [
    {
      id: "ana",
      name: "Ana",
      phone: "11 4000-7919",
      birthDate: null,
      appointments: [turno("a1", "COMPLETED", "2026-06-25T13:00:00Z"), turno("a2", "COMPLETED", "2026-07-25T13:00:00Z")],
    },
    { id: "bea", name: "Bea", phone: "11 5000-1111", birthDate: new Date("1990-09-24T12:00:00.000Z"), appointments: [] },
  ];
  let eventos: EventoConstancia[] = [];
  const llamadas: { modelo: string; where: Record<string, unknown> }[] = [];
  const db = {
    client: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        llamadas.push({ modelo: "client", where: args.where });
        return fichas;
      },
    },
    auditLog: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        llamadas.push({ modelo: "auditLog", where: args.where });
        return eventos;
      },
    },
  } as unknown as DbCrm;

  const ctx = { tenantId: "t-qa", hoy: HOY, ahora, rubro: "servicios" as const };
  const { bandeja } = await cargarBandeja(db, ctx);
  assert.deepEqual(bandeja.filas.map((f) => [f.clientId, f.motivo]), [
    ["bea", "cumpleanios"],
    ["ana", "recuperar"],
  ]);
  assert.equal(llamadas.length, 2);
  for (const l of llamadas) assert.equal(l.where.tenantId, "t-qa");

  // Contactada hoy: al recargar no reaparece, y ocupa un lugar del tope.
  eventos = [{ entity: "ContactoCliente", action: "contacto", entityId: "ana", createdAt: new Date("2026-09-23T14:30:00Z") }];
  const recarga = await cargarBandeja(db, ctx);
  assert.deepEqual(recarga.bandeja.filas.map((f) => f.clientId), ["bea"]);
  assert.equal(recarga.bandeja.contactadasHoy, 1);
  assert.equal(recarga.bandeja.excluidas.contactoReciente, 1);
});

test("sin motivo no es candidata: una frecuente al día no entra", () => {
  const p = persona("ok", {
    visitas: [
      { fecha: "2026-08-24", monto: 1, servicioId: "s", servicio: "Uñas" },
      { fecha: "2026-09-13", monto: 1, servicioId: "s", servicio: "Uñas" },
    ],
  });
  const e: Evaluacion = evaluarPersona(p, HOY, new Map());
  assert.equal(e.segmento, "frecuente");
  const b = armarBandeja({ evaluadas: [{ persona: p, ev: e }], constancias: sinConstancias(), hoy: HOY, pedirResenas: true });
  assert.equal(b.candidatas, 0);
  assert.equal(b.filas.length, 0);
});

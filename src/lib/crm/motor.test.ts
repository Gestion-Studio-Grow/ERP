// El motor comercial EJECUTADO con datos: ciclo (mediana), bordes de segmento, cumpleaños que
// cruzan el año, constancias de contacto y permiso, e identidad por teléfono. Sin base.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cicloPersonal, ciclosPorServicio, intervalos, mediana } from "./ciclo";
import { diasEntre, diasHastaCumple, mesDiaDeNacimiento, sumarDias } from "./fechas";
import { evaluarPersona, porRecuperar, segmentoPorNumeros } from "./segmentos";
import { armarPersona, juntarPorDia, type FichaCruda } from "./personas";
import { contarConPermiso, leerConstancias, permisoTrasUnificar, pidioBaja, type EventoConstancia } from "./constancias";
import { compradoresSinFicha, gruposDuplicados, mismaClave, pedidosDeLaFicha } from "./identidad";
import { CRM_REGLAS } from "./reglas";
import { bordesDelMes, contarNuevas } from "./lecturas";

const v = (fecha: string, servicioId: string | null = "s1") => ({ fecha, servicioId });

// ── Ciclo ────────────────────────────────────────────────────────────────────

test("mediana: impar, par, vacía y desordenada", () => {
  assert.equal(mediana([30, 10, 20]), 20);
  assert.equal(mediana([10, 40, 20, 30]), 25);
  assert.equal(mediana([]), null);
  assert.equal(mediana([45]), 45);
});

test("ciclo propio = mediana de los intervalos: un viaje largo no lo corre", () => {
  // Cada 30 días, y una vez 120 (se fue de viaje): la mediana sigue siendo 30.
  const visitas = [v("2026-01-01"), v("2026-01-31"), v("2026-03-02"), v("2026-06-30"), v("2026-07-30")];
  assert.deepEqual(intervalos(visitas), [30, 30, 120, 30]);
  assert.deepEqual(cicloPersonal(visitas, new Map()), { dias: 30, fuente: "propio" });
});

test("ciclo: sin intervalos usa el del servicio; sin servicio, 45 días (provisional)", () => {
  const una = [v("2026-09-01", "depi")];
  assert.deepEqual(cicloPersonal(una, new Map([["depi", 28]])), { dias: 28, fuente: "servicio" });
  assert.deepEqual(cicloPersonal(una, new Map()), { dias: CRM_REGLAS.cicloPorDefectoDias, fuente: "defecto" });
  assert.deepEqual(cicloPersonal([], new Map()), { dias: 45, fuente: "defecto" });
});

test("ciclo: se acota a [7, 365] (dos visitas el mismo fin de semana no dan un ciclo de 2 días)", () => {
  assert.equal(cicloPersonal([v("2026-09-05"), v("2026-09-07")], new Map()).dias, 7);
  assert.equal(cicloPersonal([v("2024-01-01"), v("2026-01-01")], new Map()).dias, 365);
});

test("ciclo del servicio: sólo visitas consecutivas del MISMO servicio y con casos suficientes", () => {
  const historias = [
    [v("2026-01-01", "depi"), v("2026-01-29", "depi"), v("2026-02-26", "depi")], // 28, 28
    [v("2026-03-01", "depi"), v("2026-03-31", "depi")], // 30
    [v("2026-01-01", "unias"), v("2026-01-15", "depi")], // cambia de servicio: no cuenta
    [v("2026-05-01", "unias"), v("2026-05-15", "unias")], // un solo caso de uñas: no alcanza
  ];
  const porServicio = ciclosPorServicio(historias);
  assert.equal(porServicio.get("depi"), 28); // mediana de [28, 28, 30]
  assert.equal(porServicio.has("unias"), false);
});

// ── Segmentos: los bordes ────────────────────────────────────────────────────

test("bordes de segmento: 1,5 y 3 ciclos adentro de 'en riesgo', más de 3 es 'no volvió'", () => {
  const seg = (ciclosSinVenir: number, cantidadVisitas = 3, conTurno = false) =>
    segmentoPorNumeros({ cantidadVisitas, ciclosSinVenir, conTurno });
  assert.equal(seg(1.4), "frecuente");
  assert.equal(seg(1.5), "en-riesgo");
  assert.equal(seg(3), "en-riesgo");
  assert.equal(seg(3.1), "perdida");
  assert.equal(seg(1.4, 1), "nueva");
  assert.equal(seg(2, 1), "en-riesgo");
  // Con turno reservado nunca está en riesgo: está volviendo.
  assert.equal(seg(5, 3, true), "frecuente");
  assert.equal(seg(5, 1, true), "nueva");
  assert.equal(segmentoPorNumeros({ cantidadVisitas: 0, ciclosSinVenir: null, conTurno: true }), "sin-visitas");
});

test("evaluarPersona: días sin venir, ciclos con un decimal y valor por año", () => {
  const p = {
    id: "c1",
    nombre: "Ana",
    telefono: "11 4000-7919",
    cumple: null,
    visitas: juntarPorDia([
      { fecha: "2026-06-01", monto: 20000, servicioId: "s1", servicio: "Depilación" },
      { fecha: "2026-07-01", monto: 20000, servicioId: "s1", servicio: "Depilación" },
      { fecha: "2026-07-31", monto: 26000, servicioId: "s1", servicio: "Depilación" },
    ]),
    proximoTurno: null,
    sinResena: [],
  };
  // Ciclo 30 (mediana de 30 y 30). Hoy 23/09: 54 días sin venir → 1,8 ciclos → en riesgo.
  const ev = evaluarPersona(p, "2026-09-23", new Map());
  assert.equal(ev.ciclo.dias, 30);
  assert.equal(ev.diasSinVenir, 54);
  assert.equal(ev.ciclosSinVenir, 1.8);
  assert.equal(ev.segmento, "en-riesgo");
  assert.equal(ev.ticketPromedio, 22000);
  assert.equal(ev.valorAnual, Math.round(22000 * (365 / 30)));
  // Veinte días antes todavía estaba dentro de su ritmo.
  assert.equal(evaluarPersona(p, "2026-09-03", new Map()).segmento, "frecuente");
});

test("porRecuperar: sólo 'en riesgo', la que más vale primero", () => {
  const base = (id: string, segmento: "en-riesgo" | "perdida" | "frecuente", valorAnual: number) => ({
    id,
    ev: { segmento, valorAnual, diasSinVenir: 60 } as never,
  });
  const lista = porRecuperar([base("a", "en-riesgo", 100), base("b", "perdida", 999), base("c", "en-riesgo", 300), base("d", "frecuente", 500)]);
  assert.deepEqual(lista.map((x) => x.id), ["c", "a"]);
});

test("armarPersona: turnos completados son visitas (una por día), el reservado es el próximo, los sin reseña se anotan", () => {
  const ahora = new Date("2026-09-23T15:00:00.000Z");
  const turno = (id: string, status: string, iso: string, review: { id: string } | null = null) => ({
    id,
    status,
    startsAt: new Date(iso),
    serviceId: "s1",
    priceAtBooking: null,
    service: { name: "Uñas", price: 10000 },
    review,
  });
  const f: FichaCruda = {
    id: "c1",
    name: "Ana",
    phone: "1140007919",
    birthDate: new Date("1990-03-12T12:00:00.000Z"),
    appointments: [
      turno("t1", "COMPLETED", "2026-09-01T13:00:00.000Z", { id: "r1" }),
      turno("t2", "COMPLETED", "2026-09-01T15:00:00.000Z"), // mismo día: una sola visita
      turno("t3", "COMPLETED", "2026-09-22T14:00:00.000Z"), // ayer, sin reseña
      turno("t4", "CONFIRMED", "2026-10-05T14:00:00.000Z"),
      turno("t5", "PENDING", "2026-09-30T14:00:00.000Z"),
    ],
  };
  const p = armarPersona(f, "servicios", ahora);
  assert.deepEqual(p.visitas.map((x) => [x.fecha, x.monto]), [["2026-09-01", 20000], ["2026-09-22", 10000]]);
  assert.equal(p.proximoTurno?.startsAt.toISOString(), "2026-09-30T14:00:00.000Z");
  assert.deepEqual(p.sinResena.map((x) => x.appointmentId), ["t2", "t3"]);
  assert.equal(p.cumple, "03-12");
});

test("armarPersona en un mostrador: las visitas son los pedidos", () => {
  const p = armarPersona(
    { id: "c1", name: "Juan", phone: "1140007919", birthDate: null, orders: [{ id: "o1", createdAt: new Date("2026-09-10T15:00:00.000Z"), total: 8000 }] },
    "mostrador",
    new Date("2026-09-23T15:00:00.000Z"),
  );
  assert.deepEqual(p.visitas, [{ fecha: "2026-09-10", monto: 8000, servicioId: null, servicio: null }]);
  assert.equal(p.proximoTurno, null);
});

// ── Fechas y cumpleaños ──────────────────────────────────────────────────────

test("cumpleaños que cruza el año: el 30/12, uno del 2/1 está a 3 días", () => {
  assert.equal(diasHastaCumple("01-02", "2026-12-30"), 3);
  assert.equal(diasHastaCumple("12-30", "2026-12-30"), 0);
  // Ya pasó este año: el próximo es el del año que viene.
  assert.equal(diasHastaCumple("12-29", "2026-12-30"), 364);
  assert.equal(diasHastaCumple("09-23", "2026-09-23"), 0);
});

test("29 de febrero: en un año no bisiesto se festeja el 28 (provisional)", () => {
  assert.equal(diasHastaCumple("02-29", "2027-02-27"), 1); // 28/02/2027
  assert.equal(diasHastaCumple("02-29", "2028-02-27"), 2); // 29/02/2028, bisiesto
  assert.equal(diasHastaCumple("02-29", "2027-03-01"), 365); // ya pasó: 29/02/2028
});

test("el cumpleaños se lee con la convención de las 12:00Z (no se corre un día)", () => {
  assert.equal(mesDiaDeNacimiento(new Date("1990-03-12T12:00:00.000Z")), "03-12");
  assert.equal(mesDiaDeNacimiento(null), null);
  assert.equal(diasEntre("2026-02-27", "2026-03-01"), 2);
  assert.equal(sumarDias("2026-12-31", 1), "2027-01-01");
});

test("nuevos del mes: primera visita dentro del mes del negocio, con sus bordes", () => {
  const mes = bordesDelMes("2026-09-23");
  assert.equal(mes.desde.toISOString(), "2026-09-01T03:00:00.000Z");
  assert.equal(mes.hasta.toISOString(), "2026-10-01T03:00:00.000Z");
  const primeras = [
    new Date("2026-09-01T02:59:00.000Z"), // 31/08 23:59 en Buenos Aires: no
    new Date("2026-09-01T03:00:00.000Z"), // 01/09 00:00: sí
    new Date("2026-09-30T23:00:00.000Z"), // 30/09 20:00: sí
    new Date("2026-10-01T03:00:00.000Z"), // 01/10: no
  ];
  assert.equal(contarNuevas(primeras, mes), 2);
  assert.equal(bordesDelMes("2026-12-05").hasta.toISOString(), "2027-01-01T03:00:00.000Z");
});

// ── Constancias ──────────────────────────────────────────────────────────────

const ev = (entity: string, action: string, entityId: string, iso: string): EventoConstancia => ({
  entity,
  action,
  entityId,
  createdAt: new Date(iso),
});

test("permiso: vale el ÚLTIMO evento; sin eventos no hay baja", () => {
  const eventos = [
    ev("ConsentimientoCliente", "baja", "a", "2026-09-01T12:00:00Z"),
    ev("ConsentimientoCliente", "alta", "a", "2026-09-10T12:00:00Z"),
    ev("ConsentimientoCliente", "baja", "b", "2026-09-10T12:00:00Z"),
  ];
  assert.equal(pidioBaja(eventos, "a"), false);
  assert.equal(pidioBaja(eventos, "b"), true);
  assert.equal(pidioBaja(eventos, "c"), false);
  assert.equal(contarConPermiso(["a", "b", "c"], eventos), 2);
  // Desordenados llegan igual: se ordena por fecha.
  assert.equal(pidioBaja([...eventos].reverse(), "a"), false);
});

test("constancias del día: contactos de hoy (día del negocio), pasadas a la bandeja y bajas", () => {
  const c = leerConstancias(
    [
      ev("ContactoCliente", "contacto", "a", "2026-09-23T13:00:00Z"),
      ev("ContactoCliente", "contacto", "b", "2026-09-23T02:00:00Z"), // 22/09 23:00 en BA: ayer
      ev("ContactoCliente", "a_bandeja", "c", "2026-09-23T12:00:00Z"),
      ev("ContactoCliente", "a_bandeja", "d", "2026-09-20T12:00:00Z"), // otro día: no cuenta
      ev("ConsentimientoCliente", "baja", "e", "2026-01-01T12:00:00Z"),
    ],
    "2026-09-23",
  );
  assert.equal(c.contactadasHoy, 1);
  assert.equal(c.ultimoContacto.get("b"), "2026-09-22");
  assert.deepEqual([...c.pasadasHoy], ["c"]);
  assert.deepEqual([...c.bajas], ["e"]);
});

test("al unificar, el permiso que queda es el último que expresó la persona en cualquiera de sus fichas", () => {
  const eventos = [
    ev("ConsentimientoCliente", "alta", "queda", "2026-09-01T12:00:00Z"),
    ev("ConsentimientoCliente", "baja", "dup", "2026-09-10T12:00:00Z"),
  ];
  assert.equal(permisoTrasUnificar(eventos, "queda", ["dup"]), "baja");
  assert.equal(permisoTrasUnificar(eventos.slice(0, 1), "queda", ["dup"]), null);
  assert.equal(permisoTrasUnificar([...eventos, ev("ConsentimientoCliente", "alta", "queda", "2026-09-20T12:00:00Z")], "queda", ["dup"]), null);
  assert.equal(permisoTrasUnificar([], "queda", ["dup"]), null);
});

// ── Identidad ────────────────────────────────────────────────────────────────

test("fichas duplicadas: el mismo número escrito distinto agrupa; sin dígitos no", () => {
  const fichas = [
    { id: "a", name: "Ana", phone: "11 4000-7919", turnos: 1, createdAt: "2026-01-01" },
    { id: "b", name: "Ana P.", phone: "+54 9 11 4000 7919", turnos: 5, createdAt: "2026-02-01" },
    { id: "c", name: "Otra", phone: "11 5555-0000", turnos: 0 },
    { id: "d", name: "Sin tel 1", phone: "", turnos: 0 },
    { id: "e", name: "Sin tel 2", phone: "-", turnos: 0 },
  ];
  const grupos = gruposDuplicados(fichas);
  assert.equal(grupos.length, 1);
  assert.deepEqual(grupos[0].fichas.map((f) => f.id).sort(), ["a", "b"]);
  // La que se propone conservar es la de más turnos: la que el alta de turno ya viene usando.
  assert.equal(grupos[0].sugerida.id, "b");
  assert.equal(mismaClave([{ phone: "11 4000-7919" }, { phone: "5491140007919" }]), true);
  assert.equal(mismaClave([{ phone: "11 4000-7919" }, { phone: "11 5555-0000" }]), false);
  assert.equal(mismaClave([{ phone: "" }, { phone: "" }]), false);
});

test("pedidos de la ficha: los atados y los que llegaron sin ficha con su número", () => {
  const pedidos = [
    { id: "o1", clientId: "c1", customerPhone: "cualquiera" },
    { id: "o2", clientId: null, customerPhone: "+54 9 11 4000-7919" }, // tienda, antes de tener ficha
    { id: "o3", clientId: null, customerPhone: "11 5555-0000" }, // otra persona
    { id: "o4", clientId: "c2", customerPhone: "1140007919" }, // atado a OTRA ficha: no es suyo
  ];
  assert.deepEqual(pedidosDeLaFicha("c1", "11 4000-7919", pedidos).map((p) => p.id), ["o1", "o2"]);
});

test("compradores sin ficha: agrupa por número, saca los que ya tienen ficha y los números a medias", () => {
  const d = (iso: string) => new Date(iso);
  const lista = compradoresSinFicha(
    [
      { customerName: "Juan", customerPhone: "11 5555-0000", createdAt: d("2026-09-01T12:00:00Z") },
      { customerName: "Juan Pérez", customerPhone: "+54 9 11 5555 0000", createdAt: d("2026-09-10T12:00:00Z") },
      { customerName: "Ana", customerPhone: "1140007919", createdAt: d("2026-09-12T12:00:00Z") }, // ya tiene ficha
      { customerName: "Mostrador", customerPhone: "0", createdAt: d("2026-09-13T12:00:00Z") },
    ],
    [{ phone: "11 4000-7919" }],
  );
  assert.deepEqual(lista.map((c) => [c.clave, c.nombre, c.pedidos]), [["1155550000", "Juan Pérez", 2]]);
});

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  diaMas,
  entraEnFiltro,
  estaResuelto,
  fechaCorta,
  fechaLarga,
  leerFiltroAgenda,
  lineaDeLaAgenda,
  lugarDeLaRaya,
  marcaDelTurno,
  minutosEntre,
  nombreRelativo,
  pasoDelTurno,
  turnoDelDia,
  verboDelPaso,
  type Permisos,
  type TurnoCrudo,
  type TurnoDelDia,
} from "./agenda-core";

// Jueves 24 de septiembre de 2026, 11:32 en Buenos Aires (14:32 UTC).
const AHORA = new Date("2026-09-24T14:32:00.000Z");
const TODO: Permisos = { gestionar: true, cobrar: true, terminar: true };
const PROFESIONAL: Permisos = { gestionar: false, cobrar: true, terminar: true };
const OK = { ok: true } as const;

function crudo(p: Partial<TurnoCrudo> & { hora: string; minutos?: number }): TurnoCrudo {
  const inicio = new Date(`2026-09-24T${p.hora}:00.000-03:00`);
  const fin = new Date(inicio.getTime() + (p.minutos ?? 45) * 60000);
  return {
    id: p.id ?? `t-${p.hora}`,
    clientId: "c1",
    startsAt: inicio,
    endsAt: fin,
    status: p.status ?? "CONFIRMED",
    notes: null,
    priceAtBooking: p.priceAtBooking ?? null,
    reminderSentAt: null,
    professionalId: "p1",
    serviceId: "s1",
    client: { name: "Camila Ortiz", phone: "11 5555-0101" },
    service: p.service ?? { name: "Peeling químico", price: 22000, depositAmount: null },
    professional: p.professional ?? { name: "Carla Díaz" },
    box: { name: "Box 3" },
    payment: p.payment ?? null,
    collections: p.collections ?? [],
  };
}

const turno = (p: Partial<TurnoCrudo> & { hora: string; minutos?: number }, veredicto: TurnoDelDia["veredicto"] = OK) => turnoDelDia(crudo(p), veredicto);

describe("el renglón de un turno lee la plata con las reglas de siempre", () => {
  test("precio congelado al reservar manda sobre el del servicio", () => {
    const t = turno({ hora: "10:00", priceAtBooking: 18000 });
    assert.equal(t.precio, 18000);
    assert.equal(t.saldo, 18000);
  });

  test("una condonación no es plata que entró: cobrado y dado de baja van separados", () => {
    const t = turno({
      hora: "09:30",
      status: "COMPLETED",
      collections: [
        { id: "k1", amount: 17000, method: "EFECTIVO", note: null },
        { id: "k2", amount: 5000, method: "EFECTIVO", note: "CONDONACION: descuento de la dueña" },
      ],
    });
    assert.equal(t.cobrado, 17000);
    assert.equal(t.condonado, 5000);
    assert.equal(t.saldo, 0);
    assert.equal(t.cuentaACobrar, false);
  });

  test("sin cobros propios manda el pago viejo aprobado", () => {
    const t = turno({ hora: "09:30", status: "COMPLETED", payment: { status: "APPROVED", amount: 22000 } });
    assert.equal(t.cobrado, 22000);
    assert.equal(t.saldo, 0);
  });

  test("la seña del servicio se propone mientras no entró nada", () => {
    const t = turno({ hora: "16:00", service: { name: "Radiofrecuencia", price: 25000, depositAmount: 5000 } });
    assert.equal(t.senia, 5000);
    assert.deepEqual(t.sugerido, { tipo: "senia", monto: 5000 });
  });
});

describe("una tecla por renglón: el paso que sigue", () => {
  test("reservado → Confirmar, sólo para quien gestiona la agenda", () => {
    const t = turno({ hora: "13:45", status: "PENDING" });
    assert.deepEqual(pasoDelTurno(t, TODO, AHORA), { tipo: "confirmar" });
    assert.deepEqual(pasoDelTurno(t, PROFESIONAL, AHORA), { tipo: "ninguno" });
  });

  test("confirmado que empezó → Terminar y cobrar el saldo", () => {
    const t = turno({ hora: "11:15" });
    assert.deepEqual(pasoDelTurno(t, TODO, AHORA), { tipo: "terminar", saldo: 22000, conCobro: true });
    assert.equal(verboDelPaso(pasoDelTurno(t, TODO, AHORA)), "Terminar y cobrar");
  });

  test("si la profesional cobra aparte, la recepción termina sin cobrar (el veredicto del servidor)", () => {
    const t = turno({ hora: "11:15" }, { ok: false, motivo: "Vero cobra sus propios turnos." });
    assert.deepEqual(pasoDelTurno(t, TODO, AHORA), { tipo: "terminar", saldo: 22000, conCobro: false });
    assert.equal(verboDelPaso(pasoDelTurno(t, TODO, AHORA)), "Terminar");
  });

  test("confirmado que todavía no empezó, con seña sin cobrar → Cobrar la seña", () => {
    const t = turno({ hora: "16:00", service: { name: "Radiofrecuencia", price: 25000, depositAmount: 5000 } });
    assert.deepEqual(pasoDelTurno(t, TODO, AHORA), { tipo: "cobrar-senia", monto: 5000 });
  });

  test("confirmado que no empezó y sin seña → ninguna tecla (no se inventa «Llegó»)", () => {
    assert.deepEqual(pasoDelTurno(turno({ hora: "17:00" }), TODO, AHORA), { tipo: "ninguno" });
  });

  test("terminado con saldo → Cobrar el saldo; terminado y saldado → nada", () => {
    const debe = turno({ hora: "09:30", status: "COMPLETED", collections: [{ id: "a", amount: 7000, method: "EFECTIVO" }] });
    assert.deepEqual(pasoDelTurno(debe, TODO, AHORA), { tipo: "cobrar", monto: 15000 });
    const pagado = turno({ hora: "09:30", status: "COMPLETED", collections: [{ id: "a", amount: 22000, method: "EFECTIVO" }] });
    assert.deepEqual(pasoDelTurno(pagado, TODO, AHORA), { tipo: "ninguno" });
  });

  test("no vino → nada", () => {
    assert.deepEqual(pasoDelTurno(turno({ hora: "10:00", status: "NO_SHOW" }), TODO, AHORA), { tipo: "ninguno" });
  });

  test("sin agenda:complete no se ofrece terminar", () => {
    assert.deepEqual(pasoDelTurno(turno({ hora: "11:15" }), { gestionar: true, cobrar: true, terminar: false }, AHORA), { tipo: "ninguno" });
  });
});

describe("la marca dice el estado con forma y palabra, sin inventar estados", () => {
  test("confirmado en su horario, sin cerrar y futuro", () => {
    assert.deepEqual(marcaDelTurno(turno({ hora: "11:15", minutos: 40 }), AHORA), { tipo: "medias", texto: "En su horario" });
    assert.deepEqual(marcaDelTurno(turno({ hora: "10:00", minutos: 60 }), AHORA), { tipo: "atencion", texto: "Sin cerrar" });
    assert.deepEqual(marcaDelTurno(turno({ hora: "17:00" }), AHORA), { tipo: "hecho", texto: "Confirmado" });
  });

  test("reservado: sin confirmar o con la hora pasada", () => {
    assert.equal(marcaDelTurno(turno({ hora: "13:45", status: "PENDING" }), AHORA).texto, "Reservado, sin confirmar");
    assert.equal(marcaDelTurno(turno({ hora: "09:00", status: "PENDING" }), AHORA).texto, "Reservado, ya pasó la hora");
  });

  test("terminado: cobrado, sin cobro o con saldo", () => {
    const cobrado = turno({ hora: "09:30", status: "COMPLETED", collections: [{ id: "a", amount: 22000, method: "EFECTIVO" }] });
    assert.equal(marcaDelTurno(cobrado, AHORA).texto, "Terminado y cobrado");
    assert.equal(estaResuelto(cobrado), true);
    const debe = turno({ hora: "09:30", status: "COMPLETED" });
    assert.equal(marcaDelTurno(debe, AHORA).texto, "Terminado, falta cobrar");
    assert.equal(estaResuelto(debe), false);
  });
});

describe("filtros y línea de estado", () => {
  const dia = [
    turno({ hora: "09:30", status: "COMPLETED", collections: [{ id: "a", amount: 22000, method: "EFECTIVO" }] }),
    turno({ hora: "10:00", professional: { name: "Laura Gómez" } }),
    turno({ hora: "11:15" }),
    turno({ hora: "13:45", status: "PENDING" }),
    turno({ hora: "16:00", status: "PENDING", service: { name: "Radiofrecuencia", price: 25000, depositAmount: 5000 } }),
  ];

  test("«9 turnos · 3 sin confirmar · 1 por cobrar · Carla con 5»", () => {
    const l = lineaDeLaAgenda(dia, AHORA);
    assert.equal(l.turnos, 5);
    assert.equal(l.sinConfirmar, 2);
    assert.equal(l.porCobrar, 1); // la seña de las 16:00
    assert.equal(l.sinCerrar, 2); // 10:00 y 11:15 ya empezaron y siguen confirmados
    assert.deepEqual(l.masCargada, { nombre: "Carla Díaz", turnos: 4 });
  });

  test("una sola profesional no se nombra", () => {
    assert.equal(lineaDeLaAgenda(dia.slice(2), AHORA).masCargada, null);
  });

  test("el filtro que no existe es «todos»", () => {
    assert.equal(leerFiltroAgenda("cualquiera"), "todos");
    assert.equal(leerFiltroAgenda("por-cobrar"), "por-cobrar");
    assert.equal(dia.filter((t) => entraEnFiltro(t, "sin-cerrar", AHORA)).length, 2);
  });

  test("la raya de «ahora» va antes del primer turno que no empezó, sólo hoy", () => {
    assert.equal(lugarDeLaRaya(dia, true, AHORA), 3);
    assert.equal(lugarDeLaRaya(dia, false, AHORA), null);
    assert.equal(lugarDeLaRaya(dia.slice(3), true, AHORA), null); // ninguno empezó: la raya arriba no dice nada
    assert.equal(lugarDeLaRaya(dia.slice(0, 2), true, AHORA), null); // todos empezaron
  });
});

describe("fechas del libro", () => {
  test("«Jueves 24 de septiembre», con mayúscula y sin «De»", () => {
    assert.equal(fechaLarga("2026-09-24"), "Jueves 24 de septiembre");
    assert.equal(fechaLarga("2026-01-01"), "Jueves 1 de enero");
  });

  test("teclas de día cortas y aritmética de calendario", () => {
    assert.equal(fechaCorta("2026-09-25"), "vie 25");
    assert.equal(diaMas("2026-09-30", 1), "2026-10-01");
    assert.equal(diaMas("2026-03-01", -1), "2026-02-28");
    assert.equal(nombreRelativo("2026-09-25", "2026-09-24"), "Mañana");
    assert.equal(nombreRelativo("2026-09-23", "2026-09-24"), "Ayer");
    assert.equal(nombreRelativo("2026-09-28", "2026-09-24"), null);
    assert.equal(minutosEntre("2026-09-24T14:15:00.000Z", "2026-09-24T14:55:00.000Z"), 40);
  });
});

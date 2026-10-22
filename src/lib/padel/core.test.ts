import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESTADOS_QUE_OCUPAN,
  armarMensaje,
  esDeuda,
  esPagable,
  pagoAlCancelar,
  saldoAFavor,
  saldoCubre,
  totalDeuda,
  PLANTILLAS_DEFAULT,
  plantillaConfirmada,
  comprobanteValido,
  diaCorto,
  franjasLibres,
  hayChoque,
  horarioDisponible,
  linkWhatsApp,
  nombreValido,
  precioDe,
  proximaSemana,
  puedeCancelarAlumno,
  puedePedir,
  repetidaNaceConfirmada,
  telefonoAlumno,
  tokenValido,
  transicionClase,
  transicionPago,
  ventanasDelDia,
  type Franja,
} from "./core";

// 2026-10-20 es martes. Hora argentina = UTC-3.
const MARTES = "2026-10-20";
const semana: Franja[] = [
  { diaSemana: 2, fecha: null, desde: "08:00", hasta: "11:00", tipo: "DA" },
  { diaSemana: 2, fecha: null, desde: "17:00", hasta: "19:00", tipo: "DA" },
  { diaSemana: 3, fecha: null, desde: "08:00", hasta: "12:00", tipo: "DA" },
];
const lunesALaNoche = new Date("2026-10-19T23:00:00-03:00");
const hora = (h: string) => new Date(`${MARTES}T${h}:00-03:00`);

test("clase: el profe confirma, rechaza, la da o marca ausente; el alumno sólo cancela", () => {
  assert.equal(transicionClase("PEDIDA", "confirmar", "profe"), "CONFIRMADA");
  assert.equal(transicionClase("PEDIDA", "confirmar", "alumno"), null);
  assert.equal(transicionClase("PEDIDA", "rechazar", "profe"), "RECHAZADA");
  assert.equal(transicionClase("CONFIRMADA", "dar", "profe"), "DADA");
  assert.equal(transicionClase("CONFIRMADA", "ausente", "profe"), "AUSENTE");
  assert.equal(transicionClase("CONFIRMADA", "cancelar", "alumno"), "CANCELADA");
  assert.equal(transicionClase("DADA", "cancelar", "alumno"), null);
  assert.equal(transicionClase("RECHAZADA", "confirmar", "profe"), null);
  assert.equal(transicionClase("CUALQUIERA", "dar", "profe"), null);
});

test("pago: el alumno sube, el profe valida o lo devuelve; efectivo en un toque", () => {
  assert.equal(transicionPago("PENDIENTE", "CONFIRMADA", "subir", "alumno"), "EN_REVISION");
  assert.equal(transicionPago("EN_REVISION", "CONFIRMADA", "subir", "alumno"), "EN_REVISION", "puede mandar otro");
  assert.equal(transicionPago("PAGADO", "CONFIRMADA", "subir", "alumno"), null);
  assert.equal(transicionPago("EN_REVISION", "DADA", "validar", "profe"), "PAGADO");
  assert.equal(transicionPago("EN_REVISION", "DADA", "validar", "alumno"), null);
  assert.equal(transicionPago("EN_REVISION", "DADA", "noValido", "profe"), "PENDIENTE");
  assert.equal(transicionPago("PENDIENTE", "DADA", "efectivo", "profe"), "PAGADO");
  assert.equal(transicionPago("PENDIENTE", "CANCELADA", "efectivo", "profe"), null, "una cancelada no se cobra");
});

test("ventanas: franjas del día de la semana + extras de la fecha; los bloqueos aparte", () => {
  const conExcepciones: Franja[] = [
    ...semana,
    { diaSemana: null, fecha: MARTES, desde: "13:00", hasta: "14:00", tipo: "DA" },
    { diaSemana: null, fecha: MARTES, desde: "08:00", hasta: "09:00", tipo: "NO" },
  ];
  const { ventanas, bloqueos } = ventanasDelDia(MARTES, conExcepciones);
  assert.equal(ventanas.length, 3);
  assert.equal(bloqueos.length, 1);
  assert.equal(ventanas[0].startsAt.toISOString(), "2026-10-20T11:00:00.000Z", "08:00 AR = 11:00 UTC");
});

test("franjas libres: de a una clase, sin pisar ocupadas ni bloqueos", () => {
  const libres = franjasLibres({ fecha: MARTES, franjas: semana, ocupadas: [{ startsAt: hora("09:00"), endsAt: hora("10:00") }], duracionMin: 60, anticipacionMin: 120, ahora: lunesALaNoche });
  assert.deepEqual(libres, [hora("08:00"), hora("10:00"), hora("17:00"), hora("18:00")].map((d) => d.toISOString()));
});

test("franjas libres: no ofrece lo que empieza antes de la anticipación mínima", () => {
  const libres = franjasLibres({ fecha: MARTES, franjas: semana, ocupadas: [], duracionMin: 60, anticipacionMin: 120, ahora: hora("07:30") });
  assert.equal(libres[0], hora("10:00").toISOString(), "08:00 y 09:00 están a menos de 2 h");
});

test("franjas libres: un bloqueo de lluvia saca las franjas que toca", () => {
  const lluvia: Franja[] = [...semana, { diaSemana: null, fecha: MARTES, desde: "17:00", hasta: "19:00", tipo: "NO" }];
  const libres = franjasLibres({ fecha: MARTES, franjas: lluvia, ocupadas: [], duracionMin: 60, anticipacionMin: 0, ahora: lunesALaNoche });
  assert.deepEqual(libres, [hora("08:00"), hora("09:00"), hora("10:00")].map((d) => d.toISOString()));
});

test("franjas libres: un día sin franjas no ofrece nada; una franja rota se ignora", () => {
  assert.deepEqual(franjasLibres({ fecha: "2026-10-25", franjas: semana, ocupadas: [], duracionMin: 60, anticipacionMin: 0, ahora: lunesALaNoche }), []);
  const rota: Franja[] = [{ diaSemana: 2, fecha: null, desde: "19:00", hasta: "08:00", tipo: "DA" }];
  assert.deepEqual(franjasLibres({ fecha: MARTES, franjas: rota, ocupadas: [], duracionMin: 60, anticipacionMin: 0, ahora: lunesALaNoche }), []);
});

test("el servidor vuelve a chequear: un horario fuera de grilla o tomado no pasa", () => {
  const base = { fecha: MARTES, franjas: semana, duracionMin: 60, anticipacionMin: 120, ahora: lunesALaNoche };
  assert.equal(horarioDisponible({ ...base, ocupadas: [], empiezaEn: hora("08:00") }), true);
  assert.equal(horarioDisponible({ ...base, ocupadas: [], empiezaEn: hora("08:30") }), false, "fuera de grilla");
  assert.equal(horarioDisponible({ ...base, ocupadas: [{ startsAt: hora("08:00"), endsAt: hora("09:00") }], empiezaEn: hora("08:00") }), false);
});

test("choques con bordes estrictos", () => {
  const ocupada = [{ startsAt: hora("10:00"), endsAt: hora("11:00") }];
  assert.equal(hayChoque(hora("11:00"), hora("12:00"), ocupada), false);
  assert.equal(hayChoque(hora("10:30"), hora("11:30"), ocupada), true);
});

test("tope de pedidos sin confirmar por teléfono", () => {
  assert.equal(puedePedir(0, 2), true);
  assert.equal(puedePedir(1, 2), true);
  assert.equal(puedePedir(2, 2), false);
  assert.equal(puedePedir(0, 0), true, "un tope en 0 se trata como 1");
});

test("la semana que viene: la misma hora de pared", () => {
  assert.equal(proximaSemana(hora("18:00")).toISOString(), "2026-10-27T21:00:00.000Z");
});

test("el alumno cancela solo con anticipación y solo lo que está vivo", () => {
  assert.equal(puedeCancelarAlumno("CONFIRMADA", hora("18:00"), hora("15:00"), 120), true);
  assert.equal(puedeCancelarAlumno("CONFIRMADA", hora("18:00"), hora("17:00"), 120), false);
  assert.equal(puedeCancelarAlumno("DADA", hora("18:00"), hora("08:00"), 120), false);
});

test("repetir: nace confirmada si el alumno ya tomó alguna clase", () => {
  assert.equal(repetidaNaceConfirmada(0), false);
  assert.equal(repetidaNaceConfirmada(3), true);
});

test("precio: individual fijo; grupal por persona, de 1 a 4", () => {
  const c = { precioIndividual: 25000, precioGrupal: 12000 };
  assert.equal(precioDe(c, "INDIVIDUAL", 3), 25000);
  assert.equal(precioDe(c, "GRUPAL", 3), 36000);
  assert.equal(precioDe(c, "GRUPAL", 9), 48000);
  assert.equal(precioDe(c, "GRUPAL", 0), 12000);
});

test("teléfono y wa.me: celular argentino de 10 dígitos con el 549 adelante", () => {
  assert.equal(telefonoAlumno("011 15-5183-9732"), "1151839732");
  assert.equal(telefonoAlumno("+54 9 11 5183-9732"), "1151839732");
  assert.equal(telefonoAlumno("123"), "");
  assert.equal(linkWhatsApp("11 5183 9732", "hola che"), "https://wa.me/5491151839732?text=hola%20che");
  assert.equal(linkWhatsApp("", "hola"), null);
});

test("mensajes: las variables sin dato se borran", () => {
  assert.equal(armarMensaje("Hola {nombre}! Alias {alias}.", { nombre: "Juan" }), "Hola Juan! Alias .");
  assert.equal(armarMensaje("{a}  {b}", { a: "x", b: "y" }), "x y");
});

test("validaciones de entrada", () => {
  assert.equal(comprobanteValido("data:image/jpeg;base64,AAAA"), true);
  assert.equal(comprobanteValido("data:text/html;base64,AAAA"), false);
  assert.equal(comprobanteValido(`data:image/jpeg;base64,${"A".repeat(400_001)}`), false);
  assert.equal(tokenValido("abcdefghijklmnopqrstuvwx"), true);
  assert.equal(tokenValido("../../etc"), false);
  assert.equal(nombreValido("  Juan   Pérez "), "Juan Pérez");
  assert.equal(nombreValido("J"), null);
});

test("chip de día corto", () => {
  assert.equal(diaCorto(MARTES), "mar 20");
});

test("clase confirmada: sin precio no dice «$ 0» y sin alias no promete uno; la editada no se toca", () => {
  const def = PLANTILLAS_DEFAULT.confirmada;
  assert.equal(plantillaConfirmada(def, { hayPrecio: true, hayAlias: true }), def);
  assert.doesNotMatch(plantillaConfirmada(def, { hayPrecio: true, hayAlias: false }), /\{alias\}/);
  assert.doesNotMatch(plantillaConfirmada(def, { hayPrecio: false, hayAlias: true }), /\{precio\}/);
  const nada = plantillaConfirmada(def, { hayPrecio: false, hayAlias: false });
  assert.doesNotMatch(nada, /\{precio\}|\{alias\}/);
  assert.match(nada, /\{link\}/);
  assert.equal(plantillaConfirmada("Mi texto {precio}", { hayPrecio: false, hayAlias: false }), "Mi texto {precio}");
});

// ── Tanda 1: plata (B2/B4) ──────────────────────────────────────────────────

test("B4: una clase cancelada después de pagar queda acreditada (saldo a favor), sin perder el pago", () => {
  const pagada = { estado: "CONFIRMADA", pagoEstado: "PAGADO", pagoMedio: "TRANSFERENCIA", precio: 25_000 };
  const cambio = pagoAlCancelar(pagada);
  assert.deepEqual(cambio, { pagoEstado: "ACREDITADO" });
  const cancelada = { ...pagada, estado: "CANCELADA", ...cambio! };
  assert.equal(saldoAFavor([cancelada]), 25_000, "los $ 25.000 quedan a favor");
  assert.equal(esDeuda(cancelada), false);
  assert.equal(esPagable(cancelada), false);
  // La transición de pago lo confirma: sólo se acredita una pagada que se canceló o rechazó.
  assert.equal(transicionPago("PAGADO", "CANCELADA", "acreditar", "profe"), "ACREDITADO");
  assert.equal(transicionPago("PAGADO", "RECHAZADA", "acreditar", "alumno"), "ACREDITADO");
  assert.equal(transicionPago("PAGADO", "CONFIRMADA", "acreditar", "profe"), null, "viva: no se acredita");
  assert.equal(transicionPago("PENDIENTE", "CANCELADA", "acreditar", "profe"), null, "sin pagar no hay qué acreditar");
});

test("cancelar: sin pagar o con el comprobante por revisar no cambia el pago; pagada con saldo devuelve el saldo", () => {
  assert.equal(pagoAlCancelar({ pagoEstado: "PENDIENTE" }), null);
  assert.equal(pagoAlCancelar({ pagoEstado: "EN_REVISION", pagoMedio: "TRANSFERENCIA" }), null);
  // Juan tenía $ 25.000 a favor, los usó en otra clase y esa también se cancela: le vuelven los $ 25.000, no $ 50.000.
  const origen = { estado: "CANCELADA", pagoEstado: "ACREDITADO", pagoMedio: "EFECTIVO", precio: 25_000 };
  const usada = { estado: "CONFIRMADA", pagoEstado: "PAGADO", pagoMedio: "SALDO_A_FAVOR", precio: 25_000 };
  assert.equal(saldoAFavor([origen, usada]), 0);
  const cambio = pagoAlCancelar(usada);
  assert.deepEqual(cambio, { pagoEstado: "PENDIENTE", pagoMedio: null });
  assert.equal(saldoAFavor([origen, { ...usada, estado: "CANCELADA", ...cambio! }]), 25_000);
});

test("saldo a favor: acreditado − usado; lo devuelto no cuenta; un saldo parcial no se aplica", () => {
  const acreditada = { estado: "CANCELADA", pagoEstado: "ACREDITADO", pagoMedio: "EFECTIVO", precio: 25_000 };
  assert.equal(saldoAFavor([]), 0);
  assert.equal(saldoAFavor([acreditada]), 25_000);
  assert.equal(saldoAFavor([acreditada, { estado: "DADA", pagoEstado: "PAGADO", pagoMedio: "SALDO_A_FAVOR", precio: 25_000 }]), 0, "usado");
  assert.equal(saldoAFavor([{ ...acreditada, pagoEstado: "DEVUELTO" }]), 0, "«Le devolví»");
  assert.equal(saldoAFavor([{ estado: "DADA", pagoEstado: "PAGADO", pagoMedio: "EFECTIVO", precio: 25_000 }]), 0, "pagar no genera saldo");
  assert.equal(saldoCubre(25_000, 25_000), true);
  assert.equal(saldoCubre(25_000, 36_000), false, "grupal de $ 36.000: no se aplica a medias");
  assert.equal(saldoCubre(25_000, 0), false, "una clase sin precio no consume saldo");
  assert.equal(transicionPago("ACREDITADO", "CANCELADA", "devolver", "profe"), "DEVUELTO");
  assert.equal(transicionPago("ACREDITADO", "CANCELADA", "devolver", "alumno"), null);
  assert.equal(transicionPago("PAGADO", "CANCELADA", "devolver", "profe"), null);
});

test("B2: una sola regla de deuda — PEDIDA nunca; CONFIRMADA pagable pero no deuda; DADA deuda", () => {
  const c = (estado: string, pagoEstado = "PENDIENTE", precio = 25_000) => ({ estado, pagoEstado, pagoMedio: null, precio });
  assert.equal(esPagable(c("PEDIDA")), false, "un pedido sin confirmar no se paga");
  assert.equal(esDeuda(c("PEDIDA")), false);
  assert.equal(esPagable(c("SIN_RESPUESTA")), false, "un pedido vencido no aparece en Pagar");
  assert.equal(esDeuda(c("SIN_RESPUESTA")), false);
  assert.equal(esPagable(c("CONFIRMADA")), true);
  assert.equal(esDeuda(c("CONFIRMADA")), false);
  assert.equal(esPagable(c("CONFIRMADA", "EN_REVISION")), false, "ya mandó el comprobante");
  assert.equal(esDeuda(c("DADA")), true);
  assert.equal(esDeuda(c("DADA", "EN_REVISION")), true, "hasta que el profe valide, sigue debiendo");
  assert.equal(esDeuda(c("DADA", "PAGADO")), false);
  assert.equal(esDeuda(c("DADA", "ACREDITADO")), false);
  assert.equal(esDeuda(c("DADA", "PENDIENTE", 0)), false, "sin precio no hay deuda");
  assert.equal(esDeuda(c("CANCELADA")), false);
  // M-029: 2 DADAS sin pagar + 1 CONFIRMADA → «Debés $ 50.000 · 2 clases».
  const clases = [c("DADA"), c("DADA"), c("CONFIRMADA"), c("PEDIDA"), c("SIN_RESPUESTA")];
  assert.equal(totalDeuda(clases), 50_000);
  assert.equal(clases.filter(esPagable).length, 3);
});

test("B2: SIN_RESPUESTA — vence sólo un PEDIDA, sólo el sistema, y libera la franja", () => {
  assert.equal(transicionClase("PEDIDA", "vencer", "sistema"), "SIN_RESPUESTA");
  assert.equal(transicionClase("PEDIDA", "vencer", "profe"), null);
  assert.equal(transicionClase("CONFIRMADA", "vencer", "sistema"), null);
  assert.equal(ESTADOS_QUE_OCUPAN.includes("SIN_RESPUESTA"), false);
  // M-031: la franja de un pedido vencido se vuelve a ofrecer.
  const libres = franjasLibres({ fecha: MARTES, franjas: semana, ocupadas: [], duracionMin: 60, anticipacionMin: 0, ahora: lunesALaNoche });
  assert.ok(libres.includes(hora("08:00").toISOString()));
});

test("comprobante: el alumno no paga un pedido sin confirmar", () => {
  assert.equal(transicionPago("PENDIENTE", "PEDIDA", "subir", "alumno"), null);
  assert.equal(transicionPago("ACREDITADO", "DADA", "subir", "alumno"), null);
  assert.equal(transicionPago("ACREDITADO", "DADA", "efectivo", "profe"), null);
});

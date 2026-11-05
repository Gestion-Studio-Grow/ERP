// La historia de una clienta, sin base: la línea de tiempo, los textos del rastro y qué ve cada rol.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarLineaDeTiempo,
  duracionEnCriollo,
  estadoFinal,
  fraseDelRastro,
  hrefHistoria,
  leerFiltrosDeHistoria,
  quienFue,
  usuariosDelRastro,
  veMontosDelTurno,
  vistaDeHistoria,
  type FilaDeAuditoria,
  type TurnoLeidoDeHistoria,
} from "./historia-core";

const nombres = new Map([
  ["u1", "Caro"],
  ["u2", "Recepción Ana"],
]);
const turno = (id: string, inicio: string, extra: Partial<TurnoLeidoDeHistoria> = {}): TurnoLeidoDeHistoria => ({
  id,
  startsAt: new Date(inicio),
  endsAt: new Date(new Date(inicio).getTime() + 45 * 60_000),
  status: "COMPLETED",
  notes: "Piel sensible, usar la cera tibia",
  professionalId: "p-caro",
  profesional: "Caro",
  servicio: "Piernas completas",
  box: "Box 1",
  cobrado: 14000,
  ...extra,
});
const fila = (entityId: string, action: string, actor = "user:u1", changes: unknown = null, cuando = "2026-11-01T13:00:00Z", channel: string | null = "admin"): FilaDeAuditoria => ({
  actor,
  action,
  entityId,
  channel,
  changes,
  createdAt: new Date(cuando),
});

test("qué ve cada rol: la dueña todo; la profesional sus clientas, notas y su plata; la recepción sin notas, plata ni rastro", () => {
  assert.deepEqual(vistaDeHistoria("OWNER"), { notas: true, rastro: true, montos: "todos", soloSusClientas: false });
  assert.deepEqual(vistaDeHistoria("PROFESSIONAL"), { notas: true, rastro: true, montos: "propios", soloSusClientas: true });
  assert.deepEqual(vistaDeHistoria("RECEPTION"), { notas: false, rastro: false, montos: "ninguno", soloSusClientas: false });
  // Un rol desconocido: lo mínimo y sólo lo suyo (fail-closed).
  assert.deepEqual(vistaDeHistoria("OTRO"), { notas: false, rastro: false, montos: "ninguno", soloSusClientas: true });

  assert.equal(veMontosDelTurno(vistaDeHistoria("OWNER"), "p-x", null), true);
  assert.equal(veMontosDelTurno(vistaDeHistoria("PROFESSIONAL"), "p-caro", "p-caro"), true);
  assert.equal(veMontosDelTurno(vistaDeHistoria("PROFESSIONAL"), "p-vero", "p-caro"), false, "la plata de otra profesional no");
  assert.equal(veMontosDelTurno(vistaDeHistoria("PROFESSIONAL"), "p-caro", null), false, "sin profesional vinculada, nada");
  assert.equal(veMontosDelTurno(vistaDeHistoria("RECEPTION"), "p-caro", null), false);
});

test("línea de tiempo: nuevo arriba, con estado final, duración, notas y rastro viejo arriba", () => {
  const turnos = [turno("t1", "2026-10-01T13:00:00Z"), turno("t2", "2026-11-01T13:00:00Z", { status: "NO_SHOW", cobrado: 0 })];
  const audit = [
    fila("t2", "no_show", "user:u2", null, "2026-11-01T14:00:00Z"),
    fila("t2", "create_manual", "user:u2", null, "2026-10-20T12:00:00Z"),
    fila("t1", "complete", "user:u1", { saldoCobrado: { amount: 14000, method: "EFECTIVO" } }),
  ];
  const l = armarLineaDeTiempo(turnos, audit, nombres, vistaDeHistoria("OWNER"), null);
  assert.deepEqual(l.map((t) => t.id), ["t2", "t1"]);
  assert.equal(l[0].estado.texto, "No vino");
  assert.equal(l[0].estado.quien, "Lo marcó Recepción Ana");
  assert.deepEqual(l[0].rastro.map((r) => r.frase), ["Agendó el turno", "Marcó que no vino"], "viejo arriba");
  assert.equal(l[1].estado.texto, "Realizado");
  assert.equal(l[1].estado.quien, "Lo cerró Caro");
  assert.equal(l[1].duracionMin, 45);
  assert.equal(l[1].fecha, "01/10/2026");
  assert.equal(l[1].hora, "10:00");
  assert.equal(l[1].cobrado, 14000);
  assert.equal(l[1].notaDelEquipo, "Piel sensible, usar la cera tibia");
  assert.match(l[1].rastro[0].frase, /Lo marcó como realizado · cobró \$\s?14\.000/);
});

test("la recepción ve el turno y cómo terminó, sin notas, sin plata y sin rastro", () => {
  const l = armarLineaDeTiempo(
    [turno("t1", "2026-10-01T13:00:00Z", { status: "CANCELLED" })],
    [fila("t1", "cancel", "user:u2", { quien: "clienta" })],
    nombres,
    vistaDeHistoria("RECEPTION"),
    null,
  );
  assert.equal(l[0].notaDelEquipo, null);
  assert.equal(l[0].notaDeLaClienta, null);
  assert.equal(l[0].cobrado, null);
  assert.deepEqual(l[0].rastro, []);
  assert.equal(l[0].estado.texto, "Cancelado");
  assert.equal(l[0].estado.quien, "Avisó la clienta; lo anotó Recepción Ana");
});

test("la profesional ve la plata y las cifras del rastro sólo de SUS turnos", () => {
  const l = armarLineaDeTiempo(
    [turno("mio", "2026-10-01T13:00:00Z"), turno("ajeno", "2026-10-02T13:00:00Z", { professionalId: "p-vero", profesional: "Vero" })],
    [fila("mio", "collect_payment", "user:u1", { amount: 5000, method: "MP" }), fila("ajeno", "collect_payment", "user:u2", { amount: 7000, method: "EFECTIVO" })],
    nombres,
    vistaDeHistoria("PROFESSIONAL"),
    "p-caro",
  );
  const mio = l.find((t) => t.id === "mio")!;
  const ajeno = l.find((t) => t.id === "ajeno")!;
  assert.equal(mio.cobrado, 14000);
  assert.match(mio.rastro[0].frase, /^Cobró \$\s?5\.000 por Mercado Pago o transferencia$/);
  assert.equal(ajeno.cobrado, null);
  assert.equal(ajeno.rastro[0].frase, "Cobró en efectivo");
  assert.doesNotMatch(ajeno.rastro.map((r) => r.frase).join(" "), /\$/);
  assert.equal(ajeno.notaDelEquipo, "Piel sensible, usar la cera tibia", "las notas del turno sí: es su historia clínica");
});

test("textos del rastro en criollo: creado, movido, duración, editado, no vino, cobrado, anulado", () => {
  const f = (action: string, changes: unknown = null, channel: string | null = "admin", conMontos = true) => fraseDelRastro({ action, changes, channel }, conMontos);
  assert.equal(f("create", null, "public").frase, "Reservó el turno por la web");
  assert.equal(f("create_manual").frase, "Agendó el turno");
  assert.equal(
    f("reschedule", { from: { startsAt: "2026-11-03T13:00:00Z", professionalId: "a", boxId: "b1" }, to: { startsAt: "2026-11-04T14:30:00Z", professionalId: "b", boxId: "b1" } }).frase,
    "Lo movió del 03/11/2026 10:00 al 04/11/2026 11:30",
  );
  assert.deepEqual(f("reschedule", { from: { professionalId: "a" }, to: { professionalId: "b" } }).detalle, ["Cambió de profesional"]);
  assert.equal(f("resize", { from: { endsAt: "2026-11-03T13:45:00Z" }, to: { endsAt: "2026-11-03T14:00:00Z" } }).frase, "Le cambió la duración: terminaba 10:45, ahora 11:00");
  assert.equal(f("update").frase, "Editó el turno");
  assert.equal(f("no_show").frase, "Marcó que no vino");
  assert.equal(f("collect_payment", { tipo: "senia", amount: 5000 }).frase, "Marcó que llegó la seña");
  assert.match(f("void_collection", { monto: 5000, motivo: "se cobró dos veces" }).frase, /^Anuló un cobro · \$\s?5\.000$/);
  assert.deepEqual(f("void_collection", { monto: 5000, motivo: "se cobró dos veces" }).detalle, ["Motivo: «se cobró dos veces»"]);
  assert.equal(f("void_collection", { monto: 5000 }, "admin", false).frase, "Anuló un cobro");
  assert.deepEqual(f("cancel", { quien: "negocio" }).detalle, ["Lo canceló el negocio"]);
  assert.equal(f("undo_no_show").frase, "Deshizo el «no vino»");
  assert.equal(f("algo_nuevo").frase, "Hizo un cambio en el turno");
  // Un JSON con otra forma no rompe ni inventa.
  assert.equal(f("reschedule", "basura").frase, "Lo cambió de horario");
  assert.match(f("complete", { saldoCobrado: [{ amount: 3000 }, { amount: 2000 }] }).frase, /^Lo marcó como realizado · cobró \$\s?5\.000$/);
});

test("quién: nombre del usuario, la clienta por la web o «Usuario eliminado»; nunca el id crudo", () => {
  assert.equal(quienFue("user:u1", nombres), "Caro");
  assert.equal(quienFue("user:zz", nombres), "Usuario eliminado");
  assert.equal(quienFue("cliente:1155667788", nombres), "La clienta, desde la web", "el teléfono no se muestra");
  assert.equal(quienFue("operator:x", nombres), "GSG");
  assert.deepEqual(usuariosDelRastro([{ actor: "user:a" }, { actor: "user:a" }, { actor: "cliente:1" }, { actor: "user:b" }]), ["a", "b"]);
  assert.equal(estadoFinal("CANCELLED", [fila("t", "cancel", "cliente:11", null, undefined, "public")], nombres).quien, "Lo canceló la clienta, desde la web");
  assert.equal(estadoFinal("COMPLETED", [], nombres).quien, null, "sin rastro no se inventa quién");
});

test("filtros de la URL: lo que no tiene forma se ignora; fechas al revés se dan vuelta; la página es ≥ 1", () => {
  assert.deepEqual(leerFiltrosDeHistoria({ profesional: "cm123", servicio: ["s1", "s2"], desde: "2026-11-30", hasta: "2026-11-01", pagina: "3" }), {
    profesional: "cm123",
    servicio: "s1",
    desde: "2026-11-01",
    hasta: "2026-11-30",
    pagina: 3,
  });
  assert.deepEqual(leerFiltrosDeHistoria({ profesional: "x' OR 1=1", desde: "2026-02-30", pagina: "-2" }), { profesional: null, servicio: null, desde: null, hasta: null, pagina: 1 });
  assert.equal(hrefHistoria("c 1", { profesional: "p1", pagina: 2 }), "/admin/historias/c%201?profesional=p1&pagina=2");
  assert.equal(hrefHistoria("c1"), "/admin/historias/c1");
  assert.equal(duracionEnCriollo(45), "45′");
  assert.equal(duracionEnCriollo(90), "1 h 30′");
  assert.equal(duracionEnCriollo(120), "2 h");
});

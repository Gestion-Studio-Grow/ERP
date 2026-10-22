// Novedades de la caja (CH-037/056/067): qué entradas de la auditoría suben y cómo se escriben.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCIONES_DE_NOVEDAD, idsParaNombrar, novedadDeLaCaja, novedadesDeLaCaja, quienFue, type FilaDeAuditoria, type Nombres } from "./novedades";

const nombres: Nombres = {
  usuario: (id) => ({ lu: "Lu", vero: "Vero", duenia: "Macarena" })[id],
  clientaDelTurno: (id) => ({ t1: "Carla M." })[id],
};

let n = 0;
function fila(action: string, changes: unknown, o: Partial<FilaDeAuditoria> = {}): FilaDeAuditoria {
  n++;
  return { id: `a${n}`, action, entity: "Appointment", entityId: "t1", actor: "user:lu", createdAt: new Date(Date.UTC(2026, 9, 24, 14, n)), changes, ...o };
}

test("anulación de un cobro: quién, cuánto y el motivo (CH-037)", () => {
  const nov = novedadDeLaCaja(fila("void_collection", { collectionId: "c1", motivo: "cobré con el medio equivocado", monto: 8000 }), nombres);
  assert.ok(nov);
  assert.equal(nov.texto, "Lu anuló un cobro de $8.000");
  assert.equal(nov.motivo, "cobré con el medio equivocado");
  assert.equal(nov.monto, 8000);
  assert.equal(nov.tono, "peligro");
  assert.equal(nov.href, "/admin/turnos/lista#turno-t1");
});

test("deshacer una seña recién cobrada se dice distinto (no es una anulación con motivo)", () => {
  const nov = novedadDeLaCaja(fila("void_collection", { monto: 5000, deshacer: true, motivo: "deshacer: la seña se marcó por error" }), nombres);
  assert.equal(nov?.texto, "Lu deshizo una seña de $5.000 recién cobrada");
  assert.equal(nov?.motivo, null);
  assert.equal(nov?.tono, "atencion");
});

test("baja de saldo", () => {
  const nov = novedadDeLaCaja(fila("write_off_balance", { motivo: "se mudó", monto: 9000 }, { actor: "user:vero" }), nombres);
  assert.equal(nov?.texto, "Vero dio de baja un saldo de $9.000");
  assert.equal(nov?.motivo, "se mudó");
});

test("seña devuelta al cancelar o en un «no vino»; sin plata devuelta no sube", () => {
  const negocio = novedadDeLaCaja(fila("cancel", { senia: "devolver", cobrado: 5000, devuelto: 5000, quien: "negocio" }), nombres);
  assert.equal(negocio?.texto, "Lu devolvió la seña de $5.000 a Carla M.");
  assert.equal(negocio?.motivo, "cancelado por el negocio");
  const clienta = novedadDeLaCaja(fila("cancel", { devuelto: 5000, quien: "clienta" }, { entityId: "otro" }), nombres);
  assert.equal(clienta?.texto, "Lu devolvió la seña de $5.000", "sin la clienta resuelta, no se inventa un nombre");
  assert.equal(clienta?.motivo, "canceló la clienta");
  assert.equal(novedadDeLaCaja(fila("no_show", { devuelto: 3000 }), nombres)?.motivo, "no vino");
  assert.equal(novedadDeLaCaja(fila("cancel", { senia: "retener", cobrado: 5000, devuelto: 0 }), nombres), null, "se la quedó el negocio: no movió plata");
  assert.equal(novedadDeLaCaja(fila("cancel", null), nombres), null, "cancelación sin seña");
  assert.equal(novedadDeLaCaja(fila("cancel", { quien: "clienta" }), nombres), null);
});

test("asiento borrado del libro", () => {
  const nov = novedadDeLaCaja(fila("libro.delete", { type: "EGRESO", method: "EFECTIVO", amount: 2500, reason: "artículos de limpieza" }, { entity: "CashMovement" }), nombres);
  assert.equal(nov?.texto, "Lu borró del libro «artículos de limpieza» de $2.500");
  assert.equal(nov?.href, "/admin/caja/libro");
});

test("cierre del día: sube sólo con diferencia, con su nota", () => {
  const conFaltante = fila(
    "caja.cierre-diario",
    {
      day: "2026-10-24",
      note: "faltó cambio",
      porMedio: { EFECTIVO: { esperado: 120000, declarado: 118000, diferencia: -2000 }, MP: { esperado: 64000, declarado: null, diferencia: null }, TARJETA: { esperado: 0, declarado: 0, diferencia: 0 } },
    },
    { entity: "CierreDiario", entityId: "2026-10-24" },
  );
  const nov = novedadDeLaCaja(conFaltante, nombres);
  assert.equal(nov?.texto, "Lu cerró el 24/10 con un faltante de $2.000");
  assert.equal(nov?.motivo, "faltó cambio");
  assert.equal(nov?.monto, -2000);
  assert.equal(nov?.href, "/admin/caja/cierre?dia=2026-10-24");
  const sobrante = novedadDeLaCaja(fila("caja.cierre-diario", { day: "2026-10-23", porMedio: { MP: { diferencia: 500 } } }), nombres);
  assert.equal(sobrante?.texto, "Lu cerró el 23/10 con un sobrante de $500");
  const cuadro = fila("caja.cierre-diario", { day: "2026-10-22", porMedio: { EFECTIVO: { diferencia: 0 } } });
  assert.equal(novedadDeLaCaja(cuadro, nombres), null);
});

test("lo que no es plata no sube; los datos rotos tampoco rompen", () => {
  for (const f of [
    fila("confirm", { status: "CONFIRMED" }),
    fila("reschedule", {}),
    fila("void_collection", { monto: "8000" }),
    fila("void_collection", "basura"),
    fila("write_off_balance", { monto: -1 }),
    fila("libro.delete", { amount: 0 }),
    fila("caja.cierre-diario", { porMedio: "x" }),
  ]) {
    assert.equal(novedadDeLaCaja(f, nombres), null, f.action);
  }
});

test("quién fue: nombre, la clienta o «alguien del panel» (nunca un id ni «undefined»)", () => {
  assert.equal(quienFue("user:lu", nombres), "Lu");
  assert.equal(quienFue("user:borrado", nombres), "Alguien del panel");
  assert.equal(quienFue("admin", nombres), "Alguien del panel");
  assert.equal(quienFue("cliente:1155667788", nombres), "La clienta");
});

test("la lista: más nuevas primero, sin lo propio de quien mira, con tope", () => {
  const filas = [
    fila("void_collection", { monto: 1000 }),
    fila("void_collection", { monto: 2000 }, { actor: "user:duenia" }),
    fila("confirm", {}),
    fila("write_off_balance", { monto: 3000 }),
  ];
  const lista = novedadesDeLaCaja(filas, nombres, { excluirActor: "user:duenia" });
  assert.deepEqual(lista.map((x) => x.monto), [3000, 1000]);
  assert.equal(novedadesDeLaCaja(filas, nombres, { tope: 1 }).length, 1);
  for (const x of novedadesDeLaCaja(filas, nombres)) assert.doesNotMatch(x.texto, /undefined|null|NaN/);
});

test("ids para nombrar: actores y sólo los turnos con seña devuelta; las acciones del where", () => {
  const filas = [fila("cancel", { devuelto: 5000 }, { entityId: "t9" }), fila("cancel", {}, { entityId: "t8", actor: "user:vero" }), fila("void_collection", { monto: 1 }, { actor: "admin" })];
  assert.deepEqual(idsParaNombrar(filas), { usuarios: ["lu", "vero"], turnos: ["t9"] });
  assert.deepEqual([...ACCIONES_DE_NOVEDAD], ["void_collection", "write_off_balance", "cancel", "no_show", "libro.delete", "caja.cierre-diario"]);
});

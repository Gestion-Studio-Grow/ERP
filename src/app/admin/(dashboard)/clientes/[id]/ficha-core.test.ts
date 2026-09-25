import { test } from "node:test";
import assert from "node:assert/strict";
import { comoVieneMostrador, detalleSinDeuda, estadoDeLaFicha, notaDelRitmo, pedidoSinCobrar, teclaPrincipal, type EntradaEstadoFicha } from "./ficha-core";

const base: EntradaEstadoFicha = {
  servicios: true,
  proximoTurno: null,
  ultimaVezHace: null,
  debe: 0,
  fiadoIlegible: false,
  faltazos: 0,
  faltazosParaAviso: 2,
  pedidos: 0,
  pedidosSinCobrar: 0,
  noQuiere: false,
};
const textos = (e: EntradaEstadoFicha) => estadoDeLaFicha(e).map((d) => (d.tipo === "debe" ? `debe:${d.monto}` : d.texto));

test("clienta nueva de estética sin turno ni deuda: sin turno, al día, todavía no vino", () => {
  assert.deepEqual(textos(base), ["Sin turno reservado", "Está al día", "Todavía no vino"]);
});

test("el turno va primero y la deuda segunda, con el monto sin tocar", () => {
  const d = estadoDeLaFicha({ ...base, proximoTurno: "vie 25/09 10:30 · Hidratación facial con Marina", debe: 18700, ultimaVezHace: "hace 12 días" });
  assert.equal(d[0].tipo === "texto" && d[0].texto, "Turno vie 25/09 10:30 · Hidratación facial con Marina");
  assert.deepEqual(d[1], { tipo: "debe", clave: "debe", monto: 18700, aclaracion: null });
  assert.equal(d[2].tipo === "texto" && d[2].texto, "Vino por última vez hace 12 días");
});

test("con los faltazos del umbral sugiere seña y se marca en atención", () => {
  const d = estadoDeLaFicha({ ...base, faltazos: 2 }).find((x) => x.clave === "faltazos");
  assert.deepEqual(d, { tipo: "texto", clave: "faltazos", texto: "Faltó 2 veces sin avisar: pedile seña", tono: "atencion" });
});

test("un solo faltazo se dice sin alarma", () => {
  assert.ok(textos({ ...base, faltazos: 1 }).includes("Faltó 1 vez sin avisar"));
});

test("si el fiado no se pudo leer, no dice «al día»: dice que no debe turnos", () => {
  assert.ok(textos({ ...base, fiadoIlegible: true }).includes("No debe turnos (el fiado no se pudo leer)"));
  const d = estadoDeLaFicha({ ...base, fiadoIlegible: true, debe: 5000 }).find((x) => x.tipo === "debe");
  assert.equal(d?.tipo === "debe" && d.aclaracion, "sin contar el fiado, que no se pudo leer");
});

test("mostrador no habla de turnos ni de faltazos: habla de pedidos y compras", () => {
  const t = textos({ ...base, servicios: false, faltazos: 3, pedidos: 4, ultimaVezHace: "hace 3 días" });
  assert.deepEqual(t, ["Cuenta corriente al día", "4 pedidos", "Compró por última vez hace 3 días"]);
});

test("mostrador con un pedido sin cobrar: la cuenta corriente al día no esconde el pedido pendiente", () => {
  const d = estadoDeLaFicha({ ...base, servicios: false, pedidos: 2, pedidosSinCobrar: 1 });
  assert.deepEqual(
    d.map((x) => (x.tipo === "texto" ? x.texto : `debe:${x.monto}`)),
    ["Cuenta corriente al día", "2 pedidos", "1 pedido sin cobrar", "Todavía no compró"],
  );
  const sinCobrar = d.find((x) => x.clave === "sin-cobrar");
  assert.equal(sinCobrar?.tipo === "texto" && sinCobrar.tono, "atencion");
});

test("en estética los pedidos sin cobrar no cambian la línea de estado (la deuda es de turnos y fiado)", () => {
  assert.deepEqual(textos({ ...base, pedidosSinCobrar: 3 }), textos(base));
});

test("mostrador con la deuda leída: el monto sigue llegando sin tocar", () => {
  const d = estadoDeLaFicha({ ...base, servicios: false, debe: 234800 }).find((x) => x.tipo === "debe");
  assert.equal(d?.tipo === "debe" && d.monto, 234800);
});

test("mostrador con el fiado ilegible no dice «al día»", () => {
  assert.ok(textos({ ...base, servicios: false, fiadoIlegible: true }).includes("La cuenta corriente no se pudo leer"));
});

test("pedido sin cobrar: ni anulado ni cobrado", () => {
  assert.equal(pedidoSinCobrar({ status: "CONFIRMED", paid: false }), true);
  assert.equal(pedidoSinCobrar({ status: "CONFIRMED", paid: true }), false);
  assert.equal(pedidoSinCobrar({ status: "CANCELLED", paid: false }), false);
});

test("renglón «Debe» en cero: estética igual que antes; mostrador nombra la cuenta corriente y apunta a los pedidos", () => {
  assert.equal(detalleSinDeuda({ servicios: true, fiadoIlegible: false, pedidosSinCobrar: 2 }), "está al día");
  assert.equal(detalleSinDeuda({ servicios: true, fiadoIlegible: true, pedidosSinCobrar: 0 }), "el fiado no se pudo leer");
  assert.equal(detalleSinDeuda({ servicios: false, fiadoIlegible: false, pedidosSinCobrar: 0 }), "cuenta corriente al día");
  assert.equal(detalleSinDeuda({ servicios: false, fiadoIlegible: false, pedidosSinCobrar: 1 }), "cuenta corriente al día; 1 pedido sin cobrar, abajo en «Pedidos»");
});

test("cómo viene en mostrador: sin el ciclo de 45 días de la estética", () => {
  const defecto = { dias: 45, fuente: "defecto" as const };
  assert.equal(comoVieneMostrador(null), "Todavía no compró.");
  assert.equal(comoVieneMostrador({ diasSinVenir: null, cantidadVisitas: 0, ciclo: defecto }), "Todavía no compró.");
  const t = comoVieneMostrador({ diasSinVenir: 12, cantidadVisitas: 1, ciclo: defecto });
  assert.equal(t, "Última compra hace 12 días (1 compra en total).");
  assert.ok(!/ciclo|45/.test(t));
  assert.equal(comoVieneMostrador({ diasSinVenir: 20, cantidadVisitas: 3, ciclo: { dias: 45, fuente: "servicio" } }), "Última compra hace 20 días (3 compras en total).");
  assert.equal(comoVieneMostrador({ diasSinVenir: 0, cantidadVisitas: 5, ciclo: { dias: 7, fuente: "propio" } }), "Última compra hoy. Suele comprar cada 7 días (según sus 5 compras).");
  assert.equal(comoVieneMostrador({ diasSinVenir: 1, cantidadVisitas: 2, ciclo: defecto }), "Última compra hace 1 día (2 compras en total).");
});

test("la nota del ritmo: en mostrador no hay «visitas»", () => {
  assert.equal(notaDelRitmo("Sin visitas", "sin-visitas", false), "Sin compras");
  assert.equal(notaDelRitmo("Sin visitas", "sin-visitas", true), "Sin visitas");
  assert.equal(notaDelRitmo("Frecuente", "frecuente", false), "Frecuente");
});

test("«no quiere mensajes» va al final y en peligro", () => {
  const d = estadoDeLaFicha({ ...base, noQuiere: true });
  assert.deepEqual(d[d.length - 1], { tipo: "texto", clave: "no-quiere", texto: "No quiere mensajes", tono: "peligro" });
});

test("tecla principal: turno si no tiene, WhatsApp si ya tiene, nada si no hay a quién ni qué", () => {
  assert.equal(teclaPrincipal({ servicios: true, puedeDarTurno: true, tieneTurno: false, puedeEscribirle: true }), "turno");
  assert.equal(teclaPrincipal({ servicios: true, puedeDarTurno: true, tieneTurno: true, puedeEscribirle: true }), "whatsapp");
  assert.equal(teclaPrincipal({ servicios: true, puedeDarTurno: true, tieneTurno: true, puedeEscribirle: false }), "turno");
  assert.equal(teclaPrincipal({ servicios: true, puedeDarTurno: false, tieneTurno: false, puedeEscribirle: false }), null);
  assert.equal(teclaPrincipal({ servicios: false, puedeDarTurno: true, tieneTurno: false, puedeEscribirle: true }), "whatsapp");
});

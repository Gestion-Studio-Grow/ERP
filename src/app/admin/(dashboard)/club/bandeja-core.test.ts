// La bandeja «Para resolver ahora» contra el motor REAL del club sobre la demo: muestra exactamente las alertas del
// motor y en su orden (menos lo de un dueño a quien no lo es), y cada botón lleva a donde lo llevaba el vanilla.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import { armarBandeja, compartirBandeja, queHace } from "./bandeja-core";
import { ponerLuz } from "./agenda-core";

const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
const demo = (): EstadoClub => M.generarDemo(HOY, AHORA.min);

/** La demo con una alerta de cada tipo que la demo no trae: un pedido de la tienda y un pedido de crédito. */
function demoCompleta(): EstadoClub {
  const e = demo();
  assert.ok(M.crearPedidoTienda(e, { items: [{ productoId: "p1", cant: 1 }], nombre: "Sofi Romero" }, AHORA).ok);
  const cl = e.clientes.find((c) => !c.cc.habilitada)!;
  const recepcion = e.usuarios.find((u) => u.rol === "recepcion")!;
  assert.ok(M.solicitarCredito(e, { clienteId: cl.id, tipo: "cc", monto: 30000 }, { usuarioId: recepcion.id }, AHORA).ok);
  return e;
}

test("muestra EXACTAMENTE las alertas del motor y en su orden (un dueño las ve todas)", () => {
  const e = demoCompleta();
  const motor = M.alertas(e, AHORA);
  const v = armarBandeja(e, AHORA, true);
  assert.ok(motor.length >= 8, `la demo trae varias alertas (${motor.length})`);
  assert.deepEqual(v.items.map((i) => i.alerta), motor);
  assert.deepEqual(v.items.map((i) => i.texto), motor.map((a) => a.texto));
  assert.deepEqual(v.items.map((i) => i.accion), motor.map((a) => a.accion));
  assert.equal(v.urgentes, motor.filter((a) => a.nivel === "alta").length);
  assert.equal(new Set(v.items.map((i) => i.clave)).size, v.items.length, "claves únicas (key de React)");
  // Lo urgente primero, como lo ordena el motor.
  const peso = { alta: 0, media: 1, info: 2 };
  for (let i = 1; i < v.items.length; i++) assert.ok(peso[v.items[i - 1].nivel] <= peso[v.items[i].nivel]);
  assert.ok(v.items.some((i) => i.alerta.tipo === "pedido") && v.items.some((i) => i.alerta.tipo === "autorizacion"));
});

test("a quien no es dueño no le muestra lo que es sólo de un dueño; el resto, igual y en el mismo orden", () => {
  const e = demoCompleta();
  const v = armarBandeja(e, AHORA, false);
  assert.deepEqual(v.items.map((i) => i.alerta), M.alertas(e, AHORA).filter((a) => !a.paraDuenio));
  assert.ok(!v.items.some((i) => i.rotulo === "Para el dueño"));
  assert.ok(armarBandeja(e, AHORA, true).items.some((i) => i.rotulo === "Para el dueño"));
});

test("los rótulos son los del vanilla: Urgente · Atender · Aviso · Para el dueño, con su forma", () => {
  const v = armarBandeja(demoCompleta(), AHORA, true);
  for (const i of v.items) {
    const esperado = i.alerta.paraDuenio ? "Para el dueño" : i.nivel === "alta" ? "Urgente" : i.nivel === "media" ? "Atender" : "Aviso";
    assert.equal(i.rotulo, esperado);
  }
  assert.ok(v.items.some((i) => i.rotulo === "Urgente" && i.marca === "atencion"));
});

test("cada botón lleva a donde lo llevaba el vanilla", () => {
  const e = demoCompleta();
  const v = armarBandeja(e, AHORA, true);
  for (const i of v.items) {
    const q = queHace(e, i.alerta);
    assert.ok(q, `${i.alerta.tipo} tiene qué hacer`);
    const a = i.alerta;
    if (a.tipo === "devolucion") assert.deepEqual(q, { tipo: "devolver", reservaId: a.reservaId });
    else if (a.tipo === "falta_sin_ficha") assert.deepEqual(q, { tipo: "cobrarFalta", reservaId: a.reservaId });
    else if (a.reservaId) assert.deepEqual(q, { tipo: "verTurno", reservaId: a.reservaId });
    else if (a.tipo === "luz") assert.deepEqual(q, { tipo: "apagarLuz", canchaId: a.canchaId });
    else if (a.tipo === "lluvia" || a.tipo === "mantenimiento") assert.equal(q.tipo === "solapa" && q.solapa, "canchas");
    else if (a.tipo === "autorizacion" || a.tipo === "acceso") assert.equal(q.tipo === "solapa" && q.solapa, "tablero");
    else if (a.tipo === "stock") assert.ok(q.tipo === "solapa" && q.solapa === "stock" && q.siNoEsta === "Avisale al dueño: hay que reponer.");
    else if (a.tipo === "pedido") assert.equal(q.tipo === "solapa" && q.solapa, "tienda");
    else if (a.tipo === "espera") {
      assert.equal(q.tipo, "ofrecerEspera");
      if (q.tipo === "ofrecerEspera") {
        assert.equal(q.inicio, a.inicio);
        assert.match(q.mensaje, new RegExp(`${M.hhmm(a.inicio!)} \\(hoy\\)`));
      }
    }
  }
  assert.ok(v.items.some((i) => queHace(e, i.alerta)?.tipo === "verTurno"), "la demo trae alertas de turnos");
  assert.ok(v.items.some((i) => i.alerta.tipo === "luz"), "y la luz prendida de más");
});

test("«Apagar» la luz sin juego saca la alerta; la bandeja reusa la vista si nada cambió", () => {
  const e = demo();
  const v1 = armarBandeja(e, AHORA, false);
  assert.equal(compartirBandeja(v1, armarBandeja(e, AHORA, false)), v1, "sin cambios: la misma vista (no se repinta)");
  const luz = v1.items.find((i) => i.alerta.tipo === "luz")!;
  assert.ok(luz);
  const q = queHace(e, luz.alerta);
  assert.equal(q?.tipo, "apagarLuz");
  if (q?.tipo === "apagarLuz") assert.equal(ponerLuz(e, q.canchaId, false).ok, true);
  const v2 = compartirBandeja(v1, armarBandeja(e, AHORA, false));
  assert.notEqual(v2, v1);
  assert.ok(!v2.items.some((i) => i.alerta.tipo === "luz"));
});

test("compartirBandeja: si aparece una alerta, las que siguen iguales son el MISMO objeto (sólo se pinta la nueva)", () => {
  const e = demo();
  const v1 = armarBandeja(e, AHORA, false);
  assert.ok(M.crearPedidoTienda(e, { items: [{ productoId: "p2", cant: 1 }], nombre: "Lu" }, AHORA).ok);
  const v2 = compartirBandeja(v1, armarBandeja(e, AHORA, false));
  const nuevas = v2.items.filter((i) => !v1.items.includes(i));
  assert.deepEqual(nuevas.map((i) => i.alerta.tipo), ["pedido"]);
});

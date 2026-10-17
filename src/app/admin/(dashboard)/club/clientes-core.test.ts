// Los clientes del club contra el motor REAL sobre la demo: la lista (orden, buscador), el alta sin repetir teléfono,
// la ficha (editar, baja sólo sin deuda ni cargos), la cuenta corriente (dueño la configura, recepción la pide y la
// aprueba con el código del dueño), el estado de cuenta con saldo corrido, cobrar la deuda y el WhatsApp.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub } from "@/lib/club/motor.mjs";
import { operadorDeLaDemo } from "./almacen";
import { armarClientes, armarFicha, ejecutarClientes, textoCC } from "./clientes-core";
import { codigoDeLaDemo } from "./credito-core";
import { operadorDesdeAuth } from "./operador-del-club";

const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
const demo = (): { e: EstadoClub; recep: Auth; duenio: Auth } => {
  const e = M.generarDemo(HOY, AHORA.min);
  return { e, recep: operadorDeLaDemo(e, "RECEPTION")!.auth, duenio: operadorDeLaDemo(e, "OWNER")!.auth };
};
const porNombre = (e: EstadoClub, nombre: string) => e.clientes.find((c) => c.nombre === nombre)!;

test("la lista: los que deben primero, después por nombre; el buscador encuentra por nombre y por teléfono", () => {
  const { e } = demo();
  const v = armarClientes(e, "");
  assert.equal(v.total, e.clientes.length);
  assert.equal(v.filas[0].nombre, "Agustina Romero", "la que debe va primero");
  assert.equal(v.filas[0].deuda, 21000);
  const resto = v.filas.slice(1).map((f) => f.nombre);
  assert.deepEqual(resto, [...resto].sort((a, b) => a.localeCompare(b, "es")));
  assert.deepEqual(armarClientes(e, "agus").filas.map((f) => f.nombre), ["Agustina Romero"]);
  const tel = porNombre(e, "Lucas Fernández").tel;
  assert.ok(armarClientes(e, tel.slice(-4)).filas.some((f) => f.nombre === "Lucas Fernández"), "por los últimos dígitos del teléfono");
  assert.equal(armarClientes(e, "nadie se llama así").filas.length, 0);
  // La que tiene un pedido esperando al dueño figura como «Pedida».
  const julieta = v.filas.find((f) => f.id === e.novedades[0].clienteId)!;
  assert.equal(textoCC(julieta.cc), "Pedida al dueño");
  assert.equal(textoCC(v.filas.find((f) => f.nombre === "Lucas Fernández")!.cc), "Hasta $ 100.000");
});

test("alta: con nombre, sin repetir teléfono; devuelve el cliente nuevo para abrir su ficha", () => {
  const { e, recep } = demo();
  assert.equal(ejecutarClientes(e, { tipo: "alta", nombre: "  ", tel: "", nivel: "" }, AHORA, recep).ok, false);
  const repetido = ejecutarClientes(e, { tipo: "alta", nombre: "Otro", tel: porNombre(e, "Lucas Fernández").tel, nivel: "" }, AHORA, recep);
  assert.deepEqual(repetido, { ok: false, mensaje: "Ya hay un cliente con ese teléfono." });
  const d = ejecutarClientes(e, { tipo: "alta", nombre: "Paula Nieto", tel: "11 5555-1234", nivel: "6ta" }, AHORA, recep);
  assert.equal(d.ok, true, d.mensaje);
  assert.ok(d.clienteId);
  const f = armarFicha(e, d.clienteId!, AHORA)!;
  assert.equal(f.nombre, "Paula Nieto");
  assert.equal(f.nivel, "6ta");
  assert.equal(f.deuda, 0);
  assert.deepEqual(f.baja, { puede: true });
  assert.deepEqual(armarClientes(e, "paula nieto").filas.map((x) => x.id), [d.clienteId]);
});

test("editar: guarda y no deja usar el teléfono de otro cliente", () => {
  const { e, recep } = demo();
  const lucas = porNombre(e, "Lucas Fernández");
  const martin = porNombre(e, "Martín Ríos");
  const mal = ejecutarClientes(e, { tipo: "editar", clienteId: lucas.id, nombre: "Lucas F.", tel: martin.tel, nivel: "3ra" }, AHORA, recep);
  assert.deepEqual(mal, { ok: false, mensaje: "Ya hay otro cliente con ese teléfono." });
  assert.equal(lucas.nombre, "Lucas Fernández", "no tocó nada");
  const bien = ejecutarClientes(e, { tipo: "editar", clienteId: lucas.id, nombre: "Lucas F.", tel: lucas.tel, nivel: "2da" }, AHORA, recep);
  assert.equal(bien.ok, true, bien.mensaje);
  assert.equal(lucas.nombre, "Lucas F.");
  assert.equal(lucas.nivel, "2da");
  assert.equal(ejecutarClientes(e, { tipo: "editar", clienteId: lucas.id, nombre: " ", tel: "", nivel: "" }, AHORA, recep).ok, false);
});

test("baja: con deuda o con cargos abiertos en el buffet, no; sin nada pendiente, sí (y sale de la lista)", () => {
  const { e, recep } = demo();
  const agus = porNombre(e, "Agustina Romero");
  const fa = armarFicha(e, agus.id, AHORA)!;
  assert.equal(fa.baja.puede, false);
  assert.equal(ejecutarClientes(e, { tipo: "baja", clienteId: agus.id }, AHORA, recep).ok, false, "el motor también dice que no");

  const conCargos = M.cuentasAbiertas(e).find((c) => c.clienteId && M.cliente(e, c.clienteId)!.deuda === 0)!;
  const f = armarFicha(e, conCargos.clienteId!, AHORA)!;
  assert.deepEqual(f.baja, { puede: false, motivo: "Tiene cargos abiertos en el buffet: primero se cierran." });
  assert.equal(ejecutarClientes(e, { tipo: "baja", clienteId: conCargos.clienteId! }, AHORA, recep).ok, false);

  const libre = e.clientes.find((c) => c.deuda === 0 && !e.cuentas.some((x) => x.clienteId === c.id && x.estado === "abierta"))!;
  const d = ejecutarClientes(e, { tipo: "baja", clienteId: libre.id }, AHORA, recep);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(armarFicha(e, libre.id, AHORA), null);
  assert.ok(!armarClientes(e, "").filas.some((x) => x.id === libre.id));
});

test("cuenta corriente: recepción no la configura, la PIDE; ve «esperando al dueño» y la aprueba con el código", () => {
  const { e, recep } = demo();
  assert.equal(operadorDesdeAuth(e, recep).esDuenio, false);
  const lucas = porNombre(e, "Lucas Fernández");
  const sin = e.clientes.find((c) => !c.cc.habilitada && !e.novedades.some((n) => n.clienteId === c.id))!;
  assert.equal(ejecutarClientes(e, { tipo: "configurarCC", clienteId: lucas.id, habilitada: false, limite: "" }, AHORA, recep).ok, false, "recepción no corta");

  assert.equal(ejecutarClientes(e, { tipo: "pedirCC", clienteId: sin.id, limite: "", nota: "" }, AHORA, recep).ok, false);
  const d = ejecutarClientes(e, { tipo: "pedirCC", clienteId: sin.id, limite: "40.000", nota: "Viene siempre" }, AHORA, recep);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(ejecutarClientes(e, { tipo: "pedirCC", clienteId: sin.id, limite: "40000", nota: "" }, AHORA, recep).ok, false, "uno por cliente");
  const f = armarFicha(e, sin.id, AHORA)!;
  assert.ok(f.pedido);
  assert.equal(f.pedido.que, "cuenta corriente hasta $ 40.000");
  assert.equal(f.pedido.quedan, 5);
  assert.match(f.pedido.linkWhatsApp, /^https:\/\/wa\.me\/\?text=/, "sin el celular del dueño, el link va sin número");

  const mal = ejecutarClientes(e, { tipo: "aprobarCodigo", novedadId: f.pedido.id, codigo: "AAA-AAA", monto: "40000" }, AHORA, recep);
  assert.equal(mal.ok, false);
  assert.equal(armarFicha(e, sin.id, AHORA)!.pedido!.quedan, 4);
  const codigo = codigoDeLaDemo(e, f.pedido.id)!.codigo;
  const ok = ejecutarClientes(e, { tipo: "aprobarCodigo", novedadId: f.pedido.id, codigo, monto: "40000" }, AHORA, recep);
  assert.equal(ok.ok, true, ok.mensaje);
  assert.match(ok.mensaje, /cuenta corriente habilitada hasta \$ 40\.000/);
  assert.deepEqual(M.cliente(e, sin.id)!.cc, { habilitada: true, limite: 40000 });
  assert.equal(armarFicha(e, sin.id, AHORA)!.pedido, null);
});

test("cuenta corriente: el dueño la habilita, le cambia el límite y la corta", () => {
  const { e, duenio } = demo();
  assert.equal(operadorDesdeAuth(e, duenio).esDuenio, true);
  const sin = e.clientes.find((c) => !c.cc.habilitada && !e.novedades.some((n) => n.clienteId === c.id))!;
  assert.equal(ejecutarClientes(e, { tipo: "configurarCC", clienteId: sin.id, habilitada: true, limite: "" }, AHORA, duenio).ok, false);
  assert.equal(ejecutarClientes(e, { tipo: "configurarCC", clienteId: sin.id, habilitada: true, limite: "$ 30.000" }, AHORA, duenio).ok, true);
  assert.deepEqual(M.cliente(e, sin.id)!.cc, { habilitada: true, limite: 30000 });
  assert.equal(ejecutarClientes(e, { tipo: "configurarCC", clienteId: sin.id, habilitada: true, limite: "80000" }, AHORA, duenio).ok, true);
  assert.equal(M.cliente(e, sin.id)!.cc.limite, 80000);
  const corte = ejecutarClientes(e, { tipo: "configurarCC", clienteId: sin.id, habilitada: false, limite: "" }, AHORA, duenio);
  assert.equal(corte.ok, true);
  assert.equal(M.cliente(e, sin.id)!.cc.habilitada, false);
  assert.equal(textoCC(armarClientes(e, M.cliente(e, sin.id)!.nombre).filas[0].cc), "Sin cuenta corriente");
});

test("estado de cuenta con saldo corrido; cobrar la deuda (una parte, con su medio) entra a la caja; de más, no", () => {
  const { e, recep } = demo();
  const agus = porNombre(e, "Agustina Romero");
  const f = armarFicha(e, agus.id, AHORA)!;
  assert.ok(f.movimientos.length >= 1);
  let corrido = f.movimientos[0].saldo - f.movimientos[0].importe;
  for (const m of f.movimientos) {
    corrido += m.importe;
    assert.equal(m.saldo, corrido, "cada renglón suma al anterior");
  }
  assert.equal(f.movimientos.at(-1)!.saldo, f.deuda);
  assert.ok(f.recordarDeuda!.startsWith(`https://wa.me/${agus.tel.replace(/\D/g, "")}?text=`), "con su teléfono");
  assert.match(decodeURIComponent(f.recordarDeuda!.split("text=")[1]), /Agustina!.*\$ 21\.000/);

  const caja0 = M.resumenCaja(e).ingresos;
  assert.equal(ejecutarClientes(e, { tipo: "cobrarDeuda", clienteId: agus.id, medio: "efectivo", monto: "999999" }, AHORA, recep).ok, false);
  assert.equal(ejecutarClientes(e, { tipo: "cobrarDeuda", clienteId: agus.id, medio: "efectivo", monto: "0" }, AHORA, recep).ok, false);
  const d = ejecutarClientes(e, { tipo: "cobrarDeuda", clienteId: agus.id, medio: "mercadopago", monto: "1.000" }, AHORA, recep);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(d.mensaje, "Cobrado $ 1.000 de la cuenta de Agustina Romero (Mercado Pago (QR)). Saldo: $ 20.000.");
  assert.equal(M.resumenCaja(e).ingresos, caja0 + 1000);
  const g = armarFicha(e, agus.id, AHORA)!;
  assert.equal(g.movimientos.at(-1)!.importe, -1000);
  assert.equal(g.movimientos.at(-1)!.saldo, 20000);
  // Vacío = todo lo que debe.
  assert.equal(ejecutarClientes(e, { tipo: "cobrarDeuda", clienteId: agus.id, medio: "efectivo", monto: "" }, AHORA, recep).ok, true);
  const h = armarFicha(e, agus.id, AHORA)!;
  assert.equal(h.deuda, 0);
  assert.equal(h.recordarDeuda, null);
  assert.deepEqual(h.baja, { puede: true });
});

test("sin teléfono, el recordatorio por WhatsApp va sin número; las novedades se dan de baja y de alta", () => {
  const { e, recep } = demo();
  const d = ejecutarClientes(e, { tipo: "alta", nombre: "Sin Celu", tel: "", nivel: "" }, AHORA, recep);
  const c = M.cliente(e, d.clienteId!)!;
  c.deuda = 5000;
  assert.match(armarFicha(e, c.id, AHORA)!.recordarDeuda!, /^https:\/\/wa\.me\/\?text=/);
  assert.equal(armarFicha(e, c.id, AHORA)!.recibeNovedades, true);
  assert.equal(ejecutarClientes(e, { tipo: "novedades", clienteId: c.id, recibe: false }, AHORA, recep).ok, true);
  assert.equal(armarFicha(e, c.id, AHORA)!.recibeNovedades, false);
  assert.equal(ejecutarClientes(e, { tipo: "novedades", clienteId: c.id, recibe: true }, AHORA, recep).ok, true);
  assert.equal(armarFicha(e, c.id, AHORA)!.recibeNovedades, true);
});

test("la firma cambia sólo si cambia lo que se ve", () => {
  const { e, recep } = demo();
  const a = armarClientes(e, "");
  assert.equal(armarClientes(e, "").firma, a.firma);
  ejecutarClientes(e, { tipo: "alta", nombre: "Nueva", tel: "", nivel: "" }, AHORA, recep);
  assert.notEqual(armarClientes(e, "").firma, a.firma);
});

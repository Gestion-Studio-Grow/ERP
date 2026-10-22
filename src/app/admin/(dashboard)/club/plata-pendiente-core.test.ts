// Tanda 2B · Plata pendiente y bandeja en dos niveles, contra el motor REAL sobre la demo del día:
//   · la lista de plata pendiente (no vence), su botón y el comando que la resuelve (de la lista blanca);
//   · resolver desde dos puestos a la vez no cobra dos veces; los comandos nuevos (`plata`, `bandeja`) se re-aplican
//     byte a byte;
//   · la paleta (Ctrl+K) encuentra la falta de «Pablo» de la semana pasada (BP-051);
//   · `partir`: lo del dueño al Tablero, lo de recepción a la Agenda, la caja sin cerrar a las dos (BP-053/054);
//   · H2: re-aplicar un comando con prefijo deja el prefijo que tenía el proceso (aunque lo haya puesto otro módulo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub } from "@/lib/club/motor.mjs";
import { crearAlmacen, operadorDeLaDemo, textoDelEstado } from "./almacen";
import { armarDosBandejas, ejecutarBandeja, partir } from "./bandeja-core";
import { correrComando, describirComando, rebasar, type ArgsDe, type Comando, type NombreDeComando } from "./comandos-core";
import { armarPaleta } from "./paleta-core";
import { armarPlataPendiente, comandoDePlata, plataQueCoincide } from "./plata-pendiente-core";
import PlataPendienteDelClub from "./plata-pendiente";
import BandejaDelClub, { BandejaDelDuenio } from "./BandejaDelClub";

const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
const DIA = (n: number) => M.sumarDias(HOY, n);

/** La demo con plata pendiente de días anteriores: una devolución a Sofi (hace 5 días) y la falta de Pablo (hace 7). */
function conPlata(e: EstadoClub): { sofi: string; pablo: string } {
  const r1 = M.crearReserva(e, { canchaId: "c3", fecha: DIA(-5), inicio: 8 * 60, titular: "Sofi Paz", conSena: false }, { fecha: DIA(-7), min: 9 * 60 });
  assert.ok(r1.ok);
  assert.ok(M.registrarPago(e, r1.reserva.id, { medio: "transferencia", monto: 21000 }, { fecha: DIA(-7), min: 9 * 60 + 5 }).ok);
  assert.ok(M.cancelar(e, r1.reserva.id, {}, { fecha: DIA(-6), min: 9 * 60 }).ok);
  const r2 = M.crearReserva(e, { canchaId: "c2", fecha: DIA(-7), inicio: 9 * 60, titular: "Pablo Ruiz", conSena: false }, { fecha: DIA(-8), min: 9 * 60 });
  assert.ok(r2.ok);
  assert.ok(M.marcarNoShow(e, r2.reserva.id, {}, { fecha: DIA(-7), min: 9 * 60 + 30 }).ok);
  return { sofi: r1.reserva.id, pablo: r2.reserva.id };
}

function base(ajustar?: (e: EstadoClub) => void): { texto: string; abrir: () => EstadoClub } {
  M.prefijoIds("");
  const e = M.generarDemo(HOY, AHORA.min);
  ajustar?.(e);
  const texto = textoDelEstado(e);
  return { texto, abrir: () => (JSON.parse(texto) as { estado: EstadoClub }).estado };
}
const recepcion = (e: EstadoClub): Auth => operadorDeLaDemo(e, "RECEPTION")!.auth;
const duenio = (e: EstadoClub): Auth => operadorDeLaDemo(e, "OWNER")!.auth;
let n = 0;
function comando<N extends NombreDeComando>(e: EstadoClub, nombre: N, args: ArgsDe<N>, auth: Auth, equipo = "pc"): Comando<N> {
  return { id: `p-${++n}`, equipo, persona: auth.usuarioId ?? "", versionBase: 1, version: M.VERSION_ESTADO, nombre, args, ahora: AHORA, auth, azar: 3000 + n, idsDesde: M.secuenciaIds() };
}
const ingresos = (e: EstadoClub) => e.caja.movimientos.reduce((s, m) => s + (m.tipo === "ingreso" ? m.monto : -m.monto), 0);

test("la lista: lo de días anteriores, de lo más viejo a lo más nuevo, con su botón y los pesos que entran y salen", () => {
  const e = M.generarDemo(HOY, AHORA.min);
  conPlata(e);
  const v = armarPlataPendiente(e);
  assert.deepEqual(v.items.map((i) => i.item.tipo), ["falta_sin_ficha", "devolucion"]);
  assert.deepEqual(v.items.map((i) => i.resolver), [
    { tipo: "conMedio", verbo: "Cobrar $ 42.000", sentido: "entra" },
    { tipo: "conMedio", verbo: "Devolver $ 21.000", sentido: "sale" },
  ]);
  assert.deepEqual([v.entra, v.sale], [42000, 21000]);
  assert.match(v.items[0].detalle, /^Turno del 10\/10 09:00 · sin ficha$/);
  assert.equal(armarPlataPendiente(e).firma, v.firma, "misma lista, misma firma (no repinta)");
});

test("BP-050 (pantalla): «Plata pendiente (2)» en la Caja y la bandeja; devolver a Sofi con MP: se va de la lista, sale de la caja y se puede deshacer", () => {
  const a = crearAlmacen({ hoy: HOY, clave: "gsg-club:prueba:yo:v1", almacenamiento: null, rol: "RECEPTION", enReposo: null });
  const ids = { sofi: "" };
  a.aplicar((e) => {
    ids.sofi = conPlata(e).sofi;
    return { ok: true };
  });
  const html = renderToStaticMarkup(h(PlataPendienteDelClub, { almacen: a, titulo: "h2", siVacia: true }));
  assert.match(html, /<h2[^>]*>Plata pendiente \(2\)<\/h2>/);
  assert.match(html, /Devolver \$ 21\.000 a Sofi Paz \(turno del 12\/10 08:00\)/);
  assert.match(html, /aria-expanded="false"[^>]*>Devolver \$ 21\.000</);
  const x = M.plataPendiente(a.estado()).find((y) => y.tipo === "devolucion")!;
  const c = comandoDePlata(x, "mercadopago")!;
  assert.deepEqual(c, { nombre: "ciclo", args: [ids.sofi, { tipo: "devolver", medio: "mercadopago" }] });
  const antes = ingresos(a.estado());
  assert.equal(a.comando("ciclo", [ids.sofi, { tipo: "devolver", medio: "mercadopago" }], { deshacible: true }).ok, true);
  assert.equal(ingresos(a.estado()), antes - 21000);
  assert.equal(M.plataPendiente(a.estado()).some((y) => y.tipo === "devolucion"), false);
  assert.match(renderToStaticMarkup(h(PlataPendienteDelClub, { almacen: a })), /Plata pendiente \(1\)/);
});

test("dos puestos devuelven/cobran lo mismo a la vez: la plata se mueve UNA vez (el segundo va a «Para resolver»)", () => {
  const b = base(conPlata);
  const pc = b.abrir();
  const tablet = b.abrir();
  const x = M.plataPendiente(pc);
  const cobros = x.map((y) => comandoDePlata(y, "efectivo")!);
  const enPc = cobros.map((c) => comando(pc, c.nombre, c.args as never, recepcion(pc)));
  for (const c of enPc) assert.equal(correrComando(pc, c).ok, true);
  const enTablet = cobros.map((c) => comando(tablet, c.nombre, c.args as never, recepcion(tablet), "tablet"));
  for (const c of enTablet) assert.equal(correrComando(tablet, c).ok, true, "la tablet, sin enterarse, también");
  // La tablet sube: la base ya tiene lo de la PC; lo de la tablet se re-aplica encima y el motor dice que no.
  const r = rebasar(pc, enTablet, new Set(enPc.map((c) => c.id)));
  assert.equal(r.rechazados.length, 2, JSON.stringify(r.rechazados.map((z) => z.motivo)));
  const base0 = b.abrir();
  assert.equal(ingresos(pc) - ingresos(base0), 42000 - 21000, "falta cobrada una vez, devolución hecha una vez");
  assert.deepEqual(M.plataPendiente(pc), []);
});

test("comandos nuevos `plata` y `bandeja`: re-aplicados sobre la misma base dan lo mismo byte a byte, y se cuentan en criollo", () => {
  // plata · esperarOK: el fiado de una cuenta abierta.
  const preparar = (e: EstadoClub) => {
    const cl = e.clientes.find((c) => !c.cc.habilitada)!;
    const cta = M.abrirCuenta(e, { clienteId: cl.id, titular: cl.nombre }, AHORA);
    assert.ok(cta.ok);
    assert.ok(M.cargarEnCuenta(e, cta.cuenta.id, "p1", 2, AHORA).ok);
    assert.ok(M.solicitarCredito(e, { clienteId: cl.id, tipo: "fiado", monto: M.saldoCuenta(cta.cuenta), cuentaId: cta.cuenta.id }, recepcion(e), AHORA).ok);
    // y un cierre con diferencia (alerta del dueño posponible)
    assert.ok(M.cerrarCaja(e, { contado: 1, usuarioId: "u-rober", pin: "1111" }, AHORA).ok);
  };
  const b = base(preparar);
  const local = b.abrir();
  const nov = local.novedades.find((x) => x.tipo === "fiado")!;
  const c1 = comando(local, "plata", [{ tipo: "esperarOK", novedadId: nov.id }], recepcion(local));
  assert.equal(correrComando(local, c1).ok, true);
  const dif = M.alertas(local, AHORA).find((a) => a.tipo === "cierreConDiferencia")!;
  const c2 = comando(local, "bandeja", [{ tipo: "posponer", clave: M.claveDeAlerta(dif) }], duenio(local));
  assert.equal(correrComando(local, c2).ok, true);
  base();
  const deNuevo = b.abrir();
  const r = rebasar(deNuevo, [c1, c2], new Set());
  assert.deepEqual(r.rechazados, []);
  assert.equal(JSON.stringify(deNuevo), JSON.stringify(local), "byte a byte");
  assert.match(describirComando(c1, deNuevo), /esperando el OK del dueño/);
  assert.match(describirComando(c2, deNuevo), /Dejar para mañana el cierre de caja que no cuadró/);
  // Re-aplicar de nuevo (otro puesto) no rompe nada: idempotentes.
  assert.equal(correrComando(deNuevo, { ...c1, id: "otra" }).ok, true);
  assert.equal(correrComando(deNuevo, { ...c2, id: "otra2" }).ok, true);
  // La pospuesta la decide un dueño.
  assert.equal(ejecutarBandeja(b.abrir(), { tipo: "posponer", clave: M.claveDeAlerta(dif) }, AHORA, recepcion(local)).ok, false);
});

test("BP-051: Ctrl+K «Pablo» → «debe la falta del 10/10 · $ 42.000 · Cobrar», en rojo, y lleva a la Caja", () => {
  const e = M.generarDemo(HOY, AHORA.min);
  conPlata(e);
  const solapas = [{ id: "agenda", etiqueta: "Agenda" }, { id: "caja", etiqueta: "Caja" }];
  const it = armarPaleta(e, { texto: "pablo", hoy: HOY, dia: HOY, solapas }).find((i) => i.grupo === "Plata")!;
  assert.ok(it, "aparece");
  assert.deepEqual([it.titulo, it.detalle, it.rojo, it.accion], ["Pablo Ruiz", "debe la falta del 10/10 · $ 42.000 · Cobrar", true, { tipo: "solapa", id: "caja" }]);
  assert.equal(plataQueCoincide(e, "sofi")[0].tipo, "devolucion");
  assert.equal(armarPaleta(e, { texto: "pablo", hoy: HOY, dia: HOY, solapas: [{ id: "agenda", etiqueta: "Agenda" }] }).some((i) => i.grupo === "Plata"), false, "sin Caja, no");
});

test("BP-053/054 · dos bandejas: la caja sin cerrar en las dos; el cierre con diferencia y el pago que vence sólo en la del dueño; la plata, en ninguna (tiene su sección)", () => {
  const e = M.generarDemo(HOY, AHORA.min);
  conPlata(e);
  e.caja.cierres = []; // la semana de la demo, sin cerrar
  const ayer = DIA(-1);
  // Sólo la de ayer sin cerrar; la de antes de ayer cerró con −$5.000.
  for (const dia of M.cajasSinCerrar(e, AHORA).filter((d) => d !== ayer && d !== DIA(-2))) e.caja.cierres.push({ dia, responsable: "Lu", fecha: dia, min: 23 * 60, esperado: 5000, contado: 5000, diferencia: 0, ingresos: 0, egresos: 0 });
  e.caja.cierres.push({ dia: DIA(-2), responsable: "Lu", fecha: DIA(-2), min: 23 * 60 + 58, esperado: 50000, contado: 45000, diferencia: -5000, ingresos: 0, egresos: 0 });
  const prod = e.productos.find((p) => p.stock != null && !p.alquiler)!.id;
  assert.ok(M.registrarRemito(e, { proveedorId: e.proveedores[0] ? (e.proveedores[0] as { id: string }).id : "pv1", numero: "R-9", items: [{ productoId: prod, cant: 10, costo: 4800 }], vence: DIA(1) }, { usuarioId: "u-rober" }, AHORA).ok);
  const { mostrador, duenio: delDuenio } = partir(M.alertas(e, AHORA));
  const tipos = (l: { tipo: string }[]) => l.map((a) => a.tipo);
  assert.ok(tipos(mostrador).includes("caja") && tipos(delDuenio).includes("caja"));
  for (const t of ["cierreConDiferencia", "vencePago"]) {
    assert.ok(tipos(delDuenio).includes(t), `${t} en el Tablero`);
    assert.ok(!tipos(mostrador).includes(t), `${t} no en la Agenda`);
  }
  for (const t of ["devolucion", "falta_sin_ficha"]) assert.ok(![...tipos(mostrador), ...tipos(delDuenio)].includes(t), `${t}: va en Plata pendiente`);
  assert.ok(mostrador.every((a) => !a.paraDuenio || a.tipo === "caja"));
  const v = armarDosBandejas(e, AHORA, false);
  assert.deepEqual(v.duenio, [], "a recepción no le llega la del dueño");
  const d = armarDosBandejas(e, AHORA, true).duenio;
  const cierre = d.find((i) => i.alerta.tipo === "cierreConDiferencia")!;
  assert.deepEqual([cierre.posponible, cierre.plazo], [true, "hoy"]);
  assert.equal(cierre.texto, `La caja del ${DIA(-2).slice(8)}/10 cerró con $ 5.000 de menos (Lu, 23:58).`);
  assert.equal(d.find((i) => i.alerta.tipo === "caja")!.posponible, false, "la caja sin cerrar no se deja para mañana");
});

test("BP-055 · pospuesta desde la bandeja: hoy no está en ninguna; mañana vuelve", () => {
  const a = crearAlmacen({ hoy: HOY, clave: "gsg-club:prueba:yo:v1", almacenamiento: null, rol: "OWNER", enReposo: null });
  a.aplicar((e, ahora) => M.cerrarCaja(e, { contado: 1, usuarioId: "u-rober", pin: "1111" }, ahora));
  const item = armarDosBandejas(a.estado(), a.ahora(), true).duenio.find((i) => i.alerta.tipo === "cierreConDiferencia")!;
  assert.ok(item);
  a.cambiarOperador(M.usuario(a.estado(), "u-rober")!, { usuarioId: "u-rober", pin: "1111" });
  const d = a.comando("bandeja", [{ tipo: "posponer", clave: M.claveDeAlerta(item.alerta) }]);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(armarDosBandejas(a.estado(), a.ahora(), true).duenio.some((i) => i.alerta.tipo === "cierreConDiferencia"), false);
  assert.equal(armarDosBandejas(a.estado(), { fecha: DIA(1), min: 9 * 60 }, true).duenio.some((i) => i.alerta.tipo === "cierreConDiferencia"), true);
});

test("H2 · re-aplicar un comando con su prefijo deja el prefijo REAL que tenía el proceso (aunque no lo haya puesto comandos-core)", () => {
  const b = base();
  const e = b.abrir();
  M.prefijoIds("turnero-");
  const c = { ...comando(e, "luz", ["c1", !e.luces.c1], recepcion(e)), prefijo: "tab1-" };
  assert.equal(correrComando(e, c).ok, true);
  assert.equal(M.prefijoActualIds(), "turnero-", "no lo pisa con «»");
  M.prefijoIds("");
});

test("BP-054 (pantalla): el cierre de ayer con −$ 2.000 de la demo está en «Para el dueño» (Tablero) con «Mañana»; la bandeja de la Agenda no lo tiene", () => {
  const a = crearAlmacen({ hoy: HOY, clave: "gsg-club:prueba:yo:v1", almacenamiento: null, rol: "OWNER", enReposo: null });
  const duenioHtml = renderToStaticMarkup(h(BandejaDelDuenio, { almacen: a, irASolapa: () => undefined }));
  assert.match(duenioHtml, /Para el dueño \(1\)/);
  assert.match(duenioHtml, /La caja del 16\/10 cerró con \$ 2\.000 de menos \(Lu, 00:30\)\./);
  assert.match(duenioHtml, /aria-label="Dejar para mañana: La caja del 16\/10[^"]*"[^>]*>Mañana</);
  assert.doesNotMatch(duenioHtml, /pide cuenta corriente|pidió acceso/, "los pedidos de crédito y acceso tienen su tarjeta en el Tablero");
  const agenda = renderToStaticMarkup(h(BandejaDelClub, { almacen: a, onVerTurno: () => undefined, irASolapa: () => true }));
  assert.match(agenda, /Para resolver ahora/);
  assert.doesNotMatch(agenda, /cerró con|pide cuenta corriente/, "lo del dueño no va en la Agenda");
});

test("Tanda 2 · sin duplicados: la devolución y la falta están UNA vez al lado de la agenda (en «Plata pendiente», no también como alerta de la bandeja), y el contador de la bandeja no las cuenta", () => {
  const a = crearAlmacen({ hoy: HOY, clave: "gsg-club:prueba:yo:v1", almacenamiento: null, rol: "RECEPTION", enReposo: null });
  a.aplicar((e) => {
    conPlata(e);
    return { ok: true };
  });
  // El motor sí las trae como alertas (por eso hace falta el filtro de `partir`).
  const tipos = M.alertas(a.estado(), a.ahora()).map((x) => x.tipo);
  assert.ok(tipos.includes("devolucion") && tipos.includes("falta_sin_ficha"));
  const html = renderToStaticMarkup(h(BandejaDelClub, { almacen: a, onVerTurno: () => undefined, irASolapa: () => true }));
  const veces = (texto: string) => html.split(texto).length - 1;
  assert.equal(veces("Sofi Paz"), 1, "la devolución de Sofi, una sola vez");
  assert.equal(veces("Pablo Ruiz"), 1, "la falta de Pablo, una sola vez");
  assert.match(html, /Plata pendiente \(2\)/);
  const enLaBandeja = armarDosBandejas(a.estado(), a.ahora(), true);
  for (const i of [...enLaBandeja.mostrador, ...enLaBandeja.duenio]) assert.ok(!["devolucion", "falta_sin_ficha"].includes(i.alerta.tipo), i.texto);
  // Y la plata pendiente las tiene a las dos, una vez cada una.
  const claves = armarPlataPendiente(a.estado()).items.map((i) => i.clave);
  assert.equal(new Set(claves).size, claves.length);
});

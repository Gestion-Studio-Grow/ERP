// ============================================================================
// SIN INTERNET (H-T2-1 de la cert de la Tanda 2; D4 de docs/producto/MODO-SIN-INTERNET-CLUB.md §5) — la regla del
// REGISTRO aplicada por el almacén REAL, en un solo lugar (`almacen.comando`).
// ============================================================================
//
//   · Cada comando del REGISTRO, con y sin internet: con internet, la regla no frena nada; sin internet, lo que no va
//     (`vaSinInternet` false) se rechaza ANTES de correr — el estado queda byte a byte, no entra a la cola, no se corre
//     la envoltura del PIN — con el texto que dice qué hacer («Elegí Efectivo…» si sólo frena el medio, «Esto necesita
//     internet…» si no); lo que va, va.
//   · Cómo se sabe que no hay internet: la subida que falló (`sinInternetDesde`), el latido de versión sin respuesta,
//     o el navegador que dice que no tiene red (`enLinea`). Al volver (el latido contesta) se levanta.
//   · Efectivo sin internet entra y sube al volver; «Volver a aplicar» un cobro por MP sin internet, tampoco.
//   · Fuera de dos puestos (la demo) no hay «sin internet»: nada se frena.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { EstadoClub } from "@/lib/club/motor.mjs";
import { claveDeLaDemo, claveDeLaJornada, crearAlmacen, MINUTO_DEMO, textoDeLaDemo, textoDelEstado, type Almacen, type AlmacenamientoLocal, type ResultadoDelGuardado, type Temporizador } from "./almacen";
import { REGISTRO, rechazoSinInternet, SIN_INTERNET_NECESITA, SIN_INTERNET_SOLO_EFECTIVO, vaSinInternet } from "./comandos-core";
import { leerSincro } from "./sincro-core";

const HOY = "2026-10-17";
const NEGOCIO = "club-sin-internet";

const vaciar = async () => {
  for (let i = 0; i < 30; i++) await new Promise<void>((r) => setImmediate(r));
};

function memoria(): AlmacenamientoLocal & { cola: () => string } {
  const datos = new Map<string, string>();
  return {
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => void datos.set(k, String(v)),
    removeItem: (k) => void datos.delete(k),
    cola: () => [...datos.entries()].filter(([k]) => k.includes(":cola")).map(([, v]) => v).join("\n"),
  };
}

function temporizadorFalso(): Temporizador & { latidos: (() => void)[]; correr: () => void } {
  const esperas: { fn: () => void; viva: boolean }[] = [];
  const t = {
    latidos: [] as (() => void)[],
    despues(fn: () => void) {
      const e = { fn, viva: true };
      esperas.push(e);
      return () => void (e.viva = false);
    },
    cada(fn: () => void) {
      t.latidos.push(fn);
      return () => void t.latidos.splice(t.latidos.indexOf(fn), 1);
    },
    correr() {
      for (const e of esperas.splice(0)) if (e.viva) e.fn();
    },
  };
  return t;
}

function baseCompartida() {
  const e = M.generarDemo(HOY, MINUTO_DEMO);
  M.pasarPinesAHash(e);
  for (let d = 1; d < 7; d++) M.materializarFijos(e, M.sumarDias(HOY, d));
  return { foto: { texto: textoDeLaDemo(textoDelEstado(e), HOY, 1), version: 1 } as { texto: string; version: number } | null };
}
type Base = ReturnType<typeof baseCompartida>;
const enLaBase = (b: Base) => (JSON.parse(b.foto!.texto) as { estado: EstadoClub }).estado;

/** El guardado de un puesto contra la base: sube en el acto, salvo `retener` (queda esperando) o `caer` (no contesta). */
function guardadoDe(b: Base) {
  const esperando: { texto: string; esperada: number; resolver: (r: ResultadoDelGuardado) => void }[] = [];
  let retener = false;
  let caida = false;
  const resolver = (x: (typeof esperando)[number]) => {
    if (caida) return x.resolver({ ok: false, motivo: "error" });
    const actual = b.foto?.version ?? 0;
    if (actual !== x.esperada) return x.resolver({ ok: false, motivo: "conflicto", version: actual });
    b.foto = { texto: x.texto, version: actual + 1 };
    x.resolver({ ok: true, version: actual + 1 });
  };
  return {
    async leer() {
      if (caida) throw new Error("sin red");
      return b.foto && { ...b.foto };
    },
    guardar(texto: string, esperada: number) {
      return new Promise<ResultadoDelGuardado>((r) => {
        const x = { texto, esperada, resolver: r };
        if (retener) esperando.push(x);
        else queueMicrotask(() => resolver(x));
      });
    },
    async leerVersion() {
      return caida ? null : (b.foto?.version ?? 0);
    },
    async subirYa() {},
    retener: () => void (retener = true),
    soltar() {
      retener = false;
      for (const x of esperando.splice(0)) resolver(x);
    },
    caer: (si: boolean) => void (caida = si),
  };
}

const CARO = { id: "u-caro", pin: "44" };
const LU = { id: "u-lu", pin: "33" };

function puesto(b: Base, equipo: string, nombre: string, quien: { id: string; pin: string }, opciones: { enLinea?: () => boolean } = {}) {
  const g = guardadoDe(b);
  const t = temporizadorFalso();
  const disco = memoria();
  const a = crearAlmacen({
    reloj: "real",
    clave: claveDeLaJornada(NEGOCIO),
    almacenamiento: disco,
    guardado: g,
    cerrojos: null,
    canal: null,
    temporizador: t,
    relojMs: () => new Date(2026, 9, 17, 20, 0).getTime(),
    demoraGuardadoMs: 0,
    enReposo: null,
    rol: "OWNER",
    equipo,
    puesto: nombre,
    visible: () => true,
    ...opciones,
  });
  return {
    a,
    g,
    t,
    disco,
    latir: async () => {
      t.latidos[0]();
      await vaciar();
    },
    /** Que vuelvan a correr los reintentos del guardado (la espera creciente). */
    reintentar: async () => {
      for (let i = 0; i < 4; i++) {
        t.correr();
        await vaciar();
      }
    },
    async abrir() {
      a.arrancar();
      await vaciar();
      const u = a.estado().usuarios.find((x) => x.id === quien.id)!;
      a.cambiarOperador(u, { usuarioId: u.id, pin: quien.pin });
      return this;
    },
  };
}
type Puesto = ReturnType<typeof puesto>;

/** Se corta internet y el puesto se entera por el latido de versión (la base no contesta). */
async function cortar(p: Puesto) {
  p.g.caer(true);
  await p.latir();
  assert.ok(p.a.sincro().sinInternetDesde !== null, "el latido sin respuesta: «Sin internet desde…»");
}

// Un comando cualquiera de la pantalla (el genérico de `almacen.comando` no deja pasar un nombre suelto).
type Correr = (nombre: string, args: unknown, opciones?: { envolver?: (correr: () => unknown) => unknown }) => { ok: boolean; mensaje: string };
const comando = (a: Almacen) => a.comando.bind(a) as unknown as Correr;

/**
 * Cada comando del REGISTRO: con qué argumentos VA sin internet (null: nunca va) y con cuáles NO (con el texto que se
 * espera). Los ids son de mentira donde no importa: sin internet lo que no va se frena antes de mirar nada.
 */
const TABLA: Record<keyof typeof REGISTRO, { va: unknown[][]; no: [unknown[], string][] }> = {
  cuenta: {
    va: [["r", { tipo: "cobrarTodo", medio: "efectivo" }], ["r", { tipo: "cobrarJugador", idx: 0, medio: "monedero" }], ["r", { tipo: "abrirCancha" }], ["r", { tipo: "canchaACuenta" }]],
    no: [
      [["r", { tipo: "cobrarTodo", medio: "mercadopago" }], SIN_INTERNET_SOLO_EFECTIVO],
      [["r", { tipo: "cobrarCancha", monto: 1000, medio: "transferencia" }], SIN_INTERNET_SOLO_EFECTIVO],
      [["r", { tipo: "cobrarJugador", idx: 0, medio: "monedero", resto: "debito", usa: 100 }], SIN_INTERNET_SOLO_EFECTIVO],
      [["r", { tipo: "cargo", idx: 0, productoId: "p", cant: 1, modo: "cobrar", medio: "mercadopago" }], SIN_INTERNET_SOLO_EFECTIVO],
    ],
  },
  ciclo: {
    va: [["r", { tipo: "falta", cobrarA: "titular" }], ["r", { tipo: "cobrarFalta", medio: "efectivo" }]],
    no: [
      [["r", { tipo: "cobrarFalta", medio: "mercadopago" }], SIN_INTERNET_SOLO_EFECTIVO],
      [["r", { tipo: "devolver", medio: "efectivo" }], SIN_INTERNET_NECESITA],
      [["r", { tipo: "mover", canchaId: "c2", inicio: 1260 }], SIN_INTERNET_NECESITA],
      [["r", { tipo: "cancelar", porClub: false, motivo: "" }], SIN_INTERNET_NECESITA],
    ],
  },
  buffet: {
    va: [[{ tipo: "cobrar", cuentaId: "k", medio: "efectivo" }], [{ tipo: "cargar", cuentaId: "k", productoId: "p", cant: 1 }], [{ tipo: "aCuenta", cuentaId: "k" }]],
    no: [[[{ tipo: "cobrar", cuentaId: "k", medio: "debito" }], SIN_INTERNET_SOLO_EFECTIVO]],
  },
  mesa: {
    va: [[{ tipo: "pasarCargo", cuentaId: "k", itemIdx: 0, aCuentaId: "k2", cant: null }], [{ tipo: "cargoManual", cuentaId: "k", concepto: "Pelotas", monto: 500, descuento: false, pin: "" }]],
    no: [[[{ tipo: "cargoManual", cuentaId: "k", concepto: "Descuento", monto: -500, descuento: true, pin: "1111" }], SIN_INTERNET_NECESITA]],
  },
  caja: {
    va: [],
    no: [
      [[{ tipo: "egreso", monto: "900", concepto: "Hielo", pin: "1111" }], SIN_INTERNET_NECESITA],
      [[{ tipo: "cerrar", contado: "0", dia: null, pin: "1111" }], SIN_INTERNET_NECESITA],
      [[{ tipo: "fondo", monto: "500" }], SIN_INTERNET_NECESITA],
    ],
  },
  alta: { va: [[{ fecha: HOY, canchaId: "c1", inicio: 600, duracion: 60, tipo: "turno", titular: "Ana", clienteId: null, otros: "" }]], no: [] },
  esperaDesdeAlta: { va: [[{ titular: "Ana", clienteId: null }]], no: [] },
  espera: { va: [[{ tipo: "quitar", esperaId: "w" }]], no: [] },
  fijo: { va: [[{ tipo: "bajar" }]], no: [[[{ tipo: "baja", fijoId: "f" }], SIN_INTERNET_NECESITA]] },
  luz: { va: [["c1", true]], no: [] },
  canchas: { va: [], no: [[[{ tipo: "lluvia", fecha: HOY, desde: 1200, hasta: 1320 }], SIN_INTERNET_NECESITA]] },
  venta: {
    va: [[{ p: 1 }, "efectivo"]],
    no: [
      [[{ p: 1 }, "mercadopago"], SIN_INTERNET_SOLO_EFECTIVO],
      [[{ p: 1 }, "transferencia"], SIN_INTERNET_SOLO_EFECTIVO],
      [[{ p: 1 }, "debito"], SIN_INTERNET_SOLO_EFECTIVO],
    ],
  },
  fiado: {
    va: [],
    no: [
      [[{ tipo: "pedir", cuentaId: "k" }], SIN_INTERNET_NECESITA],
      [[{ tipo: "aprobarCodigo", novedadId: "n", codigo: "ABC-DEF" }], SIN_INTERNET_NECESITA],
    ],
  },
  clientes: {
    va: [[{ tipo: "cobrarDeuda", clienteId: "k", medio: "efectivo", monto: "100" }]],
    no: [
      [[{ tipo: "cobrarDeuda", clienteId: "k", medio: "mercadopago", monto: "100" }], SIN_INTERNET_SOLO_EFECTIVO],
      [[{ tipo: "aprobarCodigo", novedadId: "n", codigo: "ABC-DEF", monto: "100" }], SIN_INTERNET_NECESITA],
      [[{ tipo: "pedirCC", clienteId: "k", limite: "1000", nota: "" }], SIN_INTERNET_NECESITA],
      [[{ tipo: "alta", nombre: "Ana", tel: "", nivel: "" }], SIN_INTERNET_NECESITA],
    ],
  },
  tienda: {
    va: [[{ tipo: "entregar", pedidoId: "t", medio: "efectivo" }]],
    no: [
      [[{ tipo: "entregar", pedidoId: "t", medio: "transferencia" }], SIN_INTERNET_SOLO_EFECTIVO],
      [[{ tipo: "aCuenta", pedidoId: "t", clienteId: "k" }], SIN_INTERNET_NECESITA],
    ],
  },
  stock: { va: [], no: [[[{ tipo: "baja", productoId: "p", activo: false }], SIN_INTERNET_NECESITA]] },
  proveedores: { va: [], no: [[[{ tipo: "pagar", proveedorId: "x", monto: "100", medio: "efectivo", pin: "1111" }], SIN_INTERNET_NECESITA]] },
  novedades: { va: [], no: [[[{ tipo: "borrarPublicacion", id: "n" }], SIN_INTERNET_NECESITA]] },
  tablero: { va: [], no: [[[{ tipo: "autorizar", novedadId: "n", monto: "100" }], SIN_INTERNET_NECESITA]] },
  config: { va: [], no: [[[{ tipo: "cambiarMiPin", actual: "1111", nuevo: "2468", repetido: "2468" }], SIN_INTERNET_NECESITA]] },
  abrirClub: { va: [], no: [[[], SIN_INTERNET_NECESITA]] },
  golive: { va: [], no: [[[{ conservarSaldos: true, conservarStock: true, pin: "1111", descargado: true, huellaElegida: "h", rol: "OWNER" }], SIN_INTERNET_NECESITA]] },
  plata: { va: [[{ tipo: "esperarOK", novedadId: "n" }]], no: [] },
  bandeja: { va: [[{ tipo: "posponer", clave: "stock:p" }]], no: [] },
  ventaACuenta: { va: [["k", { p: 1 }]], no: [] },
  abrirConDeuda: { va: [["r", "efectivo"]], no: [[["r", "mercadopago"], SIN_INTERNET_SOLO_EFECTIVO]] },
  cierre: {
    va: [[{ tipo: "mesaSigue", reservaId: "r", porJugador: { 0: "efectivo" } }], [{ tipo: "cerrarYAbrir", cerrarId: "a", abrirId: "b", aCuenta: true, medio: "debito" }]],
    no: [
      [[{ tipo: "cerrarYAbrir", cerrarId: "a", abrirId: "b", medio: "efectivo", medioSena: "mercadopago" }], SIN_INTERNET_SOLO_EFECTIVO],
      [[{ tipo: "mesaSigue", reservaId: "r", porJugador: { 0: "efectivo", 1: "transferencia" } }], SIN_INTERNET_SOLO_EFECTIVO],
    ],
  },
};

const TEXTOS = new Set([SIN_INTERNET_SOLO_EFECTIVO, SIN_INTERNET_NECESITA]);

test("la tabla cubre TODO el REGISTRO, y la regla pura coincide: lo que va da null; lo que no, el texto que dice qué hacer", () => {
  assert.deepEqual(Object.keys(TABLA).sort(), Object.keys(REGISTRO).sort(), "un comando nuevo tiene que entrar a esta tabla");
  for (const [nombre, { va, no }] of Object.entries(TABLA)) {
    for (const args of va) {
      assert.equal(vaSinInternet(nombre, args), true, `${nombre} ${JSON.stringify(args)} va`);
      assert.equal(rechazoSinInternet(nombre, args), null, `${nombre} ${JSON.stringify(args)}`);
    }
    for (const [args, texto] of no) {
      assert.equal(vaSinInternet(nombre, args), false, `${nombre} ${JSON.stringify(args)} no va`);
      assert.equal(rechazoSinInternet(nombre, args), texto, `${nombre} ${JSON.stringify(args)}`);
    }
  }
  // Un nombre que no está o argumentos que no son lista: no va, y el texto es el general.
  assert.equal(rechazoSinInternet("borrarTodo", []), SIN_INTERNET_NECESITA);
  assert.equal(rechazoSinInternet("venta", "no es una lista"), SIN_INTERNET_NECESITA);
  // Los textos, en criollo y con qué hacer.
  assert.equal(SIN_INTERNET_SOLO_EFECTIVO, "Sin internet sólo se cobra en efectivo. Elegí Efectivo o esperá a que vuelva la señal.");
  assert.equal(SIN_INTERNET_NECESITA, "Esto necesita internet: lo podés hacer cuando vuelva la señal.");
});

test("con internet (dos puestos), la regla no frena NINGÚN comando del REGISTRO", async () => {
  const b = baseCompartida();
  const pc = await puesto(b, "pc01", "PC", CARO).abrir();
  const correr = comando(pc.a);
  for (const [nombre, { va, no }] of Object.entries(TABLA))
    for (const args of [...va, ...no.map(([a]) => a)]) {
      const d = correr(nombre, args);
      assert.ok(!TEXTOS.has(d.mensaje), `${nombre} ${JSON.stringify(args)} no lo frena internet: «${d.mensaje}»`);
    }
  assert.equal(pc.a.sincro().sinInternetDesde, null);
});

test("sin internet (dos puestos), cada comando del REGISTRO: lo que no va se rechaza ANTES de correr — estado y cola intactos, el PIN no se prueba, el aviso es role=alert con qué hacer —; lo que va, va", async () => {
  const b = baseCompartida();
  const tablet = await puesto(b, "tab1", "tablet", LU).abrir();
  await cortar(tablet);
  const correr = comando(tablet.a);
  for (const [nombre, { no }] of Object.entries(TABLA))
    for (const [args, texto] of no) {
      const antes = textoDelEstado(tablet.a.estado());
      const enCola = tablet.a.sincro().enCola;
      const cola = tablet.disco.cola();
      let envuelto = 0;
      const d = correr(nombre, args, {
        envolver: (c) => {
          envuelto++;
          return c();
        },
      });
      const que = `${nombre} ${JSON.stringify(args)}`;
      assert.equal(d.ok, false, que);
      assert.equal(d.mensaje, texto, que);
      assert.equal(envuelto, 0, `${que}: no corrió (ni gastó un intento de PIN)`);
      assert.equal(textoDelEstado(tablet.a.estado()), antes, `${que}: el estado queda byte a byte`);
      assert.equal(tablet.a.sincro().enCola, enCola, `${que}: no entra a la cola`);
      assert.equal(tablet.disco.cola(), cola, `${que}: ni a la cola del equipo`);
      assert.deepEqual({ ok: tablet.a.aviso()?.ok, mensaje: tablet.a.aviso()?.mensaje }, { ok: false, mensaje: texto }, `${que}: el aviso (role="alert" en AvisosDelClub)`);
    }
  for (const [nombre, { va }] of Object.entries(TABLA))
    for (const args of va) {
      const d = correr(nombre, args);
      assert.ok(!TEXTOS.has(d.mensaje), `${nombre} ${JSON.stringify(args)} va sin internet: «${d.mensaje}»`);
    }
});

test("venta: por MP sin internet NO entra (caja y stock intactos); en efectivo entra, queda en la cola y sube al volver; vuelto internet, MP entra", async () => {
  const b = baseCompartida();
  const tablet = await puesto(b, "tab1", "tablet", LU).abrir();
  const e0 = tablet.a.estado();
  const prod = e0.productos.find((p) => p.activo !== false && !p.alquiler && typeof p.stock === "number" && p.stock >= 5)!;
  const stock0 = prod.stock as number;
  const caja0 = M.resumenCaja(e0);
  await cortar(tablet);
  const mp = tablet.a.comando("venta", [{ [prod.id]: 1 }, "mercadopago"]);
  assert.deepEqual([mp.ok, mp.mensaje], [false, SIN_INTERNET_SOLO_EFECTIVO]);
  assert.equal(M.resumenCaja(tablet.a.estado()).porMedio.mercadopago ?? 0, caja0.porMedio.mercadopago ?? 0, "nada cobrado por MP");
  assert.equal(M.producto(tablet.a.estado(), prod.id)!.stock, stock0, "el stock no bajó");
  const ef = tablet.a.comando("venta", [{ [prod.id]: 1 }, "efectivo"]);
  assert.equal(ef.ok, true, ef.mensaje);
  await vaciar();
  assert.equal(tablet.a.sincro().enCola, 1, "la venta en efectivo espera en la cola");
  assert.equal(M.resumenCaja(enLaBase(b)).ingresos, caja0.ingresos, "todavía no llegó a la base");
  // Vuelve internet: el reintento sube la venta y la cinta se levanta.
  tablet.g.caer(false);
  await tablet.reintentar();
  assert.equal(tablet.a.sincro().sinInternetDesde, null);
  assert.equal(tablet.a.sincro().enCola, 0);
  const base = enLaBase(b);
  assert.equal(M.resumenCaja(base).ingresos - caja0.ingresos, prod.precio, "la venta en efectivo llegó UNA vez");
  assert.equal(M.producto(base, prod.id)!.stock, stock0 - 1);
  const mp2 = tablet.a.comando("venta", [{ [prod.id]: 1 }, "mercadopago"]);
  assert.equal(mp2.ok, true, mp2.mensaje);
});

test("cómo se sabe: la subida que falla, el latido que no contesta o el navegador sin red; el latido que vuelve a contestar lo levanta aunque no haya nada que subir", async () => {
  const b = baseCompartida();
  // 1) La subida que falla (sin latido de por medio).
  const pc = await puesto(b, "pc01", "PC", CARO).abrir();
  const turno = pc.a.estado().reservas.find((x) => x.fecha === HOY && x.estado === "en_cancha" && M.saldo(x) > 0)!.id;
  pc.g.caer(true);
  assert.equal(pc.a.comando("cuenta", [turno, { tipo: "cobrarJugador", idx: 0, medio: "efectivo" }]).ok, true, "efectivo va");
  await vaciar();
  assert.ok(pc.a.sincro().sinInternetDesde !== null, "la subida falló: sin internet");
  assert.equal(pc.a.comando("cuenta", [turno, { tipo: "cobrarTodo", medio: "transferencia" }]).mensaje, SIN_INTERNET_SOLO_EFECTIVO);
  // 2) El latido que no contesta, con nada pendiente; y el que vuelve a contestar lo levanta.
  const tablet = await puesto(b, "tab1", "tablet", LU).abrir();
  await cortar(tablet);
  assert.equal(tablet.a.sincro().enCola, 0, "nada que subir");
  tablet.g.caer(false);
  await tablet.latir();
  assert.equal(tablet.a.sincro().sinInternetDesde, null, "volvió: la base contestó el latido");
  assert.notEqual(tablet.a.comando("fiado", [{ tipo: "pedir", cuentaId: "k-no-existe" }]).mensaje, SIN_INTERNET_NECESITA);
  // 3) El navegador dice que no tiene red: el PRIMER toque después de apagar el wifi ya se frena.
  let enLinea = true;
  const cel = await puesto(b, "cel1", "celular", CARO, { enLinea: () => enLinea }).abrir();
  enLinea = false;
  assert.equal(cel.a.sincro().sinInternetDesde, null, "todavía no falló nada");
  const egreso = cel.a.comando("caja", [{ tipo: "egreso", monto: "900", concepto: "Hielo", pin: "44" }]);
  assert.deepEqual([egreso.ok, egreso.mensaje], [false, SIN_INTERNET_NECESITA]);
  enLinea = true;
  assert.notEqual(cel.a.comando("caja", [{ tipo: "egreso", monto: "900", concepto: "Hielo", pin: "44" }]).mensaje, SIN_INTERNET_NECESITA, "con red, la regla no frena");
});

test("«Volver a aplicar» un cobro por MP que quedó para resolver: sin internet tampoco entra (la misma regla); con internet lo decide el motor", async () => {
  const b = baseCompartida();
  const pc = await puesto(b, "pc01", "PC", CARO).abrir();
  const tablet = await puesto(b, "tab1", "tablet", LU).abrir();
  const turno = tablet.a.estado().reservas.find((x) => x.fecha === HOY && x.estado === "en_cancha" && M.saldo(x) > 0)!.id;
  // Los dos cobran lo mismo: la tablet (con wifi lento) por MP, la PC en efectivo y llega primero.
  tablet.g.retener();
  assert.equal(tablet.a.comando("cuenta", [turno, { tipo: "cobrarTodo", medio: "mercadopago" }]).ok, true);
  assert.equal(pc.a.comando("cuenta", [turno, { tipo: "cobrarTodo", medio: "efectivo" }]).ok, true);
  await vaciar();
  tablet.g.soltar();
  await vaciar();
  await tablet.reintentar();
  const item = leerSincro(tablet.a.estado()).paraResolver[0];
  assert.ok(item, "el cobro por MP de la tablet quedó para resolver");
  await cortar(tablet);
  const antes = textoDelEstado(tablet.a.estado());
  const d = tablet.a.volverAAplicar(item.id);
  assert.deepEqual([d.ok, d.mensaje], [false, SIN_INTERNET_SOLO_EFECTIVO]);
  assert.equal(textoDelEstado(tablet.a.estado()), antes);
  tablet.g.caer(false);
  await tablet.latir();
  assert.notEqual(tablet.a.volverAAplicar(item.id).mensaje, SIN_INTERNET_SOLO_EFECTIVO, "con internet, lo decide el motor (ya está cobrado: no cobra dos veces)");
  assert.equal(M.saldo(M.reserva(enLaBase(b), turno)!), 0);
});

test("fuera de dos puestos (la demo) no hay «sin internet»: con el navegador sin red, la venta por MP entra igual", () => {
  const a = crearAlmacen({ clave: claveDeLaDemo("demo-club", "u1"), almacenamiento: null, hoy: HOY, enReposo: null, enLinea: () => false });
  a.arrancar();
  const prod = a.estado().productos.find((p) => p.activo !== false && !p.alquiler && typeof p.stock === "number" && p.stock >= 1)!;
  const d = a.comando("venta", [{ [prod.id]: 1 }, "mercadopago"]);
  assert.equal(d.ok, true, d.mensaje);
});

test("la ventana que queda (documentada): wifi «conectado» sin salida y el puesto todavía no lo sabe — el PRIMER cobro por MP entra; su subida falla, y desde ahí el siguiente ya no", async () => {
  const b = baseCompartida();
  const tablet = await puesto(b, "tab1", "tablet", LU).abrir();
  const prod = tablet.a.estado().productos.find((p) => p.activo !== false && !p.alquiler && typeof p.stock === "number" && p.stock >= 5)!;
  tablet.g.caer(true);
  // Ni subida fallida ni latido todavía, y el navegador dice que tiene red: no hay cómo saberlo.
  assert.equal(tablet.a.comando("venta", [{ [prod.id]: 1 }, "mercadopago"]).ok, true, "la ventana: el primero entra");
  await vaciar();
  // El cobro «sube ya» (promete): la subida falla y el puesto se entera.
  assert.ok(tablet.a.sincro().sinInternetDesde !== null);
  const d = tablet.a.comando("venta", [{ [prod.id]: 1 }, "mercadopago"]);
  assert.deepEqual([d.ok, d.mensaje], [false, SIN_INTERNET_SOLO_EFECTIVO], "el siguiente, ya no");
});

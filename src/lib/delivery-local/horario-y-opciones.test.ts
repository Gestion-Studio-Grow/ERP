import { test } from "node:test";
import assert from "node:assert/strict";
import { estaAbierto, proximaApertura, rechazoPorHorario, resumenDelHorario, textoDelEstado, type HorarioDelLocal } from "./horario";
import {
  codificarEleccion,
  gruposDelProducto,
  idsParaLasOpciones,
  leerEleccion,
  opcionesDelAlta,
  recargoUnitario,
  PRODUCTO_QUE_YA_NO_ESTA,
  TOPE_PRODUCTOS_DISTINTOS,
  type OpcionesDeProducto,
} from "./opciones";
import { configDeliveryLocal } from "./config";

// Hora argentina escrita a mano (−03:00, sin horario de verano). 13/11/2026 es viernes.
const ar = (s: string) => new Date(`${s}:00-03:00`);

const COMUN: HorarioDelLocal = {
  porDia: { lun: [["08:00", "20:00"]], mar: [["08:00", "20:00"]], mie: [["08:00", "20:00"]], jue: [["08:00", "20:00"]], vie: [["08:00", "20:00"]], sab: [["08:00", "20:00"]] },
};

// ── Horario ──
test("horario: abierto dentro de la franja, con la hora de cierre; [desde, hasta)", () => {
  assert.deepEqual(estaAbierto(COMUN, ar("2026-11-13T08:00")), { abierto: true, cierra: "20:00" });
  assert.deepEqual(estaAbierto(COMUN, ar("2026-11-13T19:59")), { abierto: true, cierra: "20:00" });
  assert.deepEqual(estaAbierto(COMUN, ar("2026-11-13T20:00")), { abierto: false });
  assert.deepEqual(estaAbierto(COMUN, ar("2026-11-13T07:59")), { abierto: false });
});

test("horario: se lee en la hora argentina aunque el servidor esté en UTC (23:30 UTC = 20:30 en BA)", () => {
  assert.equal(estaAbierto(COMUN, new Date("2026-11-13T22:59:00Z")).abierto, true); // 19:59 BA
  assert.equal(estaAbierto(COMUN, new Date("2026-11-13T23:30:00Z")).abierto, false); // 20:30 BA
  // 01:00 UTC del sábado es todavía viernes 22:00 en BA: cerrado, abre mañana.
  assert.equal(textoDelEstado(COMUN, new Date("2026-11-14T01:00:00Z")), "Cerrado · abre mañana 8:00");
});

test("horario: textos de la vidriera", () => {
  assert.equal(textoDelEstado(COMUN, ar("2026-11-13T10:00")), "Abierto · cierra 20:00");
  assert.equal(textoDelEstado(COMUN, ar("2026-11-13T06:30")), "Cerrado · abre hoy 8:00");
  assert.equal(textoDelEstado(COMUN, ar("2026-11-14T21:00")), "Cerrado · abre el lunes 8:00"); // sábado de noche
  assert.equal(textoDelEstado(COMUN, ar("2026-11-15T12:00")), "Cerrado · abre mañana 8:00"); // domingo
  assert.equal(textoDelEstado({ porDia: {} }, ar("2026-11-15T12:00")), "Cerrado por ahora");
});

test("horario: franja que cruza la medianoche es del día en que empieza", () => {
  const noche: HorarioDelLocal = { porDia: { vie: [["20:00", "02:00"]] } };
  assert.deepEqual(estaAbierto(noche, ar("2026-11-13T23:59")), { abierto: true, cierra: "2:00" });
  assert.deepEqual(estaAbierto(noche, ar("2026-11-14T00:00")), { abierto: true, cierra: "2:00" }); // sábado 0:00
  assert.deepEqual(estaAbierto(noche, ar("2026-11-14T01:59")), { abierto: true, cierra: "2:00" });
  assert.deepEqual(estaAbierto(noche, ar("2026-11-14T02:00")), { abierto: false });
  // El jueves a la 1:00 no hay nada de ayer (miércoles sin franja).
  assert.equal(estaAbierto(noche, ar("2026-11-12T01:00")).abierto, false);
  // «24:00» y «00:00» como cierre son la medianoche.
  const hastaLas24: HorarioDelLocal = { porDia: { vie: [["18:00", "24:00"]] } };
  assert.deepEqual(estaAbierto(hastaLas24, ar("2026-11-13T23:59")), { abierto: true, cierra: "0:00" });
  assert.equal(estaAbierto(hastaLas24, ar("2026-11-14T00:00")).abierto, false);
  const hastaLas00: HorarioDelLocal = { porDia: { vie: [["18:00", "00:00"]] } };
  assert.equal(estaAbierto(hastaLas00, ar("2026-11-13T23:59")).abierto, true);
  assert.equal(estaAbierto(hastaLas00, ar("2026-11-14T00:00")).abierto, false);
});

test("horario: franja partida (mañana y tarde)", () => {
  const partido: HorarioDelLocal = { porDia: { vie: [["08:00", "13:00"], ["17:00", "21:00"]] } };
  assert.deepEqual(estaAbierto(partido, ar("2026-11-13T12:30")), { abierto: true, cierra: "13:00" });
  assert.equal(estaAbierto(partido, ar("2026-11-13T15:00")).abierto, false);
  assert.deepEqual(proximaApertura(partido, ar("2026-11-13T15:00")), { enDias: 0, dia: "viernes", hora: "17:00" });
  assert.deepEqual(estaAbierto(partido, ar("2026-11-13T17:00")), { abierto: true, cierra: "21:00" });
  assert.equal(resumenDelHorario(partido), "Viernes de 8 a 13 y de 17 a 21");
});

test("horario: los feriados NO se contemplan (el lunes 23/11 feriado abre como lunes)", () => {
  assert.equal(estaAbierto(COMUN, ar("2026-11-23T10:00")).abierto, true);
});

test("horario: franjas mal escritas no abren nada", () => {
  const roto: HorarioDelLocal = { porDia: { vie: [["8", "20:00"], ["25:00", "26:00"], ["10:00", "10:00"], ["10:61", "11:00"]] } };
  assert.equal(estaAbierto(roto, ar("2026-11-13T10:30")).abierto, false);
});

test("horario: el resumen agrupa días seguidos iguales", () => {
  assert.equal(resumenDelHorario(COMUN), "Lunes a sábado de 8 a 20");
  assert.equal(
    resumenDelHorario({ porDia: { ...COMUN.porDia, sab: [["09:30", "14:00"]], dom: [["09:30", "14:00"]] }, provisional: true }),
    "Lunes a viernes de 8 a 20 · Sábado y domingo de 9:30 a 14 (provisional a confirmar)",
  );
});

test("horario: el servidor rechaza fuera de horario en criollo; sin horario no controla", () => {
  const cfg = { nombre: "Bitácora Café", horario: COMUN };
  assert.equal(rechazoPorHorario(cfg, ar("2026-11-13T10:00")), null);
  const no = rechazoPorHorario(cfg, ar("2026-11-13T21:00"));
  assert.ok(no && no.startsWith("Bitácora Café está cerrado") && no.includes("Abre mañana 8:00"), no ?? "");
  assert.equal(rechazoPorHorario({ nombre: "X", horario: null }, ar("2026-11-13T03:00")), null);
});

test("horario de Bitácora: provisional, lunes a sábado de 8 a 20", () => {
  const cfg = configDeliveryLocal("bitacora")!;
  assert.equal(resumenDelHorario(cfg.horario), "Lunes a sábado de 8 a 20 (provisional a confirmar)");
});

// ── Opciones de producto ──
const CONFIG: OpcionesDeProducto[] = [
  {
    producto: "Latte",
    grupos: [
      { id: "tamano", nombre: "Tamaño", tipo: "unico", obligatorio: true, opciones: [{ id: "chico", nombre: "Chico", recargo: 0 }, { id: "grande", nombre: "Grande", recargo: 900 }] },
      { id: "leche", nombre: "Leche y extras", tipo: "multiple", opciones: [{ id: "almendras", nombre: "Leche de almendras", recargo: 700 }, { id: "canela", nombre: "Canela", recargo: 0 }] },
    ],
  },
];
const PRODUCTOS = [
  { id: "p_latte", name: "latté" }, // por nombre, sin tildes ni mayúsculas
  { id: "p_medialuna", name: "Medialuna" },
];

test("opciones: el producto se encuentra por id o por nombre; sin opciones, ninguna", () => {
  assert.equal(gruposDelProducto(CONFIG, PRODUCTOS[0]).length, 2);
  assert.equal(gruposDelProducto([{ producto: "p_medialuna", grupos: CONFIG[0].grupos }], PRODUCTOS[1]).length, 2);
  assert.equal(gruposDelProducto(CONFIG, PRODUCTOS[1]).length, 0);
  assert.equal(gruposDelProducto(undefined, PRODUCTOS[0]).length, 0);
});

test("opciones: la codificación es canónica (orden de la config) y vuelve igual", () => {
  const g = gruposDelProducto(CONFIG, PRODUCTOS[0]);
  const r = leerEleccion(g, "leche:canela,almendras|tamano:grande", "Latte");
  assert.ok(r.ok);
  assert.equal(codificarEleccion(r.elegidas), "tamano:grande|leche:almendras,canela");
  assert.equal(recargoUnitario(r.elegidas), 1600);
});

test("opciones: el recargo se recalcula con la config y se multiplica por la cantidad", () => {
  const r = opcionesDelAlta(CONFIG, [{ productId: "p_latte", qty: 3, opciones: "tamano:grande|leche:almendras" }, { productId: "p_medialuna", qty: 2, opciones: "" }], PRODUCTOS);
  assert.ok(r.ok);
  assert.deepEqual(r.lineasAMano, [{ nombre: "Opciones ×3 · latté: Grande, Leche de almendras", importe: 4800, motivo: "Opciones elegidas en la vidriera (Pedí Local)" }]);
  assert.deepEqual(r.renglones, ["Opciones: 3 × latté (Grande, Leche de almendras)"]);
  assert.deepEqual(r.auditoria, [{ productId: "p_latte", cantidad: 3, opciones: "tamano:grande|leche:almendras", recargo: 4800 }]);
});

test("opciones: sin recargo no hay línea extra, pero lo elegido va a la nota", () => {
  const r = opcionesDelAlta(CONFIG, [{ productId: "p_latte", qty: 1, opciones: "tamano:chico|leche:canela" }], PRODUCTOS);
  assert.ok(r.ok);
  assert.deepEqual(r.lineasAMano, []);
  assert.deepEqual(r.renglones, ["Opciones: 1 × latté (Chico, Canela)"]);
});

test("opciones: manipular el precio no sirve — sólo viajan ids y el importe sale de la config", () => {
  // Un «recargo» inventado dentro del texto no es un id válido: rechazo.
  assert.equal(opcionesDelAlta(CONFIG, [{ productId: "p_latte", qty: 1, opciones: "tamano:grande=0" }], PRODUCTOS).ok, false);
  assert.equal(opcionesDelAlta(CONFIG, [{ productId: "p_latte", qty: 1, opciones: "tamano:grande:-900" }], PRODUCTOS).ok, false);
  // Mismo pedido con o sin basura alrededor: el importe es el de la config.
  const r = opcionesDelAlta(CONFIG, [{ productId: "p_latte", qty: 2, opciones: "tamano:grande" }], PRODUCTOS);
  assert.ok(r.ok);
  assert.equal(r.lineasAMano[0].importe, 1800);
});

test("opciones: opción o grupo inexistente, dos en un grupo único, obligatorio vacío → rechazo", () => {
  const casos: [unknown, RegExp][] = [
    ["tamano:gigante", /ya no está/],
    ["tamano:grande|azucar:mucha", /ya no está/],
    ["tamano:chico,grande", /una sola opción/],
    ["", /Elegí tamaño de latté/],
    [null, /Elegí tamaño de latté/],
    ["leche:canela", /Elegí tamaño/],
    ["tamano:grande|tamano:chico", /No pudimos leer/],
    ["tamano:grande,grande", /No pudimos leer/],
    ["TAMANO:GRANDE", /No pudimos leer/],
    [42, /No pudimos leer/],
    ["x".repeat(301), /No pudimos leer/],
  ];
  for (const [opciones, error] of casos) {
    const r = opcionesDelAlta(CONFIG, [{ productId: "p_latte", qty: 1, opciones }], PRODUCTOS);
    assert.equal(r.ok, false, String(opciones));
    if (!r.ok) assert.match(r.error, error, String(opciones));
  }
});

test("opciones: en un producto sin opciones, mandar opciones es rechazo", () => {
  const r = opcionesDelAlta(CONFIG, [{ productId: "p_medialuna", qty: 1, opciones: "tamano:grande" }], PRODUCTOS);
  assert.equal(r.ok, false);
  // Producto que no está (de otro negocio, inactivo, sin precio): rechazo, con o sin opciones.
  assert.equal(opcionesDelAlta(CONFIG, [{ productId: "p_otro", qty: 1, opciones: "tamano:grande" }], PRODUCTOS).ok, false);
  const sin = opcionesDelAlta(CONFIG, [{ productId: "p_otro", qty: 1, opciones: "" }], PRODUCTOS);
  assert.equal(sin.ok, false);
  if (!sin.ok) assert.equal(sin.error, PRODUCTO_QUE_YA_NO_ESTA);
});

test("opciones: cantidad — se saltean las líneas en 0, y con recargo no se pide por peso", () => {
  const r = opcionesDelAlta(CONFIG, [{ productId: "p_latte", qty: 0, opciones: "tamano:gigante" }, { productId: "p_latte", qty: -1, opciones: "tamano:grande" }], PRODUCTOS);
  assert.ok(r.ok);
  assert.deepEqual(r.lineasAMano, []);
  assert.equal(opcionesDelAlta(CONFIG, [{ productId: "p_latte", qty: 1.5, opciones: "tamano:grande" }], PRODUCTOS).ok, false);
});

test("opciones: el mismo producto con opciones distintas son dos líneas con su recargo", () => {
  const r = opcionesDelAlta(CONFIG, [{ productId: "p_latte", qty: 1, opciones: "tamano:grande" }, { productId: "p_latte", qty: 2, opciones: "tamano:chico|leche:almendras" }], PRODUCTOS);
  assert.ok(r.ok);
  assert.deepEqual(r.lineasAMano.map((l) => l.importe), [900, 1400]);
});

test("opciones de Bitácora: recargos en pesos enteros, ids válidos y un tamaño obligatorio", () => {
  const cfg = configDeliveryLocal("bitacora")!;
  assert.ok(cfg.opciones && cfg.opciones.length > 0);
  for (const o of cfg.opciones!) {
    for (const g of o.grupos) {
      assert.match(g.id, /^[a-z0-9-]{1,40}$/);
      for (const op of g.opciones) {
        assert.match(op.id, /^[a-z0-9-]{1,40}$/);
        assert.ok(Number.isInteger(op.recargo) && op.recargo >= 0, `${g.id}:${op.id}`);
      }
    }
  }
});

// ── Certificación vuelta 1 (B1 y B2) ──

test("B1: el tope de productos distintos cuenta sólo las líneas con cantidad; pasado el tope, rechazo", () => {
  // 200 ids falsos en 0 + el Latte en 1: el Latte entra a la búsqueda (antes quedaba afuera).
  const relleno = Array.from({ length: TOPE_PRODUCTOS_DISTINTOS }, (_, i) => ({ productId: `falso_${i}`, qty: 0 }));
  assert.deepEqual(idsParaLasOpciones([...relleno, { productId: "p_latte", qty: 1 }]), ["p_latte"]);
  // Repetidos cuentan una vez; NaN y negativos no cuentan.
  assert.deepEqual(idsParaLasOpciones([{ productId: "a", qty: 1 }, { productId: "a", qty: 2 }, { productId: "b", qty: NaN }, { productId: "c", qty: -1 }, { productId: "", qty: 1 }]), ["a"]);
  // 200 distintos con cantidad pasan; 201 rechazan (nunca se corta la lista).
  const doscientos = Array.from({ length: TOPE_PRODUCTOS_DISTINTOS }, (_, i) => ({ productId: `p_${i}`, qty: 1 }));
  assert.equal(idsParaLasOpciones(doscientos)?.length, TOPE_PRODUCTOS_DISTINTOS);
  assert.equal(idsParaLasOpciones([...doscientos, { productId: "p_latte", qty: 1 }]), null);
});

test("B1: un producto con opciones que no llegó a la lista de nombres no se saltea su obligatorio", () => {
  // El ataque del certificador: el Latte sin tamaño y fuera de `productos` → antes se aceptaba.
  const r = opcionesDelAlta(CONFIG, [{ productId: "p_latte", qty: 1, opciones: "" }], []);
  assert.equal(r.ok, false);
});

test("B2: producto inactivo o sin precio (fuera de la lista) con recargo → rechazo con texto en criollo", () => {
  const r = opcionesDelAlta(CONFIG, [{ productId: "p_latte", qty: 2, opciones: "tamano:grande" }, { productId: "p_medialuna", qty: 1, opciones: "" }], [PRODUCTOS[1]]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /ya no está en la carta/);
});

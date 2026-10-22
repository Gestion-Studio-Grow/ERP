// ============================================================================
// EL MOSTRADOR NUEVO (Magra tanda 2 · 2A) — las reglas puras del ticket que crece y de las teclas.
// ============================================================================
//
// Sin base ni navegador: góndolas, teclas fijadas, «−/+», «Quitar» con «Deshacer», descuento en
// chips, qué le falta al precio a mano, «Subió a $X recién», el peso en vivo y el redondeo al
// centavo de MG-044. La pantalla las usa para avisar; el servidor decide la plata con las suyas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { round2 } from "@/lib/round";
import { fmtMoneyARS } from "@/components/ui/format";
import {
  PASO_KG,
  TECLAS_BOUTIQUE,
  alternarTeclaFijada,
  aplicarDescuento,
  avisoDeCambioDePrecio,
  cambiosDePrecio,
  descuentoParaRedondear,
  deshacerRenglon,
  faltaEnLineaAMano,
  gondolaDe,
  gondolasDelMostrador,
  leerTeclasFijadas,
  pasoDelRenglon,
  quitarRenglon,
  reemplazosDe,
  teclasPrincipales,
  textoDelCambioDePrecio,
  tomaElPesoSolo,
} from "./reglas-venta";

const CATALOGO = [
  { id: "asado", name: "Asado", saleUnit: "WEIGHT" as const },
  { id: "bondiola", name: "Bondiola", saleUnit: "WEIGHT" as const },
  { id: "chorizo", name: "Chorizo", saleUnit: "UNIT" as const },
  { id: "entrana", name: "Entraña", saleUnit: "WEIGHT" as const },
  { id: "hamburguesa", name: "Hamburguesa casera", saleUnit: "UNIT" as const },
  { id: "morcilla", name: "Morcilla", saleUnit: "UNIT" as const },
  { id: "molleja", name: "Molleja", saleUnit: "WEIGHT" as const },
  { id: "vacio", name: "Vacío", saleUnit: "WEIGHT" as const },
];

test("MG-042: el primer día (sin ventas) hay teclas de TODOS los cortes, por góndola y en el orden de la cámara", () => {
  const g = gondolasDelMostrador(CATALOGO);
  assert.deepEqual(
    g.map((x) => [x.rotulo, x.ids]),
    [
      ["Vaca", ["asado", "entrana", "vacio"]],
      ["Cerdo", ["bondiola"]],
      ["Achuras", ["molleja"]],
      ["Preparados", ["chorizo", "hamburguesa", "morcilla"]],
    ],
  );
  assert.equal(g.flatMap((x) => x.ids).length, CATALOGO.length, "ningún corte queda afuera");
});

test("góndolas: las más vendidas primero adentro de cada una; la góndola explícita (Gate 2) gana sobre el nombre", () => {
  const g = gondolasDelMostrador(CATALOGO, { primero: ["vacio", "morcilla"], explicitas: { molleja: "vaca", bondiola: "inventada" } });
  assert.deepEqual(g.find((x) => x.id === "vaca")?.ids, ["vacio", "asado", "entrana", "molleja"]);
  assert.deepEqual(g.find((x) => x.id === "preparados")?.ids, ["morcilla", "chorizo", "hamburguesa"]);
  assert.equal(g.find((x) => x.id === "achuras"), undefined, "sin molleja, la góndola vacía no aparece");
  assert.equal(gondolaDe({ id: "bondiola", name: "Bondiola" }, { bondiola: "inventada" }), "cerdo", "una góndola que no existe no cuenta");
});

test("MG-047: reemplazo = la misma góndola y forma de venta, con stock; el agotado no se ofrece", () => {
  const stock = { chorizo: { stock: 2, trackStock: true }, hamburguesa: { stock: 0, trackStock: true }, morcilla: { stock: 5, trackStock: true } };
  assert.deepEqual(reemplazosDe("chorizo", CATALOGO, stock), ["morcilla"]);
  assert.deepEqual(reemplazosDe("vacio", CATALOGO, {}), ["asado", "entrana"]);
  assert.deepEqual(reemplazosDe("no-existe", CATALOGO, {}), []);
});

test("teclas fijadas: se leen sólo ids con forma, sin repetir, hasta el tope; fijar y soltar", () => {
  assert.deepEqual(leerTeclasFijadas(["a", "a", " b", 3, null, "c_1-2", "x".repeat(65)]), ["a", "c_1-2"]);
  assert.deepEqual(leerTeclasFijadas("a"), []);
  const muchas = Array.from({ length: 30 }, (_, i) => `p${i}`);
  assert.equal(leerTeclasFijadas(muchas).length, TECLAS_BOUTIQUE);
  assert.deepEqual(alternarTeclaFijada(["a", "b"], "a"), ["b"]);
  assert.deepEqual(alternarTeclaFijada(["a"], "b"), ["a", "b"]);
  assert.deepEqual(alternarTeclaFijada(muchas.slice(0, TECLAS_BOUTIQUE), "nueva").length, TECLAS_BOUTIQUE, "llena, no suma");
});

test("pestaña principal: las fijadas que todavía se venden; sin ninguna, las de siempre", () => {
  const vendibles = new Set(["vacio", "chorizo"]);
  const deSiempre = { ids: ["chorizo"], rotulo: "Más vendidos" };
  assert.deepEqual(teclasPrincipales(["vacio", "borrado"], vendibles, deSiempre), { ids: ["vacio"], rotulo: "Fijadas", fijadas: true });
  assert.deepEqual(teclasPrincipales(["borrado"], vendibles, deSiempre), { ids: ["chorizo"], rotulo: "Más vendidos", fijadas: false });
});

test("«−/+»: por unidad de a 1 (nunca menos de 1); por kilo de a 100 g, al gramo, nunca menos de 100 g", () => {
  assert.equal(pasoDelRenglon(3, false, 1), 4);
  assert.equal(pasoDelRenglon(1, false, -1), 1);
  assert.equal(pasoDelRenglon(1.24, true, 1), 1.34);
  assert.equal(pasoDelRenglon(0.335, true, -1), 0.235);
  assert.equal(pasoDelRenglon(0.15, true, -1), PASO_KG);
  assert.equal(pasoDelRenglon(0, true, 1), 0.1);
  assert.equal(pasoDelRenglon(0.7, true, 1), 0.8, "sin arrastrar el error del float (0,7 + 0,1)");
});

test("MG-046: «Quitar» y «Deshacer» devuelven el renglón igual y a su lugar", () => {
  const ls = [
    { key: 1, productId: "vacio", qtyText: "1,240", etiqueta: 35464 },
    { key: 2, productId: "bondiola", qtyText: "0,8" },
    { key: 3, productId: "chorizo", qtyText: "4" },
  ];
  const q = quitarRenglon(ls, 2, 99);
  assert.deepEqual(q.lineas.map((l) => l.key), [1, 3]);
  assert.equal(q.usoKeyVacia, false);
  assert.ok(q.quitado);
  assert.deepEqual(deshacerRenglon(q.lineas, q.quitado!), ls, "vuelve igual y en el medio");
  assert.deepEqual(deshacerRenglon(ls, q.quitado!), ls, "si ya está, no se duplica");
  // El único renglón: queda uno vacío con otra key, y al deshacer el vacío se va.
  const solo = quitarRenglon([ls[0]], 1, 99);
  assert.deepEqual(solo.lineas, [{ key: 99, productId: "", qtyText: "", etiqueta: undefined }]);
  assert.equal(solo.usoKeyVacia, true);
  assert.deepEqual(deshacerRenglon(solo.lineas, solo.quitado!), [ls[0]]);
  // Quitar algo que no está no hace nada.
  assert.equal(quitarRenglon(ls, 7, 99).quitado, null);
});

test("MG-049: chips 5 % y 10 % con el tope de la recepción (10 %); 15 % dice el tope", () => {
  const sub = 55384;
  const diez = aplicarDescuento({ subtotal: sub, pedido: { tipo: "porcentaje", valor: 10 }, topePct: 10 });
  assert.ok(diez.ok && diez.descuento === 5538.4 && diez.total === 49845.6, JSON.stringify(diez));
  const quince = aplicarDescuento({ subtotal: sub, pedido: { tipo: "porcentaje", valor: 15 }, topePct: 10 });
  assert.equal(quince.ok, false);
  assert.match(!quince.ok ? quince.error : "", /llega hasta el 10 %/);
});

test("«Redondear»: baja a la centena de abajo; redondo o chico, no ofrece nada", () => {
  assert.equal(descuentoParaRedondear(36608), 8);
  assert.equal(descuentoParaRedondear(4135.58), 35.58);
  assert.equal(descuentoParaRedondear(36600), 0);
  assert.equal(descuentoParaRedondear(99.99), 0, "no regala la venta entera");
  assert.equal(descuentoParaRedondear(0), 0);
  assert.equal(round2(36608 - descuentoParaRedondear(36608)), 36600);
});

test("MG-050: el botón dice QUÉ le falta al precio a mano", () => {
  assert.equal(faltaEnLineaAMano({ nombre: "", importeText: "", motivo: "" }), null, "vacía del todo se ignora");
  assert.equal(faltaEnLineaAMano({ nombre: "Bondiola", importeText: "12.000", motivo: "" }), "Falta el motivo de «Bondiola»");
  assert.equal(faltaEnLineaAMano({ nombre: "Bondiola", importeText: "", motivo: "Pieza especial" }), "Falta el importe de «Bondiola»");
  assert.equal(faltaEnLineaAMano({ nombre: "Bondiola", importeText: "1kg2", motivo: "Pieza especial" }), "Revisá el importe de «Bondiola»");
  assert.equal(faltaEnLineaAMano({ nombre: "", importeText: "12.000", motivo: "x" }), "Falta qué se vende en el precio a mano");
  assert.equal(faltaEnLineaAMano({ nombre: "Bondiola", importeText: "12.000", motivo: "Pieza especial" }), null);
  assert.equal(faltaEnLineaAMano({ nombre: "Bondiola", importeText: "12.000", motivo: "No tiene precio cargado" }), null);
  assert.equal(faltaEnLineaAMano({ nombre: "Bondiola", importeText: "12.000", motivo: "ok" }), "Revisá el precio a mano de «Bondiola»", "motivo muy corto");
});

test("MG-048: «Subió a $29.900 recién» sólo para lo que cambió; lo que no vino no cuenta", () => {
  const enPantalla = [
    { id: "vacio", name: "Vacío", saleUnit: "WEIGHT" as const, price: null, pricePerKg: 28600 },
    { id: "chorizo", name: "Chorizo", saleUnit: "UNIT" as const, price: 1900, pricePerKg: null },
    { id: "bondiola", name: "Bondiola", saleUnit: "WEIGHT" as const, price: null, pricePerKg: 15400 },
  ];
  const c = cambiosDePrecio(enPantalla, {
    vacio: { price: null, pricePerKg: 29900 },
    chorizo: { price: 1900, pricePerKg: null },
  });
  assert.deepEqual(c, [{ id: "vacio", nombre: "Vacío", porKilo: true, antes: 28600, ahora: 29900 }]);
  assert.equal(textoDelCambioDePrecio(c[0]), "Subió a $29.900 recién");
  assert.equal(textoDelCambioDePrecio({ antes: 28600, ahora: 27000 }), "Bajó a $27.000 recién");
  assert.match(avisoDeCambioDePrecio(c), /Vacío subió a \$29\.900 recién/);
});

test("E03: el peso en vivo se toma solo quieto y positivo, una vez por activación", () => {
  assert.equal(tomaElPesoSolo({ estable: true, pesoActual: 1.284, yaTomado: false }), true);
  assert.equal(tomaElPesoSolo({ estable: false, pesoActual: 1.284, yaTomado: false }), false);
  assert.equal(tomaElPesoSolo({ estable: true, pesoActual: 0, yaTomado: false }), false);
  assert.equal(tomaElPesoSolo({ estable: true, pesoActual: null, yaTomado: false }), false);
  assert.equal(tomaElPesoSolo({ estable: true, pesoActual: 1.284, yaTomado: true }), false);
});

test("MG-044: 0,335 kg a $12.345/kg = $4.135,58 (4.135,575 al centavo hacia arriba), igual que el servidor", () => {
  const renglon = round2(0.335 * 12345);
  assert.equal(renglon, 4135.58);
  assert.match(fmtMoneyARS(renglon, 2), /4\.135,58/);
});

test("MG-045: vacío 1,240 + bondiola 0,800 + 4 chorizos = $55.384", () => {
  const total = round2(round2(1.24 * 28600) + round2(0.8 * 15400) + round2(4 * 1900));
  assert.equal(total, 55384);
});

test("integración T2 · «Repetir» desde la ficha: sólo lo vendible entra al ticket, lo por kilo sin peso, y el aviso lo dice", async () => {
  const { lineasDesdeLaFicha, avisoDeRepetir } = await import("./reglas-venta");
  const repetir = {
    renglones: [
      { productId: "vacio", nombre: "Vacío", qtyText: "" },
      { productId: "chorizo", nombre: "Chorizo", qtyText: "6" },
      { productId: "sin-precio", nombre: "Matambre", qtyText: "" },
    ],
    omitidos: ["Pieza especial"],
  };
  const r = lineasDesdeLaFicha(repetir, new Set(["vacio", "chorizo"]));
  assert.deepEqual(r.lineas, [
    { productId: "vacio", qtyText: "" },
    { productId: "chorizo", qtyText: "6" },
  ]);
  assert.deepEqual(r.omitidos, ["Pieza especial", "Matambre"]);
  assert.deepEqual(lineasDesdeLaFicha(null, new Set(["vacio"])), { lineas: [], omitidos: [] });
  assert.equal(
    avisoDeRepetir({ code: 31, cliente: "Ana Pérez", porPeso: true, omitidos: r.omitidos }),
    "Repetís el pedido #31 de Ana. Lo que va por kilo hay que pesarlo de nuevo. No se repite: Pieza especial, Matambre (ya no está a la venta o se carga aparte).",
  );
  assert.equal(avisoDeRepetir({ code: 2, cliente: "", porPeso: false, omitidos: [] }), "Repetís el pedido #2 del cliente.");
  assert.equal(avisoDeRepetir(null), null);
});

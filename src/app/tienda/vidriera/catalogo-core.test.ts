// La vidriera nueva: buscar, filtrar, ordenar y la bolsa, con los catálogos del laboratorio
// (los nombres y precios de MAGRA, Shine y A Dos Manos que siembra lab/sembrar.mts).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bolsaGuardada,
  carta,
  conteoPorSeccion,
  escribirFiltros,
  fijar,
  hayFiltros,
  leerFiltros,
  lineas,
  marcaYModelo,
  mover,
  normalizar,
  parecidosPorPrecio,
  plata,
  puestoDePrecio,
  precioDe,
  responde,
  resumen,
  SIN_FILTROS,
  textoCantidad,
  textoDelEnvio,
  type ProductoVidriera,
} from "./catalogo-core";
import { CONFIG, marcaDeLaVidriera, seccionDe, seccionMagra, seccionPadel } from "./marcas";

const kg = (
  id: string,
  name: string,
  pricePerKg: number,
  disponibilidad: ProductoVidriera["disponibilidad"] = null,
): ProductoVidriera => ({
  id,
  name,
  saleUnit: "WEIGHT",
  price: null,
  pricePerKg,
  unit: "kg",
  disponibilidad,
});
const u = (
  id: string,
  name: string,
  price: number,
  disponibilidad: ProductoVidriera["disponibilidad"] = null,
): ProductoVidriera => ({
  id,
  name,
  saleUnit: "UNIT",
  price,
  pricePerKg: null,
  unit: "unidades",
  disponibilidad,
});

const MAGRA = [
  kg("a", "Asado de tira", 20100),
  kg("b", "Bife de chorizo", 28600, "ultimas"),
  kg("c", "Bondiola de cerdo", 16900),
  u("d", "Ensalada premium envasada", 6900),
  u("e", "Hamburguesas caseras (x4)", 10900),
  kg("f", "Pechuga de pollo orgánico", 12900),
  u("g", "Pollo entero orgánico (~2 kg)", 19500, "sin-stock"),
  u("h", "Sorrentinos italianos (Lamberti)", 9900),
  kg("i", "Solomillo de cerdo", 18500),
  u("j", "Filet de merluza congelado", 12900),
  u("k", "Salsa artesanal importada", 7900),
  kg("l", "Vacío", 22200),
];
const seccionesMagra = CONFIG.magra.secciones;
const seccionDeMagra = Object.fromEntries(MAGRA.map((p) => [p.id, seccionDe("magra", p.name)]));

test("MAGRA reparte su carta en vaca, cerdo, pollo y gourmet por el nombre", () => {
  assert.equal(seccionMagra("Asado de tira"), "vaca");
  assert.equal(seccionMagra("Hamburguesas caseras (x4)"), "vaca");
  assert.equal(seccionMagra("Carne picada especial"), "vaca");
  assert.equal(seccionMagra("Bondiola de cerdo"), "cerdo");
  assert.equal(seccionMagra("Solomillo de cerdo"), "cerdo");
  assert.equal(seccionMagra("Pechuga de pollo orgánico"), "pollo");
  assert.equal(seccionMagra("Pollo entero orgánico (~2 kg)"), "pollo");
  assert.equal(seccionMagra("Ensalada premium envasada"), "gourmet");
  assert.equal(seccionMagra("Filet de merluza congelado"), "gourmet");
  assert.equal(seccionMagra("Sorrentinos italianos (Lamberti)"), "gourmet");
  assert.equal(seccionMagra("Salsa artesanal importada"), "gourmet");
});

test("A Dos Manos: palas, zapatillas y todo lo demás en accesorios (el protector de pala no es una pala)", () => {
  assert.equal(seccionPadel("Pala Adidas Metalbone 3.4"), "palas");
  assert.equal(seccionPadel("Zapatillas Head Sprint Pro 3.5"), "calzado");
  assert.equal(seccionPadel("Protector de pala premium Bullpadel"), "accesorios");
  assert.equal(seccionPadel("Tubo de pelotas Head Padel Pro (x3)"), "accesorios");
  assert.equal(seccionPadel("Paletero Bullpadel Hack"), "accesorios");
});

test("la vidriera de cada negocio: MAGRA y Shine por su front, A Dos Manos por su marca, el resto genérica", () => {
  assert.equal(marcaDeLaVidriera("magra", "magra"), "magra");
  assert.equal(marcaDeLaVidriera("shinevelas", "shinevelas"), "shinevelas");
  assert.equal(marcaDeLaVidriera(null, "adosmanos"), "adosmanos");
  assert.equal(marcaDeLaVidriera(null, null), "generica");
});

test("buscar: sin tildes, sin mayúsculas, palabras en cualquier orden", () => {
  assert.equal(normalizar("Ñandú  Tallado!"), "nandu tallado");
  assert.ok(responde("bife chorizo", "Bife de chorizo"));
  assert.ok(responde("VACIO", "Vacío"));
  assert.ok(responde("adidas pala", "Pala Adidas Metalbone 3.4"));
  assert.ok(responde("", "lo que sea"));
  assert.ok(!responde("lomo", "Bife de chorizo"));
  // La sección también responde: "cerdo" trae la bondiola aunque su nombre la diga igual.
  assert.ok(responde("gourmet", "Salsa artesanal importada", "Gourmet"));
});

test("la carta con «bife»: sólo el grupo que tiene algo, y dice cuántos de cuántos", () => {
  const r = carta(MAGRA, seccionesMagra, seccionDeMagra, { ...SIN_FILTROS, q: "bife" });
  assert.deepEqual(
    r.grupos.map((g) => g.seccion),
    ["vaca"],
  );
  assert.deepEqual(
    r.grupos[0].items.map((p) => p.name),
    ["Bife de chorizo"],
  );
  assert.equal(r.visibles, 1);
  assert.equal(r.total, MAGRA.length);
});

test("la carta por sección y por precio: cerdo de menor a mayor", () => {
  const r = carta(MAGRA, seccionesMagra, seccionDeMagra, { ...SIN_FILTROS, seccion: "cerdo", orden: "precio-asc" });
  assert.deepEqual(
    r.grupos.map((g) => g.items.map((p) => precioDe(p))),
    [[16900, 18500]],
  );
  const d = carta(MAGRA, seccionesMagra, seccionDeMagra, { ...SIN_FILTROS, orden: "precio-desc" });
  assert.deepEqual(
    d.grupos[0].items.map((p) => p.name),
    ["Bife de chorizo", "Vacío", "Asado de tira", "Hamburguesas caseras (x4)"],
  );
});

test("los chips cuentan con la búsqueda de ahora y sin la sección elegida", () => {
  const n = conteoPorSeccion(MAGRA, seccionesMagra, seccionDeMagra, { ...SIN_FILTROS, q: "de", seccion: "vaca" });
  // "de": asado DE tira, bife DE chorizo, bondiola DE cerdo, pechuga DE pollo, solomillo DE cerdo, filet DE merluza
  assert.deepEqual(n, { vaca: 2, cerdo: 2, pollo: 1, gourmet: 1 });
});

test("filtros en la URL: se leen sólo los válidos y se escriben sin ruido, conservando la ficha abierta", () => {
  const f = leerFiltros(new URLSearchParams("q=lomo&seccion=inventada&orden=precio-asc&marca=Nike"), {
    secciones: ["vaca", "cerdo"],
    marcas: ["Adidas"],
  });
  assert.deepEqual(f, { q: "lomo", seccion: null, marca: null, orden: "precio-asc" });
  assert.equal(escribirFiltros(SIN_FILTROS, "producto=abc"), "?producto=abc");
  assert.equal(escribirFiltros({ ...SIN_FILTROS, q: " bife ", seccion: "vaca" }, ""), "?q=bife&seccion=vaca");
  assert.equal(escribirFiltros({ ...SIN_FILTROS, orden: "precio-desc" }, "q=x"), "?orden=precio-desc");
  assert.ok(!hayFiltros({ ...SIN_FILTROS, orden: "precio-asc" }));
  assert.ok(hayFiltros({ ...SIN_FILTROS, marca: "Adidas" }));
  // Desde el objeto de searchParams de Next (valores sueltos o arreglos).
  assert.equal(leerFiltros({ q: ["pala", "otra"], seccion: "vaca" }, { secciones: ["vaca"] }).q, "pala");
});

test("la marca y el modelo de una pala salen del nombre con la lista de marcas del copy; si no está, no se inventa", () => {
  const marcas = ["Adidas", "Bullpadel", "Nox", "Siux", "Head", "Asics"];
  assert.deepEqual(marcaYModelo("Pala Adidas Metalbone 3.4", marcas), { marca: "Adidas", modelo: "Metalbone 3.4" });
  assert.deepEqual(marcaYModelo("Pala Nox AT10 Genius 18K", marcas), { marca: "Nox", modelo: "AT10 Genius 18K" });
  assert.deepEqual(marcaYModelo("Grip base Adidas", marcas), { marca: "Adidas", modelo: "Grip base" });
  assert.deepEqual(marcaYModelo("Protector de pala transparente", marcas), {
    marca: null,
    modelo: "Protector de pala transparente",
  });
  // "Head" como palabra entera: "Headband" no es Head.
  assert.equal(marcaYModelo("Headband de toalla", marcas).marca, null);
});

test("la bolsa: un cuarto kilo por toque en lo que va por peso, una unidad en lo demás; sin stock no suma", () => {
  let b = mover({}, MAGRA[0], 1);
  b = mover(b, MAGRA[0], 1);
  b = mover(b, MAGRA[4], 1);
  assert.deepEqual(b, { a: 0.5, e: 1 });
  assert.deepEqual(mover(b, MAGRA[6], 1), b, "el pollo entero sin stock no entra");
  b = mover(mover(b, MAGRA[0], -1), MAGRA[0], -1);
  assert.deepEqual(b, { e: 1 }, "al llegar a cero la línea se va");
  assert.deepEqual(fijar(b, "a", 1.5), { e: 1, a: 1.5 });
});

test("líneas e importes: 1,5 kg de asado a $20.100 son $30.150; 2 hamburguesas, dos piezas", () => {
  const porId = new Map(MAGRA.map((p) => [p.id, p]));
  const ls = lineas({ a: 1.5, e: 2, fantasma: 3 }, porId);
  assert.deepEqual(
    ls.map((l) => [l.p.name, l.importe]),
    [
      ["Asado de tira", 30150],
      ["Hamburguesas caseras (x4)", 21800],
    ],
  );
  assert.deepEqual(resumen(ls), { subtotal: 51950, piezas: 3 });
  // Un cuarto de 28.600 son 7.150 justos; un cuarto de 12.900, 3.225.
  assert.equal(lineas({ b: 0.25 }, porId)[0].importe, 7150);
});

test("cantidades y plata como se dicen acá", () => {
  assert.equal(textoCantidad(MAGRA[0], 0.25), "250 g");
  assert.equal(textoCantidad(MAGRA[0], 1.5), "1,5 kg");
  assert.equal(textoCantidad(MAGRA[4], 2), "2 u");
  assert.equal(plata(20100), "$20.100");
  assert.equal(plata(7162.5), "$7.162,50");
});

test("la bolsa guardada en el navegador no se cree: sólo ids publicados, con stock y cantidades sanas", () => {
  assert.deepEqual(bolsaGuardada({ a: 1, g: 1, zz: 2, b: -1, e: "2", l: Infinity }, MAGRA), { a: 1 });
  assert.deepEqual(bolsaGuardada("basura", MAGRA), {});
  assert.deepEqual(bolsaGuardada([1, 2], MAGRA), {});
});

test("el envío dice lo cierto de cada marca: con tarifa la tarifa, sin tarifa «Sin cargo» sólo si el local no lo cobra", () => {
  const base = { hayProductos: true } as const;
  assert.equal(
    textoDelEnvio({ ...base, fulfillment: "PICKUP", costo: 0, hayTarifa: true, sinTarifa: "a-coordinar" }),
    "Sin cargo",
  );
  assert.equal(
    textoDelEnvio({ ...base, fulfillment: "DELIVERY", costo: 3500, hayTarifa: true, sinTarifa: "a-coordinar" }),
    "$3.500",
  );
  assert.equal(
    textoDelEnvio({ ...base, fulfillment: "DELIVERY", costo: 0, hayTarifa: true, sinTarifa: "a-coordinar" }),
    "Sin cargo",
  );
  assert.equal(
    textoDelEnvio({ ...base, fulfillment: "DELIVERY", costo: 0, hayTarifa: false, sinTarifa: "sin-cargo" }),
    "Sin cargo",
  );
  assert.equal(
    textoDelEnvio({ ...base, fulfillment: "DELIVERY", costo: 0, hayTarifa: false, sinTarifa: "a-coordinar" }),
    "A coordinar",
  );
  assert.equal(
    textoDelEnvio({ hayProductos: false, fulfillment: "DELIVERY", costo: 0, hayTarifa: true, sinTarifa: "sin-cargo" }),
    "—",
  );
});

test("las palabras de cada rubro: en velas y pádel no se habla de cortes ni de kilos", () => {
  for (const id of ["shinevelas", "adosmanos"] as const) {
    const texto = JSON.stringify(CONFIG[id].palabras).toLowerCase();
    assert.ok(!/corte|kilo|\bkg\b|g[oó]ndola/.test(texto), `${id}: ${texto}`);
  }
});

test("en la ficha, para comparar: los de la misma sección con precio parecido y el puesto de su precio", () => {
  const palas = [
    u("m", "Pala Adidas Metalbone 3.4", 549900),
    u("r", "Pala Adidas RX Series", 219900),
    u("v", "Pala Bullpadel Vertex 04", 529900),
    u("s", "Pala Head Speed Motion", 349900),
    u("n", "Pala Nox AT10 Genius 18K", 489900),
    u("e", "Pala Siux Electra ST3 Stupa", 419900),
    u("z", "Zapatillas Head Sprint Pro 3.5", 179900),
  ];
  const sec = Object.fromEntries(palas.map((p) => [p.id, seccionDe("adosmanos", p.name)]));
  // La Nox ($489.900): la Vertex está a $40.000, la Metalbone a $60.000, la Electra a $70.000.
  assert.deepEqual(
    parecidosPorPrecio(palas[4], palas, sec).map((p) => p.id),
    ["v", "m", "e"],
  );
  assert.deepEqual(
    puestoDePrecio(palas[1], palas, sec),
    { puesto: 1, de: 6 },
    "la RX es la más barata de 6 palas (la zapatilla no cuenta)",
  );
  assert.deepEqual(puestoDePrecio(palas[0], palas, sec), { puesto: 6, de: 6 });
});

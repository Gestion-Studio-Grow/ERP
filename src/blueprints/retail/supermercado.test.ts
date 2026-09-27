// El blueprint del supermercado: catálogo semilla verificable (EAN, IVA, presentación, sección),
// cómo se lo elige en el alta y qué trae de fábrica.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOGO_SUPERMERCADO } from "./supermercado-catalogo";
import { IDS_SECCION_SUPER } from "./supermercado-tipos";
import { catalogoDelRubro, getRetailRubro, RETAIL_BLUEPRINTS } from "./index";
import { rubroConPerecederos, resolveRubroId } from "./rubros";
import { resolveBlueprint, getBlueprint } from "../index";
import { defaultModulesForBlueprint } from "../presets-meta";
import { esEan13Valido } from "@/lib/supermercado/ean";
import { leerContenido } from "@/lib/supermercado/unidad-medida";

const IVA_21 = 5;
const IVA_105 = 4;
const EXENTO = 2;

test("el catálogo semilla tiene entre 300 y 400 productos, de las diez secciones", () => {
  assert.ok(CATALOGO_SUPERMERCADO.length >= 300 && CATALOGO_SUPERMERCADO.length <= 400, `${CATALOGO_SUPERMERCADO.length}`);
  const secciones = new Set(CATALOGO_SUPERMERCADO.map((p) => p.seccion));
  assert.deepEqual([...secciones].sort(), [...IDS_SECCION_SUPER].sort());
  for (const s of IDS_SECCION_SUPER) {
    assert.ok(CATALOGO_SUPERMERCADO.filter((p) => p.seccion === s).length >= 15, `${s} tiene pocos productos`);
  }
});

test("todo producto por unidad trae un EAN-13 argentino (779) con el dígito verificador bien", () => {
  const malos = CATALOGO_SUPERMERCADO.filter((p) => p.sale === "u" && !(esEan13Valido(p.codigo) && p.codigo.startsWith("779")));
  assert.deepEqual(malos.map((p) => `${p.name}: ${p.codigo}`), []);
});

test("todo producto por peso trae su código de balanza (PLU de 5 dígitos)", () => {
  const malos = CATALOGO_SUPERMERCADO.filter((p) => p.sale === "kg" && !/^\d{5}$/.test(p.codigo));
  assert.deepEqual(malos.map((p) => p.name), []);
  // Fiambrería, carnicería y verdulería tienen productos al peso: la balanza tiene qué pesar.
  for (const s of ["fiambreria", "carniceria", "verduleria"] as const) {
    assert.ok(CATALOGO_SUPERMERCADO.some((p) => p.seccion === s && p.sale === "kg"), s);
  }
});

test("códigos y nombres no se repiten (el código es único por negocio en la base)", () => {
  assert.equal(new Set(CATALOGO_SUPERMERCADO.map((p) => p.codigo)).size, CATALOGO_SUPERMERCADO.length);
  assert.equal(new Set(CATALOGO_SUPERMERCADO.map((p) => p.name)).size, CATALOGO_SUPERMERCADO.length);
});

test("IVA por producto: frutas, verduras y carne vacuna al 10,5 %; limpieza, perfumería y bebidas al 21 %", () => {
  for (const p of CATALOGO_SUPERMERCADO) {
    assert.ok([IVA_21, IVA_105, EXENTO].includes(p.alicuotaIva), `${p.name}: alícuota ${p.alicuotaIva}`);
    if (p.seccion === "verduleria") assert.equal(p.alicuotaIva, IVA_105, p.name);
    if (["limpieza", "perfumeria", "bebidas"].includes(p.seccion)) assert.equal(p.alicuotaIva, IVA_21, p.name);
  }
  const vacuna = CATALOGO_SUPERMERCADO.filter((p) => p.seccion === "carniceria" && /asado|vac[ií]o|bife|lomo|cuadril|nalga|peceto|picada|osobuco|falda|roast/i.test(p.name) && !/milanesa/i.test(p.name));
  assert.ok(vacuna.length >= 8);
  for (const p of vacuna) assert.equal(p.alicuotaIva, IVA_105, p.name);
});

test("toda alícuota dudosa (exenta, pollo, cerdo, pan envasado, huevos) dice por qué validarla con el contador", () => {
  for (const p of CATALOGO_SUPERMERCADO) {
    if (p.alicuotaIva === EXENTO) assert.ok(p.ivaAValidar, `${p.name}: exento sin motivo`);
    if (/pollo|cerdo|huevos|lactal/i.test(p.name) && !/milanesa/i.test(p.name) && p.seccion !== "congelados") assert.ok(p.ivaAValidar, `${p.name}: sin motivo`);
  }
  const aValidar = CATALOGO_SUPERMERCADO.filter((p) => p.ivaAValidar).length;
  assert.ok(aValidar > 0 && aValidar < CATALOGO_SUPERMERCADO.length / 4, `${aValidar}`);
});

test("toda presentación de un producto por unidad dice cuánto trae (para el precio por litro o kilo)", () => {
  const sinContenido = CATALOGO_SUPERMERCADO.filter((p) => p.sale === "u" && p.presentacion !== "1 u" && !leerContenido(p.presentacion));
  assert.deepEqual(sinContenido.map((p) => `${p.name}: "${p.sale === "u" ? p.presentacion : ""}"`), []);
});

test("precios de ejemplo positivos y en pesos enteros; stock y mínimo con sentido", () => {
  for (const p of CATALOGO_SUPERMERCADO) {
    const precio = p.sale === "kg" ? p.pricePerKg : p.price;
    assert.ok(Number.isInteger(precio) && precio > 0, p.name);
    assert.ok(p.stock > 0 && p.minimo > 0 && p.minimo < p.stock, p.name);
  }
});

test("el alta elige el supermercado por el rubro, sin robarle el lugar a otros rubros", () => {
  assert.equal(resolveBlueprint("Supermercado de barrio").blueprintId, "supermercado");
  assert.equal(resolveBlueprint("minimercado con carnicería").blueprintId, "supermercado");
  assert.equal(resolveBlueprint("carnicería").blueprintId, "carniceria");
  assert.equal(resolveBlueprint("kiosco autoservicio").blueprintId, "kiosco");
  assert.equal(resolveBlueprint("almacén natural").blueprintId, "dietetica");
  assert.equal(getBlueprint("supermercado").id, "supermercado");
  assert.ok(RETAIL_BLUEPRINTS.supermercado);
});

test("trae de fábrica la caja con lector, las promos, el stock y la facturación", () => {
  const m = defaultModulesForBlueprint("supermercado");
  for (const id of ["pos", "catalog", "clients", "reports", "inventario", "arca", "caja-rapida", "ofertas"]) assert.ok(m.includes(id), id);
});

test("vende perecederos (lotes, vencimientos y mermas de comida) y el rubro se resuelve por el dato del alta", () => {
  assert.equal(rubroConPerecederos("supermercado"), true);
  assert.equal(resolveRubroId({ blueprintId: "supermercado", slug: "super-la-esquina" }), "supermercado");
});

test("el catálogo grande no viaja en rubros.ts (lo importa el navegador): vive aparte", () => {
  const r = getRetailRubro("supermercado")!;
  assert.equal(r.catalog.length, 0);
  assert.equal(r.catalogoAparte, true);
  assert.equal(catalogoDelRubro("supermercado").length, CATALOGO_SUPERMERCADO.length);
});

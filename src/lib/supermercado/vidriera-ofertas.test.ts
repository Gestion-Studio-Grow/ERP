// La vidriera del supermercado: la declara el rubro (configuración, no un programa aparte) y las
// ofertas viajan sin lo que es del panel.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getRetailRubro, RETAIL_RUBROS } from "@/blueprints/retail/rubros";
import { SECCIONES_SUPERMERCADO } from "@/blueprints/retail/supermercado-tipos";
import { promoPublica } from "./vidriera-ofertas";
import type { PromocionGuardada } from "./config-repo";

test("el rubro supermercado declara su vidriera: sus diez secciones, sus palabras y el precio por kilo o litro", () => {
  const v = getRetailRubro("supermercado")?.vidriera;
  assert.ok(v);
  assert.deepEqual(
    v.secciones.lista.map((x) => x.id),
    SECCIONES_SUPERMERCADO.map((x) => x.id),
  );
  assert.equal(v.precioPorMedida, true);
  assert.equal(v.secciones.de({ name: "Lavandina Ayudín 1 L", saleUnit: "UNIT" }), "limpieza");
  assert.equal(v.secciones.de({ name: "Queso cremoso", saleUnit: "WEIGHT" }), "fiambreria");
  // La sección explícita (columna de góndola) gana sobre el nombre.
  assert.equal(v.secciones.de({ name: "Queso cremoso", saleUnit: "WEIGHT", category: "lacteos" }), "lacteos");
});

test("los demás rubros no declaran vidriera: siguen con la de siempre (o el interruptor «Diseño nuevo»)", () => {
  const con = Object.values(RETAIL_RUBROS).filter((r) => r.vidriera).map((r) => r.id);
  assert.deepEqual(con, ["supermercado"]);
});

test("la promo que viaja a la vidriera no lleva la versión ni quién la cargó", () => {
  const guardada: PromocionGuardada = {
    id: "promo-0001",
    nombre: "2×1 Coca",
    tipo: "nxm",
    lleva: 2,
    paga: 1,
    productos: ["p1"],
    secciones: [],
    dias: [],
    prioridad: 20,
    acumulable: false,
    activa: true,
    version: "fila-123",
    actualizada: new Date("2026-09-27T10:00:00Z"),
    por: "user:abc",
  };
  const p = promoPublica(guardada);
  assert.deepEqual(Object.keys(p).sort(), ["activa", "acumulable", "desde", "dias", "hasta", "id", "lleva", "nombre", "paga", "prioridad", "productos", "secciones", "tipo"]);
  assert.equal(JSON.stringify(p).includes("user:abc"), false);
});

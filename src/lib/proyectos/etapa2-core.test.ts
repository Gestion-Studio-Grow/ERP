// Interruptores de la Etapa 2 de Proyectos: fallan cerrado, por negocio. node:test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAVE_ETAPA2, etapa2Activa, etapa2Estado, MENSAJE_APAGADO, PARTES_ETAPA2 } from "./etapa2-core";
import { construirCatalogo } from "@/modules/catalog";
import { resolverActivacion } from "@/modules/activation";

test("apagado por defecto: sin lista, null, vacía o con módulos comunes → todo apagado", () => {
  for (const m of [undefined, null, [], ["proyectos", "clients", "agenda"]]) {
    for (const parte of PARTES_ETAPA2) assert.equal(etapa2Activa(m, parte), false, `${parte} con ${JSON.stringify(m)}`);
  }
});

test("prende sólo con la clave exacta; claves ajenas o parecidas no activan", () => {
  assert.equal(etapa2Activa(["proyectos-ia"], "ia"), true);
  assert.equal(etapa2Activa(["ia", "armador3d", "portal"], "ia"), false);
  assert.equal(etapa2Activa(["ia", "armador3d", "portal"], "portal"), false);
  assert.equal(etapa2Activa(["PROYECTOS-IA", " proyectos-ia", "proyectos-ia "], "ia"), false);
  assert.equal(etapa2Activa(["proyectos-ia"], "armador3d"), false);
  assert.equal(etapa2Activa(["proyectos-armador3d"], "portal"), false);
  assert.equal(etapa2Activa(["proyectos-portal"], "portal"), true);
});

test("estado por negocio: lo de un negocio no prende al otro", () => {
  const a = etapa2Estado(["proyectos", "proyectos-portal"]);
  const b = etapa2Estado(["proyectos"]);
  assert.deepEqual(a, { ia: false, armador3d: false, portal: true, "facturacion-proyectos": false, importador: false });
  assert.ok(Object.values(b).every((v) => v === false));
});

test("las reservadas existen y tienen mensaje, pero arrancan apagadas", () => {
  assert.equal(CLAVE_ETAPA2["facturacion-proyectos"], "proyectos-facturacion");
  assert.equal(CLAVE_ETAPA2.importador, "proyectos-importador");
  for (const p of PARTES_ETAPA2) assert.ok(MENSAJE_APAGADO[p].length > 0);
  assert.equal(etapa2Activa(["proyectos-facturacion"], "facturacion-proyectos"), true);
});

test("catálogo: las cinco claves están registradas y dependen de proyectos", () => {
  const r = construirCatalogo();
  for (const clave of Object.values(CLAVE_ETAPA2)) {
    const d = r.get(clave);
    assert.equal(d.kind, "capability");
    assert.ok(d.dependencias?.some((x) => x.id === "proyectos"), clave);
  }
  const con = resolverActivacion({ tenantId: "t1", blueprintId: "productora", modules: ["clients", "proyectos", "proyectos-ia", "proyectos-portal"] }, r);
  assert.deepEqual(con.desconocidos, []);
  assert.ok(con.activos.some((d) => d.id === "proyectos-ia"));
  const sin = resolverActivacion({ tenantId: "t2", blueprintId: "productora", modules: ["clients", "proyectos-armador3d"] }, r);
  assert.ok(sin.dependenciasFaltantes.some((x) => x.id === "proyectos-armador3d"));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  atajoDesdeProducto,
  atajoDesdeUltima,
  claveEmisionValida,
  emisionDesdeAtajo,
  esCaminoCorto,
  montoDesdeTexto,
  nuevaClaveEmision,
  tocar,
  validarAtajo,
  type Atajo,
  type EstadoCaminoCorto,
  type ToqueCaminoCorto,
} from "@/lib/facturita-atajos";
import { validarEmision } from "@/lib/facturita-core";

const TORTA: Atajo = { id: "p1", detalle: "Torta de chocolate", precio: 25000, concepto: "productos" };
const CLASE: Atajo = { id: "p2", detalle: "Clase de yoga", precio: 8000, concepto: "servicios" };

/** Corre los toques de la persona y devuelve cuántos hicieron falta hasta que la factura sale. */
function toquesHastaEmitir(atajo: Atajo, condicion: string | null, toques: ToqueCaminoCorto[]): number | null {
  let e: EstadoCaminoCorto = { paso: "eligiendo" };
  let n = 0;
  for (const t of toques) {
    e = tocar(e, t);
    n++;
    if (e.paso === "emitiendo") {
      // Lo que viaja al servidor tiene que pasar la MISMA validación que el formulario.
      const v = validarEmision(emisionDesdeAtajo(e.atajo, e.clave), "20261105", { condicionEmisor: condicion });
      assert.ok(v.ok, JSON.stringify(v));
      assert.equal(v.ok && v.receptor.condicionIva, "CONSUMIDOR_FINAL");
      return n;
    }
  }
  return null;
}

test("el lema: un monotributista emite en DOS toques (producto → Emitir por $X)", () => {
  const clave = nuevaClaveEmision();
  const n = toquesHastaEmitir(TORTA, "MONOTRIBUTO", [
    { tipo: "atajo", atajo: TORTA, condicionEmisor: "MONOTRIBUTO", clave },
    { tipo: "emitir" },
  ]);
  assert.equal(n, 2);
});

test("el doble toque no cambia nada: el segundo «emitir» llega con la misma clave", () => {
  const clave = nuevaClaveEmision();
  let e: EstadoCaminoCorto = tocar({ paso: "eligiendo" }, { tipo: "atajo", atajo: TORTA, condicionEmisor: "MONOTRIBUTO", clave });
  e = tocar(e, { tipo: "emitir" });
  const otra = tocar(e, { tipo: "emitir" });
  assert.deepEqual(otra, e);
  assert.equal(e.paso === "emitiendo" && e.clave, clave);
  // Tocar otro producto mientras emite tampoco cambia lo que se está emitiendo.
  assert.deepEqual(tocar(e, { tipo: "atajo", atajo: CLASE, condicionEmisor: "MONOTRIBUTO", clave: "x" }), e);
});

test("lo que no entra en dos toques va al formulario, no inventa el dato", () => {
  // Servicio: ARCA pide las fechas.
  assert.equal(toquesHastaEmitir(CLASE, "MONOTRIBUTO", [{ tipo: "atajo", atajo: CLASE, condicionEmisor: "MONOTRIBUTO", clave: "a".repeat(16) }, { tipo: "emitir" }]), null);
  // Inscripto: elige la alícuota. Sin perfil fiscal: la emisión no tiene con qué.
  assert.equal(esCaminoCorto(TORTA, "RESPONSABLE_INSCRIPTO"), false);
  assert.equal(esCaminoCorto(TORTA, null), false);
  assert.equal(esCaminoCorto(TORTA, "MONOTRIBUTO"), true);
  const e = tocar({ paso: "eligiendo" }, { tipo: "atajo", atajo: CLASE, condicionEmisor: "MONOTRIBUTO", clave: "a".repeat(16) });
  assert.equal(e.paso, "formulario");
});

test("cambiar el monto o el comprador sale del camino corto", () => {
  const e = tocar({ paso: "eligiendo" }, { tipo: "atajo", atajo: TORTA, condicionEmisor: "MONOTRIBUTO", clave: "a".repeat(16) });
  assert.equal(tocar(e, { tipo: "cambiar" }).paso, "formulario");
  assert.equal(tocar({ paso: "eligiendo" }, { tipo: "emitir" }).paso, "eligiendo");
});

test("validarAtajo: detalle, precio en criollo y topes", () => {
  assert.deepEqual(validarAtajo({ detalle: "  Torta   grande ", precio: "25.000,50" }), {
    ok: true, detalle: "Torta grande", precio: 25000.5, concepto: "productos",
  });
  assert.equal(validarAtajo({ detalle: "x", precio: 100 }).ok, false);
  assert.equal(validarAtajo({ detalle: "Torta", precio: "0" }).ok, false);
  assert.equal(validarAtajo({ detalle: "Torta", precio: "-5" }).ok, false);
  assert.equal(validarAtajo({ detalle: "Torta", precio: "abc" }).ok, false);
  assert.equal(validarAtajo({ detalle: "Torta", precio: 1e12 }).ok, false);
  assert.equal(validarAtajo({ detalle: "Torta", precio: Number.NaN }).ok, false);
  assert.equal(validarAtajo({ detalle: { x: 1 }, precio: 10 }).ok, false);
  assert.equal(montoDesdeTexto("25000.5"), 25000.5);
  assert.equal(montoDesdeTexto("1.250"), 1250);
  assert.equal(montoDesdeTexto("1.250.000"), 1250000);
});

test("atajoDesdeProducto y «Repetir la última» sólo si se repite tal cual", () => {
  assert.deepEqual(atajoDesdeProducto({ id: "p", name: "Clase", price: 8000, unit: "servicio" })?.concepto, "servicios");
  assert.equal(atajoDesdeProducto({ id: "p", name: "Torta", price: null, unit: "unidades" }), null);
  const ultima = atajoDesdeUltima({ invoiceId: "i", descripcion: "Torta", total: 25000, concepto: "productos", consumidorFinal: true });
  assert.deepEqual(ultima, { id: "ultima", detalle: "Torta", precio: 25000, concepto: "productos" });
  // Con comprador identificado, repetirla «a consumidor final» sería otra factura.
  assert.equal(atajoDesdeUltima({ invoiceId: "i", descripcion: "Torta", total: 25000, concepto: "productos", consumidorFinal: false }), null);
  assert.equal(atajoDesdeUltima(null), null);
  assert.equal(atajoDesdeUltima({ descripcion: "Torta", total: 1, concepto: "otro", consumidorFinal: true }), null);
});

test("la clave de emisión: un UUID entra; vacío, corto o con símbolos no", () => {
  assert.ok(claveEmisionValida(nuevaClaveEmision()));
  assert.notEqual(nuevaClaveEmision(), nuevaClaveEmision());
  assert.equal(claveEmisionValida(""), false);
  assert.equal(claveEmisionValida("corta"), false);
  assert.equal(claveEmisionValida("a".repeat(65)), false);
  assert.equal(claveEmisionValida("'; DROP TABLE x; --aaaaaaaa"), false);
  assert.equal(claveEmisionValida(123), false);
});

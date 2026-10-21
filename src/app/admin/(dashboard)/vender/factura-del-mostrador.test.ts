// La factura en el mostrador: consumidor final por defecto, el umbral sale de la tabla de vigencias
// (no se inventa), y cuando no se puede facturar, el porqué.
import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoSinFactura, textoDelReceptor } from "./factura-del-mostrador";
import { UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL, vigenteEn } from "@/lib/fiscal/vigencias";

test("la factura sale a consumidor final y el umbral de identificación es el de la tabla vigente", () => {
  const umbral = vigenteEn(UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL, "2026-10-20")?.valor ?? null;
  assert.equal(umbral, 10_000_000, "RG ARCA 5700/2025 (src/lib/fiscal/vigencias.ts)");
  const t = textoDelReceptor(umbral);
  assert.match(t, /^Sale a consumidor final\./);
  assert.match(t, /la factura a su nombre, o la venta llega a \$\s?10\.000\.000/);
  // Ni «A» ni «B»: la letra depende de la condición del emisor (un monotributista hace C).
  assert.doesNotMatch(t, /factura [AB]\b/);
  assert.match(t, /CUIT o DNI en «Cliente» antes de cobrar/);
  // Sin umbral conocido no se inventa uno.
  assert.doesNotMatch(textoDelReceptor(null), /llega a/);
});

test("sin «Facturar»: el porqué depende de si falta el permiso o la facturación del negocio", () => {
  assert.equal(motivoSinFactura({ puedeFacturar: true, rolFactura: true }), null);
  assert.match(motivoSinFactura({ puedeFacturar: false, rolFactura: false }) ?? "", /la hace el dueño, desde Ventas del día/);
  assert.match(motivoSinFactura({ puedeFacturar: false, rolFactura: true }) ?? "", /todavía no factura desde el sistema/);
});

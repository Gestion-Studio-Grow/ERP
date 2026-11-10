// Delivery local en el alta de la vidriera y en el seguimiento público.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { notaDelPedido } from "./reglas-tienda";
import { configDeliveryLocal } from "@/lib/delivery-local/config";

test("notaDelPedido: los extras van después de zona y franja y ANTES de lo de la clienta", () => {
  assert.equal(
    notaDelPedido({
      zona: "Centro",
      franja: "Franja: 9-12 (hoy 10/11)",
      extras: ["Ubicación: https://maps.google.com/?q=1,2", "Paga en efectivo, justo"],
      deLaClienta: " timbre 2B ",
    }),
    "Zona: Centro · Franja: 9-12 (hoy 10/11) · Ubicación: https://maps.google.com/?q=1,2 · Paga en efectivo, justo · timbre 2B",
  );
  assert.equal(notaDelPedido({ zona: null, franja: null, extras: [], deLaClienta: null }), null);
  assert.equal(notaDelPedido({ zona: null, franja: null, extras: ["Paga por transferencia"], deLaClienta: "" }), "Paga por transferencia");
});

test("sin extras, la nota es la de siempre", () => {
  const base = { zona: "Canning centro", franja: "Franja: L-S 11-13 (mañana 23/10)", deLaClienta: " jugoso " };
  assert.equal(notaDelPedido(base), "Zona: Canning centro · Franja: L-S 11-13 (mañana 23/10) · jugoso");
  assert.equal(notaDelPedido({ ...base, extras: [] }), notaDelPedido(base));
});

test("los negocios provisionados no tienen el delivery local: su alta sigue idéntica", () => {
  for (const slug of ["beauty-spa", "magra", "shinevelas", "adosmanos", "quebienoles", "", null, undefined, "__proto__", "toString"]) {
    assert.equal(configDeliveryLocal(slug), null, String(slug));
  }
  assert.ok(configDeliveryLocal("bitacora"));
});

test("placeOnlineOrder: el delivery local sólo corre con config; sin ella, la nota, la auditoría y el redirect de siempre", () => {
  const src = readFileSync(new URL("../../lib/order-actions.ts", import.meta.url), "utf8");
  const cuerpo = src.slice(src.indexOf("export async function placeOnlineOrder"), src.indexOf("async function subtotalDeLaBolsaEnBase"));
  assert.match(cuerpo, /const deliveryLocal = configDeliveryLocal\(tenant\?\.slug\);/);
  assert.match(cuerpo, /const extrasLocal = deliveryLocal \? extrasDelAlta\(deliveryLocal, formData, fulfillment === "DELIVERY"\) : null;/);
  // Un pago mal formado frena ANTES de grabar.
  assert.ok(cuerpo.indexOf("if (extrasLocal && !extrasLocal.ok)") < cuerpo.indexOf("tomarPedidoOnlineGuarded("));
  assert.match(cuerpo, /\.\.\.\(extrasLocal\?\.ok \? \{ extras: extrasLocal\.renglones \} : \{\}\)/);
  assert.match(cuerpo, /\.\.\.\(extrasLocal\?\.ok \? \{ entregaLocal: extrasLocal\.auditoria \} : \{\}\)/);
  assert.match(cuerpo, /seguimiento = rutaDeSeguimiento\(tokenDeSeguimiento\(authSecret\(\), tenantId, result\.id\)\);/);
  // Sin el secreto, el pedido ya grabado no termina en error: cae a «gracias».
  assert.match(cuerpo, /\} catch \(err\) \{[^}]*\}\s*\}\s*if \(seguimiento\) redirect\(seguimiento\);\s+redirect\(`\/tienda\/gracias\?pedido=\$\{result\.code\}`\);/);
});

test("el seguimiento público no lee dirección, teléfono ni ubicación, y no se indexa", () => {
  const src = readFileSync(new URL("./pedido/[token]/page.tsx", import.meta.url), "utf8");
  const codigo = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  for (const prohibido of ["address", "customerPhone", "customerName", "notes", "ubicacion", "basePrisma"]) {
    assert.ok(!codigo.includes(prohibido), `no debe aparecer ${prohibido}`);
  }
  assert.match(codigo, /secreto = authSecret\(\);\s*\} catch \{\s*return null;/, "sin secreto: 404, no 500");
  assert.match(codigo, /verificarToken\(secreto, tenantId, token\)/);
  assert.match(codigo, /where: \{ id: orderId, tenantId \}/);
  assert.match(codigo, /if \(!datos\) notFound\(\);/);
  assert.match(codigo, /robots: \{ index: false/);
  assert.match(codigo, /referrer: "no-referrer"/);
  assert.match(codigo, /generator: "Gestión Studio Grow"/);
});

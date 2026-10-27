// Cierre de la certificación de Magra T1 — lo puro:
//   · F-1 / MG-023: «Etiqueta $X · Sistema $Y» y «Cobrar el de la etiqueta» (sólo sin tope = Dueño);
//     la línea a mano que arma pasa la validación de siempre y la regla del tope la rechaza para
//     quien tiene tope (la misma que corre el servidor adentro de la transacción).
//   · O-3: el ticket de una venta con vuelto dice «Pagó con $X · Vuelto $Y», también dividida.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COBRAR_EL_DE_LA_ETIQUETA,
  etiquetaDistinta,
  lineaAManoDeLaEtiqueta,
  MOTIVO_ETIQUETA_DE_BALANZA,
  puedeCobrarElDeLaEtiqueta,
  textoEtiquetaDistinta,
} from "./etiqueta-de-balanza";
import { controlarPrecioAMano, topeDePrecioAMano, validarLineaAMano } from "@/lib/venta-reglas";
import { renglonesDelTicket, textoDelTicket, ventaDeOrden, vueltoDelTicket, type VentaTicket } from "./reglas-venta";

const VACIO = { name: "Vacío", saleUnit: "WEIGHT", price: null, pricePerKg: 28600 };

test("MG-023: la diferencia se escribe «Etiqueta $X · Sistema $Y»; al centavo igual no hay diferencia", () => {
  assert.equal(textoEtiquetaDistinta(18538, 17732), "Etiqueta $18.538,00 · Sistema $17.732,00");
  assert.equal(etiquetaDistinta(18538, 17732), true);
  assert.equal(etiquetaDistinta(17732, 17732), false);
  assert.equal(etiquetaDistinta(17732.004, 17732), false, "medio centavo no es diferencia");
  assert.equal(etiquetaDistinta(null, 17732), false, "etiqueta sin importe");
  assert.equal(etiquetaDistinta(0, 17732), false);
  assert.equal(etiquetaDistinta(Number.NaN, 17732), false);
  assert.equal(COBRAR_EL_DE_LA_ETIQUETA, "Cobrar el de la etiqueta");
});

test("MG-023: «Cobrar el de la etiqueta» sólo para el Dueño (el tope sale del rol)", () => {
  assert.equal(puedeCobrarElDeLaEtiqueta(topeDePrecioAMano("OWNER")), true);
  for (const rol of ["RECEPTION", "PROFESSIONAL"] as const) {
    assert.equal(puedeCobrarElDeLaEtiqueta(topeDePrecioAMano(rol)), false, rol);
  }
  assert.equal(puedeCobrarElDeLaEtiqueta(undefined), false, "sin dato, no se ofrece");
});

test("MG-023: la línea a mano de la etiqueta pasa la validación; el servidor la deja al Dueño y la frena con tope", () => {
  const m = lineaAManoDeLaEtiqueta({ nombre: "Vacío", kg: 0.62, importeEtiqueta: 18538, importeSistema: 17732 });
  assert.equal(m.nombre, "Vacío", "el nombre del producto: así la regla del tope lo reconoce");
  assert.ok(m.motivo.startsWith(MOTIVO_ETIQUETA_DE_BALANZA));
  assert.match(m.motivo, /0,62 kg/);
  assert.match(m.motivo, /\$17\.732/);
  const v = validarLineaAMano({ nombre: m.nombre, importe: m.importeText, motivo: m.motivo });
  assert.equal(v.ok, true, JSON.stringify(v));
  if (!v.ok) return;
  assert.equal(v.linea.importe, 18538);
  // La MISMA regla que `controlarPreciosAManoEnTx`: el Dueño (tope null) pasa; con tope, rechazo.
  assert.deepEqual(controlarPrecioAMano({ linea: v.linea, catalogo: [VACIO], tope: topeDePrecioAMano("OWNER") }), { ok: true });
  const r = controlarPrecioAMano({ linea: v.linea, catalogo: [VACIO], tope: topeDePrecioAMano("RECEPTION") });
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.error : "", /se vende por kilo/);
  // Con centavos, el importe viaja entero.
  const c = lineaAManoDeLaEtiqueta({ nombre: "Vacío", kg: 0.621, importeEtiqueta: 18538.5, importeSistema: 17760.6 });
  const vc = validarLineaAMano({ nombre: c.nombre, importe: c.importeText, motivo: c.motivo });
  assert.equal(vc.ok && vc.linea.importe, 18538.5);
});

const venta = (o: Partial<VentaTicket>): VentaTicket =>
  ventaDeOrden({
    id: "o1",
    code: 7,
    createdAt: new Date("2026-10-22T15:00:00.000Z"),
    subtotal: 36608,
    discount: 0,
    total: 36608,
    paymentMethod: "EFECTIVO",
    customerName: "Mostrador",
    customerPhone: "",
    status: "DELIVERED",
    items: [{ productId: "v", name: "Vacío", saleUnit: "WEIGHT", quantity: 1.28, unitPrice: 28600, lineTotal: 36608 }],
    ...(o as object),
  });

test("O-3: efectivo simple → «Pagó con $50.000 · Vuelto $13.392» en el ticket y en WhatsApp", () => {
  const v = venta({});
  assert.equal(vueltoDelTicket(v, 50000), 13392);
  const texto = textoDelTicket(v, { negocio: "MAGRA", pagoCon: 50000 });
  assert.match(texto, /Pagó con \$50\.000,00 · Vuelto \$13\.392,00/);
  // Justo: vuelto $0 se dice igual; sin «pagó con» o con menos, no se inventa.
  assert.equal(vueltoDelTicket(v, 36608), 0);
  assert.equal(vueltoDelTicket(v, null), null);
  assert.equal(vueltoDelTicket(v, 30000), null);
  assert.doesNotMatch(textoDelTicket(v, { negocio: "MAGRA" }), /Vuelto/);
});

test("O-3: pago dividido Efectivo $25.000 (asentado $20.000) + MP $16.608 → «Pagó con $25.000 · Vuelto $5.000»", () => {
  const v = ventaDeOrden({
    id: "o2",
    code: 8,
    createdAt: new Date("2026-10-22T15:00:00.000Z"),
    subtotal: 36608,
    discount: 0,
    total: 36608,
    paymentMethod: "EFECTIVO",
    customerName: "Mostrador",
    customerPhone: "",
    status: "DELIVERED",
    collections: [
      { method: "EFECTIVO", amount: 20000 },
      { method: "MERCADOPAGO", amount: 16608 },
    ],
    items: [{ productId: "v", name: "Vacío", saleUnit: "WEIGHT", quantity: 1.28, unitPrice: 28600, lineTotal: 36608 }],
  });
  assert.equal(v.medio, null);
  assert.equal(vueltoDelTicket(v, 25000), 5000);
  const renglones = renglonesDelTicket(v, { negocio: "MAGRA", pagoCon: 25000 }).map((r) => r.texto);
  assert.ok(renglones.includes("Pagó con $25.000,00 · Vuelto $5.000,00"), renglones.join(" | "));
  // Dividido sin efectivo (MP + Transferencia): no hay vuelto aunque llegue un «pagó con».
  const sinEfectivo = { ...v, pagos: [{ medio: "MERCADOPAGO", monto: 20000 }, { medio: "TRANSFERENCIA", monto: 16608 }] };
  assert.equal(vueltoDelTicket(sinEfectivo, 50000), null);
});

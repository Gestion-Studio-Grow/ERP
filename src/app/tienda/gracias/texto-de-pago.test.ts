// Gracias: el texto de cómo se paga (con y sin el botón de Mercado Pago) y que la rama de la
// vidriera nueva —la que toma la demo Magra— reciba el botón. Puro: sin base ni red.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { textoDePagoDeGracias } from "./texto-de-pago";

const MEDIOS = "Efectivo, transferencia y Mercado Pago.";

test("magra sin botón: lo de siempre (pagás al recibir, o te lo confirmamos)", () => {
  assert.equal(
    textoDePagoDeGracias({ marca: "magra", medios: MEDIOS, conMercadoPago: false }),
    "Te lo llevamos o lo retirás. Pagás al recibir: efectivo, transferencia y Mercado Pago.",
  );
  assert.equal(
    textoDePagoDeGracias({ marca: "magra", medios: "", conMercadoPago: false }),
    "Te lo llevamos o lo retirás. El medio de pago te lo confirmamos antes de cobrar.",
  );
});

test("magra con botón: ofrece pagar ahora y no dice sólo «pagás al recibir»", () => {
  const con = textoDePagoDeGracias({ marca: "magra", medios: MEDIOS, conMercadoPago: true });
  assert.equal(con, "Te lo llevamos o lo retirás. Podés pagar ahora con Mercado Pago o al recibir: efectivo, transferencia y Mercado Pago.");
  assert.doesNotMatch(con, /Pagás al recibir/);
  assert.equal(
    textoDePagoDeGracias({ marca: "magra", medios: "", conMercadoPago: true }),
    "Te lo llevamos o lo retirás. Podés pagar ahora con Mercado Pago o coordinar el pago con el local.",
  );
});

test("otras marcas: sin botón como antes; con botón, pagar ahora o coordinar", () => {
  assert.equal(
    textoDePagoDeGracias({ marca: "shinevelas", medios: MEDIOS, conMercadoPago: false }),
    "Te lo mandamos o lo retirás. El pago se coordina al confirmar: efectivo, transferencia y Mercado Pago.",
  );
  assert.equal(
    textoDePagoDeGracias({ marca: "generica", medios: MEDIOS, conMercadoPago: false }),
    "Te lo mandamos o lo retirás. El medio de pago y el envío te los confirmamos antes de cobrar.",
  );
  assert.match(textoDePagoDeGracias({ marca: "shinevelas", medios: MEDIOS, conMercadoPago: true }), /^Te lo mandamos o lo retirás\. Podés pagar ahora con Mercado Pago o al confirmar: efectivo/);
  assert.match(textoDePagoDeGracias({ marca: "generica", medios: "", conMercadoPago: true }), /Podés pagar ahora con Mercado Pago o coordinar el pago con el local\.$/);
});

test("cableado: la rama de la vidriera nueva calcula el pago y le pasa el botón a GraciasNueva", () => {
  const pagina = readFileSync(join(__dirname, "page.tsx"), "utf8");
  const nueva = pagina.slice(pagina.indexOf("if (usaVidrieraNueva("), pagina.indexOf('if (front === "magra")'));
  assert.ok(nueva.length > 0, "la rama nueva está antes que la de Magra");
  assert.match(nueva, /Promise\.all\(\[leerTienda\(\), pagoDeGracias\(pedido, t\)\]\)/);
  assert.match(nueva, /<GraciasNueva[\s\S]*pagar=\{\s*mp && \(\s*<PagarConMercadoPago[\s\S]*pedido=\{mp\.pedido\}[\s\S]*token=\{mp\.token\}/);
  assert.match(nueva, /pago=\{textoDePagoDeGracias\(\{ marca, medios, conMercadoPago: mp != null \}\)\}/);

  const vista = readFileSync(join(__dirname, "..", "vidriera", "GraciasNueva.tsx"), "utf8");
  assert.match(vista, /pagar\?: ReactNode/);
  assert.match(vista, /\{pagar && <div className=\{s\.segPagar\}>\{pagar\}<\/div>\}/);
});

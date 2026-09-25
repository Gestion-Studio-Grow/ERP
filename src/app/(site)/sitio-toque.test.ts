// ============================================================================
// EL SITIO DE LA ESTÉTICA SE TOCA CON EL DEDO: ningún botón por debajo de 44 px.
// ============================================================================
//
// El gate «visual-aa» (scripts/qa/visual-audit.mjs) mide la home y /reserva del negocio de
// servicios del gate (estetica-demo), que es la MISMA landing que ve CH en producción. En el
// celular, el «Reservar» del encabezado medía 37 px de alto y los desplegables de /reserva
// («Profesional», «Servicio») 38 px; los horarios, 36 px. Quien reserva lo hace con el pulgar.
//
// Se mide igual que el gate, sin servidor: el markup real con react-dom/server, el CSS real
// (globals.css compilado con Tailwind), Chromium a 412 px y la MISMA función de medición
// (`auditInPage`, vía src/test/navegador.ts).

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Browser } from "playwright";
import { agendaBookingCopyForSlug } from "@/blueprints/agenda/rubros";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { abrirNavegador, medirComoElGate, TOQUE_MIN } from "@/test/navegador";

let Header: typeof import("./_ch/Header").default;
let BookingProvider: typeof import("./_ch/BookingProvider").default;
let BookingForm: typeof import("./reserva/BookingForm").default;

const SERVICIO = { id: "s1", name: "Limpieza facial profunda", durationMin: 60, price: 38000, residentPrice: null, depositAmount: null };
const PROFESIONALES = [
  { id: "p1", name: "Carla", services: [SERVICIO], box: { name: "Box 1" } },
  { id: "p2", name: "Juli", services: [SERVICIO], box: null },
];

describe("El sitio de la estética en el celular: todo lo que se toca mide 44 px o más", { timeout: 120_000 }, () => {
  let browser: Browser | null = null;
  let css = "";
  let sinNavegador = "";

  before(async () => {
    prepararAccionesDeServidor();
    Header = (await import("./_ch/Header")).default;
    BookingProvider = (await import("./_ch/BookingProvider")).default;
    BookingForm = (await import("./reserva/BookingForm")).default;
    const n = await abrirNavegador();
    if ("sinNavegador" in n) sinNavegador = n.sinNavegador;
    else ({ browser, css } = n);
  });

  after(async () => {
    await browser?.close();
  });

  async function chicosEn(html: string, ancho?: { width: number; height: number }) {
    const r = await medirComoElGate(browser!, css, html, ancho);
    return r.touchFails.map((f) => `${f.text || f.selector} ${f.w}×${f.h}`);
  }

  test("home: el «Reservar» del encabezado mide 44 px en el celular", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const html = renderToStaticMarkup(h(BookingProvider, null, h(Header, { brandName: "Estética DEMO" })));
    const chicos = await chicosEn(html);
    assert.deepEqual(chicos, [], `botones de menos de ${TOQUE_MIN} px:\n${chicos.join("\n")}`);
  });

  test("home: en la PC el «Reservar» del encabezado queda como siempre (37 px, sólo crece en el celular)", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const html = renderToStaticMarkup(h(BookingProvider, null, h(Header, { brandName: "Estética DEMO" })));
    // La función del gate mide igual en la PC: ahí el botón sigue en 37 px de alto, como hoy en CH.
    const chicos = await chicosEn(html, { width: 1280, height: 900 });
    assert.deepEqual(chicos, ["Reservar 94×37"]);
  });

  test("/reserva: los desplegables del formulario miden 44 px en el celular", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const html = renderToStaticMarkup(h(BookingForm, { professionals: PROFESIONALES, copy: agendaBookingCopyForSlug("estetica-demo") }));
    const chicos = await chicosEn(html);
    assert.deepEqual(chicos, [], `controles de menos de ${TOQUE_MIN} px:\n${chicos.join("\n")}`);
  });
});

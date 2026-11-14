// ============================================================================
// ASISTENTE ARCA · el formulario de descarte del pedido cerrado con otra clave (seguimiento del #147)
// ============================================================================
//
// Lo ve SÓLO el operador, con el pedido en «otra-clave», si puede tocar el negocio (no CH sin el
// dueño) y si la ficha le pasó la acción. Pide la palabra tipeada. El cliente ve el aviso y el
// WhatsApp, nunca el formulario. Ningún texto de la pantalla trae material del pedido.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AsistenteArca } from "./AsistenteArca";
import { estadoDelAsistente, PALABRA_DEL_DESCARTE, type EntradaAsistente, type ProblemaDelPedido } from "@/lib/fiscal/asistente-arca";
import type { VistaDelAsistente } from "@/lib/fiscal/asistente-arca.server";

const nada = async () => {};

function vista(problema: ProblemaDelPedido | null): VistaDelAsistente {
  const entrada: EntradaAsistente = {
    ficha: {
      slug: "negocio-qa",
      arcaCuit: "20123456786",
      arcaPuntoVenta: 3,
      arcaHomologacion: true,
      arcaCondicionIva: "MONOTRIBUTO",
      credencial: null,
      delegacion: null,
      modoArca: "real",
      enListaReal: true,
      comprobantesDePrueba: { esperandoCae: 0, enviosAbiertos: 0, autorizados: 0, desde: null },
    },
    pedidoPendiente: null,
    problemaDelPedido: problema,
    pedidoDePase: null,
  };
  return {
    entrada,
    estado: estadoDelAsistente(entrada),
    csrPem: null,
    contador: null,
    contadores: [],
    avisoAlContador: null,
    soporte: "https://wa.me/5491100000000",
  };
}

function render(opc: { plano: "cliente" | "operador"; problema: ProblemaDelPedido | null; conAccion?: boolean; soloLectura?: string | null }) {
  return renderToStaticMarkup(
    createElement(AsistenteArca, {
      vista: vista(opc.problema),
      plano: opc.plano,
      tenantId: opc.plano === "operador" ? "t-qa" : undefined,
      soloLectura: opc.soloLectura ?? null,
      acciones: {
        generarPedido: nada,
        cargarCertificado: nada,
        probar: nada,
        ...(opc.conAccion === false ? {} : { descartarPedido: nada }),
      },
    }),
  );
}

const conFormulario = (html: string) => html.includes('name="confirmacion"') && html.includes("Descartar el pedido");

test("operador + pedido de otra clave: formulario con la palabra tipeada y el negocio oculto", () => {
  const html = render({ plano: "operador", problema: "otra-clave" });
  assert.ok(conFormulario(html));
  assert.ok(html.includes(`escribí ${PALABRA_DEL_DESCARTE}`));
  assert.ok(html.includes('id="asistente-descarte"') && html.includes('for="asistente-descarte"'), "campo con rótulo");
  assert.ok(html.includes('name="tenantId" value="t-qa"'));
  // Con otra clave tampoco se ofrece generar uno nuevo (hay que descartar primero).
  assert.ok(!html.includes("Generar el pedido de certificado"));
});

test("sin formulario: el cliente, otro estado, CH sin el dueño o sin la acción", () => {
  assert.ok(!conFormulario(render({ plano: "cliente", problema: "otra-clave" })));
  // «ilegible» muestra «Reintentar», que pide el router de Next: su rama no toca el descarte.
  for (const p of [null, "dañado", "sin-configuracion"] as const) {
    assert.ok(!conFormulario(render({ plano: "operador", problema: p })), String(p));
  }
  assert.ok(!conFormulario(render({ plano: "operador", problema: "otra-clave", soloLectura: "Sólo el dueño de GSG." })));
  assert.ok(!conFormulario(render({ plano: "operador", problema: "otra-clave", conAccion: false })));
});

// Tanda perf de Magra: lo que NO baja con la pantalla (P-2) y las teclas memorizadas (P-3).
//
//   · P-2: el mostrador de siempre (VenderForm + PedidoDesdeWhatsApp) y las solapas (POS y alta de
//     turno) llegan diferidos en el navegador (`next/dynamic` del lado del cliente); el boutique
//     dibuja el pedido de WhatsApp y el bloque Cliente diferidos. Un import estático de vuelta mete
//     ese código en el JS de la pantalla aunque no se dibuje (52 KB gz en la bandeja).
//   · P-3: `TeclasMemorizadas` no se vuelve a dibujar si sólo cambian las funciones (que VenderForm
//     pasa estables); sí si cambian el catálogo, el stock, las pestañas o las fijadas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DASH = fileURLToPath(new URL("../../", import.meta.url));
const leer = (rel: string) => readFileSync(join(DASH, rel), "utf8");
const importsEstaticos = (src: string) => [...src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)";/gm)].map((m) => m[1]);

test("P-2: lo pesado del mostrador llega diferido en el navegador; el boutique difiere WhatsApp y Cliente", () => {
  // El JS de una pantalla lleva TODO componente de cliente que alcance su grafo de servidor: el
  // corte tiene que ser un `next/dynamic` del lado del cliente.
  const mostrador = leer("vender/MostradorDeVenta.tsx");
  for (const pesado of ["./VenderForm", "./PedidoDesdeWhatsApp"]) {
    assert.ok(!importsEstaticos(mostrador).includes(pesado), `MostradorDeVenta importa estático ${pesado}`);
  }
  assert.match(mostrador, /PedidoDesdeWhatsAppDiferido as PedidoDesdeWhatsApp, VenderFormDiferido as VenderForm \} from "\.\/boutique\/diferidos"/);
  const diferidos = leer("vender/boutique/diferidos.tsx");
  assert.match(diferidos, /^"use client";/);
  assert.match(diferidos, /dynamic\(\(\) => import\("\.\.\/VenderForm"\)\)/);
  assert.match(diferidos, /dynamic\(\(\) => import\("\.\.\/PedidoDesdeWhatsApp"\)\)/);
  const solapas = leer("pedidos/boutique/diferidos.tsx");
  assert.match(solapas, /^"use client";/);
  assert.match(solapas, /dynamic\(\(\) => import\("\.\.\/MostradorTabs"\)\)/);
  for (const [nombre, src] of [["vender/page.tsx", leer("vender/page.tsx")], ["pedidos/page.tsx", leer("pedidos/page.tsx")]] as const) {
    const estaticos = importsEstaticos(src);
    for (const pesado of ["./MostradorTabs", "../pedidos/MostradorTabs", "./PosForm", "./VenderForm", "../vender/VenderForm", "./PedidoDesdeWhatsApp"]) {
      assert.ok(!estaticos.includes(pesado), `${nombre} importa estático ${pesado}`);
    }
    assert.match(src, /MostradorTabsDiferido as MostradorTabs/);
  }
  // El mostrador boutique: VenderForm sí (se dibuja), el pedido de WhatsApp y el Cliente diferidos.
  const boutique = leer("vender/boutique/MostradorBoutique.tsx");
  assert.ok(!importsEstaticos(boutique).includes("../PedidoDesdeWhatsApp"));
  assert.match(leer("vender/boutique/WhatsAppDiferido.tsx"), /dynamic\(traer,/);
  const form = leer("vender/boutique/VenderBoutique.tsx");
  assert.ok(!importsEstaticos(form).includes("../ClienteDeLaVenta"), "VenderBoutique importa ClienteDeLaVenta como valor");
  assert.match(form, /ClienteDeLaVentaDiferido as ClienteDeLaVenta/);
  assert.match(leer("vender/boutique/perezosos.tsx"), /export const ClienteDeLaVentaDiferido = dynamic\(traerCliente,/);
});

test("P-3: las teclas memorizadas comparan los datos, no la identidad de las funciones", async () => {
  const { mismasTeclas } = await import("./perezosos");
  type Props = Parameters<typeof mismasTeclas>[0];
  const productos: Props["productos"] = [{ id: "p1", name: "Vacío", saleUnit: "WEIGHT", price: null, pricePerKg: 20000 }];
  const stockById: Props["stockById"] = { p1: { stock: 3, trackStock: true } };
  const principal = { rotulo: "Fijadas", ids: ["p1"] };
  const gondolas: Props["gondolas"] = [];
  const fijadas = ["p1"];
  const base: Props = { productos, stockById, principal, gondolas, onTocar: () => {}, fijar: { fijadas, onGuardar: async () => null } };
  // Un toque re-renderiza VenderForm: funciones y el objeto `fijar` nuevos, mismos datos → no se dibuja.
  assert.equal(mismasTeclas(base, { ...base, onTocar: () => {}, fijar: { fijadas, onGuardar: async () => "x" } }), true);
  assert.equal(mismasTeclas(base, { ...base, stockById: { ...stockById } }), false, "cambió el stock");
  assert.equal(mismasTeclas(base, { ...base, productos: [...productos] }), false, "cambió un precio (catálogo nuevo)");
  assert.equal(mismasTeclas(base, { ...base, principal: { ...principal } }), false, "cambiaron las teclas principales");
  assert.equal(mismasTeclas(base, { ...base, fijar: { fijadas: ["p1", "p2"], onGuardar: async () => null } }), false, "se guardaron otras fijadas");
  assert.equal(mismasTeclas(base, { ...base, fijar: null }), false, "dejó de poder fijar");
});

test("P-3: la llamada estable siempre llama a la última versión (sin cierres viejos)", () => {
  // V-6: el estado vive en el núcleo (un hook, siempre en el mismo orden) y la vista boutique lo usa.
  const nucleo = leer("vender/nucleo-de-venta.tsx");
  assert.match(nucleo, /const tocarTeclaEstable = useLlamadaEstable\(\(id: string\) => tocarTecla\(id\)\);/);
  const form = leer("vender/boutique/VenderBoutique.tsx");
  assert.match(form, /onTocar=\{tocarTeclaEstable\}/);
  assert.match(form, /onGuardar: guardarFijadasEstable/);
  assert.ok(form.indexOf("useNucleoDeVenta(props)") < form.indexOf("return vistaBoutique(props.boutique!);"));
});

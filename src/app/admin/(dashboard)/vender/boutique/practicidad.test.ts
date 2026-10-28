// Tanda practicidad de Magra, frente «vender»: las reglas puras del pie plegable (V-2), del teclado
// de peso en línea (V-3), de «Confirmar todo» (V-5, confirmar-todo.ts) y el corte del JS del boutique (V-6). Lo que se
// ve en el navegador (V-1 a V-4 a 390 y 1024 px) está en vender-pantalla.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { estadoDelPie, textoDeCobrar } from "./PieDeCobro";
import { TECLAS_DEL_RENGLON, digitosDelPeso, pesoTrasTecla } from "./RenglonBoutique";
import { confirmablesDeUnToque, type RenglonAConfirmar } from "./confirmar-todo";

const VENDER = fileURLToPath(new URL("../", import.meta.url));
const leer = (rel: string) => readFileSync(join(VENDER, rel), "utf8");
const importsEstaticos = (src: string) => [...src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)";/gm)].map((m) => m[1]);

test("V-2: el pie vacío no ocupa lugar; con algo cargado es la barra; los medios, al tocarla", () => {
  assert.equal(estadoDelPie(0, false, null), "nada", "ticket vacío: sin pie");
  assert.equal(estadoDelPie(0, true, null), "nada", "vacío se pliega solo aunque estuviera abierto");
  assert.equal(estadoDelPie(0, false, 4375), "vuelto", "recién cobrada con billete: sólo el vuelto");
  assert.equal(estadoDelPie(15500, false, 4375), "barra", "la venta nueva: la barra (el vuelto viejo no)");
  assert.equal(estadoDelPie(15500, true, null), "medios");
  assert.equal(estadoDelPie(0, false, null, true), "barra", "una línea a mano a medio llenar dice qué le falta");
  assert.equal(textoDeCobrar("Cobrar", 15500), "Cobrar $15.500");
  assert.equal(textoDeCobrar("Registrar y cobrar", 13882.5), "Registrar y cobrar $13.882,50");
});

test("V-3: el teclado del renglón lee el peso que ya tiene (nunca queda desfasado) y pone la coma solo", () => {
  assert.equal(TECLAS_DEL_RENGLON.length, 12, "tres filas de cuatro");
  assert.equal(digitosDelPeso(0), "");
  assert.equal(digitosDelPeso(1.24), "1240");
  assert.equal(digitosDelPeso(Number.NaN), "");
  let kg = 0;
  for (const t of ["1", "2", "4", "0"] as const) kg = pesoTrasTecla(kg, t);
  assert.equal(kg, 1.24, "«1240» → 1,240 kg");
  assert.equal(pesoTrasTecla(1.24, "borrar"), 0.124);
  assert.equal(pesoTrasTecla(0.5, "00"), 50, "«500» + «00» → 50,000 kg (lo frena «¿son 50 kg?» del renglón)");
  assert.equal(pesoTrasTecla(12.345, "6"), 12.345, "más de 5 cifras no entra");
  // Tipeado a mano con el teclado de la PC (1,2): la tecla siguiente sigue desde ahí.
  assert.equal(pesoTrasTecla(1.2, "5"), 12.005);
  // El campo no abre el teclado del sistema.
  assert.match(leer("boutique/RenglonBoutique.tsx"), /inputMode=\{porKilo \? "none" : "numeric"\}/);
});

test("V-4: el nombre del renglón boutique no se trunca", () => {
  const src = leer("boutique/RenglonBoutique.tsx");
  const nombre = src.slice(src.indexOf('data-vender="nombre-del-renglon"'), src.indexOf("{nombre}", src.indexOf('data-vender="nombre-del-renglon"')));
  assert.doesNotMatch(nombre, /truncate|line-clamp|text-ellipsis/);
  assert.match(nombre, /overflow-wrap:anywhere/);
});

test("V-5: «Confirmar todo» confirma los completos sin dudas; los que tienen una duda, de a uno", () => {
  const prop = (productId: string, dudas: string[] = []) => ({ productId, dudas });
  const r = (key: string, extra: Partial<RenglonAConfirmar> = {}) => ({
    r: { key, propuesto: prop("vacio"), productId: "vacio", confirmado: false, quitado: false, ...extra },
    problema: null as string | null,
  });
  const vista = [
    r("a"),
    r("b", { propuesto: prop("chorizo", ["Pidió 8: van 2 paquetes de 6 (12)"]), productId: "chorizo" }),
    // Le cambiaron el producto: la duda era del otro, ya no cuenta.
    r("c", { propuesto: prop("chorizo", ["se vende por unidad"]), productId: "vacio" }),
    r("d", { confirmado: true }),
    r("e", { quitado: true }),
    { ...r("f"), problema: "Poné los kilos (por ejemplo 1,5)." },
  ];
  assert.deepEqual(confirmablesDeUnToque(vista), { claves: ["a", "c"], conDudas: 1 });
  assert.deepEqual(confirmablesDeUnToque([]), { claves: [], conDudas: 0 });
});

test("V-6: la rama boutique es su propio módulo; CH no la baja y el boutique no baja las vistas de siempre", () => {
  const form = leer("VenderForm.tsx");
  const boutique = leer("boutique/VenderBoutique.tsx");
  const nucleo = leer("nucleo-de-venta.tsx");
  const mostrador = leer("boutique/MostradorBoutique.tsx");
  // VenderForm (CH) llega al boutique sólo diferido (el mostrador de la bandeja con el interruptor).
  assert.ok(!importsEstaticos(form).includes("./boutique/VenderBoutique"));
  assert.match(form, /dynamic\(\(\) => import\("\.\/boutique\/VenderBoutique"\)\)/);
  // El boutique arma su vista sobre el núcleo, sin pasar por VenderForm ni sus piezas de siempre.
  assert.ok(importsEstaticos(boutique).includes("../nucleo-de-venta"));
  for (const deSiempre of ["../VenderForm", "@/components/balanza/TomarPesoParaElTicket", "@/components/ui/Renglon", "@/components/ui/Kbd", "../ZonaDelEnvio"]) {
    assert.ok(!importsEstaticos(boutique).includes(deSiempre), `VenderBoutique importa ${deSiempre}`);
  }
  assert.doesNotMatch(boutique, /BuscadorCombo/);
  // El núcleo no conoce las vistas.
  for (const vista of ["./VenderForm", "./boutique/VenderBoutique"]) assert.ok(!importsEstaticos(nucleo).includes(vista));
  // La página del boutique monta su módulo directo.
  assert.ok(importsEstaticos(mostrador).includes("./VenderBoutique"));
  assert.ok(!importsEstaticos(mostrador).includes("../VenderForm"));
  // Lo cerrado (pedido de WhatsApp, bloque Cliente) se adelanta con el primer toque, no al entrar.
  assert.doesNotMatch(leer("boutique/WhatsAppDiferido.tsx"), /requestIdleCallback/);
  assert.doesNotMatch(leer("boutique/perezosos.tsx"), /requestIdleCallback/);
});

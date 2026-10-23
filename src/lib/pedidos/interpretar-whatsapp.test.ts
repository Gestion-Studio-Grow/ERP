// PEDIDO DESDE WHATSAPP — el lector del chat (Magra, tanda 2 · 2B · MG-051, MG-052, MG-053).
// Frases de mostrador de una carnicería boutique (PROVISIONALES: hay que confirmarlas con los
// chats reales de Magra), con los números escritos con letra, «y medio», por importe, por pieza,
// por paquete y con los errores de tipeo de todos los días.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DICCIONARIO_DE_CORTES,
  FALTANTE_A_FUTURO_AVISA,
  claveDeCorte,
  faltanteDelRenglon,
  franjaElegidaDeLaPropuesta,
  franjasParaElegir,
  horarioParaElFormulario,
  horasDeLasPartes,
  interpretarPedidoDeWhatsApp,
  mensajeDeConfirmacion,
  normalizarTexto,
  notaDelPedidoDeWhatsApp,
  productosQuePuedenFaltarAFuturo,
  reconocerCorte,
  totalDelRenglon,
  type ProductoDelCatalogo,
} from "./interpretar-whatsapp";

// Jueves 22/10/2026.
const HOY = "2026-10-22";

const kg = (id: string, name: string, pricePerKg: number): ProductoDelCatalogo => ({ id, name, saleUnit: "WEIGHT", price: null, pricePerKg });
const un = (id: string, name: string, price: number): ProductoDelCatalogo => ({ id, name, saleUnit: "UNIT", price, pricePerKg: null });

/** El catálogo del mostrador de MG-041…MG-052: vacío a $28.600, chorizo por unidad a $1.900, picada a $9.800. */
const MAGRA: ProductoDelCatalogo[] = [
  kg("vacio", "Vacío", 28600),
  un("chorizo", "Chorizo", 1900),
  kg("molleja", "Molleja", 21000),
  kg("bdc", "Bife de chorizo", 15900),
  kg("ojo", "Ojo de bife", 16900),
  kg("picada", "Picada", 9800),
  kg("asado", "Asado de tira", 11500),
  kg("nalga", "Nalga", 13900),
  kg("mila", "Milanesas de nalga", 12900),
  kg("entrana", "Entraña", 25000),
  kg("bondiola", "Bondiola", 15400),
  kg("colita", "Colita de cuadril", 17800),
  kg("pollo", "Pollo entero", 4200),
  un("hamb", "Hamburguesas caseras x4", 6500),
  un("provo", "Provoleta", 4500),
];

const leer = (texto: string, catalogo = MAGRA) => interpretarPedidoDeWhatsApp(texto, catalogo, { hoy: HOY, negocio: "Magra" });
const resumen = (texto: string, catalogo = MAGRA) =>
  leer(texto, catalogo).renglones.map((r) => [r.productId, r.cantidad, r.unidad, r.aAjustar] as const);

// ── Los criterios de aceptación ─────────────────────────────────────────────────────────────

test("MG-051: el chat de Ana propone su teléfono, su nombre, los dos renglones y la franja «Mañana tarde»", () => {
  const p = leer("hola, soy Ana 11 5555-1234, para mañana a la tarde 2 kg de vacío y 6 chorizos");
  assert.deepEqual(p.telefono, { clave: "1155551234", texto: "11 5555-1234", conAreaSupuesta: false });
  assert.equal(p.nombre, "Ana");
  assert.equal(p.franja?.texto, "Mañana tarde");
  assert.equal(p.franja?.dia, "2026-10-23");
  assert.equal(p.franja?.parte, "tarde");
  assert.deepEqual(
    p.renglones.map((r) => [r.texto, r.productId, r.cantidad, r.unidad, r.seguro]),
    [
      ["2 kg de vacío", "vacio", 2, "kg", true],
      ["6 chorizos", "chorizo", 6, "u", true],
    ],
  );
  assert.deepEqual(p.sinReconocer, []);
  // 2 × 28.600 + 6 × 1.900
  assert.equal(p.totalEstimado, 68600);
});

test("MG-052: «$15.000 de picada» a $9.800/kg son 1,531 kg estimados, a ajustar, $15.003,80", () => {
  const [r] = leer("$15.000 de picada").renglones;
  assert.equal(r.productId, "picada");
  assert.equal(r.cantidad, 1.531);
  assert.equal(r.aAjustar, true);
  assert.equal(r.pidio, "$15.000");
  assert.equal(r.totalEstimado, 15003.8);
  // Escrito de otras formas: «$ 15000», «15 lucas», «15 mil pesos».
  for (const t of ["$ 15000 de picada", "15 lucas de picada", "15 mil pesos de picada", "picada $15.000"]) {
    assert.deepEqual(resumen(t), [["picada", 1.531, "kg", true]], t);
  }
});

test("MG-053: el WhatsApp de «te anotamos» lleva lo anotado, la franja, el total estimado y el número", () => {
  const m = mensajeDeConfirmacion({
    nombre: "Ana Pérez",
    negocio: "Magra",
    codigo: 128,
    cuando: "Mañana tarde (17 a 20 h)",
    entrega: "retiro",
    renglones: [
      { nombre: "Vacío", cantidad: 2, unidad: "kg", aAjustar: false },
      { nombre: "Chorizo", cantidad: 6, unidad: "u", aAjustar: false },
      { nombre: "Picada", cantidad: 1.531, unidad: "kg", aAjustar: true, pidio: "$15.000" },
    ],
    total: 83603.8,
  });
  assert.equal(
    m,
    "¡Hola Ana! Te anotamos para mañana tarde (17 a 20 h) (para retirar en el local): 2 kg de Vacío, 6 Chorizo y $15.000 de Picada (unos 1,531 kg). Total estimado $83.603,80: lo ajustamos cuando lo pesamos. Tu pedido es el #128. ¡Gracias! — Magra",
  );
  // Sólo unidades: el total no es estimado.
  assert.match(
    mensajeDeConfirmacion({ nombre: null, negocio: "Magra", codigo: null, cuando: null, entrega: "envio", renglones: [{ nombre: "Provoleta", cantidad: 2, unidad: "u", aAjustar: false }], total: 9000 }),
    /^¡Hola! Te anotamos \(te lo llevamos\): 2 Provoleta\. Total \$9\.000\. ¡Gracias! — Magra$/,
  );
});

// ── Las 10 frases de mostrador (provisionales a confirmar con los chats reales) ─────────────

test("frase 1 · «1 kilo de vacío, medio de chorizo, 2 de molleja» (chorizo por unidad: pregunta cuántos)", () => {
  const p = leer("1 kilo de vacío, medio de chorizo, 2 de molleja");
  assert.deepEqual(
    p.renglones.map((r) => [r.productId, r.cantidad, r.unidad]),
    [
      ["vacio", 1, "kg"],
      ["chorizo", null, "u"],
      ["molleja", 2, "kg"],
    ],
  );
  assert.match(p.renglones[1].dudas.join(" "), /se vende por unidad: poné cuántos/);
  assert.equal(p.renglones[1].seguro, false);
});

test("frase 1 bis · con el chorizo por kilo, «medio de chorizo» es medio kilo", () => {
  const catalogo = MAGRA.map((p) => (p.id === "chorizo" ? kg("chorizo", "Chorizo", 9900) : p));
  assert.deepEqual(resumen("1 kilo de vacío, medio de chorizo, 2 de molleja", catalogo), [
    ["vacio", 1, "kg", false],
    ["chorizo", 0.5, "kg", false],
    ["molleja", 2, "kg", false],
  ]);
});

test("frase 2 · «dejame 3 bifes de chorizo de 300 gr» es bife de chorizo (no chorizo), 0,9 kg a ajustar", () => {
  const [r, ...resto] = leer("dejame 3 bifes de chorizo de 300 gr").renglones;
  assert.equal(resto.length, 0);
  assert.equal(r.productId, "bdc");
  assert.equal(r.cantidad, 0.9);
  assert.equal(r.aAjustar, true);
  assert.equal(r.pidio, "3 bifes de 300 g");
  assert.equal(r.texto, "3 bifes de chorizo de 300 gr");
  assert.equal(r.totalEstimado, 14310);
});

test("frase 3 · sin el peso de cada bife, lo estima con el peso típico y lo marca para revisar", () => {
  const [r] = leer("separame 2 bifes de chorizo").renglones;
  assert.equal(r.productId, "bdc");
  assert.equal(r.cantidad, 0.7);
  assert.equal(r.aAjustar, true);
  assert.equal(r.seguro, false);
  assert.match(r.dudas.join(" "), /350 g cada bife/);
});

test("frase 4 · números con letra y «y medio»: «un kilo y medio de vacío y dos kilos y medio de asado»", () => {
  assert.deepEqual(resumen("Hola! me separás un kilo y medio de vacío y dos kilos y medio de asado porfa"), [
    ["vacio", 1.5, "kg", false],
    ["asado", 2.5, "kg", false],
  ]);
  // «y medio» después de un corte ES otro renglón: «1 kilo de vacío y medio de molleja».
  assert.deepEqual(resumen("1 kilo de vacio y medio de molleja"), [
    ["vacio", 1, "kg", false],
    ["molleja", 0.5, "kg", false],
  ]);
});

test("frase 5 · cuartos y fracciones: «tres cuartos de entraña», «un cuarto de picada», «1/2 kg», «1 1/2»", () => {
  assert.deepEqual(resumen("tres cuartos de entraña, un cuarto de picada"), [
    ["entrana", 0.75, "kg", false],
    ["picada", 0.25, "kg", false],
  ]);
  assert.deepEqual(resumen("molleja 1/2 kg y 1 1/2 de bondiola"), [
    ["molleja", 0.5, "kg", false],
    ["bondiola", 1.5, "kg", false],
  ]);
});

test("frase 6 · errores de tipeo: vasio, bacio, chorisos, moleja, entrania, bondiolla, colita de cuadri", () => {
  assert.deepEqual(resumen("2 kg de vasio, 1 de bacio, 4 chorisos, medio de moleja, 1 de entrania, 1 de bondiolla, 2 de colita de cuadri"), [
    ["vacio", 2, "kg", false],
    ["vacio", 1, "kg", false],
    ["chorizo", 4, "u", false],
    ["molleja", 0.5, "kg", false],
    ["entrana", 1, "kg", false],
    ["bondiola", 1, "kg", false],
    ["colita", 2, "kg", false],
  ]);
});

test("frase 7 · diminutivos y gramos: «medio kilito de mollejitas y 300 gramos de vacío»", () => {
  assert.deepEqual(resumen("me das medio kilito de mollejitas y 300 gramos de vacío? gracias!!"), [
    ["molleja", 0.5, "kg", false],
    ["vacio", 0.3, "kg", false],
  ]);
});

test("frase 8 · el sábado a las 11, pollos por pieza, hamburguesas por caja de 4 y plata en lucas", () => {
  const p = leer("buenas tardes! para el sábado a las 11: 2 pollos, 1 entraña, 8 hamburguesas, 15 lucas de picada");
  assert.equal(p.franja?.dia, "2026-10-24");
  assert.equal(p.franja?.hora, "11:00");
  assert.equal(p.franja?.parte, "manana");
  assert.equal(p.franja?.texto, "Sábado 11:00");
  assert.deepEqual(
    p.renglones.map((r) => [r.productId, r.cantidad, r.unidad, r.aAjustar]),
    [
      ["pollo", 4.4, "kg", true],
      ["entrana", 1, "kg", false],
      ["hamb", 2, "u", false],
      ["picada", 1.531, "kg", true],
    ],
  );
  assert.equal(p.renglones[2].pidio, "8 hamburguesas");
});

test("frase 9 · teléfono con +54 9, retiro y «tipo 18hs»: el teléfono no se lee como cantidad", () => {
  const p = leer("+54 9 11 4000-7919 te pido moleja 1/2 kg y bondiolita 1,5kg, lo paso a buscar tipo 18hs");
  assert.equal(p.telefono?.clave, "1140007919");
  assert.equal(p.entrega, "retiro");
  assert.equal(p.franja?.texto, "Hoy 18:00");
  assert.deepEqual(
    p.renglones.map((r) => [r.productId, r.cantidad]),
    [
      ["molleja", 0.5],
      ["bondiola", 1.5],
    ],
  );
});

test("frase 10 · chat copiado con encabezados: el mensaje del local no cuenta, la clienta sí; envío y dirección", () => {
  const p = leer(
    "[22/10/26, 10:15] Magra: ¡Hola! ¿Qué necesitás?\n[22/10/26, 10:16] Laura Gómez: hola, 2 kg de lomo wagyu y 1 provoleta, mandamelo\ndirección: Los Aromos 123, Canning",
  );
  assert.equal(p.nombre, "Laura Gómez");
  assert.equal(p.entrega, "envio");
  assert.equal(p.direccion, "Los Aromos 123, Canning");
  assert.deepEqual(p.renglones.map((r) => [r.productId, r.cantidad]), [["provo", 1]]);
  // El lomo no está en el catálogo: no se inventa, queda para cargarlo a mano.
  assert.deepEqual(p.sinReconocer, ["2 kg de lomo wagyu"]);
});

// ── Cantidades ──────────────────────────────────────────────────────────────────────────────

test("cantidad · «1.240 kg» es un kilo y cuarto (MG-041: $35.464), «1 kilo 200» es 1,2 kg, «x 2kg» va después", () => {
  const [r] = leer("1.240 kg de vacío").renglones;
  assert.equal(r.cantidad, 1.24);
  assert.equal(r.totalEstimado, 35464);
  assert.deepEqual(resumen("un kilo 200 de vacio"), [["vacio", 1.2, "kg", false]]);
  assert.deepEqual(resumen("vacio x 2kg"), [["vacio", 2, "kg", false]]);
  assert.deepEqual(resumen("vacío: 2 kilos"), [["vacio", 2, "kg", false]]);
});

test("cantidad · un número solo: chico son kilos, de 50 a 4.999 son gramos, de 5.000 para arriba es plata", () => {
  assert.deepEqual(resumen("2 de molleja"), [["molleja", 2, "kg", false]]);
  assert.deepEqual(resumen("500 de picada"), [["picada", 0.5, "kg", false]]);
  assert.deepEqual(resumen("1500 de picada"), [["picada", 1.5, "kg", false]]);
  const [r] = leer("20000 de vacío").renglones;
  assert.equal(r.cantidad, 0.699);
  assert.equal(r.aAjustar, true);
  assert.match(r.dudas.join(" "), /revisá que sea plata/);
});

test("cantidad · docena, media docena y par", () => {
  assert.deepEqual(resumen("una docena de chorizos"), [["chorizo", 12, "u", false]]);
  assert.deepEqual(resumen("media docena de chorizos"), [["chorizo", 6, "u", false]]);
  assert.deepEqual(resumen("un par de provoletas"), [["provo", 2, "u", false]]);
});

test("cantidad · sin cantidad el renglón queda pedido pero pide la cantidad", () => {
  const [r] = leer("y vacío también").renglones;
  assert.equal(r.productId, "vacio");
  assert.equal(r.cantidad, null);
  assert.match(r.dudas[0], /No dice cuánto/);
});

test("por pieza · «6 milanesas» estima 150 g cada una; «1 kg de milanesas» es un kilo", () => {
  assert.deepEqual(resumen("6 milanesas"), [["mila", 0.9, "kg", true]]);
  assert.deepEqual(resumen("1 kg de milanesas"), [["mila", 1, "kg", false]]);
});

test("por paquete · «Chorizo de cerdo x6»: 6 chorizos = 1 paquete; 8 = 2 paquetes con aviso; «2 paquetes» = 2", () => {
  const catalogo = [kg("vacio", "Vacío", 28600), un("chorizo6", "Chorizo de cerdo x6", 7200)];
  let [r] = leer("6 chorizos", catalogo).renglones;
  assert.deepEqual([r.productId, r.cantidad, r.seguro, r.totalEstimado], ["chorizo6", 1, true, 7200]);
  [r] = leer("8 chorizos", catalogo).renglones;
  assert.equal(r.cantidad, 2);
  assert.match(r.dudas.join(" "), /Pidió 8: van 2 paquetes de 6 \(12\)/);
  [r] = leer("2 paquetes de chorizo", catalogo).renglones;
  assert.equal(r.cantidad, 2);
});

test("por kilo un producto por unidad: no se adivina, se pregunta", () => {
  const [r] = leer("medio kilo de provoleta").renglones;
  assert.equal(r.cantidad, null);
  assert.match(r.dudas[0], /Provoleta se vende por unidad/);
});

// ── Cortes ──────────────────────────────────────────────────────────────────────────────────

test("cortes · «nalga cortada en milanesas» es nalga con su detalle, no un renglón de milanesas", () => {
  const p = leer("quiero 1kg de nalga cortada en milanesas");
  assert.deepEqual(p.renglones.map((r) => [r.productId, r.cantidad, r.detalle]), [["nalga", 1, "cortada en milanesas"]]);
});

test("cortes · lo que pidió aparte queda en el detalle («sin grasa»)", () => {
  const [r] = leer("2 kg de picada sin grasa").renglones;
  assert.equal(r.detalle, "sin grasa");
});

test("cortes · con dos productos de la misma clave, propone el que comparte palabras y ofrece el otro", () => {
  const catalogo = [kg("esp", "Carne picada especial", 9800), kg("com", "Carne picada común", 7800)];
  let [r] = leer("1 kg de picada común", catalogo).renglones;
  assert.equal(r.productId, "com");
  assert.deepEqual(r.alternativas, [{ id: "esp", nombre: "Carne picada especial" }]);
  assert.equal(r.seguro, false);
  [r] = leer("1 kg de picada", catalogo).renglones;
  assert.equal(r.alternativas.length, 1);
  assert.match(r.dudas[0], /También puede ser/);
});

test("cortes · «pasado mañana» no es «asado» y «buenas tardes» no es una franja", () => {
  let p = leer("buenas tardes, pasado mañana a la tarde 2 kg de vacío");
  assert.deepEqual(p.renglones.map((r) => r.productId), ["vacio"]);
  assert.equal(p.franja?.texto, "Sábado tarde");
  p = leer("buenas tardes! 2 kg de vacío");
  assert.equal(p.franja, null);
});

test("cortes · un producto que el diccionario no conoce se reconoce por su nombre («provoleta»)", () => {
  assert.deepEqual(resumen("2 provoletas"), [["provo", 2, "u", false]]);
});

test("cortes · el saludo, el nombre y el número de la casa no son un pedido", () => {
  const p = leer("Hola, soy la vecina del 5. tres cuartos de entraña. Gracias!!");
  assert.deepEqual(p.sinReconocer, []);
  assert.equal(p.nombre, null);
  assert.deepEqual(p.renglones.map((r) => r.productId), ["entrana"]);
});

// ── Teléfono, nombre, franja ────────────────────────────────────────────────────────────────

test("teléfono · las formas argentinas dan la misma clave; sin área se supone 11 (provisional)", () => {
  for (const t of ["+54 9 11 4000-7919", "011 15-4000-7919", "11 4000 7919", "1140007919", "5491140007919"]) {
    assert.equal(leer(`${t} 1 kg de vacío`).telefono?.clave, "1140007919", t);
  }
  const p = leer("15 5555 1234 Marta, 2 de vacío");
  assert.deepEqual(p.telefono, { clave: "1155551234", texto: "15 5555 1234", conAreaSupuesta: true });
  assert.deepEqual(resumen("11 5555-1234 2 kg de vacío"), [["vacio", 2, "kg", false]]);
  // Un importe o un peso no es un teléfono.
  assert.equal(leer("$15.000 de picada").telefono, null);
});

test("nombre · «soy Marta Pérez» con apellido en mayúscula; «soy ana para mañana» sólo el nombre", () => {
  assert.equal(leer("Hola, soy Marta Pérez, 2 kg de vacio").nombre, "Marta Pérez");
  assert.equal(leer("soy ana para mañana 2 kg de vacio").nombre, "Ana");
  assert.equal(leer("me llamo Rocío, 1 kg de vacío").nombre, "Rocío");
});

test("franja · hoy, mañana a la mañana, el lunes (que viene), de 17 a 19, «a la tarde» sola es hoy", () => {
  assert.equal(leer("para hoy a la mañana 1 de vacío").franja?.texto, "Hoy mañana");
  assert.equal(leer("para mañana a la mañana 1 de vacío").franja?.texto, "Mañana mañana");
  const lunes = leer("para el lunes 1 de vacío").franja;
  assert.equal(lunes?.dia, "2026-10-26");
  assert.equal(lunes?.parte, null);
  // El mismo día de la semana que hoy es el que viene.
  assert.equal(leer("el jueves 1 de vacío").franja?.dia, "2026-10-29");
  const rango = leer("mañana de 17 a 19, 2 de vacío");
  assert.equal(rango.franja?.hora, "17:00");
  assert.deepEqual(rango.renglones.map((r) => [r.productId, r.cantidad]), [["vacio", 2]]);
  assert.equal(leer("a la tarde paso, 1 de vacío").franja?.texto, "Hoy tarde");
  assert.equal(leer("1 kg de vacío").franja, null);
  // Sin «hoy» no hay franja (no se adivina la fecha).
  assert.equal(interpretarPedidoDeWhatsApp("mañana 1 de vacío", MAGRA).franja, null);
});

test("entrega · envío con «me lo traen», retiro con «paso a buscar», nada si no lo dice", () => {
  assert.equal(leer("1 de vacío, me lo traen?").entrega, "envio");
  assert.equal(leer("1 de vacío, paso a buscar").entrega, "retiro");
  assert.equal(leer("1 de vacío").entrega, null);
});

test("robustez · vacío, sólo saludo, un texto larguísimo y un catálogo vacío no rompen", () => {
  assert.deepEqual(leer("").renglones, []);
  assert.deepEqual(leer("hola buen día!!").renglones, []);
  assert.deepEqual(leer("hola buen día!!").sinReconocer, []);
  assert.ok(leer("2 kg de vacío, ".repeat(2000)).renglones.length > 0);
  const p = leer("2 kg de vacío", []);
  assert.deepEqual(p.renglones, []);
  assert.deepEqual(p.sinReconocer, ["2 kg de vacío"]);
});

// ── El diccionario compartido (lista del frigorífico) ───────────────────────────────────────

test("diccionario · claves únicas y sinónimos sin tildes", () => {
  const claves = DICCIONARIO_DE_CORTES.map((c) => c.clave);
  assert.equal(new Set(claves).size, claves.length);
  for (const c of DICCIONARIO_DE_CORTES) for (const s of c.sinonimos) assert.equal(s, normalizarTexto(s), `${c.clave}: «${s}»`);
});

test("diccionario · claveDeCorte lee los renglones de una lista del frigorífico", () => {
  assert.equal(claveDeCorte("BIFE ANGOSTO"), "bife-de-chorizo");
  assert.equal(claveDeCorte("Vacio novillo x kg"), "vacio");
  assert.equal(claveDeCorte("Bife ancho c/hueso"), "ojo-de-bife");
  assert.equal(claveDeCorte("Milanesas de nalga"), "milanesa");
  assert.equal(claveDeCorte("Chorizo de cerdo x6"), "chorizo");
  assert.equal(claveDeCorte("Tapa de asado"), "tapa-de-asado");
  assert.equal(claveDeCorte("PICAÑA"), "tapa-de-cuadril");
  assert.equal(claveDeCorte("Caja de cartón"), null);
});

test("diccionario · reconocerCorte da el producto del catálogo para un texto suelto", () => {
  assert.deepEqual(reconocerCorte("Bife angosto novillo", MAGRA), { productId: "bdc", nombre: "Bife de chorizo", alternativas: [], seguro: true });
  assert.equal(reconocerCorte("VACIO", MAGRA)?.productId, "vacio");
  assert.equal(reconocerCorte("Mollejas", MAGRA)?.productId, "molleja");
  assert.equal(reconocerCorte("Caja de cartón", MAGRA), null);
});

// ── Lo que usa la pantalla ──────────────────────────────────────────────────────────────────

test("franjas · los chips de hoy y mañana con las horas por defecto (provisionales) o las de Envíos", () => {
  const chips = franjasParaElegir({ hoy: HOY });
  assert.deepEqual(chips.map((c) => [c.texto, c.horas, c.dia, c.desde]), [
    ["Hoy mañana", "10 a 13 h", "2026-10-22", "10:00"],
    ["Hoy tarde", "17 a 20 h", "2026-10-22", "17:00"],
    ["Mañana mañana", "10 a 13 h", "2026-10-23", "10:00"],
    ["Mañana tarde", "17 a 20 h", "2026-10-23", "17:00"],
  ]);
  // Las de hoy que ya terminaron no se ofrecen.
  assert.deepEqual(franjasParaElegir({ hoy: HOY, ahoraHHmm: "14:30" }).map((c) => c.texto), ["Hoy tarde", "Mañana mañana", "Mañana tarde"]);
  assert.deepEqual(horasDeLasPartes(["L-S 11-13", "L-S 17:30-19"]).tarde, { desde: "17:30", hasta: "19:00" });
  assert.equal(franjasParaElegir({ hoy: HOY, franjasRetiro: ["L-S 11-13"] })[0].horas, "11 a 13 h");
});

test("franjas · la del chat queda elegida; si es otro día o dijo una hora, suma su chip", () => {
  let p = leer("para mañana a la tarde 2 kg de vacío");
  let chips = franjasParaElegir({ hoy: HOY, propuesta: p.franja });
  assert.equal(franjaElegidaDeLaPropuesta(chips, p.franja)?.texto, "Mañana tarde");
  p = leer("el sábado a la tarde 2 kg de vacío");
  chips = franjasParaElegir({ hoy: HOY, propuesta: p.franja });
  assert.equal(franjaElegidaDeLaPropuesta(chips, p.franja)?.texto, "Sábado tarde");
  p = leer("el sábado a las 11 2 kg de vacío");
  chips = franjasParaElegir({ hoy: HOY, propuesta: p.franja });
  const elegida = franjaElegidaDeLaPropuesta(chips, p.franja);
  assert.equal(elegida?.desde, "11:00");
  assert.equal(horarioParaElFormulario(elegida!.dia, elegida!.desde), "2026-10-24T11:00");
});

test("nota · dice que vino por WhatsApp, la franja, qué se ajusta al pesar y el detalle; hasta 500 letras", () => {
  const n = notaDelPedidoDeWhatsApp({
    franja: "Mañana tarde (17 a 20 h)",
    renglones: [
      { nombre: "Picada", aAjustar: true, pidio: "$15.000", detalle: "sin grasa" },
      { nombre: "Vacío", aAjustar: false },
    ],
  });
  assert.equal(n, "Pedido por WhatsApp · Franja: Mañana tarde (17 a 20 h) · A ajustar al pesar: Picada (pidió $15.000) · Picada: sin grasa");
  assert.equal(notaDelPedidoDeWhatsApp({ franja: null, renglones: [], extra: "x".repeat(900) }).length, 500);
});

test("total · el renglón corregido recalcula al centavo; sin cantidad o sin precio no hay total", () => {
  assert.equal(totalDelRenglon(0.335, 12345), 4135.58);
  assert.equal(totalDelRenglon(null, 12345), null);
  assert.equal(totalDelRenglon(1, null), null);
});

// ── El faltante a futuro (decisión del dueño, provisional) ──────────────────────────────────

test("faltante · pedido para otro día de un corte por kilo: avisa y deja anotar (sólo con el mostrador boutique)", () => {
  assert.equal(FALTANTE_A_FUTURO_AVISA, true);
  const base = { stock: { stock: 0.8, trackStock: true }, cantidad: 2, porPeso: true, nombre: "Vacío", prendido: true };
  assert.deepEqual(faltanteDelRenglon({ ...base, aFuturo: true }), {
    bloquea: false,
    texto: "Hoy quedan 0,8 kg de Vacío. Como es para otro día, se anota igual: acordate de envasar.",
  });
  // Para hoy, o lo que se vende por unidad, o sin el mostrador boutique: frena como siempre.
  assert.equal(faltanteDelRenglon({ ...base, aFuturo: false })?.bloquea, true);
  assert.equal(faltanteDelRenglon({ ...base, aFuturo: true, porPeso: false })?.bloquea, true);
  assert.equal(faltanteDelRenglon({ ...base, aFuturo: true, prendido: false })?.bloquea, true);
  // Alcanza, o no controla stock: nada que decir.
  assert.equal(faltanteDelRenglon({ ...base, aFuturo: false, cantidad: 0.5 }), null);
  assert.equal(faltanteDelRenglon({ ...base, aFuturo: false, stock: { stock: 0, trackStock: false } }), null);
});

test("faltante · lo que el servidor deja quedar en negativo: sólo por kilo, ONLINE, día posterior y prendido", () => {
  const productos = [
    { id: "vacio", saleUnit: "WEIGHT" },
    { id: "chorizo", saleUnit: "UNIT" },
  ];
  const ok = { channel: "ONLINE", dia: "2026-10-24", hoy: HOY, prendido: true };
  assert.deepEqual(productosQuePuedenFaltarAFuturo(productos, ok), ["vacio"]);
  assert.deepEqual(productosQuePuedenFaltarAFuturo(productos, { ...ok, dia: HOY }), []);
  assert.deepEqual(productosQuePuedenFaltarAFuturo(productos, { ...ok, dia: null }), []);
  assert.deepEqual(productosQuePuedenFaltarAFuturo(productos, { ...ok, channel: "COUNTER" }), []);
  assert.deepEqual(productosQuePuedenFaltarAFuturo(productos, { ...ok, prendido: false }), []);
});

// ── F-2 (CERT-magra-t2): encabezados de WhatsApp Web, fechas y cantidades fuera de escala ─────

const trio = (texto: string) => leer(texto).renglones.map((r) => [r.productId, r.cantidad, r.seguro] as const);

test("F-2a · encabezados de WhatsApp Web/Desktop: «[hh:mm, dd/mm/yyyy] Nombre:» y «[hh:mm] Nombre:» se limpian; la hora no es cantidad", () => {
  const chat =
    "[10:15, 22/10/2026] Magra: Hola! Qué te preparo?\n[10:16, 22/10/2026] Laura Gómez: 1 kg de vacío\n[10:20] Laura Gómez: chorizo\n[10:21] Magra: algo más?\n[10:22] Laura Gómez: vacío para mañana";
  const r = trio(chat);
  // El hallazgo de la certificación era [["vacio",1,true],["chorizo",20,true],["vacio",null,false]]:
  // la hora «10:20» quedaba como 20 chorizos «seguros».
  assert.notDeepEqual(r, [["vacio", 1, true], ["chorizo", 20, true], ["vacio", null, false]]);
  assert.deepEqual(r, [["vacio", 1, true], ["chorizo", null, false], ["vacio", null, false]]);
  assert.equal(leer(chat).nombre, "Laura Gómez");
  // Ningún renglón seguro sale de una hora.
  assert.deepEqual(trio("[20:15] Laura: chorizo"), [["chorizo", null, false]]);
  assert.deepEqual(trio("[8:05 p. m.] Laura: vacío"), [["vacio", null, false]]);
  // Los mensajes del negocio con el encabezado Web tampoco cuentan.
  assert.deepEqual(trio("[10:15] Magra: te mando 3 kg de vacío?\n[10:16] Laura: 2 kg de vacío"), [["vacio", 2, true]]);
  // El formato Android sigue igual.
  assert.deepEqual(trio("22/10/26, 10:15 - Laura: 2 kg de vacío"), [["vacio", 2, true]]);
});

test("F-2a (CERT-magra-t2b) · la marca invisible LRM/RLM/BOM que WhatsApp iOS/Web antepone a la línea no deja la hora como cantidad", () => {
  const LRM = "‎";
  // El hallazgo: "‎[10:20] Laura: chorizo" → [["chorizo",10,true]].
  assert.notDeepEqual(trio(`${LRM}[10:20] Laura: chorizo`), [["chorizo", 10, true]]);
  assert.deepEqual(trio(`${LRM}[10:20] Laura: chorizo`), [["chorizo", null, false]]);
  assert.deepEqual(trio(`‏[10:20, 22/10/2026] Laura: chorizo`), [["chorizo", null, false]]);
  assert.deepEqual(trio(`﻿${LRM} [22/10/26, 10:15] Laura: chorizo`), [["chorizo", null, false]]);
  assert.deepEqual(trio(`${LRM}22/10/26, 10:15 - Laura: 2 kg de vacío`), [["vacio", 2, true]]);
  // Con la marca, la línea del negocio también se reconoce y se descarta; el remitente se toma.
  const chat = `${LRM}[10:15] Magra: te mando 3 kg de vacío?\n${LRM}[10:16] Laura Gómez: 2 kg de vacío`;
  assert.deepEqual(trio(chat), [["vacio", 2, true]]);
  assert.equal(leer(chat).nombre, "Laura Gómez");
});

test("F-2a (recertificación) · la marca invisible delante del nombre o envolviendo el número no agendado (iOS) no queda en el nombre", () => {
  const LRE = "‪";
  const PDF = "‬";
  const numero = leer(`[10:16] ${LRE}+54 9 11 5555-1234${PDF}: 2 kg de vacío`);
  assert.equal(numero.nombre, "+54 9 11 5555-1234");
  assert.ok(!/[​-‏‪-‮⁠-⁩﻿]/.test(numero.nombre ?? ""), "sin marcas de formato");
  assert.deepEqual(trio(`[10:16] ${LRE}+54 9 11 5555-1234${PDF}: 2 kg de vacío`), [["vacio", 2, true]]);
  assert.equal(leer(`⁨[10:16] ‎Laura Gómez⁩: 2 kg de vacío`).nombre, "Laura Gómez");
});

test("F-2b · la fecha dd/mm no se lee como cantidad: «para el 25/10 2 kg de vacío» son 2 kg; las fracciones siguen", () => {
  assert.deepEqual(trio("para el 25/10 2 kg de vacío"), [["vacio", 2, true]]);
  assert.deepEqual(trio("para el 25/10/2026 2 kg de vacío"), [["vacio", 2, true]]);
  assert.deepEqual(trio("el 3/11 medio kilo de picada"), [["picada", 0.5, true]]);
  assert.deepEqual(resumen("1/2 kg de vacío"), [["vacio", 0.5, "kg", false]]);
  assert.deepEqual(resumen("3/4 de picada"), [["picada", 0.75, "kg", false]]);
});

test("F-2c · más de 25 kg por renglón o más de $500.000 quedan como duda, nunca seguros", () => {
  const [mil] = leer("1500 kg de vacío").renglones;
  assert.equal(mil.cantidad, 1500);
  assert.equal(mil.seguro, false);
  assert.match(mil.dudas.join(" "), /de verdad/);
  assert.equal(leer("26 kg de picada").renglones[0].seguro, false);
  assert.equal(leer("25 kg de picada").renglones[0].seguro, true);
  const [plata] = leer("$600.000 de vacío").renglones;
  assert.equal(plata.seguro, false);
  assert.match(plata.dudas.join(" "), /revisá que sea así/);
  // Por unidad, un total fuera de escala también se pregunta.
  const [prov] = leer("200 provoletas").renglones;
  assert.equal(prov.totalEstimado, 900000);
  assert.equal(prov.seguro, false);
});

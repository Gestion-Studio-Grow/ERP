// ============================================================================
// P2-C6 · redacción de texto libre — vuelta 5 (observaciones O-v4-1…O-v4-4 del dictamen vuelta 4)
// ============================================================================
//   node --import tsx --test src/eventos/redaccion-v5.test.ts
//
// Incluye los adversariales del certificador (`cert-p2-v4/v4-redaccion.test.ts`, que no van al
// repo) con sus mismos textos. Los que la vuelta 5 decide NO tapar quedan fijados con su motivo
// («residual aceptado»), así un cambio de comportamiento se ve.
//   · O-v4-2 (regresión): la coma tapaba importes con centavos. Un DNI con comas se tapa; un
//     importe con decimales, no.
//   · O-v4-1: emails mal escritos, separadores `_` `'` `’` (y otros raros), dígitos no ASCII.
//   · O-v4-3: un sustituto suelto en la ENTRADA no tumba nada (redacción y sobre).
//   · O-v4-4: el corte no deja una máscara ni un «[email]» por la mitad.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { armarSobre } from "./emitir";
import { LARGO_TEXTO_LIBRE, bienFormado, enmascararTelefono, redactarTextoLibre as R } from "./esquema";

const SUSTITUTO_SUELTO = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const digitos = (s: string) => s.normalize("NFKC").replace(/\D/g, "");

/** Ninguna ventana de 6 dígitos seguidos del dato aparece en los dígitos del resultado. */
function noFiltra(texto: string, dato: string, msg = texto) {
  const out = R(texto);
  const d = digitos(dato);
  const od = digitos(out.replace(/\*{6}\d{0,4}/g, ""));
  for (let i = 0; i + 6 <= d.length; i++) assert.ok(!od.includes(d.slice(i, i + 6)), `${msg}: filtró «${d.slice(i, i + 6)}» → ${JSON.stringify(out)}`);
}

// ── O-v4-2 · la regresión: importes con centavos ──────────────────────────────

test("O-v4-2 · un importe con decimales NO se tapa (la coma de F4 no se lleva los centavos)", () => {
  for (const t of [
    "reintegro de $ 1.250,50",
    "se cobró 1.500,75 de más",
    "Total $ 125.000,50",
    "le devolvimos 125.000,50 por transferencia",
    "total $12.500,00",
    "$ 125.000",
    "importe 12500.00 difiere",
    "1,250 kg",
    "precio 999,99",
    "cobrado 1.250.000,00 en dos pagos",
    "USD 1,250,000.00",
  ]) assert.equal(R(t), t, t);
});

test("O-v4-2 · un DNI con comas SÍ se tapa (F4 sigue cerrado)", () => {
  assert.equal(R("DNI 30,123,456"), "DNI ******3456");
  assert.equal(R("CUIT 20,30123456,7"), "CUIT ******4567");
  assert.equal(R("DNI 30.123.456"), "DNI ******3456");
  // Con forma de plata pero sin «$» y sin centavos: es un número de 6+ dígitos y se tapa (O2).
  assert.equal(R("125.000"), "******5000");
  // Un teléfono con un punto antes de los dos últimos dígitos no se confunde con centavos.
  noFiltra("tel 11 5566.77.88", "1155667788");
  noFiltra("tel 1155.6677.88", "1155667788");
});

test("O-v4-2 · una fecha no es un documento (antes «28/10/2026» salía tapada)", () => {
  assert.equal(R("retira el 28/10/2026"), "retira el 28/10/2026");
  assert.equal(R("vence 28-10-26"), "vence 28-10-26");
  assert.equal(R("vence 28/10/2026, total 15000"), "vence 28/10/2026, total 15000");
});

test("O2 · residual aceptado: una lista de códigos con coma sigue siendo una tirada (se pierde dato, no se filtra)", () => {
  // «1042, 1043» y «5566 , 7788» tienen la misma forma; separarlos dejaría en claro un teléfono
  // escrito con coma. Gana el dato personal.
  assert.equal(R("pedido 1042, 1043, 1044 y 1045"), "pedido ******1044 y 1045");
  noFiltra("tel 11 5566, 7788", "1155667788");
});

// ── O-v4-1 · separadores y dígitos raros ──────────────────────────────────────

const SEPARADORES_TAPADOS: [string, string][] = [
  ["guion bajo", "11_5566_7788"],
  ["apóstrofo de miles", "30'123'456"],
  ["comilla tipográfica", "30’123’456"],
  ["tilde ~", "11~5566~7788"],
  ["barra vertical", "11|5566|7788"],
  ["backslash", "11\\5566\\7788"],
  ["bullet •", "11•5566•7788"],
  ["punto de ancho completo", "11．5566．7788"],
];
for (const [nombre, dato] of SEPARADORES_TAPADOS) {
  test(`O-v4-1 · separador ${nombre}: «${dato}» se tapa`, () => noFiltra(`llamame al ${dato} gracias`, dato, nombre));
}

test("O-v4-1 · residual aceptado: «·», «*», «:» y «;» separan números en texto común y cortan la tirada", () => {
  // Meterlos taparía «a las 18:30 1042», «2*1500» o «1042; 1043». Ninguno es la forma de escribir
  // un teléfono o un DNI en Argentina; el dictamen ya daba «·» por diseño.
  for (const t of ["a las 18:30 retira", "2*1500 c/u", "pedidos 1042; 1043", "pedido #1042 · 3 u"]) assert.equal(R(t), t);
  for (const dato of ["11·5566·7788", "11*5566*7788", "11:5566:7788", "11;5566;7788"]) assert.equal(R(dato), dato, `residual: ${dato}`);
});

test("O-v4-1 · dígitos de otros sistemas (ancho completo, arábigos orientales, matemáticos) se tapan", () => {
  assert.equal(R("tel １１５５６６７７８８"), "tel ******7788");
  assert.equal(R("tel 𝟏𝟏𝟓𝟓𝟔𝟔𝟕𝟕𝟖𝟖"), "tel ******7788");
  assert.equal(R("tel ١١٥٥٦٦٧٧٨٨"), "tel ******");
  assert.equal(enmascararTelefono("١١٥٥٦٦٧٧٨٨"), "******");
  // Superíndices: no son dígitos decimales (\p{No}); nadie escribe así un teléfono. Residual.
  assert.equal(R("¹¹⁵⁵⁶⁶⁷⁷⁸⁸"), "¹¹⁵⁵⁶⁶⁷⁷⁸⁸");
});

const EMAILS: [string, string, string][] = [
  ["autocorrector: espacio tras el punto", "mail juan.perez@gmail. com", "juan.perez"],
  ["espacio antes de la arroba", "mail juan.perez @gmail.com", "juan.perez"],
  ["espacios alrededor de la arroba", "mail juan.perez @ gmail.com", "juan.perez"],
  ["sin TLD", "escribime a juan.perez@hotmail", "juan.perez"],
  ["arroba de ancho completo", "juan.perez＠gmail.com", "juan.perez"],
  ["(at)", "juan.perez(at)gmail.com", "juan.perez"],
  ["mayúsculas", "JUAN.PEREZ@GMAIL.COM", "JUAN.PEREZ"],
  ["TLD .com.ar", "juan.perez@fibertel.com.ar", "juan.perez"],
  ["entre <>", "<juan.perez@gmail.com>", "juan.perez"],
  ["con guion blando en el local", "juan­perez@gmail.com", "perez"],
  ["dominio con espacios alrededor del punto", "juan.perez @ gmail . com", "juan.perez"],
];
for (const [nombre, texto, local] of EMAILS) {
  test(`O-v4-1 · email ${nombre}`, () => {
    const out = R(texto);
    assert.ok(!out.includes(local) && out.includes("[email]"), `${nombre}: ${JSON.stringify(out)}`);
    assert.ok(!/gmail|hotmail|fibertel/i.test(out), `${nombre}: quedó el dominio en ${JSON.stringify(out)}`);
  });
}

test("O-v4-1 · sin sobre-enmascarar: arrobas sueltas, horas y el punto final de la oración quedan", () => {
  for (const t of ["nos vemos @ las 5", "seguinos en @magra", "llegó @ 10.30", "retira 2 kg @ $5000", "Av. Corrientes 1234 piso 5"]) assert.equal(R(t), t);
  assert.equal(R("Me escribió marta@mail.com. Gracias"), "Me escribió [email]. Gracias");
  assert.equal(R("pedido #1042 entregado"), "pedido #1042 entregado");
  assert.equal(R("2 kg de vacío, 1,5 kg de asado a las 18:30"), "2 kg de vacío, 1,5 kg de asado a las 18:30");
});

// ── O-v4-3 · sustituto suelto en la entrada ───────────────────────────────────

test("O-v4-3 · un sustituto suelto en el texto de la persona se cambia por U+FFFD (la redacción nunca tira)", () => {
  for (const t of ["cliente \ud83d se fue", "cliente \ude00 se fue", "\ud83d", "a\udc00\ud83d", "fin \ud83d"]) {
    const out = R(t);
    assert.ok(!SUSTITUTO_SUELTO.test(out), JSON.stringify(out));
    assert.ok(out.includes("�"));
  }
  // Un emoji entero no se toca.
  assert.equal(R("cliente 😀 contento"), "cliente 😀 contento");
  assert.equal(bienFormado("👨‍👩‍👧"), "👨‍👩‍👧");
});

test("O-v4-3 · el sobre no lleva sustitutos sueltos en NINGÚN texto (id, texto, textoLibre, clave)", () => {
  const sobre = armarSobre({
    tenantId: "t1", tipo: "pedido.creado", version: 1, clave: "pedido:o1:creado\ud83d",
    datos: {
      pedidoId: "o1\ud83d", codigo: 1, canal: "MOSTRADOR", entrega: "RETIRA", total: 100,
      items: [{ productoId: "p\udc00", sku: "SKU\ud83d", nombre: "Vacío \ud83d", cantidad: 1, precioUnitario: 100 }],
      clienteId: null, externalRef: "ext\ud83d",
    },
  });
  const json = JSON.stringify(sobre.payload);
  assert.ok(!/\\ud[89ab][0-9a-f]{2}(?!\\ud[c-f])|\\ud[c-f][0-9a-f]{2}/i.test(json), json);
  assert.ok(!SUSTITUTO_SUELTO.test(sobre.clave));
});

// ── O-v4-4 · el corte ─────────────────────────────────────────────────────────

test("O-v4-4 · el corte a 500 no deja una máscara ni un «[email]» por la mitad", () => {
  for (let pad = 480; pad < 500; pad++) {
    const tel = R(`${"x".repeat(pad)} 11 5566 7788`);
    const mail = R(`${"x".repeat(pad)} juan@gmail.com`);
    for (const out of [tel, mail]) {
      assert.ok(out.length <= LARGO_TEXTO_LIBRE);
      assert.ok(!/\*{1,6}\d{0,3}$/.test(out) && !/\[(e(m(a(il?)?)?)?)?$/.test(out), JSON.stringify(out.slice(-20)));
    }
  }
});

// ── Barrido del certificador (cert-p2-v4) con las piezas nuevas ───────────────

test("barrido · 3000 textos al azar: ≤ 500, sin sustituto suelto, sin dato en claro, importes intactos", () => {
  const piezas = ["a", " ", "😀", "11 5566-7788", "juan@gmail.com", "30.123.456", "­", "👨‍👩‍👧", "11_5566_7788", "juan@hotmail", "\ud83d", "$ 1.250,50"];
  let semilla = 7;
  const rnd = () => ((semilla = (semilla * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let n = 0; n < 3000; n++) {
    let s = "";
    const largo = 20 + Math.floor(rnd() * 4600);
    while (s.length < largo) s += piezas[Math.floor(rnd() * piezas.length)] + (rnd() < 0.5 ? " " : "");
    const out = R(s);
    assert.ok(out.length <= LARGO_TEXTO_LIBRE, `largo ${out.length}`);
    assert.ok(!SUSTITUTO_SUELTO.test(out), `sustituto suelto en ${n}`);
    const od = digitos(out.replace(/\*{6}\d{0,4}/g, "").replace(/1\.250,50/g, ""));
    for (const d of ["1155667788", "30123456"]) for (let i = 0; i + 6 <= d.length; i++) assert.ok(!od.includes(d.slice(i, i + 6)), `filtró ${d} en ${n}`);
    assert.ok(!/juan@|@gmail|@hotmail/.test(out), `email en ${n}`);
  }
});

test("costo · los emails mal escritos y la forma de plata no hacen cuadrática la redacción", () => {
  const hostiles = ["a@".repeat(50_000), "a @ ".repeat(25_000), "1,".repeat(50_000), "$1".repeat(50_000), `${"x".repeat(60)}@`.repeat(1_500)];
  for (const h of hostiles) {
    const t0 = performance.now();
    R(h);
    assert.ok(performance.now() - t0 < 200, `${h.slice(0, 8)}…: ${(performance.now() - t0).toFixed(0)} ms`);
  }
});

// ── Vuelta 6 · O-v5-1 y O-v5-2 del dictamen vuelta 5 ─────────────────────────

test("O-v5-1 · un teléfono, DNI o CUIT pegado a «,NN»/«.NN» se tapa igual que suelto", () => {
  for (const [texto, dato] of [
    ["llamar al 1155667788,15hs", "1155667788"],
    ["tel 1155667788.30 min antes", "1155667788"],
    ["DNI 30123456,12 cuotas", "30123456"],
    ["CUIT 20301234567,50", "20301234567"],
    ["llamar al 1155667788,15 hs", "1155667788"],
  ]) {
    noFiltra(texto, dato);
    assert.ok(R(texto).includes("******"), `${texto} → ${R(texto)}`);
  }
  // Igual que suelto: tapado, con la máscara de siempre.
  assert.equal(R("llamar al 1155667788"), "llamar al ******7788");
  assert.match(R("llamar al 1155667788,15hs"), /^llamar al \*{6}\d{4}hs$/);
  // La plata con centavos sigue intacta: hasta 7 dígitos enteros sin miles, o cualquier largo
  // con miles o después de «$».
  for (const t of ["precio 1234567,89", "importe 12500.00 difiere", "Total $ 1155667788,15", "cobrado 1.250.000,00"]) assert.equal(R(t), t);
});

test("O-v5-1 · residual escrito: un DNI con puntos de miles y «,NN» tiene la forma de un importe", () => {
  // «30.123.456,50» es también $ 30.123.456,50: no hay forma de separarlos sin tapar precios.
  assert.equal(R("DNI 30.123.456,50"), "DNI 30.123.456,50");
});

test("O-v5-2 · un email escrito con palabras se tapa", () => {
  for (const t of [
    "juan.perez arroba gmail punto com",
    "juan.perez [at] gmail [dot] com",
    "juan.perez (arroba) gmail (punto) com punto ar",
    "escribile a juan.perez ARROBA gmail PUNTO com, gracias",
    "juan.perez arroba gmail.com",
  ]) {
    const out = R(t);
    assert.ok(out.includes("[email]") && !/juan\.perez|gmail/i.test(out), `${t} → ${out}`);
  }
  // Sin dominio con punto y TLD, «arroba» es una palabra más.
  for (const t of ["la arroba de la planilla", "2 arroba de papa punto", "una arroba (11,5 kg) de papa"]) assert.equal(R(t), t);
});

test("O-v5-2 · costo: «arroba» y «punto» repetidos no hacen cuadrática la redacción", () => {
  for (const h of ["a arroba ".repeat(20_000), "x arroba " + "a punto ".repeat(20_000), "aaaa arroba bbbb punto ".repeat(8_000)]) {
    const t0 = performance.now();
    R(h);
    assert.ok(performance.now() - t0 < 200, `${h.slice(0, 12)}…: ${(performance.now() - t0).toFixed(0)} ms`);
  }
});

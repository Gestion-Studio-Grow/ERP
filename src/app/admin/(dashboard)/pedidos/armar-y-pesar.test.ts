// ============================================================================
// ARMAR Y PESAR · ENTREGA Y COBRO CON EL PIE — Magra, tanda 1 · 1C (magra-DISENO.md §2.2, §5).
// ============================================================================
//
// Las cuentas de la pantalla Armar (`armar-core.ts`, las mismas que usan sus acciones) con los
// números del catálogo MG-xxx, y lo que la entrega y el cobro de la bandeja le mandan al servidor
// con el PIE DE COBRO (`camposDelPie` → `leerPagos`, la lectura REAL de `cobrarPedido` y
// `entregarPedido`). Al final, la forma de los archivos: lo nuevo va detrás del interruptor y el
// ticket es el de Vender, importado sin editar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  aplicarLectura,
  avisoDelListo,
  agregadoDelListo,
  camposDelArmado,
  confirmarPeso,
  corregirPeso,
  cuentaDelArmado,
  leerPedidoOriginal,
  pedidoOriginalDe,
  renglonesDelArmado,
  textoDeLaDiferencia,
  textoDelDesvio,
  textoDifCantidad,
  textoDifPlata,
  type LineaDelPedido,
  type RenglonDelArmado,
} from "./[code]/armar/armar-core";
import { camposDelPie, resultadoDeLaDivision, vueltoDelResultado } from "@/lib/cobro/pie-de-cobro-core";
import { leerPagos, vueltoDelCobro } from "@/lib/cobro/leer-pagos";
import { confirmacionDePeso } from "@/lib/pos-peso";
import { NOMBRE_LINEA_ENVIO } from "@/lib/venta-reglas";

// El pedido #128 de Ana: 0,5 kg de vacío a $28.600/kg (precio del pedido) + 6 chorizos a $1.900.
const PEDIDO_128: LineaDelPedido[] = [
  { productId: "p_vacio", name: "Vacío", saleUnit: "WEIGHT", quantity: 0.5, unitPrice: 28600, lineTotal: 14300 },
  { productId: "p_chorizo", name: "Chorizo", saleUnit: "UNIT", quantity: 6, unitPrice: 1900, lineTotal: 11400 },
];
const ANTES_128 = { subtotal: 25700, descuento: 0, cupon: null, totalPedido: 25700 };

const conTexto = (rs: RenglonDelArmado[], productId: string, texto: string) =>
  rs.map((r) => (r.productId === productId ? { ...r, texto } : r));

test("MG-024: la etiqueta de 0,62 kg tilda el vacío, +0,120 kg · +$3.432 y el total pasa a $29.132", () => {
  const rs = renglonesDelArmado(PEDIDO_128, null);
  const r = aplicarLectura(rs, { tipo: "etiqueta", productId: "p_vacio", kg: 0.62, importeEtiqueta: 17732, precioSistema: 29900 });
  assert.equal(r.tono, "ok");
  const vacio = r.renglones.find((x) => x.productId === "p_vacio")!;
  assert.equal(vacio.listo, true);
  assert.equal(vacio.texto, "0,62");
  assert.equal(r.activo, vacio.key);
  const c = cuentaDelArmado(r.renglones, [], ANTES_128);
  const cv = c.renglones.find((x) => x.productId === "p_vacio")!;
  assert.equal(cv.total, 17732); // 0,620 × $28.600, al precio del pedido
  assert.equal(textoDifCantidad(cv.difCantidad, cv.unidad), "+0,12 kg");
  assert.equal(textoDifPlata(cv.difPlata), "+$3.432");
  assert.equal(c.total, 29132);
  assert.equal(c.diferencia, 3432);
  assert.equal(c.totalPedido, 25700);
});

test("MG-026: el precio del pedido manda; el de hoy ($29.900) o el de la etiqueta no se usan", () => {
  const rs = aplicarLectura(renglonesDelArmado(PEDIDO_128, null), {
    tipo: "etiqueta",
    productId: "p_vacio",
    kg: 0.62,
    importeEtiqueta: 18538,
    precioSistema: 29900,
  }).renglones;
  const c = cuentaDelArmado(rs, [], ANTES_128);
  assert.equal(c.renglones[0].precio, 28600);
  assert.equal(c.total, 29132);
  assert.ok(!JSON.stringify(c).includes("29900"));
});

test("MG-025: +24 % pasa la tolerancia: hay aviso de la diferencia con los dos pesos y el total nuevo", () => {
  const rs = conTexto(renglonesDelArmado(PEDIDO_128, null), "p_vacio", "0,62");
  const c = cuentaDelArmado(rs, [], ANTES_128);
  assert.equal(c.mayorDesvio?.productId, "p_vacio");
  assert.equal(textoDelDesvio(c.mayorDesvio!.desvio!), "24 % más");
  const texto = textoDeLaDiferencia({
    cliente: "Ana Pérez",
    code: 128,
    negocio: "MAGRA",
    renglones: c.renglones.map((r) => ({ nombre: r.nombre, unidad: r.unidad, pidio: r.pidio, qty: r.qty })),
    totalPedido: c.totalPedido,
    total: c.total,
  });
  assert.equal(
    texto,
    "Hola Ana, te escribo de MAGRA por tu pedido #128. Vacío: pesó 0,62 kg (pediste 0,5 kg). El total queda en $29.132 (antes $25.700). ¿Te lo dejamos así? Si preferís, lo ajustamos.",
  );
  // Justo en el borde (15 %) no avisa, como `desvioDelPeso`.
  const borde = cuentaDelArmado(conTexto(renglonesDelArmado(PEDIDO_128, null), "p_vacio", "0,575"), [], ANTES_128);
  assert.equal(borde.mayorDesvio, null);
});

test("el desvío se mide contra lo que PIDIÓ la clienta (fila original), no contra la última pesada", () => {
  // Ya se pesó una vez a 0,62: el pedido hoy tiene 0,62 y la fila original dice 0,5.
  const hoy: LineaDelPedido[] = [{ ...PEDIDO_128[0], quantity: 0.62, lineTotal: 17732 }, PEDIDO_128[1]];
  const original = leerPedidoOriginal(
    JSON.parse(JSON.stringify({ code: 128, ...pedidoOriginalDe({ items: PEDIDO_128, subtotal: 25700, discount: 0, total: 25700 }) })),
  );
  assert.ok(original);
  const rs = renglonesDelArmado(hoy, original);
  assert.equal(rs[0].pidio, 0.5);
  assert.equal(rs[0].guardado, 0.62);
  const c = cuentaDelArmado(rs, [], { subtotal: 29132, descuento: 0, cupon: null, totalPedido: original!.total });
  assert.equal(c.totalPedido, 25700);
  assert.equal(c.diferencia, 3432);
  assert.equal(c.cambio, false, "sin tocar nada no hay nada que guardar");
  // Sin fila (o una fila rota), lo pedido es lo de hoy.
  assert.equal(leerPedidoOriginal({ lineas: "x" }), null);
  assert.equal(renglonesDelArmado(hoy, null)[0].pidio, 0.62);
});

test("MG-027: «1500» frena con «¿Son 1.500 kg de verdad?» y «No, es 1,5 kg» lo corrige", () => {
  const rs = conTexto(renglonesDelArmado(PEDIDO_128, null), "p_vacio", "1500");
  const c = cuentaDelArmado(rs, [], ANTES_128);
  assert.equal(c.porConfirmar?.productId, "p_vacio");
  const p = confirmacionDePeso({ valor: 1500, saleUnit: "WEIGHT" })!;
  assert.match(p.pregunta, /^¿Son 1\.500 kg de verdad\?/);
  assert.equal(p.corregir, "No, es 1,5 kg");
  const corregido = rs.map((r) => (r.productId === "p_vacio" ? corregirPeso(r) : r));
  assert.equal(corregido[0].texto, "1,5");
  assert.equal(cuentaDelArmado(corregido, [], ANTES_128).porConfirmar, null);
  // «Sí, son 1500 kg» confirma ESE peso; si después lo cambia por otro sospechoso, vuelve a preguntar.
  const si = rs.map((r) => (r.productId === "p_vacio" ? confirmarPeso(r) : r));
  assert.equal(cuentaDelArmado(si, [], ANTES_128).porConfirmar, null);
  assert.equal(cuentaDelArmado(conTexto(si, "p_vacio", "2000"), [], ANTES_128).porConfirmar?.productId, "p_vacio");
});

test("MG-028: el aviso de «Listo y avisar» suma el peso real y cómo pagar si no está pago", () => {
  const base = "Hola Ana, tu pedido #128 de MAGRA ya está listo para retirar. Total a pagar: $29.132,00. ¡Gracias!";
  const agregado = agregadoDelListo({ renglones: [{ nombre: "Vacío", unidad: "WEIGHT", pidio: 0.5, qty: 0.62 }], pagado: false });
  assert.equal(
    avisoDelListo(base, agregado),
    "Hola Ana, tu pedido #128 de MAGRA ya está listo para retirar. Total a pagar: $29.132,00. Vacío: pesó 0,62 kg (pediste 0,5 kg). Podés pagar en efectivo, con Mercado Pago o por transferencia. ¡Gracias!",
  );
  assert.equal(agregadoDelListo({ renglones: [{ nombre: "Vacío", unidad: "WEIGHT", pidio: 0.5, qty: 0.5 }], pagado: true }), "");
  assert.equal(avisoDelListo(base, ""), base);
});

test("MG-029 / lector: el código del chorizo lo tilda; el de un corte por kilo lo deja activo esperando el peso", () => {
  const rs = renglonesDelArmado(PEDIDO_128, null);
  const chorizo = aplicarLectura(rs, { tipo: "codigo", productId: "p_chorizo", cantidad: 1 });
  assert.equal(chorizo.renglones[1].listo, true);
  assert.equal(chorizo.renglones[1].texto, "6", "la cantidad pedida no cambia: se corrige con − / +");
  const vacio = aplicarLectura(rs, { tipo: "codigo", productId: "p_vacio", cantidad: null });
  assert.equal(vacio.activo, rs[0].key);
  assert.equal(vacio.renglones[0].listo, false);
  assert.equal(aplicarLectura(rs, { tipo: "texto", texto: "vaci" }).activo, rs[0].key, "sin acentos ni mayúsculas");
  const ajeno = aplicarLectura(rs, { tipo: "codigo", productId: "p_entrana", cantidad: 1 });
  assert.equal(ajeno.tono, "error");
  assert.deepEqual(ajeno.renglones, rs);
});

test("«Quitar» saca el renglón: no viaja al servidor y el total baja; sacar todo no se puede guardar", () => {
  const rs = conTexto(renglonesDelArmado(PEDIDO_128, null), "p_chorizo", "0");
  assert.deepEqual(camposDelArmado("ord_128", rs), [
    ["id", "ord_128"],
    ["productId", "p_vacio"],
    ["quantity", "0.5"],
  ]);
  const c = cuentaDelArmado(rs, [], ANTES_128);
  assert.equal(c.total, 14300);
  assert.equal(c.sinLineas, false);
  assert.equal(cuentaDelArmado(conTexto(rs, "p_vacio", "0"), [], ANTES_128).sinLineas, true);
});

test("el envío queda igual y no es base del descuento (la misma cuenta que el servidor)", () => {
  const envio: LineaDelPedido = { productId: null, name: NOMBRE_LINEA_ENVIO, saleUnit: "UNIT", quantity: 1, unitPrice: 4000, lineTotal: 4000 };
  // 10 % de $25.700 = $2.570 de descuento sobre lo que se compra.
  const c = cuentaDelArmado(conTexto(renglonesDelArmado(PEDIDO_128, null), "p_vacio", "0,62"), [envio], {
    subtotal: 29700,
    descuento: 2570,
    cupon: null,
    totalPedido: 27130,
  });
  assert.equal(c.envio, 4000);
  assert.equal(c.descuento, 2913.2); // 10 % de $29.132
  assert.equal(c.total, 30218.8); // 29.132 + 4.000 − 2.913,20
});

test("MG-012: Entregar → Efectivo → $30.000 cobra $25.700 con «Vuelto $4.300»", () => {
  const res = { modo: "simple" as const, medio: "EFECTIVO" as const, recibido: 30000 };
  assert.equal(vueltoDelResultado(25700, res), 4300);
  const fd = new FormData();
  for (const [k, v] of [["id", "ord_128"], ...camposDelPie(25700, res)]) fd.append(k, v);
  const p = leerPagos((c) => fd.getAll(c).map(String));
  assert.ok(p.ok);
  assert.equal(p.medio, "EFECTIVO");
  assert.equal(p.asientos, null);
  assert.equal(vueltoDelCobro({ total: 25700, medio: p.medio, asientos: p.asientos, recibido: p.recibido }), 4300);
});

test("MG-006: entregar dividido, Efectivo $10.000 + Transferencia el resto: dos asientos que suman $25.700, principal Transferencia", () => {
  const d = resultadoDeLaDivision(25700, [
    { medio: "EFECTIVO", montoTexto: "10000" },
    { medio: "TRANSFERENCIA", montoTexto: "" },
  ]);
  assert.ok(d.ok);
  const fd = new FormData();
  for (const [k, v] of [["id", "ord_128"], ...camposDelPie(25700, d.resultado)]) fd.append(k, v);
  const p = leerPagos((c) => fd.getAll(c).map(String));
  assert.ok(p.ok);
  assert.equal(p.medio, "TRANSFERENCIA");
  assert.deepEqual(p.asientos, [
    { medio: "EFECTIVO", monto: 10000 },
    { medio: "TRANSFERENCIA", monto: 15700 },
  ]);
});

// ── La forma de los archivos ─────────────────────────────────────────────────

const leer = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("entrega y cobro con el pie de cobro único y el ticket de Vender, detrás del interruptor", () => {
  const cobro = leer("./CobroDelPedido.tsx");
  assert.match(cobro, /import \{ PieDeCobro, type ResultadoDelPie \} from "@\/components\/cobro\/PieDeCobro";/);
  assert.match(cobro, /import TicketVenta from "\.\.\/vender\/TicketVenta";/);
  assert.match(cobro, /if \(boutique && conMedios\) return <CobroConPie/);
  // MG-014: «Queda a cobrar» entrega sin medio, con el campo de siempre.
  assert.match(cobro, /\["quedaACobrar", "on"\]/);
  for (const f of ["./EntregarPedidoForm.tsx", "./CobrarPedidoForm.tsx"]) {
    const s = leer(f);
    assert.match(s, /const \{ boutique \} = useCobroDelNegocio\(\);/, f);
    assert.match(s, /<CobroConPie /, f);
  }
  const pagina = leer("./page.tsx");
  assert.match(pagina, /const boutique = comercio && mostradorBoutiquePrendido\(interruptores\);/);
  assert.equal(pagina.match(/<CobroDelNegocio boutique=\{boutique\}/g)?.length, 2, "las dos bandejas");
  // Una sola puerta para vender: con el interruptor, el link dice «Vender» y no se arma el mostrador acá.
  assert.match(pagina, /\{boutique \? "Vender" : "Cobrar en el mostrador"\}/);
  assert.match(pagina, /const conMostradorUnico = !modeloNuevo && !boutique &&/);
});

test("Armar va detrás del interruptor y guarda lo que pidió la clienta antes del primer ajuste", () => {
  const pagina = leer("./[code]/armar/page.tsx");
  assert.match(pagina, /if \(!identidad\.isRetail \|\| !mostradorBoutiquePrendido\(interruptores\)\) redirect\("\/admin\/pedidos"\);/);
  assert.match(pagina, /where: \{ tenantId, code \}/);
  const acciones = leer("./[code]/armar/acciones.ts");
  assert.match(acciones, /^"use server";/);
  assert.equal(acciones.match(/await requireCapability\("orders:manage"\);/g)?.length, 3, "cada endpoint pide orders:manage");
  assert.match(acciones, /action: ACCION_PEDIDO_ORIGINAL,/);
  assert.match(acciones, /return updateOrderItems\(null, formData\);/);
  const ajuste = leer("./AjustarPedidoForm.tsx");
  assert.match(ajuste, /guardar = updateOrderItems,/, "sin el interruptor, la acción de siempre");
  assert.match(ajuste, /\{conQuitar && \(/);
});

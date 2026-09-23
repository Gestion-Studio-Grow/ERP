// ============================================================================
// La compra a proveedor ASIENTA la plata que salió — y la asienta UNA vez, en la
// MISMA transacción que el stock.
// ============================================================================
//
// El defecto que esto guarda: `insertStockPurchase` registraba la compra, sumaba el
// stock y no escribía un peso en el libro de caja. El cierre del día terminaba con un
// faltante exactamente igual a lo que se le había pagado al proveedor, y `cerrarDia` lo
// dejaba asentado como "Diferencia de caja" imborrable. La alternativa era tipear el
// egreso a mano en otra pantalla: doble carga, importe re-tipeado, sin vínculo entre las
// dos filas.
//
// Dos frentes, sin DB (ADR-026):
//   1. UNIDAD de la decisión pura (`decidirEgresoDeCompra`): cuándo corresponde egreso,
//      por qué medio, con qué fecha contable, y qué queda escrito en el detalle.
//   2. FORMA del archivo que persiste (`purchase-core.ts`) y del libro
//      (`libro-caja-actions.ts`). La atomicidad y la dirección única no son valores que
//      devuelva una función: son propiedades de DÓNDE está escrita cada línea, y eso
//      sólo lo atrapa algo que mire el archivo (mismo criterio que audit-superficie.test.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COMPRA_ACTOR_PREFIX,
  PAGO_POR_DEFECTO,
  compraMarker,
  decidirEgresoDeCompra,
  diaContableDelEgreso,
  esEgresoDeCompra,
  type PagoDeCompra,
} from "./purchase-egreso";

const leer = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const BASE = {
  kind: "COMPRA" as const,
  purchaseId: "sp_1",
  code: 12,
  supplier: "Distribuidora Norte",
  totalCost: 150000,
  pago: { estado: "PAGADA", method: "EFECTIVO" } as PagoDeCompra,
  hoy: "2026-09-16",
  cerradoHasta: null as string | null,
};

// ── 1. La decisión pura ─────────────────────────────────────────────────────

test("una compra pagada asienta un EGRESO por el total, con el medio informado", () => {
  const d = decidirEgresoDeCompra(BASE);
  assert.ok(d.asienta);
  assert.equal(d.egreso.type, "EGRESO");
  assert.equal(d.egreso.amount, 150000);
  assert.equal(d.egreso.method, "EFECTIVO");
  assert.equal(d.egreso.dia, "2026-09-16");
  assert.equal(d.egreso.medioAsumido, false);
  assert.equal(d.egreso.diferidoPorCierre, false);
  assert.equal(d.egreso.reason, "Compra #12 · Distribuidora Norte");
  assert.equal(d.egreso.createdBy, "compra:sp_1");
});

test("el monto se redondea a 2 decimales: el libro no arrastra centavos binarios", () => {
  const d = decidirEgresoDeCompra({ ...BASE, totalCost: 0.1 + 0.2 });
  assert.ok(d.asienta);
  assert.equal(d.egreso.amount, 0.3);
});

test("MP y TARJETA viajan tal cual: el medio lo decide quien pagó, no este módulo", () => {
  for (const method of ["MP", "TARJETA"] as const) {
    const d = decidirEgresoDeCompra({ ...BASE, pago: { estado: "PAGADA", method } });
    assert.ok(d.asienta);
    assert.equal(d.egreso.method, method);
    assert.equal(d.egreso.medioAsumido, false);
  }
});

test("una REPOSICIÓN no asienta egreso: no es una compra, no salió plata", () => {
  const d = decidirEgresoDeCompra({ ...BASE, kind: "REPOSICION" });
  assert.equal(d.asienta, false);
  assert.equal(d.asienta === false && d.motivo, "reposicion-interna");
});

test("una compra A CUENTA CORRIENTE no asienta egreso: la plata sale cuando se paga", () => {
  const d = decidirEgresoDeCompra({ ...BASE, pago: { estado: "CUENTA_CORRIENTE" } });
  assert.equal(d.asienta, false);
  assert.equal(d.asienta === false && d.motivo, "cuenta-corriente");
});

test("sin costo no hay nada que asentar (0, negativo o basura)", () => {
  for (const totalCost of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const d = decidirEgresoDeCompra({ ...BASE, totalCost });
    assert.equal(d.asienta, false, `totalCost=${totalCost}`);
    assert.equal(d.asienta === false && d.motivo, "sin-costo");
  }
});

// ── Medio no informado ──────────────────────────────────────────────────────
//
// El formulario de /admin/compras todavía no pregunta cómo se pagó. Se asume EFECTIVO,
// pero el punto del test es que NO se asuma en silencio: si la marca desaparece del
// detalle, la dueña deja de tener forma de enterarse de que ese medio lo puso el sistema.

test("sin medio informado asume efectivo y lo DICE en el detalle", () => {
  const d = decidirEgresoDeCompra({ ...BASE, pago: { estado: "PAGADA", method: null } });
  assert.ok(d.asienta);
  assert.equal(d.egreso.method, "EFECTIVO");
  assert.equal(d.egreso.medioAsumido, true);
  assert.match(d.egreso.reason, /medio no informado/);
});

test("PAGO_POR_DEFECTO es el que aplica cuando el llamador no manda nada, y viene marcado", () => {
  const d = decidirEgresoDeCompra({ ...BASE, pago: PAGO_POR_DEFECTO });
  assert.ok(d.asienta);
  assert.equal(d.egreso.medioAsumido, true);
});

// ── Día cerrado ─────────────────────────────────────────────────────────────

test("si hoy ya está cerrado, el egreso se imputa al PRIMER DÍA ABIERTO y lo aclara", () => {
  const d = decidirEgresoDeCompra({ ...BASE, hoy: "2026-09-16", cerradoHasta: "2026-09-16" });
  assert.ok(d.asienta);
  assert.equal(d.egreso.dia, "2026-09-17");
  assert.equal(d.egreso.diferidoPorCierre, true);
  assert.match(d.egreso.reason, /día ya cerrado/);
  assert.match(d.egreso.reason, /2026-09-16/); // la fecha REAL del pago no se pierde
});

test("diaContableDelEgreso: sin cierre y con cierre viejo, el día es hoy", () => {
  assert.equal(diaContableDelEgreso("2026-09-16", null), "2026-09-16");
  assert.equal(diaContableDelEgreso("2026-09-16", "2026-09-10"), "2026-09-16");
});

test("diaContableDelEgreso: un cierre que abarca hoy empuja al día siguiente, cruzando el mes", () => {
  assert.equal(diaContableDelEgreso("2026-09-30", "2026-09-30"), "2026-10-01");
});

// ── La marca ────────────────────────────────────────────────────────────────

test("la marca identifica la compra y se reconoce con esEgresoDeCompra", () => {
  assert.equal(compraMarker("sp_9"), `${COMPRA_ACTOR_PREFIX}sp_9`);
  assert.ok(esEgresoDeCompra({ createdBy: compraMarker("sp_9") }));
  assert.ok(!esEgresoDeCompra({ createdBy: "user:u1" }));
  assert.ok(!esEgresoDeCompra({ createdBy: "cierre-diario:2026-09-16" }));
  assert.ok(!esEgresoDeCompra({ createdBy: null }));
});

test("un proveedor larguísimo se recorta: el detalle se lee en una tabla angosta", () => {
  const d = decidirEgresoDeCompra({ ...BASE, supplier: "X".repeat(200), pago: { estado: "PAGADA", method: null } });
  assert.ok(d.asienta);
  assert.ok(d.egreso.reason.length < 140, d.egreso.reason);
  assert.match(d.egreso.reason, /medio no informado/); // la aclaración sobrevive al recorte
});

// ── 2. La forma de los archivos que persisten ───────────────────────────────

test("el egreso se escribe DENTRO de la única tenantTransaction de insertStockPurchase", () => {
  const core = leer("./purchase-core.ts");

  const aperturas = core.match(/tenantTransaction\(/g) ?? [];
  assert.equal(
    aperturas.length,
    1,
    "una segunda transacción para la caja reintroduce el defecto: la compra podría quedar " +
      "registrada con el stock adentro y el egreso perdido.",
  );

  const inicioTx = core.indexOf("await tenantTransaction(");
  const create = core.indexOf("tx.cashMovement.create(");
  const ledger = core.indexOf("await recordMovement(");
  assert.ok(inicioTx > 0 && create > inicioTx, "el asiento de caja tiene que estar dentro de la tx");
  assert.ok(ledger > inicioTx, "el movimiento de stock tiene que estar dentro de la misma tx");

  assert.ok(
    !/prisma\.cashMovement/.test(core),
    "el asiento no puede usar el cliente global `prisma`: quedaría fuera de la transacción.",
  );
});

test("insertStockPurchase pre-chequea la marca antes de crear el egreso (idempotencia)", () => {
  const core = leer("./purchase-core.ts");
  const chequeo = core.indexOf("tx.cashMovement.findFirst(");
  const create = core.indexOf("tx.cashMovement.create(");
  assert.ok(chequeo > 0, "falta el pre-chequeo por marca: registrar dos veces asentaría dos egresos");
  assert.ok(chequeo < create, "el pre-chequeo va ANTES del create");
  assert.match(core.slice(chequeo, create), /createdBy: e\.createdBy/);
});

test("el libro NO deja borrar el egreso que asentó una compra (dirección única)", () => {
  const libro = leer("../libro-caja-actions.ts");
  const borrar = libro.indexOf("export async function deleteLibroEntry");
  assert.ok(borrar > 0);
  assert.match(
    libro.slice(borrar),
    /esEgresoDeCompra\(found\)/,
    "sin esta guarda, borrar la fila deja la mercadería adentro y la plata como si nunca " +
      "hubiera salido — el mismo agujero que asentar el egreso vino a tapar.",
  );
});

test("el libro AVISA si alguien tipea a mano un egreso que la compra ya asentó", () => {
  const libro = leer("../libro-caja-actions.ts");
  assert.match(
    libro,
    /createdBy: \{ startsWith: COMPRA_ACTOR_PREFIX \}/,
    "la costumbre de tipear el gasto del proveedor a mano sigue viva: sin el aviso, el " +
      "gasto queda dos veces y la caja cierra de menos.",
  );
  assert.match(libro, /origen === "compra"/);
});

// ── 3. El medio de pago lo PREGUNTA el formulario ───────────────────────────
//
// El sistema asentaba siempre EFECTIVO porque nadie preguntaba, y `StockPurchase` no tiene
// ninguna columna de la que derivarlo. Asumirlo mal descuadra el arqueo por el importe
// COMPLETO —faltante en una columna, sobrante en la otra— y además apagaba el aviso de
// duplicado del libro, que comparaba por medio. Estos tests son de forma a propósito: el
// defecto no fue una función mal escrita, fue un campo que no existía.

test("el formulario de compras pregunta cómo se pagó y no deja registrar sin elegirlo", () => {
  const form = leer("../../app/admin/(dashboard)/compras/ComprasForm.tsx");
  assert.match(
    form,
    /name="pago"/,
    "sin un control `name=\"pago\"` el medio nunca llega a la Server Action y se vuelve a asumir.",
  );
  assert.match(
    form,
    /isCompra && pago === ""/,
    "registrar una COMPRA sin medio tiene que estar deshabilitado. Una REPOSICIÓN interna no " +
      "mueve plata, así que ésa sí va sin medio.",
  );
});

test("la Server Action pasa el medio elegido a insertStockPurchase", () => {
  const action = leer("../stock-actions.ts");
  const desde = action.indexOf("export async function createStockPurchase");
  assert.ok(desde > 0, "stock-actions.ts ya no exporta createStockPurchase");
  const sig = action.indexOf("\nexport ", desde + 1);
  const cuerpo = action.slice(desde, sig === -1 ? undefined : sig);
  assert.match(cuerpo, /parseCashMethod\(formData\.get\("pago"\)\)/, "el medio se lee del formulario");
  assert.match(cuerpo, /pago: \{ estado: "PAGADA" as const, method \}/, "y se le pasa a insertStockPurchase");
});

test("la Server Action AUDITA el asiento de caja de la compra", () => {
  // `purchase-core.ts` afirmaba por escrito que "la Server Action lo audita" y no lo hacía.
  // `medioAsumido` es lo único que distingue un medio elegido de uno asumido: sin eso en la
  // auditoría, no hay manera de reconstruir después por qué una fila salió por esa columna.
  const action = leer("../stock-actions.ts");
  const desde = action.indexOf("export async function createStockPurchase");
  const sig = action.indexOf("\nexport ", desde + 1);
  const cuerpo = action.slice(desde, sig === -1 ? undefined : sig);
  assert.match(cuerpo, /egresoAsentado/);
  assert.match(cuerpo, /egresoMedioAsumido/);
  assert.match(cuerpo, /egresoMotivo/, "y por qué NO se asentó, cuando no se asienta");
});

test("el aviso de duplicado de un egreso del sistema NO exige que coincida el medio", () => {
  // `method` estuvo al tope del `where`, arriba del OR, así que las ramas del sistema
  // (`compra:`, `comision:`) exigían igualdad de medio — justo lo que no se puede dar por
  // cierto cuando el medio del asiento pudo haberse asumido. Con eso, el aviso se apagaba
  // exactamente en los casos en que más hacía falta.
  const libro = leer("../libro-caja-actions.ts");
  const i = libro.indexOf("const yaHay = await tx.cashMovement.findFirst(");
  assert.ok(i > 0, "no encontré la consulta del aviso de duplicado");
  const where = libro.slice(i, libro.indexOf("orderBy", i));
  const tope = where.slice(0, where.indexOf("OR: ["));
  assert.doesNotMatch(
    tope,
    /^\s*method,\s*$/m,
    "`method` volvió al tope del where: el aviso de las ramas del sistema vuelve a exigir " +
      "igualdad de medio y se apaga cuando el medio del asiento fue asumido.",
  );
  assert.match(where, /\{ type, reason: detail, occurredAt, method \}/, "la rama tipeada a mano sí compara el medio");
});

// ── 4. Lo tipeado en el remito → el egreso del libro ────────────────────────
//
// En CH el total de la compra ES el egreso que se asienta. Con los `<input type="number">`
// de antes, tecleando "12,5" el campo entregaba "125" (MEDIDO en Chromium 141, tabla en
// pos-peso.ts): la línea entraba diez veces al stock y el egreso salía diez veces más
// grande. Este test ejecuta el camino que hace hoy la Server Action: leer con las mismas
// funciones de pos-peso, armar las líneas con purchase-core y decidir el egreso.

import { cantidadDelFormulario, importeDelFormulario } from "../pos-peso";
import { buildPurchaseLines, purchaseTotal } from "./purchase-core";

function egresoDeUnaLinea(qtyTipeada: string, costoTipeado: string): number | null {
  const qty = cantidadDelFormulario(qtyTipeada, "Cantidad");
  const unitCost = importeDelFormulario(costoTipeado, "Costo") ?? 0;
  assert.ok(qty != null);
  const lines = buildPurchaseLines(
    [{ id: "p1", name: "Crema hidratante", unit: "kg" }],
    [{ productId: "p1", qty, unitCost }],
  );
  const d = decidirEgresoDeCompra({ ...BASE, totalCost: purchaseTotal(lines) });
  return d.asienta ? d.egreso.amount : null;
}

test("una línea de '12,5' kg a '$6.543' asienta un egreso de $81.787,50", () => {
  assert.equal(egresoDeUnaLinea("12,5", "$6.543"), 81787.5);
  // Lo mismo si viaja la forma canónica del hidden (punto decimal, sin miles).
  assert.equal(egresoDeUnaLinea("12.5", "6543"), 81787.5);
  // Con centavos y miles juntos, como en la factura del proveedor.
  assert.equal(egresoDeUnaLinea("12,5", "6.543,00"), 81787.5);
});

test("lo que asentaba el camino viejo con lo que entregaba el navegador: diez veces más", () => {
  // "12,5" tecleado en un type="number" → "125" (medido). 125 × 6543 = 817.875.
  assert.equal(egresoDeUnaLinea("125", "6543"), 817875);
});

test("un costo ilegible frena la compra con mensaje en vez de asentar un egreso de menos", () => {
  assert.throws(() => egresoDeUnaLinea("12,5", "6.5.43"), /no es un importe/);
  assert.throws(() => egresoDeUnaLinea("12,5kg3", "6543"), /no es una cantidad/);
});

test("la Server Action de compras lee con las funciones de pos-peso, no con Number()", () => {
  const action = leer("../stock-actions.ts");
  const desde = action.indexOf("function parseLines");
  assert.ok(desde > 0, "no encontré parseLines en stock-actions.ts");
  const cuerpo = action.slice(desde, action.indexOf("\n}\n", desde));
  assert.match(cuerpo, /cantidadDelFormulario\(/);
  assert.match(cuerpo, /importeDelFormulario\(/);
  assert.doesNotMatch(cuerpo, /Number\(/, "volvió un Number() crudo: '12.500' de costo se lee 12,5");
});

test("el formulario de compras no usa type=number y manda la forma canónica", () => {
  const form = leer("../../app/admin/(dashboard)/compras/ComprasForm.tsx");
  // Sin comentarios: el archivo cuenta POR QUÉ dejó el type=number, y eso no es usarlo.
  const codigo = form.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(codigo, /type="number"/, "con type=number el navegador se traga la coma");
  assert.match(form, /name="quantity" value=\{cantidadParaFormulario\(/);
  assert.match(form, /importeParaFormulario\(l\.unitCost\)/);
});

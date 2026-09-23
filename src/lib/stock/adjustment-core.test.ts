// Tests de la aritmética pura de los ajustes de stock (F2): cómo cada motivo traduce
// el valor cargado por el operador en un delta FIRMADO, y las reglas de motivo/nota.
// `insertStockAdjustment` (que toca Prisma) no se testea acá — se cubre la lógica de
// signo, que es donde vive el riesgo (convertir una baja en suba, o un recuento mal).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adjustmentDelta,
  motivoMode,
  requiresNote,
  buildReason,
  leerValorDeAjuste,
  leerLineasDeAjuste,
  filtroDeAjustables,
  horaDelConteo,
  leerMotivo,
  marcaDeConteo,
  mensajeDeTope,
  motivosDeAjuste,
  movidoDespuesDe,
  stockTeorico,
  superaElTope,
  topeDeMermaPorCarga,
  valorDeLaBaja,
  ADJUSTMENT_MOTIVOS,
  TOPE_MERMA_POR_CARGA,
  type AdjustmentMode,
} from "./adjustment-core";
import { rubroConPerecederos } from "@/blueprints/retail/rubros";

test("motivoMode: recuento cuenta, mermas restan, otro es delta firmado", () => {
  assert.equal(motivoMode("RECUENTO"), "COUNT");
  assert.equal(motivoMode("MERMA"), "LOSS");
  assert.equal(motivoMode("ROTURA"), "LOSS");
  assert.equal(motivoMode("VENCIMIENTO"), "LOSS");
  assert.equal(motivoMode("OTRO"), "SIGNED");
});

test("adjustmentDelta COUNT (recuento): delta = contado − stock actual", () => {
  assert.equal(adjustmentDelta("COUNT", 8, 10), -2); // faltan 2 respecto del sistema
  assert.equal(adjustmentDelta("COUNT", 12, 10), 2); // sobran 2
  assert.equal(adjustmentDelta("COUNT", 10, 10), 0); // coincide → no-op
});

test("adjustmentDelta LOSS (merma/rotura/vencimiento): siempre resta la magnitud", () => {
  assert.equal(adjustmentDelta("LOSS", 3, 10), -3);
  // Aunque el operador cargue negativo por error, una pérdida SIEMPRE baja.
  assert.equal(adjustmentDelta("LOSS", -3, 10), -3);
});

test("adjustmentDelta SIGNED (otro): respeta el signo del valor cargado", () => {
  assert.equal(adjustmentDelta("SIGNED", 5, 10), 5);
  assert.equal(adjustmentDelta("SIGNED", -5, 10), -5);
});

test("adjustmentDelta: redondea a 3 decimales (stock fraccional en kg)", () => {
  assert.equal(adjustmentDelta("COUNT", 9.25, 10), -0.75);
  assert.equal(adjustmentDelta("LOSS", 0.756, 10), -0.756);
});

test("adjustmentDelta: valor no numérico → 0 (línea inerte, no rompe el lote)", () => {
  assert.equal(adjustmentDelta("LOSS", NaN, 10), 0);
  assert.equal(adjustmentDelta("COUNT", NaN, 10), 0);
});

test("requiresNote: sólo OTRO exige nota (el resto la tiene en el motivo)", () => {
  assert.equal(requiresNote("OTRO"), true);
  assert.equal(requiresNote("MERMA"), false);
  assert.equal(requiresNote("RECUENTO"), false);
});

test("buildReason: motivo + nota; nunca vacío (reason obligatorio)", () => {
  assert.equal(buildReason("MERMA", "se cayó una caja"), "Merma — se cayó una caja");
  assert.equal(buildReason("RECUENTO", null), "Recuento");
  assert.equal(buildReason("RECUENTO", "   "), "Recuento"); // nota en blanco se ignora
});

// ── Lo que se tipea en la línea → el delta que se asienta ───────────────────
//
// El camino completo que usan la pantalla (preview) y la Server Action: texto tipeado →
// `leerValorDeAjuste` → `adjustmentDelta`. Si alguien vuelve a leer con `Number()`, estos
// casos se ponen rojos.

function deltaDeLoTipeado(mode: AdjustmentMode, raw: string, stock: number): number | null {
  const l = leerValorDeAjuste(mode, raw);
  return l.estado === "ok" ? adjustmentDelta(mode, l.valor, stock) : null;
}

test("recuento de '4,350' kg contra 10 kg en sistema: delta −5,65, el corte queda en 4,35", () => {
  const delta = deltaDeLoTipeado("COUNT", "4,350", 10);
  assert.equal(delta, -5.65);
  assert.equal(Math.round((10 + delta!) * 1000) / 1000, 4.35);
  // Lo que pasaba con el `type="number"`: tecleado "4,350" el campo entregaba "4350"
  // (medido, cabecera de pos-peso.ts) y el recuento SUBÍA el stock a 4350 kg.
  assert.equal(adjustmentDelta("COUNT", Number("4350"), 10), 4340);
});

test("recuento: punto y coma valen lo mismo, y contado 0 es un recuento válido", () => {
  assert.equal(deltaDeLoTipeado("COUNT", "4.350", 10), -5.65);
  assert.equal(deltaDeLoTipeado("COUNT", "0", 3.2), -3.2);
});

test("un contado ilegible NO produce delta (ni 0 − stock ni nada)", () => {
  for (const raw of ["abc", "4,3,5", "1.3.4", "-2", "4,350kg2"]) {
    assert.equal(leerValorDeAjuste("COUNT", raw).estado, "invalida", raw);
    assert.equal(deltaDeLoTipeado("COUNT", raw, 10), null, raw);
  }
  // Vacío tampoco: es un campo que todavía no se tocó.
  assert.equal(leerValorDeAjuste("COUNT", "").estado, "vacio");
});

test("merma: la cantidad perdida con coma resta; con signo es un error de tipeo", () => {
  assert.equal(deltaDeLoTipeado("LOSS", "0,750", 10), -0.75);
  assert.equal(leerValorDeAjuste("LOSS", "-0,750").estado, "invalida");
});

test("otro (delta firmado): el signo se respeta, con coma y con el menos del celular", () => {
  assert.equal(deltaDeLoTipeado("SIGNED", "-2,5", 10), -2.5);
  assert.equal(deltaDeLoTipeado("SIGNED", "\u22122,5", 10), -2.5);
  assert.equal(deltaDeLoTipeado("SIGNED", "+1,25", 10), 1.25);
  assert.equal(deltaDeLoTipeado("SIGNED", "3", 10), 3);
  // Un signo solo, o dos, no es un número.
  assert.equal(leerValorDeAjuste("SIGNED", "-").estado, "invalida");
  assert.equal(leerValorDeAjuste("SIGNED", "--2").estado, "invalida");
});

test("server: lee las líneas con la misma regla y lo que viaja canónico da lo mismo", () => {
  assert.deepEqual(leerLineasDeAjuste("COUNT", ["p1", "p2"], ["4,350", "4.35"]), [
    { productId: "p1", value: 4.35 },
    { productId: "p2", value: 4.35 },
  ]);
  assert.deepEqual(leerLineasDeAjuste("SIGNED", ["p1"], ["-2.5"]), [{ productId: "p1", value: -2.5 }]);
});

test("server: una línea ilegible RECHAZA el ajuste entero con mensaje, no se descarta callada", () => {
  assert.throws(
    () => leerLineasDeAjuste("COUNT", ["p1", "p2"], ["4,350", "abc"]),
    /Línea 2: "abc" no es una cantidad/,
  );
  assert.throws(() => leerLineasDeAjuste("COUNT", ["p1"], [""]), /Línea 1: falta el valor/);
  assert.throws(() => leerLineasDeAjuste("COUNT", ["p1", "p2"], ["1"]), /incompleto/);
});

test("server: la fila sin producto no es un error (no se pidió nada)", () => {
  assert.deepEqual(leerLineasDeAjuste("COUNT", ["", "p1"], ["", "2"]), [{ productId: "p1", value: 2 }]);
});

test("pantalla de ajustes: sin preelegido, sólo productos activos", () => {
  assert.deepEqual(filtroDeAjustables(), { active: true });
  assert.deepEqual(filtroDeAjustables(""), { active: true });
  assert.deepEqual(filtroDeAjustables("   "), { active: true });
  assert.deepEqual(filtroDeAjustables(null), { active: true });
});

test("pantalla de ajustes: el 'Recontar' de un producto INACTIVO lo trae igual", () => {
  // Sin esto, el enlace llegaba sin preselección (el id no estaba en la lista) y el stock de
  // un producto dado de baja no se podía corregir desde ningún lado.
  // Los activos siguen todos; de los inactivos, sólo ese id (no se abre la lista entera).
  assert.deepEqual(filtroDeAjustables("p-inactivo"), { OR: [{ active: true }, { id: "p-inactivo" }] });
  assert.deepEqual(filtroDeAjustables(" p-inactivo "), { OR: [{ active: true }, { id: "p-inactivo" }] });
});

// ── Recuento contra el stock teórico a la hora del conteo ───────────────────

const hora = (hhmm: string) => new Date(`2026-09-23T${hhmm}:00.000-03:00`);

test("criterio de aceptación: se cuenta a las 10:00, a las 10:05 se vende 1 kg, se guarda a las 10:10 → la diferencia es la real", () => {
  // A las 10:00 el sistema decía 10 kg de vacío y se contaron 9,5 (faltaba medio kilo).
  // 10:05: venta de 1 kg → el stock quedó en 9. 10:10: se guarda la planilla.
  const movimientos = [
    { productId: "vacio", qty: -2, createdAt: hora("09:30") }, // antes del conteo: no cuenta
    { productId: "vacio", qty: -1, createdAt: hora("10:05") },
    { productId: "lomo", qty: -3, createdAt: hora("10:06") }, // otro producto: no cuenta
  ];
  const stockAlGuardar = 9;
  const teorico = stockTeorico(stockAlGuardar, movidoDespuesDe(movimientos, "vacio", hora("10:00")));
  assert.equal(teorico, 10, "lo que el sistema tenía a las 10:00");
  const delta = adjustmentDelta("COUNT", 9.5, teorico);
  assert.equal(delta, -0.5, "faltaba medio kilo: eso es lo que se ajusta");
  assert.equal(stockAlGuardar + delta, 8.5, "y el stock queda en lo contado menos lo vendido después");
  // Lo de antes (comparar contra el stock al guardar) daba +0,5: la venta aparecía como sobrante.
  assert.equal(adjustmentDelta("COUNT", 9.5, stockAlGuardar), 0.5);
});

// La hora del conteo sale de DOS horas del teléfono (cuándo se tipeó y cuándo se tocó Guardar)
// y de la hora del servidor al recibir. Nunca de cuándo se armó la página.
const min = 60_000;

test("hora del conteo: 'hace cuánto se contó' medido en el teléfono, restado a la hora del servidor", () => {
  const ahora = hora("10:31"); // el servidor recibe
  // El teléfono atrasa 7 minutos: tipeó a las 10:23 de SU reloj y guardó a las 10:24 de SU reloj.
  const tipeo = hora("10:23").getTime();
  const envio = hora("10:24").getTime();
  assert.equal(horaDelConteo(String(tipeo), String(envio), ahora).getTime(), hora("10:30").getTime(), "se contó hace 1 minuto");
  // Igual con el teléfono adelantado una hora: lo único que cuenta es la diferencia.
  assert.equal(
    horaDelConteo(String(tipeo + 60 * min), String(envio + 60 * min), ahora).getTime(),
    hora("10:30").getTime(),
  );
  assert.equal(horaDelConteo(new Date(tipeo).toISOString(), new Date(envio).toISOString(), ahora).getTime(), hora("10:30").getTime(), "también en ISO");
});

test("hora del conteo: sin hora de envío, sin tipeo o con el reloj para atrás → ahora; más de un día → error", () => {
  const ahora = hora("10:10");
  const t = String(hora("10:00").getTime());
  assert.equal(horaDelConteo("", t, ahora), ahora);
  assert.equal(horaDelConteo("cualquiera", t, ahora), ahora);
  assert.equal(horaDelConteo(t, null, ahora), ahora, "un envío sin JavaScript compara contra el stock de ahora, como antes");
  assert.equal(horaDelConteo(t, String(hora("09:59").getTime()), ahora), ahora, "el reloj del teléfono fue para atrás");
  assert.throws(() => horaDelConteo(t, String(hora("10:00").getTime() + 25 * 60 * min), ahora), /más de un día/);
});

test("criterio del revisor: página armada a las 10:00, venta a las 10:20, se vuelve con Atrás a las 10:30 y se cuenta lo que hay", () => {
  // A las 10:00 el servidor arma la pantalla (el sistema dice 10 kg). Se va a otra pantalla. A
  // las 10:20 se vende 1 kg (queda 9). A las 10:30 se vuelve con Atrás: Next muestra la página
  // guardada de las 10:00. Se cuentan 9 kg (lo que hay de verdad) y se guarda a las 10:31.
  const movimientos = [{ productId: "x", qty: -1, createdAt: hora("10:20") }];
  const stockAlGuardar = 9;
  // Teléfono con el reloj en hora. Tipeo a las 10:30, envío a las 10:31.
  const [linea] = leerLineasDeAjuste("COUNT", ["x"], ["9"], {
    horas: [String(hora("10:30").getTime())],
    enviadoA: String(hora("10:31").getTime()),
    ahora: hora("10:31"),
  });
  assert.equal(linea.contadoA?.getTime(), hora("10:30").getTime());
  const teorico = stockTeorico(stockAlGuardar, movidoDespuesDe(movimientos, "x", linea.contadoA!));
  assert.equal(teorico, 9, "la venta de las 10:20 fue ANTES de contar: no se descuenta otra vez");
  assert.equal(adjustmentDelta("COUNT", 9, teorico), 0, "no falta nada");

  // La cuenta de antes: el desfase se medía contra la hora del servidor de cuando se ARMÓ la
  // página (10:00), y al volver con Atrás se medía a las 10:30 → la hora quedaba 30 min atrás.
  const desfaseViejo = hora("10:00").getTime() - hora("10:30").getTime();
  const contadoAViejo = new Date(hora("10:30").getTime() + desfaseViejo);
  const teoricoViejo = stockTeorico(stockAlGuardar, movidoDespuesDe(movimientos, "x", contadoAViejo));
  assert.equal(adjustmentDelta("COUNT", 9, teoricoViejo), -1, "así se inventaba un faltante de 1 kg");
});

test("marca del conteo: arranca con el primer número; seguir tipeando no la mueve; borrar y volver a escribir es contar de nuevo", () => {
  const t0 = hora("10:00").getTime();
  const primero = marcaDeConteo(undefined, "9", t0);
  assert.equal(primero, t0);
  assert.equal(marcaDeConteo({ texto: "9", contadoA: primero }, "9,5", t0 + 3000), t0, "corregir un dígito no lo mueve");
  assert.equal(marcaDeConteo({ texto: "9,5", contadoA: t0 }, "", t0 + 5000), null, "vacío: no hay conteo");
  assert.equal(marcaDeConteo({ texto: "", contadoA: null }, "8", t0 + 20 * min), t0 + 20 * min, "volver a escribir: conteo nuevo");
});

test("las líneas de un recuento traen su hora; el mismo producto dos veces es un error", () => {
  const ahora = hora("10:10");
  const l = leerLineasDeAjuste("COUNT", ["vacio", "lomo"], ["9,5", "3"], {
    horas: [String(hora("10:00").getTime()), ""],
    enviadoA: String(hora("10:10").getTime()),
    ahora,
  });
  assert.equal(l[0].contadoA?.getTime(), hora("10:00").getTime());
  assert.equal(l[1].contadoA, undefined, "sin hora: se compara contra el stock de ahora, como antes");
  assert.throws(() => leerLineasDeAjuste("COUNT", ["vacio", "vacio"], ["9", "8"]), /ya está contado en la línea 1/);
  // En una merma, dos líneas del mismo producto son dos pérdidas: se aceptan.
  assert.equal(leerLineasDeAjuste("LOSS", ["vacio", "vacio"], ["1", "2"]).length, 2);
});

// ── Motivos y tope de merma ─────────────────────────────────────────────────

test("motivos: en servicios los de siempre (CH no cambia); los de perecederos sólo donde se vende comida fresca", () => {
  assert.deepEqual(motivosDeAjuste({ esMostrador: false }), ADJUSTMENT_MOTIVOS);
  assert.deepEqual([...ADJUSTMENT_MOTIVOS], ["RECUENTO", "MERMA", "ROTURA", "VENCIMIENTO", "OTRO"]);
  // El dato sale del blueprint (`rubroConPerecederos`), el mismo que prende Lotes y Despiece.
  const carniceria = motivosDeAjuste({ esMostrador: true, perecederos: rubroConPerecederos("carniceria") });
  for (const m of ["DECOMISO", "CONSUMO_INTERNO", "DEGUSTACION"] as const) {
    assert.ok(carniceria.includes(m), m);
    assert.equal(motivoMode(m), "LOSS", `${m} siempre resta`);
  }
  assert.equal(carniceria[0], "MERMA", "en el mostrador la pantalla arranca en Merma");
  for (const rubroId of ["velas", "padel", null]) {
    const m = motivosDeAjuste({ esMostrador: true, perecederos: rubroConPerecederos(rubroId) });
    assert.equal(m[0], "MERMA");
    assert.ok(!m.includes("DECOMISO") && !m.includes("DEGUSTACION") && !m.includes("CONSUMO_INTERNO"), `${rubroId}: sin perecederos`);
    assert.ok(m.includes("RECUENTO") && m.includes("OTRO"));
  }
  // Un negocio de servicios no suma motivos de perecederos aunque le llegue el dato.
  assert.deepEqual(motivosDeAjuste({ esMostrador: false, perecederos: true }), ADJUSTMENT_MOTIVOS);
  assert.equal(leerMotivo("vencimiento"), "VENCIMIENTO");
  assert.equal(leerMotivo("inventado"), null, "un motivo que no existe NO se convierte en recuento");
});

test("tope de merma: la dueña sin tope; recepción hasta $50.000 por carga (provisional)", () => {
  assert.equal(topeDeMermaPorCarga("OWNER"), null);
  assert.equal(topeDeMermaPorCarga("RECEPTION"), TOPE_MERMA_POR_CARGA);
  assert.equal(TOPE_MERMA_POR_CARGA, 50_000);

  // Merma "vencido" de 2 kg de vacío a $6.543: $13.086 → pasa.
  const chica = valorDeLaBaja([{ delta: -2, costo: 6543 }]);
  assert.deepEqual(chica, { pesos: 13086, sinCosto: 0 });
  assert.equal(superaElTope(chica.pesos, topeDeMermaPorCarga("RECEPTION")), false);

  // 8 kg de lomo a $9.000 = $72.000 → recepción rechazada, la dueña no.
  const grande = valorDeLaBaja([{ delta: -8, costo: 9000 }, { delta: -1, costo: null }]);
  assert.deepEqual(grande, { pesos: 72000, sinCosto: 1 });
  assert.equal(superaElTope(grande.pesos, topeDeMermaPorCarga("RECEPTION")), true);
  assert.equal(superaElTope(grande.pesos, topeDeMermaPorCarga("OWNER")), false);

  // "Otro" que suma no es baja; "Otro" que resta, sí.
  assert.deepEqual(valorDeLaBaja([{ delta: 3, costo: 9000 }, { delta: -1, costo: 9000 }]), { pesos: 9000, sinCosto: 0 });
});

test("tope: el FALTANTE de un recuento cuenta como baja (antes se esquivaba cargándola como Recuento)", () => {
  // QA de la integración de la ola 2: recepción no podía dar de baja 20 kg de lomo como merma,
  // pero contando 0 lo lograba igual. Ahora el faltante del recuento pasa por el mismo tope.
  const faltante = valorDeLaBaja([{ delta: -20, costo: 9000 }]);
  assert.deepEqual(faltante, { pesos: 180000, sinCosto: 0 });
  assert.equal(superaElTope(faltante.pesos, topeDeMermaPorCarga("RECEPTION")), true, "recepción: rechazado");
  assert.equal(superaElTope(faltante.pesos, topeDeMermaPorCarga("OWNER")), false, "la dueña: sin tope");
  // El sobrante de un producto barato no compensa el faltante de uno caro.
  const mezclado = valorDeLaBaja([
    { delta: 500, costo: 100 },
    { delta: -6, costo: 9000 },
  ]);
  assert.deepEqual(mezclado, { pesos: 54000, sinCosto: 0 });
  assert.equal(superaElTope(mezclado.pesos, topeDeMermaPorCarga("RECEPTION")), true);
  // Un recuento chico (1 kg de vacío) o que sólo sobra no molesta a nadie.
  assert.equal(superaElTope(valorDeLaBaja([{ delta: -1, costo: 6543 }]).pesos, TOPE_MERMA_POR_CARGA), false);
  assert.deepEqual(valorDeLaBaja([{ delta: 3, costo: 9000 }]), { pesos: 0, sinCosto: 0 });
});

test("tope del recuento: el mensaje habla del faltante y, sin costos, no lleva montos", () => {
  const fmt = (n: number) => `$${n}`;
  const baja = { pesos: 180_000, tope: TOPE_MERMA_POR_CARGA };
  const sinCostos = mensajeDeTope(baja, false, fmt, "RECUENTO");
  assert.doesNotMatch(sinCostos, /\$|\d/, "ni el faltante ni el tope en pesos");
  assert.match(sinCostos, /faltante de este recuento pasa tu tope/);
  assert.match(sinCostos, /No se registró nada/);
  assert.match(mensajeDeTope(baja, true, fmt, "RECUENTO"), /\$180000.*\$50000/);
  // Sin motivo (o con una merma) el mensaje de siempre.
  assert.match(mensajeDeTope(baja, false, fmt), /Esta carga pasa tu tope/);
  assert.match(mensajeDeTope(baja, false, fmt, "VENCIMIENTO"), /Esta carga pasa tu tope/);
});

test("tope de merma: el rechazo no le muestra costos a quien no los ve", () => {
  const fmt = (n: number) => `$${n}`;
  // RECEPTION carga 1000 kg de vacío a $6.543: la baja es $6.543.000.
  const baja = { pesos: 6_543_000, tope: TOPE_MERMA_POR_CARGA };
  const sinCostos = mensajeDeTope(baja, false, fmt);
  assert.doesNotMatch(sinCostos, /\$|\d/, "ni el monto de la baja ni el tope: de ahí sale el costo por kilo");
  assert.match(sinCostos, /pasa tu tope/);
  assert.match(sinCostos, /No se registró nada/);
  assert.doesNotMatch(sinCostos, /partila/, "no se sugiere partir la carga para esquivar el tope");
  const conCostos = mensajeDeTope(baja, true, fmt);
  assert.match(conCostos, /\$6543000/);
  assert.match(conCostos, /\$50000/);
});

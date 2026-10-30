// N2 · M1 (Magra) — las reglas PURAS de caja y medios. La parte con base está en
// m1-caja-medios-postgres.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCierreDiario,
  columnaDelMovimiento,
  columnasDelCierre,
  conteoDelTurnoParaElCierre,
  mensajeTurnoAbierto,
  openingAfterCierre,
  ajustesAsMovements,
  pagadosDeMasDelPeriodo,
  puedeCerrarElDia,
  validarReabrirDia,
  validateCierre,
  type CierreMovement,
} from "@/lib/caja/cierre-diario";
import { openingFromHistory } from "@/lib/caja/libro-caja";
import {
  etiquetaDeMedio,
  leerMedioDeCobro,
  leerMedioDeCobroConTarjeta,
  mediosDeCobroDisponibles,
  tarjetaHabilitadaPor,
  textoDelPosnet,
} from "@/lib/caja/medio-cobro";
import { aperturaPideMotivo, detalleConMotivo, leerMotivoDeApertura, tarjetaDeApertura, textoDelMotivoDeApertura } from "@/lib/caja/apertura-sugerida";
import { causasProbables, revisarCierre } from "@/app/admin/(dashboard)/caja/cierre/revisar-cierre";

const sp = (s: string) => s.replace(/\s/g, " ");
const en = (dia: string) => new Date(`${dia}T15:00:00Z`);
let n = 0;
const mov = (p: Partial<CierreMovement> & Pick<CierreMovement, "method" | "amount">): CierreMovement => ({
  id: `m${++n}`,
  occurredAt: en("2026-10-20"),
  type: "VENTA",
  detail: "",
  ...p,
});

// ── C1 · Tarjeta ─────────────────────────────────────────────────────────────

test("Tarjeta se habilita sólo con el valor en la base Y en el cliente de Prisma", () => {
  assert.equal(tarjetaHabilitadaPor({ enLaBase: false, enElCliente: false }), false);
  assert.equal(tarjetaHabilitadaPor({ enLaBase: true, enElCliente: false }), false, "con la base sola Prisma rechaza el alta");
  assert.equal(tarjetaHabilitadaPor({ enLaBase: false, enElCliente: true }), false, "con el cliente solo la base rechaza el valor");
  assert.equal(tarjetaHabilitadaPor({ enLaBase: true, enElCliente: true }), true);
});

test("sin Tarjeta habilitada, los medios son los de siempre y DEBITO/CREDITO se siguen rechazando", () => {
  assert.deepEqual(mediosDeCobroDisponibles(false).map((m) => m.valor), ["EFECTIVO", "MERCADOPAGO", "TRANSFERENCIA"]);
  assert.deepEqual(mediosDeCobroDisponibles(true).map((m) => m.valor), ["EFECTIVO", "MERCADOPAGO", "TRANSFERENCIA", "DEBITO", "CREDITO"]);
  for (const t of ["DEBITO", "CREDITO"] as const) {
    assert.equal(leerMedioDeCobroConTarjeta(t, false), null);
    assert.equal(leerMedioDeCobroConTarjeta(t, true), t);
    assert.equal(leerMedioDeCobro(t), null, "el camino de siempre no cambia");
  }
  // D-C01: no hay un medio «TARJETA»; ni habilitada se acepta.
  assert.equal(leerMedioDeCobroConTarjeta("TARJETA", true), null);
  assert.equal(leerMedioDeCobroConTarjeta("MERCADOPAGO", false), "MERCADOPAGO");
  assert.equal(etiquetaDeMedio("DEBITO"), "Tarjeta de débito");
  assert.equal(etiquetaDeMedio("CREDITO"), "Tarjeta de crédito");
});

test("el protocolo sin señal dice cómo anotar el posnet, con y sin Tarjeta", () => {
  assert.equal(textoDelPosnet(false), "posnet: anotá en el cuaderno como TARJETA (débito o crédito).");
  assert.match(textoDelPosnet(true), /anotá en el cuaderno DÉBITO o CRÉDITO y, al cargarla, elegí Débito o Crédito/);
});

// ── C2 · columnas ────────────────────────────────────────────────────────────

test("columnas: Transferencia separada de MP por el medio de origen; Tarjeta sólo si se puede cobrar o se movió", () => {
  assert.equal(columnaDelMovimiento({ method: "MP", medioDeOrigen: "TRANSFERENCIA" }), "TRANSFERENCIA");
  assert.equal(columnaDelMovimiento({ method: "MP", medioDeOrigen: "MERCADOPAGO" }), "MP");
  assert.equal(columnaDelMovimiento({ method: "MP" }), "MP", "sin origen conocido: Mercado Pago");
  assert.equal(columnaDelMovimiento({ method: "EFECTIVO", medioDeOrigen: "TRANSFERENCIA" }), "EFECTIVO");
  assert.deepEqual(columnasDelCierre({ tarjetaHabilitada: false, tarjetaSeMovio: false }), ["EFECTIVO", "MP", "TRANSFERENCIA"]);
  assert.deepEqual(columnasDelCierre({ tarjetaHabilitada: true, tarjetaSeMovio: false }), ["EFECTIVO", "MP", "TRANSFERENCIA", "TARJETA"]);
  assert.deepEqual(columnasDelCierre({ tarjetaHabilitada: false, tarjetaSeMovio: true }), ["EFECTIVO", "MP", "TRANSFERENCIA", "TARJETA"]);
});

test("cierre por columnas: el esperado sale del libro, MP + Transferencia = MP del libro, la diferencia va a MP y el arrastre cierra", () => {
  const previous = [mov({ method: "MP", amount: 10_000, occurredAt: en("2026-10-19") }), mov({ method: "EFECTIVO", amount: 2_000, occurredAt: en("2026-10-19") })];
  const movements = [
    mov({ method: "EFECTIVO", amount: 5_000 }),
    mov({ method: "MP", amount: 4_000, medioDeOrigen: "MERCADOPAGO" }),
    mov({ method: "MP", amount: 3_000, medioDeOrigen: "TRANSFERENCIA" }),
    mov({ method: "MP", amount: 1_000, type: "EGRESO", medioDeOrigen: "TRANSFERENCIA" }),
  ];
  const columnas = columnasDelCierre({ tarjetaHabilitada: false, tarjetaSeMovio: false });
  const c = buildCierreDiario({
    day: "2026-10-20",
    previous,
    movements,
    columnas,
    declared: { EFECTIVO: 7_000, MP: 14_000, TRANSFERENCIA: 1_500, TARJETA: 3 },
  });
  assert.deepEqual(c.columnas, ["EFECTIVO", "MP", "TRANSFERENCIA"]);
  assert.equal(c.porColumna.MP.expected, 14_000, "saldo anterior + lo de Mercado Pago");
  assert.equal(c.porColumna.TRANSFERENCIA.expected, 2_000, "lo que se movió por transferencia en el período");
  assert.equal(c.porColumna.MP.expected + c.porColumna.TRANSFERENCIA.expected, c.porMedio.MP.expected);
  assert.equal(c.porColumna.TARJETA.declared, null, "una columna que no se cuenta no se declara");
  assert.equal(c.estado, "FALTANTE");
  assert.deepEqual(c.ajustes, [{ type: "EGRESO", method: "MP", amount: 500, detail: "Diferencia de caja 20/10/2026: faltante en Transferencia" }]);
  assert.equal(c.porMedio.MP.declared, 15_500);
  // El arrastre: el libro con el ajuste dice lo contado.
  const despues = openingFromHistory([...previous, ...movements, ...ajustesAsMovements(c, en("2026-10-20"))]);
  assert.deepEqual(despues, openingAfterCierre(c));
  assert.equal(despues.MP, 15_500);
});

test("sin `columnas`, el cierre es el de siempre: tres medios, MP junto", () => {
  const c = buildCierreDiario({
    day: "2026-10-20",
    previous: [],
    movements: [mov({ method: "MP", amount: 3_000, medioDeOrigen: "TRANSFERENCIA" })],
    declared: { EFECTIVO: 0, MP: 2_000, TARJETA: null },
  });
  assert.deepEqual(c.columnas, ["EFECTIVO", "MP", "TARJETA"]);
  assert.equal(c.porColumna.MP.expected, 3_000);
  assert.equal(c.porColumna.TRANSFERENCIA.expected, 0);
  assert.equal(c.ajustes[0].detail, "Diferencia de caja 20/10/2026: faltante en Mercado Pago");
  assert.equal(validateCierre(c, { note: "x", today: "2026-10-20", lastClosedDay: null }).ok, true);
});

test("la hoja revisa las columnas que manda el servidor (Transferencia incluida)", () => {
  const medios = ["EFECTIVO", "MP", "TRANSFERENCIA"] as const;
  const r = revisarCierre({
    declarado: { EFECTIVO: "15.000", MP: "4.000", TRANSFERENCIA: "2.500" },
    esperado: { EFECTIVO: 15_000, MP: 4_000, TRANSFERENCIA: 3_000 },
    etiquetas: { EFECTIVO: "Efectivo", MP: "Mercado Pago", TRANSFERENCIA: "Transferencia" },
    nota: "",
    medios,
  });
  assert.ok(!r.listo && r.campo === "nota", "con diferencia en Transferencia pide la nota");
  const ok = revisarCierre({
    declarado: { EFECTIVO: "15.000", MP: "", TRANSFERENCIA: "doscientos" },
    esperado: { EFECTIVO: 15_000, MP: 4_000, TRANSFERENCIA: 3_000 },
    etiquetas: { EFECTIVO: "Efectivo", MP: "Mercado Pago", TRANSFERENCIA: "Transferencia" },
    nota: "",
    medios,
  });
  assert.ok(!ok.listo && ok.campo === "TRANSFERENCIA", "lo ilegible se marca en su campo");
});

// ── C3 · apertura a ciegas ───────────────────────────────────────────────────

test("a ciegas la tarjeta no muestra el número; la diferencia exige motivo y queda en el detalle", () => {
  const t = tarjetaDeApertura({ esperado: 12_000, ultimoCierre: "2026-10-19", hoy: "2026-10-20", aCiegas: true });
  assert.deepEqual(t, { titulo: "Abrí la caja: contá lo que hay en el cajón", conSugerido: false, sugerido: 0 });
  assert.equal(tarjetaDeApertura({ esperado: 12_000, ultimoCierre: null, hoy: "2026-10-20" }).conSugerido, true, "apagado, la de siempre");
  assert.equal(aperturaPideMotivo({ diferencia: -2_000, motivo: null, exigido: true }), true);
  assert.equal(aperturaPideMotivo({ diferencia: -2_000, motivo: "faltó cambio", exigido: true }), false);
  assert.equal(aperturaPideMotivo({ diferencia: 0, motivo: null, exigido: true }), false, "cuadrando no se pide nada");
  assert.equal(aperturaPideMotivo({ diferencia: -2_000, motivo: null, exigido: false }), false, "sin el interruptor, opcional");
  assert.match(sp(textoDelMotivoDeApertura(10_000, 12_000)), /Contaste \$ ?10\.000 y el libro dice \$ ?12\.000: faltan \$ ?2\.000/);
  assert.equal(leerMotivoDeApertura("  faltó   el cambio "), "faltó el cambio");
  assert.equal(leerMotivoDeApertura("   "), null);
  assert.equal(leerMotivoDeApertura("x".repeat(400))?.length, 300);
  assert.equal(detalleConMotivo("Faltante al abrir", "faltó el cambio"), "Faltante al abrir. Motivo: faltó el cambio");
  assert.equal(detalleConMotivo("Faltante al abrir", null), "Faltante al abrir");
});

// ── C4 · C5 · C8 ─────────────────────────────────────────────────────────────

test("un solo conteo: se reusa lo contado al cerrar el turno sólo si el efectivo no se movió después", () => {
  const turno = { contado: 15_000, cerradoEl: new Date(), quien: "Ana" };
  assert.equal(conteoDelTurnoParaElCierre({ turno, esperadoEfectivo: 15_000 })?.vigente, true);
  assert.equal(conteoDelTurnoParaElCierre({ turno, esperadoEfectivo: 14_000 })?.vigente, false);
  assert.equal(conteoDelTurnoParaElCierre({ turno: null, esperadoEfectivo: 15_000 }), null);
  assert.equal(conteoDelTurnoParaElCierre({ turno: { ...turno, contado: null }, esperadoEfectivo: 15_000 }), null);
});

test("cierran el día la dueña/el dueño y el encargado; el turno abierto se rechaza con nombre", () => {
  assert.equal(puedeCerrarElDia("OWNER"), true);
  assert.equal(puedeCerrarElDia("ENCARGADO"), true);
  assert.equal(puedeCerrarElDia("RECEPTION"), false);
  assert.equal(puedeCerrarElDia(undefined), false);
  assert.match(mensajeTurnoAbierto({ quien: "Ana", hora: "09:12" }), /lo abrió Ana a las 09:12/);
});

// ── C6 · causas probables ────────────────────────────────────────────────────

test("causas probables: sólo lo que pasó, en criollo, y el vuelto de un pedido pagado de más", () => {
  assert.deepEqual(
    pagadosDeMasDelPeriodo([
      { orderId: "p1", total: 1_000, amount: 1_500, type: "VENTA" },
      { orderId: "p2", total: 1_000, amount: 600, type: "VENTA" },
      { orderId: "p2", total: 1_000, amount: 400, type: "VENTA" },
      { orderId: null, total: null, amount: 9_000, type: "VENTA" },
    ]),
    { cantidad: 1, monto: 500 },
  );
  const cero = { cantidad: 0, monto: 0 };
  assert.deepEqual(causasProbables(null), []);
  assert.deepEqual(causasProbables({ ventasSinCobrar: cero, repartoSinRendir: cero, pagadosDeMas: cero, cuadernoConFechaVieja: cero }), []);
  const c = causasProbables({
    ventasSinCobrar: { cantidad: 2, monto: 8_000 },
    repartoSinRendir: { cantidad: 1, monto: 8_000 },
    pagadosDeMas: { cantidad: 1, monto: 500 },
    cuadernoConFechaVieja: { cantidad: 1, monto: 12_000 },
  });
  assert.deepEqual(c.map((x) => x.id), ["sin-cobrar", "reparto", "pagados-de-mas", "cuaderno"]);
  assert.match(sp(c[1].texto), /^Rendición de reparto pendiente: 1 envío salió y no se rindió \(\$ ?8\.000.*cadete\)\.$/);
});

// ── C7 · reabrir el día ──────────────────────────────────────────────────────

test("reabrir: sólo la dueña, con motivo, el último día cerrado, nunca el corte ni un mes congelado", () => {
  const base: Parameters<typeof validarReabrirDia>[0] = {
    day: "2026-10-20",
    role: "OWNER",
    motivo: "faltó cargar una venta",
    ultimoCerrado: "2026-10-20",
    hayCierreDelDia: true,
    mesCongelado: false,
  };
  assert.deepEqual(validarReabrirDia(base), { ok: true });
  const error = (p: Partial<typeof base>) => {
    const v = validarReabrirDia({ ...base, ...p });
    return v.ok ? "" : v.error;
  };
  assert.match(error({ role: "RECEPTION" }), /Sólo la dueña o el dueño/);
  assert.match(error({ role: "ENCARGADO" }), /Sólo la dueña o el dueño/);
  assert.match(error({ motivo: "porque" }), /Escribí por qué/);
  assert.match(error({ ultimoCerrado: null }), /no está cerrado/);
  assert.match(error({ day: "2026-10-19" }), /Sólo se reabre el último día cerrado \(20\/10\/2026\)/);
  assert.match(error({ hayCierreDelDia: false }), /corte inicial/);
  assert.match(error({ mesCongelado: true }), /mes congelado/);
  // El cierre del día arrastraba días de un mes anterior congelado: reabrirlo los abriría (cert C7).
  assert.match(error({ mesCongeladoQueCubre: "septiembre de 2026" }), /también cubre días de septiembre de 2026, que está congelado/);
  assert.deepEqual(validarReabrirDia({ ...base, mesCongeladoQueCubre: null }), { ok: true });
  assert.match(error({ day: "20-10-2026" }), /No se entendió/);
});

// Cert F8 (causa raíz de F6/F7/F8): UNA redacción en el borde del servidor. A ciegas, lo que sale
// hacia la pantalla no trae ningún monto del libro de efectivo; sin ciegas, sale idéntico.
test("a ciegas, diaALaVista/cajaALaVista blanquean todo monto del efectivo del libro; sin ciegas, nada cambia", async () => {
  const { diaALaVista, cajaALaVista } = await import("@/lib/caja/arqueo-ciego-core");
  type Dia = Parameters<typeof diaALaVista>[0];
  const day = "2026-10-28";
  const at = new Date("2026-10-28T15:00:00Z");
  const fila = (id: string, type: CierreMovement["type"], method: CierreMovement["method"], amount: number): CierreMovement => ({ id, occurredAt: at, type, method, amount, detail: "" });
  // Segundo turno del día (el caso de la cert): fondo 12.000 + venta 3.000 en efectivo, y 4.321 por MP.
  const movs = [fila("ap", "APERTURA", "EFECTIVO", 12_345), fila("v1", "VENTA", "EFECTIVO", 3_017), fila("v2", "VENTA", "MP", 4_321)];
  const preview = buildCierreDiario({ day, since: null, previous: [fila("p", "VENTA", "EFECTIVO", 12_345)], movements: movs, declared: { EFECTIVO: null, MP: null, TARJETA: null } });
  const esperado = preview.porMedio.EFECTIVO.expected;
  assert.equal(esperado, 15_362);
  const dia = (efectivoACiegas: boolean): Dia => ({
    day, today: day, lastClosedDay: null, since: null, preview, efectivoACiegas,
    movements: movs.map((m) => ({ id: m.id, day, type: m.type, method: m.method, amount: m.amount, detail: "", origin: "pos" as const })),
    yaCerrado: false, enElFuturo: false, registro: null, turnosSinCerrar: null, columnas: preview.columnas, mediosDelLibro: preview.columnas, puedeCerrar: false, turnoAbierto: null,
    conteoDelTurno: { contado: esperado, quien: "Ana", cerradoEl: at, vigente: true },
    hechos: { ventasSinCobrar: { cantidad: 0, monto: 0 }, repartoSinRendir: { cantidad: 0, monto: 0 }, pagadosDeMas: [], cuadernoConFechaVieja: { cantidad: 1, monto: 3_017 } } as unknown as Dia["hechos"],
    reabrir: null,
  });
  const serializado = JSON.stringify(diaALaVista(dia(true)));
  for (const n of [esperado, 12_345, 3_017, 15_362 - 12_345]) assert.ok(!serializado.includes(String(n)), `a ciegas salió ${n}: ${serializado}`);
  assert.ok(serializado.includes("4321"), "el MP no se blanquea: va al banco, no al cajón");
  const ciega = diaALaVista(dia(true));
  assert.deepEqual(ciega.movements.map((m) => m.amount), [null, null, 4_321], "la fila en efectivo se ve, el monto no");
  assert.equal(ciega.conteoDelTurno, null);
  // Sin ciegas (turno abierto o interruptor apagado): el mismo objeto, nada se toca.
  const vista = dia(false);
  assert.equal(diaALaVista(vista), vista);
  // El turno de cajero: sin el esperado y sin «contó X sobre Y» de los turnos cerrados.
  const turnos = [{ id: "s1", closingCounted: 15_362, closingExpected: 15_362, closingDiff: 0 }];
  assert.deepEqual(cajaALaVista({ open: null, recentClosed: turnos, esperadoEnElCajon: 15_362, aperturaACiegas: true }), { open: null, recentClosed: [], esperadoEnElCajon: null, aperturaACiegas: true });
  const abierta = { open: null, recentClosed: turnos, esperadoEnElCajon: 15_362, aperturaACiegas: false };
  assert.equal(cajaALaVista(abierta), abierta);
});

// ── C2 · CashMethod.TRANSFERENCIA (orden del dueño 29/10/2026) ─────────────────

test("TRANSFERENCIA en el libro: sólo con el paquete; sin el dato, como siempre a MP", async () => {
  const { cashMethodFromPaymentMethod } = await import("@/lib/caja/cierre-diario");
  assert.equal(cashMethodFromPaymentMethod("TRANSFERENCIA"), "MP");
  assert.equal(cashMethodFromPaymentMethod("TRANSFERENCIA", false), "MP");
  assert.equal(cashMethodFromPaymentMethod("TRANSFERENCIA", true), "TRANSFERENCIA");
  // El resto no cambia con el dato.
  assert.equal(cashMethodFromPaymentMethod("MERCADOPAGO", true), "MP");
  assert.equal(cashMethodFromPaymentMethod("DEBITO", true), "TARJETA");
});

test("cierre con TRANSFERENCIA en el libro (F2): su columna = lo que entró en el período, sin saldo; la diferencia va a TRANSFERENCIA y el arrastre cierra", () => {
  const previous = [
    mov({ method: "MP", amount: 10_000, occurredAt: en("2026-10-19") }),
    mov({ method: "TRANSFERENCIA", amount: 6_000, occurredAt: en("2026-10-19") }),
  ];
  const movements = [
    mov({ method: "MP", amount: 4_000, medioDeOrigen: "MERCADOPAGO" }),
    // Un asiento de antes del paquete, del mismo período: transferencia guardada en MP.
    mov({ method: "MP", amount: 3_000, medioDeOrigen: "TRANSFERENCIA" }),
    mov({ method: "TRANSFERENCIA", amount: 2_000, medioDeOrigen: "TRANSFERENCIA" }),
    mov({ method: "TRANSFERENCIA", amount: 500, type: "EGRESO" }),
  ];
  const c = buildCierreDiario({
    day: "2026-10-20",
    previous,
    movements,
    columnas: columnasDelCierre({ tarjetaHabilitada: false, tarjetaSeMovio: false }),
    transferenciaEnElLibro: true,
    declared: { EFECTIVO: 0, MP: 14_000, TRANSFERENCIA: 4_000, TARJETA: null },
  });
  assert.equal(c.porColumna.MP.expected, 14_000, "saldo anterior de MP + Mercado Pago (sin lo de transferencia)");
  assert.equal(c.porColumna.TRANSFERENCIA.opening, 0, "F2: Transferencia no arrastra saldo");
  assert.equal(c.porColumna.TRANSFERENCIA.expected, 4_500, "2.000 − 500 del libro + 3.000 guardados en MP: lo que entró en el período");
  assert.equal(c.porMedio.TRANSFERENCIA.expected, 7_500, "el libro sí acumula: 6.000 + 2.000 − 500");
  assert.deepEqual(c.ajustes, [{ type: "EGRESO", method: "TRANSFERENCIA", amount: 500, detail: "Diferencia de caja 20/10/2026: faltante en Transferencia" }]);
  const despues = openingFromHistory([...previous, ...movements, ...ajustesAsMovements(c, en("2026-10-20"))]);
  assert.deepEqual(despues, openingAfterCierre(c));
  assert.equal(despues.TRANSFERENCIA, 7_000, "7.500 del libro − 500 de la diferencia");
  assert.equal(despues.MP, 17_000, "lo viejo sigue en MP: el ajuste no lo mueve");
});

// F2 (decisión del dueño 29/10): dos días seguidos con transferencias, sin y con el paquete. Lo que
// la persona declara es lo que ve: el saldo de la app de MP y lo que entró al banco ESE día. El
// día 2 no puede dar diferencia en ninguna columna. `guardadaEnMp` hace lo que hace la consulta de
// `transferenciaGuardadaEnMp` (cierre-diario-actions.ts) sobre lo anterior al período.
test("F2 · dos días con transferencias: el día 2 cuadra en MP y en Transferencia, sin y con el paquete", async () => {
  const { esAjusteDeTransferencia } = await import("@/lib/caja/cierre-diario");
  const guardadaEnMp = (prev: readonly CierreMovement[]) =>
    prev
      .filter((m) => m.method === "MP" && (m.medioDeOrigen === "TRANSFERENCIA" || esAjusteDeTransferencia(m.detail)))
      .reduce((s, m) => s + (m.type === "EGRESO" ? -m.amount : m.amount), 0);
  const columnas = columnasDelCierre({ tarjetaHabilitada: false, tarjetaSeMovio: false });
  for (const conPaquete of [false, true]) {
    const metodoT = conPaquete ? "TRANSFERENCIA" : "MP";
    const aMov = (l: ReturnType<typeof ajustesAsMovements>): CierreMovement[] => l;
    const d1 = [mov({ method: "MP", amount: 1_000, medioDeOrigen: "MERCADOPAGO" }), mov({ method: metodoT, amount: 500, medioDeOrigen: "TRANSFERENCIA" })];
    // Día 1: la app dice 1.000; al banco llegaron 450 (faltan 50 de una transferencia anotada).
    const c1 = buildCierreDiario({ day: "2026-10-20", previous: [], movements: d1, columnas, transferenciaEnElLibro: conPaquete, declared: { EFECTIVO: 0, MP: 1_000, TRANSFERENCIA: 450, TARJETA: null } });
    assert.deepEqual(c1.ajustes.map((a) => [a.method, a.type, a.amount]), [[metodoT, "EGRESO", 50]], `paquete=${conPaquete}: la diferencia del banco va a su medio`);
    assert.ok(esAjusteDeTransferencia(c1.ajustes[0].detail));
    const prev2 = [...d1, ...aMov(ajustesAsMovements(c1, en("2026-10-20")))];
    const d2 = [
      mov({ method: "MP", amount: 200, medioDeOrigen: "MERCADOPAGO", occurredAt: en("2026-10-21") }),
      mov({ method: metodoT, amount: 300, medioDeOrigen: "TRANSFERENCIA", occurredAt: en("2026-10-21") }),
    ];
    // Día 2: la app dice 1.200 (su saldo); al banco llegaron 300 HOY.
    const c2 = buildCierreDiario({
      day: "2026-10-21",
      previous: prev2,
      movements: d2,
      columnas,
      transferenciaEnElLibro: conPaquete,
      transferenciaGuardadaEnMp: guardadaEnMp(prev2),
      declared: { EFECTIVO: 0, MP: 1_200, TRANSFERENCIA: 300, TARJETA: null },
    });
    assert.equal(c2.porColumna.MP.opening, 1_000, `paquete=${conPaquete}: MP abre con lo de la app`);
    assert.equal(c2.porColumna.TRANSFERENCIA.opening, 0);
    assert.equal(c2.porColumna.TRANSFERENCIA.expected, 300);
    assert.deepEqual(c2.ajustes, [], `paquete=${conPaquete}: el día 2 cuadra`);
    assert.equal(c2.estado, "CUADRA");
    // El arrastre del libro no cambia con F2.
    assert.deepEqual(openingFromHistory([...prev2, ...d2, ...aMov(ajustesAsMovements(c2, en("2026-10-21")))]), openingAfterCierre(c2));
  }
});

test("F2 · cierre de siempre con el paquete: Transferencia también es lo del período; «Mercado Pago» sigue siendo el saldo del libro en MP", () => {
  const c = buildCierreDiario({
    day: "2026-10-21",
    previous: [mov({ method: "TRANSFERENCIA", amount: 6_000, occurredAt: en("2026-10-19") }), mov({ method: "MP", amount: 2_000, medioDeOrigen: "TRANSFERENCIA", occurredAt: en("2026-10-19") })],
    movements: [mov({ method: "TRANSFERENCIA", amount: 700 }), mov({ method: "MP", amount: 100 })],
    transferenciaEnElLibro: true,
    transferenciaGuardadaEnMp: 2_000,
    declared: { EFECTIVO: 0, MP: 2_100, TRANSFERENCIA: 700, TARJETA: null },
  });
  assert.deepEqual(c.columnas, ["EFECTIVO", "MP", "TRANSFERENCIA", "TARJETA"]);
  assert.equal(c.porColumna.TRANSFERENCIA.opening, 0);
  assert.equal(c.porColumna.TRANSFERENCIA.expected, 700);
  assert.equal(c.porColumna.MP.expected, 2_100, "sin la hoja nueva no se separa: lo viejo sigue junto en MP");
  assert.deepEqual(c.ajustes, []);
});

// Cert. M1 v8 H1: la hoja de siempre (page.tsx) muestra `medioDeLaClasica(preview.porMedio, m)`;
// `cerrarDia` sin columnas compara contra `porColumna`. Tienen que ser el mismo número en cada medio.
test("F2 · la hoja de siempre muestra lo mismo que cuenta cerrarDia, medio por medio", async () => {
  const { medioDeLaClasica } = await import("@/lib/caja/cierre-diario");
  const previous = [mov({ method: "TRANSFERENCIA", amount: 5_000, occurredAt: en("2026-10-19") }), mov({ method: "MP", amount: 3_000, occurredAt: en("2026-10-19") })];
  const movements = [mov({ method: "TRANSFERENCIA", amount: 5_000 }), mov({ method: "TRANSFERENCIA", amount: 800, type: "EGRESO" }), mov({ method: "EFECTIVO", amount: 1_200 })];
  const nada = { EFECTIVO: null, MP: null, TRANSFERENCIA: null, TARJETA: null };
  // Lo que ve la persona: el preview de la pantalla (con las columnas de la hoja nueva, como hoy).
  const preview = buildCierreDiario({ day: "2026-10-20", previous, movements, transferenciaEnElLibro: true, columnas: columnasDelCierre({ tarjetaHabilitada: true, tarjetaSeMovio: false }), declared: nada });
  // Lo que cuenta `cerrarDia` desde la hoja de siempre (sin columnas).
  const cuenta = buildCierreDiario({ day: "2026-10-20", previous, movements, transferenciaEnElLibro: true, declared: nada });
  for (const m of cuenta.columnas) {
    assert.equal(medioDeLaClasica(preview.porMedio, m).expected, cuenta.porColumna[m].expected, `esperado de ${m}`);
    assert.equal(medioDeLaClasica(preview.porMedio, m).opening, cuenta.porColumna[m].opening, `saldo al abrir de ${m}`);
  }
  assert.equal(medioDeLaClasica(preview.porMedio, "TRANSFERENCIA").expected, 4_200, "lo que entró en el período, sin los 5.000 de antes");
});

test("F2 · esAjusteDeTransferencia: sólo el detalle del ajuste de la columna Transferencia", async () => {
  const { esAjusteDeTransferencia } = await import("@/lib/caja/cierre-diario");
  assert.ok(esAjusteDeTransferencia("Diferencia de caja 20/10/2026: faltante en Transferencia"));
  assert.ok(esAjusteDeTransferencia("Diferencia de caja 20/10/2026: sobrante en Transferencia"));
  assert.ok(!esAjusteDeTransferencia("Diferencia de caja 20/10/2026: faltante en MP / Transf."));
  assert.ok(!esAjusteDeTransferencia("Diferencia de caja 20/10/2026: faltante en Mercado Pago"));
  assert.ok(!esAjusteDeTransferencia("Pago al proveedor en Transferencia"));
  assert.ok(!esAjusteDeTransferencia(null));
});

test("cierre de siempre (sin columnas): TRANSFERENCIA aparece sólo si el libro la tiene o se movió", () => {
  const sinNada = buildCierreDiario({ day: "2026-10-20", previous: [], movements: [], declared: { EFECTIVO: 0, MP: null, TARJETA: null } });
  assert.deepEqual(sinNada.columnas, ["EFECTIVO", "MP", "TARJETA"], "antes del paquete, nada cambia");
  const conPaquete = buildCierreDiario({ day: "2026-10-20", previous: [], movements: [], transferenciaEnElLibro: true, declared: { EFECTIVO: 0, MP: null, TARJETA: null } });
  assert.deepEqual(conPaquete.columnas, ["EFECTIVO", "MP", "TRANSFERENCIA", "TARJETA"]);
  // Plata en TRANSFERENCIA sin el dato (no debería pasar): la columna no se esconde y la
  // diferencia se asienta en TRANSFERENCIA, nunca en MP.
  const conPlata = buildCierreDiario({
    day: "2026-10-20",
    previous: [],
    movements: [mov({ method: "TRANSFERENCIA", amount: 1_000 })],
    declared: { EFECTIVO: 0, MP: null, TRANSFERENCIA: 900, TARJETA: null },
  });
  assert.ok(conPlata.columnas.includes("TRANSFERENCIA"));
  assert.equal(conPlata.ajustes[0].method, "TRANSFERENCIA");
  assert.equal(conPlata.total.expected, 1_000, "el total del libro la cuenta");
});

// Cert. M1 v9 O2 (decisión del orquestador 30/10): Transferencia es un neto del período y puede dar
// negativo. Sólo esa columna acepta el signo; el resto sigue sin aceptarlo.
test("O2 · leerContado: el «-» sólo vale en Transferencia", async () => {
  const { leerContado } = await import("@/lib/caja/cierre-diario");
  assert.deepEqual(leerContado("-400", "TRANSFERENCIA"), { estado: "ok", valor: -400 });
  assert.deepEqual(leerContado("− $ 1.250,50", "TRANSFERENCIA"), { estado: "ok", valor: -1250.5 });
  assert.deepEqual(leerContado("-0", "TRANSFERENCIA"), { estado: "ok", valor: 0 });
  assert.deepEqual(leerContado("-", "TRANSFERENCIA"), { estado: "invalida" });
  assert.deepEqual(leerContado("400", "TRANSFERENCIA"), { estado: "ok", valor: 400 });
  assert.deepEqual(leerContado("", "TRANSFERENCIA"), { estado: "vacio" });
  for (const m of ["EFECTIVO", "MP", "TARJETA"] as const) assert.deepEqual(leerContado("-400", m), { estado: "invalida" }, m);
});

test("O2 · neto negativo en Transferencia: se declara, cuadra y no asienta nada; con 0 sería un sobrante", async () => {
  const { validateCierre } = await import("@/lib/caja/cierre-diario");
  const previous = [mov({ method: "TRANSFERENCIA", amount: 3_000, occurredAt: en("2026-10-19") })];
  // Entró 1.000 y salió 1.400 por transferencia: el neto del período es −400.
  const movements = [mov({ method: "TRANSFERENCIA", amount: 1_000 }), mov({ method: "TRANSFERENCIA", amount: 1_400, type: "EGRESO" })];
  const columnas = columnasDelCierre({ tarjetaHabilitada: false, tarjetaSeMovio: false });
  const cierre = (t: number) => buildCierreDiario({ day: "2026-10-20", previous, movements, columnas, transferenciaEnElLibro: true, declared: { EFECTIVO: 0, MP: 0, TRANSFERENCIA: t, TARJETA: null } });
  const bien = cierre(-400);
  assert.equal(bien.porColumna.TRANSFERENCIA.expected, -400);
  assert.deepEqual(bien.ajustes, []);
  assert.equal(bien.estado, "CUADRA");
  assert.deepEqual(validateCierre(bien, { note: null, today: "2026-10-20", lastClosedDay: null }), { ok: true });
  assert.deepEqual(openingFromHistory([...previous, ...movements]), openingAfterCierre(bien), "el arrastre del libro no cambia");
  const conCero = cierre(0);
  assert.deepEqual(conCero.ajustes.map((a) => [a.type, a.method, a.amount]), [["INGRESO", "TRANSFERENCIA", 400]], "por eso hace falta poder tipear el negativo");
  // El negativo sigue prohibido en las otras columnas.
  const mpNegativo = buildCierreDiario({ day: "2026-10-20", previous, movements, columnas, transferenciaEnElLibro: true, declared: { EFECTIVO: 0, MP: -1, TRANSFERENCIA: -400, TARJETA: null } });
  const v = validateCierre(mpNegativo, { note: "x", today: "2026-10-20", lastClosedDay: null });
  assert.ok(!v.ok && v.errors.some((e) => /Mercado Pago no puede ser negativo/.test(e)));
  assert.ok(!v.ok && !v.errors.some((e) => /Transferencia no puede ser negativo/.test(e)));
});

test("O2 · revisarCierre: el renglón de Transferencia dice que es un neto", async () => {
  const { revisarCierre } = await import("@/app/admin/(dashboard)/caja/cierre/revisar-cierre");
  const r = revisarCierre({
    declarado: { EFECTIVO: "0", MP: "", TRANSFERENCIA: "-400" },
    esperado: { EFECTIVO: 0, MP: 0, TRANSFERENCIA: -400 },
    nota: "",
    etiquetas: { EFECTIVO: "Efectivo", MP: "Mercado Pago", TRANSFERENCIA: "Transferencia" },
    medios: ["EFECTIVO", "MP", "TRANSFERENCIA"],
  });
  assert.ok(r.listo);
  assert.match(r.listo ? r.renglones[2] : "", /Cuadra/);
  assert.match(r.listo ? r.renglones[2] : "", /salió más de lo que entró/);
  const mal = revisarCierre({
    declarado: { EFECTIVO: "0", MP: "-5", TRANSFERENCIA: "" },
    esperado: { EFECTIVO: 0, MP: 0, TRANSFERENCIA: 0 },
    nota: "",
    etiquetas: { EFECTIVO: "Efectivo", MP: "Mercado Pago", TRANSFERENCIA: "Transferencia" },
    medios: ["EFECTIVO", "MP", "TRANSFERENCIA"],
  });
  assert.ok(!mal.listo && mal.campo === "MP", "MP no acepta signo");
});

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
  assert.equal(c.ajustes[0].detail, "Diferencia de caja 20/10/2026: faltante en MP / Transf.");
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
    yaCerrado: false, enElFuturo: false, registro: null, turnosSinCerrar: null, columnas: preview.columnas, puedeCerrar: false, turnoAbierto: null,
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

test("cierre con TRANSFERENCIA en el libro: su columna = su saldo + lo viejo guardado en MP; la diferencia va a TRANSFERENCIA y el arrastre cierra", () => {
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
    declared: { EFECTIVO: 0, MP: 14_000, TRANSFERENCIA: 10_000, TARJETA: null },
  });
  assert.equal(c.porColumna.MP.expected, 14_000, "saldo anterior de MP + Mercado Pago (sin lo de transferencia)");
  assert.equal(c.porColumna.TRANSFERENCIA.opening, 6_000, "el saldo propio de TRANSFERENCIA se arrastra");
  assert.equal(c.porColumna.TRANSFERENCIA.expected, 10_500, "6.000 + 2.000 − 500 del libro + 3.000 guardados en MP");
  assert.equal(c.porColumna.MP.expected + c.porColumna.TRANSFERENCIA.expected, c.porMedio.MP.expected + c.porMedio.TRANSFERENCIA.expected);
  assert.deepEqual(c.ajustes, [{ type: "EGRESO", method: "TRANSFERENCIA", amount: 500, detail: "Diferencia de caja 20/10/2026: faltante en Transferencia" }]);
  const despues = openingFromHistory([...previous, ...movements, ...ajustesAsMovements(c, en("2026-10-20"))]);
  assert.deepEqual(despues, openingAfterCierre(c));
  assert.equal(despues.TRANSFERENCIA, 7_000, "8.000 del libro − 500 de la diferencia");
  assert.equal(despues.MP, 17_000, "lo viejo sigue en MP: el ajuste no lo mueve");
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

// El pago de la administración en la caja y su acreditación en Mercado Pago (regla del dueño, 08/11). PURO.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidatosDeAcreditacion,
  destinoDelPago,
  detalleDelIngreso,
  eleccionDeAcreditacion,
  esEnganchable,
  esPorAcreditacionPendiente,
  esVentaConfirmada,
  esperaAcreditacion,
  fechasDePagoDelMovimiento,
  leerAcreditacion,
  marcaDelPagoEnCaja,
  medioDeCajaDelDestino,
  motivoDeAcreditacionPendiente,
  motivoDeVentaConfirmada,
  motivoDelEnganche,
  pagoDelIngreso,
  ventanaDeAcreditacion,
  type MovimientoMp,
  ventanaDelAcreditadoAMano,
} from "./acreditacion-core";
import { clasificarOrigen, motivoParaNoBorrar } from "@/lib/caja/libro-caja";
import { decidirAsiento } from "@/lib/settlement/asiento-libro";
import { pagosDeLaAdministracion } from "@/app/admin/(dashboard)/caja/cierre/vouchers-del-dia";

const mov = (id: string, fecha: string, montoCentavos: number, extra: Partial<MovimientoMp> = {}): MovimientoMp => ({
  id,
  fecha,
  montoCentavos,
  descripcion: "Transferencia recibida",
  referencia: null,
  contraparte: null,
  ...extra,
});

test("medio → destino: efectivo al cajón; transferencia/MP a la columna MP; cheque a depositar; otro obliga a elegir", () => {
  assert.equal(destinoDelPago("EFECTIVO"), "CAJON");
  assert.equal(destinoDelPago("TRANSFERENCIA"), "MP");
  assert.equal(destinoDelPago("CHEQUE"), "A_DEPOSITAR");
  assert.equal(destinoDelPago("OTRO"), null, "otro sin elegir no se adivina");
  assert.equal(destinoDelPago("OTRO", "EFECTIVO"), "CAJON");
  assert.equal(destinoDelPago("OTRO", "MP"), "MP");
  assert.equal(destinoDelPago("OTRO", "TARJETA"), null);
  assert.equal(destinoDelPago("BITCOIN"), null);
  assert.equal(medioDeCajaDelDestino("CAJON"), "EFECTIVO");
  assert.equal(medioDeCajaDelDestino("MP"), "MERCADOPAGO");
  assert.equal(medioDeCajaDelDestino("A_DEPOSITAR"), null, "el cheque no entra a ninguna columna hasta el depósito");
  assert.equal(esperaAcreditacion("CAJON"), false);
  assert.equal(esperaAcreditacion("MP"), true);
  assert.equal(esperaAcreditacion("A_DEPOSITAR"), true);
  assert.equal(esperaAcreditacion(null), false);
  // El mismo patrón que el cobro de un fiado: INGRESO en la columna MP; con la caja de hoy cerrada, no.
  const d = decidirAsiento({ origen: "RECEIVABLE", medio: medioDeCajaDelDestino("MP"), monto: 14000, detalle: "x", hoy: "2026-11-09", cerradoHasta: "2026-11-08" });
  assert.deepEqual(d.ok && [d.asiento.type, d.asiento.method], ["INGRESO", "MP"]);
  const cerrado = decidirAsiento({ origen: "RECEIVABLE", medio: "MERCADOPAGO", monto: 14000, detalle: "x", hoy: "2026-11-09", cerradoHasta: "2026-11-09" });
  assert.equal(cerrado.ok, false);
});

test("marca del ingreso: el libro lo ve como cobro de cuenta corriente, con el pago de referencia, y no se borra a mano", () => {
  const marca = marcaDelPagoEnCaja("pago123");
  assert.equal(marca, "cuenta-corriente:voucher-pago:pago123");
  assert.equal(pagoDelIngreso(marca), "pago123");
  assert.equal(pagoDelIngreso("cuenta-corriente:col1"), null);
  assert.equal(pagoDelIngreso(null), null);
  assert.deepEqual(clasificarOrigen({ type: "INGRESO", createdBy: marca }), { origen: "cobro-cuenta-corriente", referencia: "voucher-pago:pago123" });
  assert.ok(motivoParaNoBorrar({ type: "INGRESO", createdBy: marca }));
});

test("ventana: del día anterior al pago a 10 días después, en AAAAMMDD", () => {
  assert.deepEqual(ventanaDeAcreditacion("2026-11-02"), { desde: "20261101", hasta: "20261112" });
  // Un cheque se deposita después: ventana de 45 días.
  assert.deepEqual(ventanaDeAcreditacion("2026-11-02", "A_DEPOSITAR"), { desde: "20261101", hasta: "20261217" });
  assert.equal(ventanaDeAcreditacion("2026-02-30"), null);
});

test("candidatos: mismo monto al centavo, en la ventana, no usados; la referencia desempata", () => {
  const pago = { fecha: "2026-11-02", montoCentavos: 1_400_000, referencia: null };
  const movs = [
    mov("a", "20261103", 1_400_000),
    mov("b", "20261103", 1_400_001), // otro monto
    mov("c", "20261020", 1_400_000), // fuera de la ventana
    mov("d", "20261113", 1_400_000), // fuera de la ventana
    mov("e", "20261101", 1_400_000), // día anterior: entra
  ];
  assert.deepEqual(candidatosDeAcreditacion(pago, movs, new Set()).map((m) => m.id), ["e", "a"]);
  assert.deepEqual(candidatosDeAcreditacion(pago, movs, new Set(["e"])).map((m) => m.id), ["a"]);
  const conRef = [mov("x", "20261103", 1_400_000), mov("y", "20261104", 1_400_000, { descripcion: "Transf. TRF-881 Adm. La Alameda" })];
  assert.deepEqual(candidatosDeAcreditacion({ ...pago, referencia: "trf 881" }, conRef, new Set()).map((m) => m.id), ["y"]);
  // Una referencia que nadie menciona no descarta a los de mismo monto y fecha.
  assert.equal(candidatosDeAcreditacion({ ...pago, referencia: "zzz999" }, conRef, new Set()).length, 2);
  assert.deepEqual(candidatosDeAcreditacion({ ...pago, montoCentavos: 0 }, movs, new Set()), []);
});

test("candidatos (cert 5): nunca un movimiento descartado, facturado o ya enganchado a otro pago", () => {
  const pago = { fecha: "2026-11-02", montoCentavos: 246_802, referencia: null };
  const movs = [
    mov("real", "20261102", 246_802, { estadoPropuesta: "no_facturable" }),
    mov("copia", "20261102", 246_802, { estadoPropuesta: "descartado" }), // C5-6: copia de re-importación
    mov("vendido", "20261102", 246_802, { estadoPropuesta: "emitida", invoiceId: "inv1" }), // C5-1
    mov("conFactura", "20261102", 246_802, { estadoPropuesta: "auto", invoiceId: "inv2" }),
    mov("deOtro", "20261102", 246_802, { estadoPropuesta: "no_facturable", motivoRevision: motivoDelEnganche("pagoX") }),
    mov("auto", "20261103", 246_802, { estadoPropuesta: "auto" }),
    mov("revision", "20261103", 246_802, { estadoPropuesta: "revision" }),
  ];
  assert.deepEqual(candidatosDeAcreditacion(pago, movs, new Set()).map((m) => m.id), ["real", "auto", "revision"]);
  assert.equal(esEnganchable({ estadoPropuesta: "descartado" }), false);
  assert.equal(esEnganchable({ estadoPropuesta: "emitida" }), false);
  assert.equal(esEnganchable({ estadoPropuesta: "auto", invoiceId: null, motivoRevision: "Marcado a mano" }), true);
  assert.equal(esEnganchable({ motivoRevision: motivoDelEnganche("p1") }), false);
});

test("elección: uno solo se engancha; ninguno o varios, a mano; uno elegido tiene que ser candidato", () => {
  const a = mov("a", "20261103", 100);
  const b = mov("b", "20261104", 100);
  assert.deepEqual(eleccionDeAcreditacion([a]), { ok: true, via: "mp", movimientoId: "a" });
  assert.deepEqual(eleccionDeAcreditacion([]), { ok: true, via: "manual", motivo: "sin-movimiento" });
  assert.deepEqual(eleccionDeAcreditacion([a, b]), { ok: true, via: "manual", motivo: "varios-posibles" });
  assert.deepEqual(eleccionDeAcreditacion([a, b], "b"), { ok: true, via: "mp", movimientoId: "b" });
  assert.equal(eleccionDeAcreditacion([a], "zz").ok, false);
});

test("leerAcreditacion no confía en la forma del AuditLog", () => {
  assert.deepEqual(leerAcreditacion({ via: "mp", movimientoId: "m1", pagoId: "p" }), { via: "mp", movimientoId: "m1", pagoId: "p" });
  assert.deepEqual(leerAcreditacion({ via: "mp" }), { via: "manual", movimientoId: null, pagoId: null });
  assert.deepEqual(leerAcreditacion(null), { via: "manual", movimientoId: null, pagoId: null });
});

test("detalle del ingreso: liquidación o pago a cuenta, referencia y si se acredita en MP", () => {
  assert.equal(
    detalleDelIngreso({ liquidacion: { desde: "2026-10-26", hasta: "2026-11-01" }, referencia: "TRF 1", destino: "MP" }),
    "Vouchers: pago de la administración, liquidación del 26/10/2026 al 01/11/2026 · TRF 1 · a acreditar en Mercado Pago",
  );
  assert.equal(detalleDelIngreso({ referencia: null, destino: "CAJON" }), "Vouchers: pago a cuenta de la administración");
  assert.equal(detalleDelIngreso({ referencia: "Ch 123", destino: "A_DEPOSITAR" }), "Vouchers: pago a cuenta de la administración · Ch 123 · cheque depositado en Mercado Pago");
});

test("cierre del día: los pagos de la administración, por su medio, sin sumar dos veces", () => {
  const p = pagosDeLaAdministracion([
    { type: "INGRESO", method: "MP", amount: 14000, referencia: "voucher-pago:p1" },
    { type: "INGRESO", method: "MP", amount: 0.1, referencia: "voucher-pago:p2" },
    { type: "INGRESO", method: "EFECTIVO", amount: 4000, referencia: "voucher-pago:p3" },
    { type: "INGRESO", method: "MP", amount: 999, referencia: "col1" }, // cobro de otro fiado
    { type: "VENTA", method: "MP", amount: 500 },
  ]);
  assert.deepEqual(p, {
    cantidad: 3,
    porMedio: [
      { medio: "MP", monto: 14000.1, cantidad: 2 },
      { medio: "EFECTIVO", monto: 4000, cantidad: 1 },
    ],
  });
  assert.equal(pagosDeLaAdministracion([{ type: "VENTA", method: "MP", amount: 1 }]), null);
});

test("cheque rechazado: motivo obligatorio y marca de caja distinta de la del ingreso", async () => {
  const c = await import("./acreditacion-core");
  assert.deepEqual(c.leerMotivoDeRechazo("  Sin   fondos "), { ok: true, motivo: "Sin fondos" });
  assert.equal(c.leerMotivoDeRechazo("no").ok, false);
  assert.equal(c.leerMotivoDeRechazo(null).ok, false);
  assert.equal(c.leerMotivoDeRechazo("x".repeat(201)).ok, false);
  const marca = c.marcaDelRechazoEnCaja("p1");
  assert.equal(marca, "cuenta-corriente:voucher-pago-rechazo:p1");
  assert.notEqual(marca, c.marcaDelPagoEnCaja("p1"));
  assert.equal(c.pagoDelIngreso(marca), null, "el contramovimiento no se lee como el ingreso de un pago");
});

test("plata de vouchers: las fechas de pago que pueden acreditarse con un movimiento y el motivo de revisión", () => {
  // Inversa de la ventana de MP: el pago va de 10 días antes a 1 día después del movimiento. Los
  // cheques no cuentan (entran a MP cuando una persona confirma el depósito): no frenan la emisión.
  assert.deepEqual(fechasDePagoDelMovimiento("20261109"), { desde: "2026-10-30", hasta: "2026-11-10" });
  assert.equal(fechasDePagoDelMovimiento("2026-11-09"), null);
  assert.equal(fechasDePagoDelMovimiento("20260230"), null);
  // Cada fecha de pago a MP cuya ventana incluye el movimiento cae dentro del rango.
  for (const fechaPago of ["2026-11-10", "2026-10-30"]) {
    const v = ventanaDeAcreditacion(fechaPago, "MP")!;
    assert.ok(v.desde <= "20261109" && "20261109" <= v.hasta, fechaPago);
    const r = fechasDePagoDelMovimiento("20261109")!;
    assert.ok(r.desde <= fechaPago && fechaPago <= r.hasta, fechaPago);
  }
  // Un pago a MP de 11 días antes ya no alcanza al movimiento.
  assert.ok(fechasDePagoDelMovimiento("20261109")!.desde > "2026-10-29");
  // El motivo no es la marca del enganche: el movimiento en revisión sigue enganchable.
  const motivo = motivoDeAcreditacionPendiente("pago-1");
  assert.match(motivo, /Vouchers.*pago-1.*no se factura/);
  assert.ok(esPorAcreditacionPendiente(motivo));
  assert.ok(!esPorAcreditacionPendiente("Falta el CUIT (umbral)"));
  assert.ok(esEnganchable({ estadoPropuesta: "revision", invoiceId: null, motivoRevision: motivo }));
  // Aprobada como venta por una persona: la acreditación nunca la engancha.
  assert.ok(esVentaConfirmada(motivoDeVentaConfirmada()));
  assert.equal(esEnganchable({ estadoPropuesta: "auto", invoiceId: null, motivoRevision: motivoDeVentaConfirmada() }), false);
  assert.equal(esEnganchable({ estadoPropuesta: "revision", invoiceId: null, motivoRevision: motivoDeVentaConfirmada() }), false);
});

test("ventanaDelAcreditadoAMano: de la fecha del pago (cheque: su fecha; si no, el día anterior) a la confirmación + 10", () => {
  // Transferencia del 1/11 confirmada a mano el 9/11: el crédito puede ser de antes de la confirmación.
  assert.deepEqual(ventanaDelAcreditadoAMano("2026-11-01", "2026-11-09", false), { desde: "20261031", hasta: "20261119" });
  // Cheque recibido el 20/10, depósito confirmado el 9/11: arranca en su fecha.
  assert.deepEqual(ventanaDelAcreditadoAMano("2026-10-20", "2026-11-09", true), { desde: "20261020", hasta: "20261119" });
  // Fecha del pago posterior a la confirmación (mal tipeada): arranca en la confirmación.
  assert.deepEqual(ventanaDelAcreditadoAMano("2026-11-15", "2026-11-09", false), { desde: "20261108", hasta: "20261119" });
  assert.equal(ventanaDelAcreditadoAMano("2026-02-30", "2026-11-09", false), null);
});

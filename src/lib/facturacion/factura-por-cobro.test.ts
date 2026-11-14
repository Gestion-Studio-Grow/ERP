// Opción B de CH (06/11/2026) · la cuenta pura de qué cobros del turno se facturan y por cuánto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mpSinPareja, planFacturasPorCobro, type FilaDelLibro } from "./factura-por-cobro";
import { claveCobroDelLibro, cobroDeLaClave } from "./clave-cobro-del-libro";
import { notaDeAnulacion, notaDeCondonacion } from "@/lib/turnos/anulacion";
import { avisoDeFacturaDelTurno } from "@/lib/turnos/aviso-factura";

const fila = (id: string, amount: number, method = "EFECTIVO", note: string | null = null, min = 0): FilaDelLibro => ({
  id,
  amount,
  method,
  note,
  createdAt: new Date(Date.UTC(2026, 10, 6, 12, min)),
});

test("seña $10.000 y saldo $30.000: un cobro, una factura, cada una por su monto", () => {
  const plan = planFacturasPorCobro({ filas: [fila("senia", 10000, "TRANSFERENCIA"), fila("saldo", 30000, "EFECTIVO", null, 5)], conFila: new Set(), mpSinPareja: 0 });
  assert.deepEqual(plan, [
    { collectionId: "senia", importe: 10000, method: "TRANSFERENCIA" },
    { collectionId: "saldo", importe: 30000, method: "EFECTIVO" },
  ]);
});

test("lo que ya tiene fila en el libro (aunque la factura esté rechazada) no se vuelve a facturar solo", () => {
  const plan = planFacturasPorCobro({ filas: [fila("senia", 10000), fila("saldo", 30000, "EFECTIVO", null, 5)], conFila: new Set(["senia"]), mpSinPareja: 0 });
  assert.deepEqual(plan.map((c) => c.collectionId), ["saldo"]);
});

test("anulados, contrapartidas y condonaciones no se facturan", () => {
  const filas = [
    fila("a", 10000),
    fila("rev-a", -10000, "EFECTIVO", notaDeAnulacion("a", "se cobró mal"), 1),
    fila("cond", 5000, "EFECTIVO", notaDeCondonacion("cortesía"), 2),
    fila("b", 0.1, "EFECTIVO", null, 3),
  ];
  assert.deepEqual(planFacturasPorCobro({ filas, conFila: new Set(), mpSinPareja: 0 }), [{ collectionId: "b", importe: 0.1, method: "EFECTIVO" }]);
});

test("lo que ya facturó Mercado Pago cubre primero los cobros con medio MP (la seña no se factura dos veces)", () => {
  const filas = [fila("mp1", 5000, "MERCADOPAGO"), fila("ef", 10000, "EFECTIVO", null, 1), fila("mp2", 3000, "MERCADOPAGO", null, 2)];
  assert.deepEqual(planFacturasPorCobro({ filas, conFila: new Set(), mpSinPareja: 6000 }), [
    { collectionId: "ef", importe: 10000, method: "EFECTIVO" },
    { collectionId: "mp2", importe: 2000, method: "MERCADOPAGO" },
  ]);
});

test("mpSinPareja: el pago de MP atado a la factura de un cobro del libro no cuenta otra vez", () => {
  const d = new Date();
  const filas = [
    { clave: "mp:111", invoiceId: "f-mp", importe: 5000, status: "AUTHORIZED", createdAt: d },
    { clave: "mp:222", invoiceId: "f-cobro", importe: 3000, status: "AUTHORIZED", createdAt: d },
    { clave: claveCobroDelLibro("c1"), invoiceId: "f-cobro", importe: 3000, status: "AUTHORIZED", createdAt: d },
    { clave: "mp:333", invoiceId: "f-rech", importe: 900, status: "REJECTED", createdAt: d },
    { clave: "mp:refund:9", invoiceId: "f-nc", importe: 100, status: "AUTHORIZED", createdAt: d },
  ];
  assert.equal(mpSinPareja(filas), 5000);
});

test("la clave del cobro entra en el CHECK de la tabla (empieza con turno:) y se lee de vuelta", () => {
  assert.match(claveCobroDelLibro("ck1"), /^(mp|turno|banco):.+$/);
  assert.equal(cobroDeLaClave(claveCobroDelLibro("ck1")), "ck1");
  assert.equal(cobroDeLaClave("turno:abc"), null);
  assert.throws(() => claveCobroDelLibro(""));
});

test("el aviso de una factura que no salió al cobrar habla del cobro, no del turno terminado", () => {
  assert.match(avisoDeFacturaDelTurno({ tipo: "fallo" }, "cobro") ?? "", /^El cobro quedó registrado, pero la factura no se pudo emitir/);
  assert.match(avisoDeFacturaDelTurno({ tipo: "fallo" }) ?? "", /^El turno quedó terminado/);
});

// Orden del dueño (09/11/2026): el voucher lo paga la administración del country y NO se factura en ARCA.
test("el cobro con voucher no se factura; el resto del turno (efectivo o MP) sí", () => {
  const soloVoucher = planFacturasPorCobro({ filas: [fila("v", 14000, "VOUCHER")], conFila: new Set(), mpSinPareja: 0 });
  assert.deepEqual(soloVoucher, []);
  const mixto = planFacturasPorCobro({
    filas: [fila("v", 10000, "VOUCHER"), fila("resto", 4000, "EFECTIVO", null, 1), fila("mp", 2000, "MERCADOPAGO", null, 2)],
    conFila: new Set(),
    mpSinPareja: 0,
  });
  assert.deepEqual(mixto, [
    { collectionId: "resto", importe: 4000, method: "EFECTIVO" },
    { collectionId: "mp", importe: 2000, method: "MERCADOPAGO" },
  ]);
  // Lo facturado por MP no se «come» con el voucher: cubre sólo cobros de MP.
  const conMp = planFacturasPorCobro({ filas: [fila("v", 10000, "VOUCHER"), fila("mp", 2000, "MERCADOPAGO", null, 1)], conFila: new Set(), mpSinPareja: 2000 });
  assert.deepEqual(conMp, []);
});

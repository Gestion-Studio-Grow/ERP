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

// ── GSG-FACT-012 · ¿el pago de MP excede el turno? ─────────────────────────────
test("pagoMPExcedeElTurno: sólo con plata de otro medio (o condonada) en el libro; MP y lo anulado no restan", async () => {
  const { pagoMPExcedeElTurno } = await import("./factura-por-cobro");
  const f = (id: string, amount: number, method: string, note: string | null = null) => ({ id, amount, method, note });
  const ex = (precio: number, monto: number, filas: ReturnType<typeof f>[]) => pagoMPExcedeElTurno({ precio, monto, filas });
  // Sin otro medio no se bloquea: turno sin cobros, precio a definir (0), link por más que el precio.
  assert.equal(ex(15000, 5000, []), false);
  assert.equal(ex(0, 20000, []), false);
  assert.equal(ex(15000, 18000, []), false);
  // Cerrado en efectivo: no cabe. Efectivo por el saldo: la seña cabe justo; un centavo más, no.
  assert.equal(ex(15000, 5000, [f("e", 15000, "EFECTIVO")]), true);
  assert.equal(ex(15000, 5000, [f("e", 10000, "EFECTIVO")]), false);
  assert.equal(ex(15000, 5000.01, [f("e", 10000, "EFECTIVO")]), true);
  assert.equal(ex(15000, 5000, [f("e", 12000, "TRANSFERENCIA")]), true);
  // El cobro de MP del libro es esta misma plata: no resta.
  assert.equal(ex(15000, 5000, [f("m", 5000, "MERCADOPAGO"), f("e", 10000, "EFECTIVO")]), false);
  // Un efectivo anulado vuelve a dejar lugar (y deja de haber otro medio).
  assert.equal(ex(15000, 5000, [f("e", 15000, "EFECTIVO"), f("x", -15000, "EFECTIVO", notaDeAnulacion("e", "error"))]), false);
  // Lo condonado cierra el turno aunque su medio sea MP.
  assert.equal(ex(15000, 5000, [f("e", 10000, "EFECTIVO"), f("c", 5000, "MERCADOPAGO", notaDeCondonacion("perdonado"))]), true);
  // Otro pago de MP ya facturado ocupa su parte (sólo si hay otro medio: sin él no se decide).
  assert.equal(pagoMPExcedeElTurno({ precio: 15000, monto: 5000, filas: [f("e", 10000, "EFECTIVO")], otrosPagosMP: 5000 }), true);
  assert.equal(pagoMPExcedeElTurno({ precio: 15000, monto: 5000, filas: [], otrosPagosMP: 15000 }), false);
});

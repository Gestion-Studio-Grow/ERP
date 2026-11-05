import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MARCA_ANULACION, notaDeCondonacion } from "@/lib/turnos/anulacion";
import { etiquetaDelMedio, pagosDelTurno, tipoDelPago } from "./pagos-core";

const turno = (o: Partial<Parameters<typeof pagosDelTurno>[0]> = {}) => ({ cobros: [], cobrado: 0, precio: 20000, saldo: 20000, condonado: 0, ...o });

describe("pagos del turno", () => {
  test("sin pagos: vacío y falta todo", () => {
    const p = pagosDelTurno(turno());
    assert.equal(p.vacio, true);
    assert.deepEqual([p.totalPagado, p.precio, p.falta], [0, 20000, 20000]);
  });

  test("seña + saldo: un renglón por pago, en orden, con medio, tipo y quién; pagado", () => {
    const p = pagosDelTurno(
      turno({
        cobros: [
          { id: "c2", amount: 15000, method: "DEBITO", note: "Saldo al terminar", createdAt: "2026-11-04T16:00:00.000Z" },
          { id: "c1", amount: 5000, method: "TRANSFERENCIA", note: "Seña al reservar", createdAt: "2026-11-01T12:00:00.000Z", quien: "Marta" },
        ],
        cobrado: 20000,
        saldo: 0,
      }),
    );
    assert.deepEqual(
      p.renglones.map((r) => [r.clave, r.medio, r.tipo, r.monto, r.quien, r.anulado]),
      [
        ["c1", "Transferencia", "Seña", 5000, "Marta", false],
        ["c2", "Débito", "Saldo", 15000, null, false],
      ],
    );
    assert.equal(p.falta, 0);
    assert.equal(p.totalPagado, 20000);
  });

  test("un cobro anulado queda tachado y su contrapartida no es otro renglón; el total es el neto", () => {
    const p = pagosDelTurno(
      turno({
        cobros: [
          { id: "c1", amount: 5000, method: "EFECTIVO", note: "Llegó la seña (verificada por recepción)", createdAt: "2026-11-01T12:00:00.000Z" },
          { id: "c9", amount: -5000, method: "EFECTIVO", note: `${MARCA_ANULACION} c1 — medio equivocado`, createdAt: "2026-11-01T12:05:00.000Z" },
          { id: "c3", amount: 5000, method: "MERCADOPAGO", note: "Seña al reservar", createdAt: "2026-11-01T12:10:00.000Z" },
        ],
        cobrado: 5000,
        saldo: 15000,
      }),
    );
    assert.deepEqual(p.renglones.map((r) => [r.clave, r.anulado, r.tipo, r.medio]), [
      ["c1", true, "Seña", "Efectivo"],
      ["c3", false, "Seña", "Mercado Pago"],
    ]);
    assert.deepEqual([p.totalPagado, p.falta], [5000, 15000]);
  });

  test("baja de saldo: no es un pago (va a los totales)", () => {
    const p = pagosDelTurno(turno({ cobros: [{ id: "c1", amount: 3000, method: "EFECTIVO", note: notaDeCondonacion("descuento") }], condonado: 3000, saldo: 17000 }));
    assert.equal(p.renglones.length, 0);
    assert.equal(p.vacio, true);
    assert.equal(p.deBaja, 3000);
  });

  test("pago anterior a los cobros parciales: un renglón, no «Todavía no pagó nada»", () => {
    const p = pagosDelTurno(turno({ cobros: [], cobrado: 20000, saldo: 0 }));
    assert.equal(p.vacio, false);
    assert.equal(p.renglones[0].tipo, "Pago anterior");
  });

  test("medios y tipo", () => {
    assert.equal(etiquetaDelMedio("CREDITO"), "Crédito");
    assert.equal(etiquetaDelMedio("RARO"), "RARO");
    assert.equal(tipoDelPago("Seña al reservar"), "Seña");
    assert.equal(tipoDelPago(null), "Saldo");
  });
});

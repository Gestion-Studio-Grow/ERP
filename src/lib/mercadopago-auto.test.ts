/**
 * Tests del auto-facturado de Mercado Pago (glue real): las reglas del dueño
 * encima del clasificador (umbral de identificación + tope mensual) y los
 * mapeos puros pago→movimiento. La persistencia (ReconciliacionMovimientosMP)
 * se cubre por contrato en runtime; acá va la lógica pura.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clasificadorConReglasDelDueno,
  clasificacionDesdeOperacion,
  hashPagoMP,
} from "@/lib/mercadopago-auto";
import type { ClasificadorPort, PagoMP } from "@/plugins/mercadopago";

const facturable: ClasificadorPort = {
  async clasificar() {
    return { clasificacion: "FACTURABLE", motivo: "cobro a cliente" };
  },
};

function pago(monto: number, extra: Partial<PagoMP> = {}): PagoMP {
  return {
    id: "pay-1",
    estado: "approved",
    monto,
    externalReference: "",
    ...extra,
  };
}

test("bajo el umbral y bajo el tope: sigue FACTURABLE", async () => {
  const c = clasificadorConReglasDelDueno(facturable, {
    umbralIdentificacion: 600_000,
    capFacturasMes: 159,
    facturasDelMes: async () => 10,
  });
  const r = await c.clasificar(pago(150_000), "t1");
  assert.equal(r.clasificacion, "FACTURABLE");
});

test("igual o sobre el umbral: va a REVISAR (necesita datos del comprador)", async () => {
  const c = clasificadorConReglasDelDueno(facturable, {
    umbralIdentificacion: 600_000,
    capFacturasMes: 159,
    facturasDelMes: async () => 0,
  });
  const r = await c.clasificar(pago(600_000), "t1");
  assert.equal(r.clasificacion, "REVISAR");
  assert.match(r.motivo, /umbral/i);
});

test("al llegar al tope del mes: va a REVISAR (emisión manual)", async () => {
  const c = clasificadorConReglasDelDueno(facturable, {
    umbralIdentificacion: 600_000,
    capFacturasMes: 159,
    facturasDelMes: async () => 159,
  });
  const r = await c.clasificar(pago(50_000), "t1");
  assert.equal(r.clasificacion, "REVISAR");
  assert.match(r.motivo, /tope/i);
});

test("lo NO facturable del clasificador base no se toca", async () => {
  const noFacturable: ClasificadorPort = {
    async clasificar() {
      return { clasificacion: "NO_FACTURABLE", motivo: "transferencia entre cuentas propias" };
    },
  };
  const c = clasificadorConReglasDelDueno(noFacturable, {
    umbralIdentificacion: 600_000,
    capFacturasMes: 159,
    facturasDelMes: async () => 0,
  });
  const r = await c.clasificar(pago(999_999_999), "t1");
  assert.equal(r.clasificacion, "NO_FACTURABLE");
});

test("mapeo operación→clasificación de DB", () => {
  assert.equal(clasificacionDesdeOperacion(pago(1, { operacion: "pago" })), "venta");
  assert.equal(clasificacionDesdeOperacion(pago(1, { operacion: "transferencia" })), "transferencia_propia");
  assert.equal(clasificacionDesdeOperacion(pago(1, { operacion: "devolucion" })), "reverso");
  assert.equal(clasificacionDesdeOperacion(pago(1, { operacion: "prestamo" })), "prestamo");
  assert.equal(clasificacionDesdeOperacion(pago(1, { operacion: "reintegro" })), "otro");
  assert.equal(clasificacionDesdeOperacion(pago(1)), "venta"); // default "pago"
});

test("hash idempotente estable por payment_id", () => {
  assert.equal(hashPagoMP("123"), "mp:123");
  assert.equal(hashPagoMP("123"), hashPagoMP("123"));
  assert.notEqual(hashPagoMP("123"), hashPagoMP("124"));
});

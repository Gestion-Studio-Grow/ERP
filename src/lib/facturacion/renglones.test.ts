// Motor de facturación · pedido 4: abono de un Responsable Inscripto con IVA declarado por renglón.
import { test } from "node:test";
import assert from "node:assert/strict";
import { montosDeRenglones } from "./renglones";
import { ivaSinAlicuotaPorProducto } from "@/plugins/arca/domain/iva-por-producto";

test("RI con un renglón al 21 %: neto + IVA = total y queda marcado ivaPorProducto (el plugin lo deja emitir)", () => {
  const m = montosDeRenglones("RESPONSABLE_INSCRIPTO", [{ total: 121000, alicuotaIva: 5 }]);
  assert.ok(m.ok);
  if (!m.ok) return;
  assert.equal(m.total, 121000);
  assert.equal(Math.round(m.neto * 100) + Math.round(m.iva.reduce((a, r) => a + r.importe, 0) * 100), 12100000);
  assert.deepEqual(m.iva.map((r) => r.alicuotaId), [5]);
  assert.equal(m.ivaPorProducto, true);
});

test("RI con dos alícuotas: un subtotal por alícuota", () => {
  const m = montosDeRenglones("RESPONSABLE_INSCRIPTO", [
    { total: 1210, alicuotaIva: 5 },
    { total: 1105, alicuotaIva: 4 },
  ]);
  assert.ok(m.ok);
  if (m.ok) assert.deepEqual(m.iva.map((r) => r.alicuotaId).sort(), [4, 5]);
});

test("RI sin alícuota en un renglón: no se emite, con el motivo", () => {
  const m = montosDeRenglones("RESPONSABLE_INSCRIPTO", [{ total: 1000 }]);
  assert.equal(m.ok, false);
});

test("monotributo: como siempre (C, sin IVA discriminado)", () => {
  const m = montosDeRenglones("MONOTRIBUTO", [{ total: 5000 }]);
  assert.ok(m.ok);
  if (m.ok) assert.equal(m.total, 5000);
});

test("sin renglones no hay comprobante", () => {
  assert.equal(montosDeRenglones("MONOTRIBUTO", []).ok, false);
});

test("el plugin acepta el evento armado así (ENG-024)", () => {
  const m = montosDeRenglones("RESPONSABLE_INSCRIPTO", [{ total: 121000, alicuotaIva: 5 }]);
  assert.ok(m.ok);
  if (!m.ok) return;
  const ev = {
    invoiceId: "x",
    tenantId: "t",
    concepto: 2,
    fecha: "20261022",
    emisor: { cuit: 20111111112, condicionIva: "RESPONSABLE_INSCRIPTO" as const, puntoVenta: 1 },
    receptor: { docTipo: 80, docNro: 30712345671, condicionIva: "RESPONSABLE_INSCRIPTO" as const },
    neto: m.neto,
    iva: m.iva,
    total: m.total,
    ivaPorProducto: m.ivaPorProducto,
  };
  assert.equal(ivaSinAlicuotaPorProducto(ev as Parameters<typeof ivaSinAlicuotaPorProducto>[0]), null);
});

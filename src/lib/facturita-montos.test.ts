/** Montos de Facturita: C sin IVA; inscripto con el IVA declarado en el renglón (ENG-024). */

import { test } from "node:test";
import assert from "node:assert/strict";
import { montosFacturita } from "@/lib/facturita-montos";
import { centavosDe } from "@/lib/dinero/redondeo";
import { ivaSinAlicuotaPorProducto } from "@/plugins/arca/domain/iva-por-producto";

test("monotributo: neto = total, sin marcar ivaPorProducto", () => {
  const m = montosFacturita("MONOTRIBUTO", 18_500, 5);
  assert.ok(m.ok);
  if (m.ok) {
    assert.equal(m.total, 18_500);
    assert.equal(m.neto, 18_500);
    assert.equal(m.ivaPorProducto, false);
  }
});

test("inscripto 21 %: 121.000 → neto 100.000 + IVA 21.000, con ivaPorProducto", () => {
  const m = montosFacturita("RESPONSABLE_INSCRIPTO", 121_000, 5);
  assert.ok(m.ok);
  if (m.ok) {
    assert.equal(m.neto, 100_000);
    assert.equal(m.total, 121_000);
    assert.deepEqual(m.iva.map((x) => [x.alicuotaId, x.base, x.importe]), [[5, 100_000, 21_000]]);
    assert.equal(m.ivaPorProducto, true);
  }
});

test("inscripto 10,5 % y 27 %: neto + IVA = total al centavo, con su alícuota", () => {
  for (const id of [4, 6]) {
    const m = montosFacturita("RESPONSABLE_INSCRIPTO", 10_000, id);
    assert.ok(m.ok);
    if (m.ok) {
      assert.equal(centavosDe(m.neto) + centavosDe(m.iva[0].importe), centavosDe(10_000));
      assert.equal(m.iva[0].alicuotaId, id);
    }
  }
});

test("el plugin ya no frena la factura del inscripto armada por Facturita (ENG-024)", () => {
  const m = montosFacturita("RESPONSABLE_INSCRIPTO", 121_000, 5);
  assert.ok(m.ok);
  const motivo = ivaSinAlicuotaPorProducto({
    emisor: { condicionIva: "RESPONSABLE_INSCRIPTO" },
    ivaPorProducto: m.ok && m.ivaPorProducto,
  } as unknown as Parameters<typeof ivaSinAlicuotaPorProducto>[0]);
  assert.equal(motivo, null);
});

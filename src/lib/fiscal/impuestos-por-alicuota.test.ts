/**
 * R1-F5 · Los impuestos de la factura de una venta: el IVA de un inscripto sale de la alícuota de
 * cada producto, y un monotributista (CH) factura exactamente como antes. Las ventas al azar pasan
 * por el armado y la validación del plugin ARCA, que es lo que decide si el pedido sale.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularImpuestos,
  calcularImpuestosPorAlicuota,
  DIVISOR_POR_ALICUOTA,
  MOTIVO_EXENTO_O_NO_GRAVADO,
  MOTIVO_INSCRIPTO_SIN_ALICUOTA,
  MOTIVO_RENGLONES_NO_SUMAN,
  type Impuestos,
  type RenglonConAlicuota,
} from "./impuestos-por-alicuota";
import { calcularImpuestos as calcularImpuestosDeFiscal } from "@/lib/fiscal";
import { centavosDe, redondearAlCentavo } from "@/lib/dinero/redondeo";
import { cuitValido } from "@/lib/cuit";
import { PORCENTAJE_IVA } from "@/plugins/arca/domain/catalogos";
import { construirComprobante } from "@/plugins/arca/domain/comprobante";
import { validarComprobante } from "@/plugins/arca/domain/validacion";

/** La regla de antes, copiada tal cual de src/lib/fiscal.ts (HEAD) para probar que no cambió. */
function calcularImpuestosDeAntes(emisor: string, montoBruto: number): Impuestos {
  if (emisor === "RESPONSABLE_INSCRIPTO") {
    const neto = redondearAlCentavo(montoBruto / 1.21);
    const importe = redondearAlCentavo(montoBruto - neto);
    return { neto, iva: [{ alicuotaId: 5, base: neto, importe }], total: redondearAlCentavo(neto + importe) };
  }
  const neto = redondearAlCentavo(montoBruto);
  return { neto, iva: [{ alicuotaId: 3, base: neto, importe: 0 }], total: neto };
}

/** Azar con semilla: la misma corrida siempre prueba las mismas ventas. */
function azar(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const CODIGOS = [3, 4, 5, 6, 8, 9];

function ventaAlAzar(r: () => number): { total: number; renglones: RenglonConAlicuota[] } {
  const renglones: RenglonConAlicuota[] = [];
  const cuantos = 1 + Math.floor(r() * 6);
  for (let i = 0; i < cuantos; i++) {
    renglones.push({ total: Math.floor(r() * 5_000_000) / 100, alicuotaIva: CODIGOS[Math.floor(r() * CODIGOS.length)] });
  }
  const centavos = renglones.reduce((s, x) => s + centavosDe(x.total), 0);
  return { total: centavos / 100, renglones };
}

const alCentavo = (x: number) => centavosDe(x) / 100 === x;

test("monotributo y exento facturan exactamente como antes: lo cobrado como neto, sin mirar alícuotas", () => {
  assert.equal(calcularImpuestosDeFiscal, calcularImpuestos, "src/lib/fiscal.ts sigue exportando la misma regla");
  const r = azar(7);
  const montos = [15500, 1, 0.01, 1.005, 2.675, 1234.567, 99999999.99, 0, ...Array.from({ length: 500 }, () => Math.floor(r() * 1e9) / 100)];
  const renglonesRaros: RenglonConAlicuota[] = [{ total: 1, alicuotaIva: 2 }, { total: 5, alicuotaIva: null }, { total: 3 }];
  for (const emisor of ["MONOTRIBUTO", "EXENTO"] as const) {
    for (const total of montos) {
      const antes = calcularImpuestosDeAntes(emisor, total);
      assert.deepEqual(calcularImpuestos(emisor, total), antes);
      for (const renglones of [[], renglonesRaros, [{ total, alicuotaIva: 5 }]]) {
        assert.deepEqual(calcularImpuestosPorAlicuota(emisor, { total, renglones }), { ok: true, impuestos: antes, ivaPorProducto: false });
      }
    }
  }
});

test("inscripto con todo al 21 %: da lo mismo que la tasa pareja de antes, ahora con el IVA por producto", () => {
  const r = azar(21);
  for (let i = 0; i < 2000; i++) {
    const total = (1 + Math.floor(r() * 1e8)) / 100;
    const mitad = Math.floor(centavosDe(total) / 2) / 100;
    const renglones = [{ total: mitad, alicuotaIva: 5 }, { total: (centavosDe(total) - centavosDe(mitad)) / 100, alicuotaIva: 5 }];
    assert.deepEqual(calcularImpuestosPorAlicuota("RESPONSABLE_INSCRIPTO", { total, renglones }), {
      ok: true,
      impuestos: calcularImpuestosDeAntes("RESPONSABLE_INSCRIPTO", total),
      ivaPorProducto: true,
    });
  }
});

test("inscripto con 21 % y 10,5 %: discrimina cada alícuota, en orden de código, y neto + IVA = total", () => {
  const r = calcularImpuestosPorAlicuota("RESPONSABLE_INSCRIPTO", {
    total: 231.5,
    renglones: [{ total: 121, alicuotaIva: 5 }, { total: 110.5, alicuotaIva: 4 }, { total: 0, alicuotaIva: 6 }],
  });
  assert.deepEqual(r, {
    ok: true,
    impuestos: {
      neto: 200,
      iva: [
        { alicuotaId: 4, base: 100, importe: 10.5 },
        { alicuotaId: 5, base: 100, importe: 21 },
      ],
      total: 231.5,
    },
    ivaPorProducto: true,
  });
});

test("3000 ventas al azar de un inscripto: todo al centavo, cuadra exacto y el plugin ARCA las valida", () => {
  const EMISOR = { cuit: 30712345671, condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta: 1, regimenFacturaA: "A" };
  const RECEPTOR = { docTipo: 80, docNro: 20304050609, condicionIva: "RESPONSABLE_INSCRIPTO" };
  assert.ok(cuitValido(String(EMISOR.cuit)) && cuitValido(String(RECEPTOR.docNro)), "CUIT de prueba válidos");
  const r = azar(2026);
  for (let i = 0; i < 3000; i++) {
    const venta = ventaAlAzar(r);
    if (!(venta.total > 0)) continue;
    const res = calcularImpuestosPorAlicuota("RESPONSABLE_INSCRIPTO", venta);
    assert.ok(res.ok && res.ivaPorProducto, JSON.stringify(venta));
    const { neto, iva, total } = res.impuestos;
    for (const x of [neto, total, ...iva.flatMap((s) => [s.base, s.importe])]) assert.ok(alCentavo(x), `${x} no está al centavo`);
    assert.equal(centavosDe(neto), iva.reduce((s, x) => s + centavosDe(x.base), 0), "neto = suma de bases");
    assert.equal(centavosDe(total), centavosDe(neto) + iva.reduce((s, x) => s + centavosDe(x.importe), 0), "total = neto + IVA");
    assert.equal(centavosDe(total), centavosDe(venta.total), "total = lo cobrado");
    assert.deepEqual(iva.map((s) => s.alicuotaId), [...new Set(iva.map((s) => s.alicuotaId))].sort((a, b) => a - b));
    const ev = {
      invoiceId: `inv-${i}`,
      tenantId: "t",
      concepto: 1,
      fecha: "20260925",
      emisor: EMISOR,
      receptor: RECEPTOR,
      ...res.impuestos,
      ivaPorProducto: true,
    } as Parameters<typeof construirComprobante>[0];
    const v = validarComprobante(construirComprobante(ev, "20260925"));
    assert.ok(v.ok, JSON.stringify({ venta, v }));
  }
});

test("inscripto sin la alícuota de algún producto: no se factura y se dice qué cargar", () => {
  for (const renglones of [[], [{ total: 100, alicuotaIva: 5 }, { total: 21, alicuotaIva: null }], [{ total: 121 }]]) {
    const total = renglones.reduce((s, x) => s + x.total, 0) || 121;
    assert.deepEqual(calcularImpuestosPorAlicuota("RESPONSABLE_INSCRIPTO", { total, renglones }), {
      ok: false,
      motivo: MOTIVO_INSCRIPTO_SIN_ALICUOTA,
    });
  }
});

test("inscripto con un producto exento o no gravado: todavía no se emite, y se dice que va por ARCA", () => {
  for (const codigo of [1, 2]) {
    const venta = { total: 221, renglones: [{ total: 121, alicuotaIva: 5 }, { total: 100, alicuotaIva: codigo }] };
    assert.deepEqual(calcularImpuestosPorAlicuota("RESPONSABLE_INSCRIPTO", venta), { ok: false, motivo: MOTIVO_EXENTO_O_NO_GRAVADO });
  }
});

test("inscripto: no se inventa ni se reparte a ojo (código que no es de ARCA, renglones que no suman, importes inválidos)", () => {
  const RI = "RESPONSABLE_INSCRIPTO" as const;
  const desconocido = calcularImpuestosPorAlicuota(RI, { total: 100, renglones: [{ total: 100, alicuotaIva: 7 }] });
  assert.match(desconocido.ok ? "" : desconocido.motivo, /código 7/);
  assert.deepEqual(calcularImpuestosPorAlicuota(RI, { total: 90, renglones: [{ total: 100, alicuotaIva: 5 }] }), {
    ok: false,
    motivo: MOTIVO_RENGLONES_NO_SUMAN,
  });
  for (const malo of [-10, Number.NaN, Number.POSITIVE_INFINITY]) {
    const r = calcularImpuestosPorAlicuota(RI, { total: 100, renglones: [{ total: 110, alicuotaIva: 5 }, { total: malo, alicuotaIva: 5 }] });
    assert.match(r.ok ? "" : r.motivo, /no tiene un importe válido/);
  }
  for (const total of [0, -5, Number.NaN]) {
    assert.deepEqual(calcularImpuestosPorAlicuota(RI, { total, renglones: [{ total, alicuotaIva: 5 }] }), {
      ok: false,
      motivo: "Una venta sin importe no se factura.",
    });
  }
});

test("la tabla de alícuotas del Core es la misma que verifica el plugin ARCA", () => {
  const codigos = (o: object) => Object.keys(o).map(Number).sort((a, b) => a - b);
  assert.deepEqual(codigos(DIVISOR_POR_ALICUOTA), codigos(PORCENTAJE_IVA));
  for (const [codigo, porcentaje] of Object.entries(PORCENTAJE_IVA)) {
    assert.ok(Math.abs(DIVISOR_POR_ALICUOTA[Number(codigo)] - (1 + porcentaje)) < 1e-12, `alícuota ${codigo}`);
  }
});

// Los números de Facturación, Libro IVA y Cierre del mes en el Inicio, EJECUTADOS contra una
// base falsa que anota cada consulta: qué `where` usan (el de la pantalla), cuántas hacen y
// qué número sale de filas dadas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cierreDelMes, facturacion, libroIva } from "@/apps/kpis/finanzas.server";
import type { ContextoLoader, DbKpi } from "@/apps/kpis/nucleo.server";
import { filtrosFacturacionMes } from "@/lib/bancos-glue";
import { whereAnuladasConFactura, whereComprobantesDelMes } from "@/lib/libros/libro-iva";
import { consultaAuditoriaCierre } from "./cierre-mes";

type Llamada = { modelo: string; op: string; args: { where?: Record<string, unknown> } & Record<string, unknown> };

function dbFalsa(respuestas: Record<string, unknown> = {}) {
  const llamadas: Llamada[] = [];
  const db = new Proxy(
    {},
    {
      get: (_, modelo) =>
        new Proxy(
          {},
          {
            get: (__, op) => async (args: Llamada["args"]) => {
              llamadas.push({ modelo: String(modelo), op: String(op), args });
              const r = respuestas[`${String(modelo)}.${String(op)}`];
              if (r !== undefined) return r;
              if (op === "count") return 0;
              if (op === "groupBy" || op === "findMany") return [];
              return null;
            },
          },
        ),
    },
  );
  return { db: db as unknown as DbKpi, llamadas };
}

const AHORA = new Date("2026-09-23T15:00:00.000Z");

function ctx(db: DbKpi, extra: Partial<ContextoLoader> = {}): ContextoLoader {
  return {
    db,
    tenantId: "t-qa",
    hoy: "2026-09-23",
    ahora: AHORA,
    esMostrador: true,
    sustantivo: { uno: "corte", varios: "cortes" },
    monto: true,
    ...extra,
  };
}

test("Facturación: las ventas anuladas con factura sin nota de crédito van en alerta, con el where del cierre", async () => {
  const { db, llamadas } = dbFalsa({
    "invoice.groupBy": [
      { status: "AUTHORIZED", _count: { _all: 11 } },
      { status: "REJECTED", _count: { _all: 1 } },
    ],
    "invoice.count": 2,
  });
  assert.deepEqual(await facturacion(ctx(db)), {
    valor: "12",
    detalle: "comprobantes este mes · 1 rechazado por ARCA",
    alerta: { valor: "2", texto: "ventas anuladas con factura sin nota de crédito" },
  });
  const { emitido } = filtrosFacturacionMes(AHORA);
  assert.deepEqual(llamadas[0].args.where, { tenantId: "t-qa", ...emitido }, "el mes de la pantalla de facturación");
  assert.deepEqual(llamadas[1].args.where, whereAnuladasConFactura("t-qa", emitido), "el mismo where del paso del cierre");
  assert.equal(llamadas.length, 2);

  const sinAnuladas = dbFalsa({ "invoice.groupBy": [{ status: "AUTHORIZED", _count: { _all: 1 } }] });
  assert.deepEqual(await facturacion(ctx(sinAnuladas.db)), { valor: "1", detalle: "comprobante este mes" });
});

test("Libro IVA: 'IVA de septiembre a pagar', con el where y la cuenta de la pantalla; las notas de crédito restan", async () => {
  const { db, llamadas } = dbFalsa({
    "invoice.groupBy": [
      { tipoComprobante: 6, _sum: { iva: 21000 } },
      { tipoComprobante: 1, _sum: { iva: 4200 } },
      { tipoComprobante: 8, _sum: { iva: 2100 } },
    ],
  });
  const dato = await libroIva(ctx(db));
  assert.ok(dato && "valor" in dato);
  assert.match(dato.valor, /23\.100/);
  assert.equal(dato.detalle, "IVA de septiembre a pagar, sólo de comprobantes");
  assert.equal(llamadas.length, 1);
  assert.deepEqual(llamadas[0].args.where, whereComprobantesDelMes("t-qa", "2026-09"), "el mismo where del Libro IVA");

  // Monotributo (sólo C): sin número, como la pantalla, que no le muestra el libro.
  assert.equal(await libroIva(ctx(dbFalsa({ "invoice.groupBy": [{ tipoComprobante: 11, _sum: { iva: 0 } }] }).db)), null);
  // Sin comprobantes en el mes: '—' con el motivo, nunca un 0 (la pantalla muestra el mismo '—').
  assert.deepEqual(await libroIva(ctx(dbFalsa().db)), { sinDato: "Todavía no hay comprobantes con CAE de septiembre" });
  // Sin permiso para ver plata, ni se consulta.
  const sinPlata = dbFalsa();
  assert.equal(await libroIva(ctx(sinPlata.db, { monto: false })), null);
  assert.equal(sinPlata.llamadas.length, 0);
});

test("Cierre del mes: una consulta a la auditoría de agosto; desde el 3 sin congelar, alerta", async () => {
  const { db, llamadas } = dbFalsa();
  assert.deepEqual(await cierreDelMes(ctx(db)), {
    valor: "Agosto",
    detalle: "sin congelar: entrá para ver qué falta",
    alerta: { valor: "Agosto", texto: "sin cerrar" },
  });
  assert.equal(llamadas.length, 1);
  assert.deepEqual(llamadas[0].args, consultaAuditoriaCierre("t-qa", "2026-08"));

  const congelado = dbFalsa({
    "auditLog.findMany": [
      { action: "cierre-mes.congelar", createdAt: new Date("2026-09-02T12:00:00Z"), changes: { por: "Ana", listos: 6 } },
    ],
  });
  assert.deepEqual(await cierreDelMes(ctx(congelado.db)), {
    valor: "Agosto",
    detalle: "6 de 8 pasos listos · falta descargar el paquete",
  });
});

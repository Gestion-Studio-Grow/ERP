// ============================================================================
// Los números del Inicio de Catálogo y precios, EJECUTADOS contra una base falsa que anota
// cada consulta: una por número, siempre con el negocio en el `where`, el `where` de la
// pantalla, y qué número sale de filas dadas.
// ============================================================================
//
// Vive acá (y no en src/apps/kpis) porque es el frente dueño de estos números quien los
// prueba; los loaders están en src/apps/kpis/precios.server.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { APPS_PRECIOS } from "@/apps/catalogo/precios";
import {
  LOADERS_PRECIOS,
  actualizarPrecios,
  catalogo,
  datoUltimoAumento,
  etiquetasDePrecio,
} from "@/apps/kpis/precios.server";
import type { ContextoLoader, DbKpi } from "@/apps/kpis/nucleo.server";
import { whereCatalogoActivo } from "./resumen";
import { ACCION_CAMBIO_DE_PRECIO, ACCION_ETIQUETA_IMPRESA, whereAumentosGenerales, whereAuditoriaDeEtiquetas } from "./precios-auditoria";

type Llamada = { modelo: string; op: string; args: { where?: Record<string, unknown> } & Record<string, unknown> };

function dbFalsa(respuestas: Record<string, unknown> = {}) {
  const llamadas: Llamada[] = [];
  const vacio = (op: string): unknown => (op === "groupBy" || op === "findMany" ? [] : op === "count" ? 0 : null);
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
              if (r instanceof Error) throw r;
              return r === undefined ? vacio(String(op)) : r;
            },
          },
        ),
    },
  );
  return { db: db as unknown as DbKpi, llamadas };
}

function ctx(db: DbKpi, extra: Partial<ContextoLoader> = {}): ContextoLoader {
  return {
    db,
    tenantId: "t-magra",
    hoy: "2026-09-23",
    ahora: new Date("2026-09-23T15:00:00.000Z"),
    esMostrador: true,
    sustantivo: { uno: "corte", varios: "cortes" },
    monto: true,
    ...extra,
  };
}

test("cada KPI declarado en Catálogo y precios tiene su loader, y cada loader su app", () => {
  const declarados = APPS_PRECIOS.flatMap((a) => (a.kpi ? [a.kpi.id] : [])).sort();
  assert.deepEqual(Object.keys(LOADERS_PRECIOS).sort(), declarados);
});

test("una consulta por número, siempre con el negocio en el where (mostrador y servicios, con y sin plata)", async () => {
  for (const [id, loader] of Object.entries(LOADERS_PRECIOS)) {
    for (const esMostrador of [true, false]) {
      for (const monto of [true, false]) {
        const { db, llamadas } = dbFalsa();
        await loader(ctx(db, { esMostrador, monto }));
        assert.ok(llamadas.length <= 1, `${id}: ${llamadas.length} consultas`);
        for (const l of llamadas) assert.equal(l.args.where?.tenantId, "t-magra", `${id}: sin el negocio`);
      }
    }
  }
});

test("Catálogo: '2 sin precio · 1 sin costo' con el where de la pantalla y el costo vigente de stock/costo.ts", async () => {
  const d = new Date("2026-09-10T12:00:00Z");
  const { db, llamadas } = dbFalsa({
    "product.findMany": [
      // Con precio y con costo de una compra.
      { id: "a", saleUnit: "WEIGHT", price: null, pricePerKg: 12500, stockMovements: [], purchaseItems: [{ unitCost: 8000, purchase: { createdAt: d } }] },
      // Sin precio (por kilo sin pricePerKg), con costo de un despiece (REPOSICION).
      { id: "b", saleUnit: "WEIGHT", price: 900, pricePerKg: null, stockMovements: [{ unitCost: 6000, createdAt: d }], purchaseItems: [] },
      // Sin precio y sin costo.
      { id: "c", saleUnit: "UNIT", price: null, pricePerKg: null, stockMovements: [], purchaseItems: [] },
    ],
  });
  assert.deepEqual(await catalogo(ctx(db)), { valor: "2", detalle: "sin precio · 1 sin costo" });
  assert.equal(llamadas.length, 1);
  assert.deepEqual(llamadas[0].args.where, whereCatalogoActivo("t-magra"), "el mismo where que el resumen de la pantalla");
  // En un negocio de servicios no hay número (sus productos son insumos): ni consulta.
  const spa = dbFalsa();
  assert.equal(await catalogo(ctx(spa.db, { esMostrador: false })), null);
  assert.equal(spa.llamadas.length, 0);
});

test("Actualizar precios: '23 días desde el último aumento (+8 %)'; sin ninguno, '—' con el motivo", async () => {
  const { db, llamadas } = dbFalsa({
    "auditLog.findFirst": {
      // 31/08 a las 15:00 en Buenos Aires.
      createdAt: new Date("2026-08-31T18:00:00.000Z"),
      changes: { origen: "actualizar-precios", lote: { id: "L", sentido: "subir", porcentaje: 8, redondeo: 50 } },
    },
  });
  assert.deepEqual(await actualizarPrecios(ctx(db)), { valor: "23 días", detalle: "desde el último aumento (+8 %)" });
  assert.deepEqual(llamadas[0].args.where, whereAumentosGenerales("t-magra"));
  assert.deepEqual(llamadas[0].args.orderBy, { createdAt: "desc" });

  const vacia = dbFalsa();
  assert.deepEqual(await actualizarPrecios(ctx(vacia.db)), { sinDato: "Todavía no se cambiaron precios en bloque desde el sistema" });
});

test("el texto del último cambio: hoy, ayer, baja y planilla", () => {
  assert.deepEqual(datoUltimoAumento({ dias: 0, origen: "actualizar-precios", porcentaje: "+8 %" }), {
    valor: "Hoy",
    detalle: "último aumento (+8 %)",
  });
  assert.deepEqual(datoUltimoAumento({ dias: 1, origen: "actualizar-precios", porcentaje: "−5 %" }), {
    valor: "Ayer",
    detalle: "última baja (−5 %)",
  });
  assert.deepEqual(datoUltimoAumento({ dias: 12, origen: "actualizar-precios", porcentaje: "−5 %" }), {
    valor: "12 días",
    detalle: "desde la última baja (−5 %)",
  });
  assert.deepEqual(datoUltimoAumento({ dias: 40, origen: "planilla", porcentaje: null }), {
    valor: "40 días",
    detalle: "desde el último cambio por planilla",
  });
});

test("Etiquetas: '14 precios cambiaron y no se reimprimieron', con el where y la cuenta de la pantalla", async () => {
  const grupos = [];
  for (let i = 0; i < 20; i++) grupos.push({ entityId: `p${i}`, action: ACCION_CAMBIO_DE_PRECIO, _max: { createdAt: new Date("2026-09-20T10:00:00Z") } });
  for (let i = 0; i < 6; i++) grupos.push({ entityId: `p${i}`, action: ACCION_ETIQUETA_IMPRESA, _max: { createdAt: new Date("2026-09-21T10:00:00Z") } });
  const { db, llamadas } = dbFalsa({ "auditLog.groupBy": grupos });
  assert.deepEqual(await etiquetasDePrecio(ctx(db)), { valor: "14", detalle: "precios cambiaron y no se reimprimieron" });
  assert.deepEqual(llamadas[0].args.where, whereAuditoriaDeEtiquetas("t-magra"));
  assert.deepEqual(llamadas[0].args.by, ["entityId", "action"]);

  const uno = dbFalsa({ "auditLog.groupBy": [grupos[0]] });
  assert.deepEqual(await etiquetasDePrecio(ctx(uno.db)), { valor: "1", detalle: "precio cambió y no se reimprimió" });
  const nada = dbFalsa();
  assert.deepEqual(await etiquetasDePrecio(ctx(nada.db)), { valor: "0", detalle: "precios para reimprimir" });
});

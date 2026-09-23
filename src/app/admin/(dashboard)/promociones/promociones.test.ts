// ============================================================================
// PROMOCIONES Y CUPONES, y el número de ETIQUETAS — los botones del Inicio, EJECUTADOS contra
// una base falsa que anota cada consulta (el `where` de la pantalla, siempre con el negocio).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { APPS_PRECIOS } from "@/apps/catalogo/precios";
import { etiquetasDePrecio, pendientesEnLaLista, promociones, type ProductoDeEtiqueta } from "@/apps/kpis/precios.server";
import type { ContextoLoader, DbKpi } from "@/apps/kpis/nucleo.server";
import { ACCION_CAMBIO_DE_PRECIO, ACCION_ETIQUETA_IMPRESA, pendientesDeEtiqueta } from "@/lib/catalogo/precios-auditoria";
import { cuponAgotado, whereCuponesVigentes } from "@/lib/venta-reglas";

type Llamada = { modelo: string; op: string; args: { where?: Record<string, unknown> } & Record<string, unknown> };

function dbFalsa(respuestas: Record<string, unknown | ((a: Llamada["args"]) => unknown)> = {}) {
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
              return typeof r === "function" ? (r as (a: Llamada["args"]) => unknown)(args) : (r ?? []);
            },
          },
        ),
    },
  );
  return { db: db as unknown as DbKpi, llamadas };
}

const AHORA = new Date("2026-09-23T15:00:00.000Z");
const ctx = (db: DbKpi): ContextoLoader => ({
  db,
  tenantId: "t-magra",
  hoy: "2026-09-23",
  ahora: AHORA,
  esMostrador: true,
  sustantivo: { uno: "corte", varios: "cortes" },
  monto: true,
});

test("la app Promociones está registrada con su ruta, su capability y su número", () => {
  const app = APPS_PRECIOS.find((a) => a.id === "promociones");
  assert.ok(app);
  assert.equal(app.ruta, "/admin/promociones");
  assert.equal(app.capability, "coupons:manage");
  assert.equal(app.kpi?.id, "promociones");
  assert.equal("menuDeHoy" in app, false, "no entra en la barra de CH");
});

test("Promociones: '4 cupones activos · 12 usos' en UNA consulta, con el where de la pantalla", async () => {
  const { db, llamadas } = dbFalsa({ "coupon.aggregate": { _count: { _all: 4 }, _sum: { usedCount: 12 } } });
  assert.deepEqual(await promociones(ctx(db)), { valor: "4", detalle: "cupones activos · 12 usos" });
  assert.equal(llamadas.length, 1);
  assert.deepEqual(llamadas[0].args.where, whereCuponesVigentes("t-magra", AHORA));
  assert.deepEqual(llamadas[0].args.where, {
    tenantId: "t-magra",
    active: true,
    OR: [{ expiresAt: null }, { expiresAt: { gte: AHORA } }],
  });
  const uno = dbFalsa({ "coupon.aggregate": { _count: { _all: 1 }, _sum: { usedCount: 1 } } });
  assert.deepEqual(await promociones(ctx(uno.db)), { valor: "1", detalle: "cupón activo · 1 uso" });
  const nada = dbFalsa({ "coupon.aggregate": { _count: { _all: 0 }, _sum: { usedCount: null } } });
  assert.deepEqual(await promociones(ctx(nada.db)), { valor: "0", detalle: "cupones activos" });
  assert.equal(cuponAgotado({ maxUses: 3, usedCount: 3 }), true);
  assert.equal(cuponAgotado({ maxUses: null, usedCount: 99 }), false);
});

test("Etiquetas: el botón y el titular de la pantalla cuentan lo mismo (no borrado y con precio)", async () => {
  // 4 productos con el precio cambiado y sin reimprimir; de esos, uno se borró y otro se quedó
  // sin precio: la lista de Etiquetas muestra 2, y el botón y el titular dicen 2.
  const grupos = ["p1", "p2", "p3", "p4"].map((id) => ({
    entityId: id,
    action: ACCION_CAMBIO_DE_PRECIO,
    _max: { createdAt: new Date("2026-09-20T10:00:00Z") },
  }));
  grupos.push({ entityId: "p5", action: ACCION_CAMBIO_DE_PRECIO, _max: { createdAt: new Date("2026-09-19T10:00:00Z") } });
  grupos.push({ entityId: "p5", action: ACCION_ETIQUETA_IMPRESA, _max: { createdAt: new Date("2026-09-20T10:00:00Z") } });
  const catalogo: Record<string, ProductoDeEtiqueta> = {
    p1: { id: "p1", deletedAt: null, saleUnit: "WEIGHT", price: null, pricePerKg: 12500 },
    p2: { id: "p2", deletedAt: null, saleUnit: "UNIT", price: 4000, pricePerKg: null },
    p3: { id: "p3", deletedAt: new Date("2026-09-21T10:00:00Z"), saleUnit: "UNIT", price: 3000, pricePerKg: null }, // se borró
    p4: { id: "p4", deletedAt: null, saleUnit: "UNIT", price: null, pricePerKg: null }, // se quedó sin precio
    p5: { id: "p5", deletedAt: null, saleUnit: "UNIT", price: 5000, pricePerKg: null }, // ya reimpreso
    p9: { id: "p9", deletedAt: null, saleUnit: "UNIT", price: 900, pricePerKg: null }, // nunca cambió
  };
  const { db, llamadas } = dbFalsa({
    "auditLog.groupBy": grupos,
    "product.findMany": (a: Llamada["args"]) => {
      const ids = ((a.where as { id: { in: string[] } }).id.in ?? []) as string[];
      return ids.filter((id) => catalogo[id]).map((id) => catalogo[id]);
    },
  });
  const boton = await etiquetasDePrecio(ctx(db));
  assert.deepEqual(boton, { valor: "2", detalle: "precios cambiaron y no se reimprimieron" });

  // DOS consultas (la excepción declarada en el loader), las dos con el negocio.
  assert.deepEqual(llamadas.map((l) => `${l.modelo}.${l.op}`), ["auditLog.groupBy", "product.findMany"]);
  for (const l of llamadas) assert.equal(l.args.where?.tenantId, "t-magra");
  const productos = llamadas[1];
  assert.deepEqual([...((productos.args.where as { id: { in: string[] } }).id.in)].sort(), ["p1", "p2", "p3", "p4"], "p5 ya se reimprimió");
  assert.equal("deletedAt" in (productos.args.where ?? {}), false, "la regla no vive en el where: la aplica la función");

  // La pantalla: sus productos son los NO borrados del negocio (`leerProductosParaPrecios`), y
  // el titular sale de la MISMA función con el mismo mapa de pendientes.
  const deLaPantalla = Object.values(catalogo)
    .filter((p) => p.deletedAt == null)
    .map((p) => ({ id: p.id, saleUnit: p.saleUnit, price: p.price, pricePerKg: p.pricePerKg }));
  const titular = pendientesEnLaLista(pendientesDeEtiqueta(grupos), deLaPantalla);
  assert.equal(titular, 2);
  assert.equal(String(titular), (boton as { valor: string }).valor, "el botón y el titular dicen lo mismo");

  // Nada pendiente: una sola consulta, y un 0 real.
  const vacio = dbFalsa();
  assert.deepEqual(await etiquetasDePrecio(ctx(vacio.db)), { valor: "0", detalle: "precios para reimprimir" });
  assert.equal(vacio.llamadas.length, 1);
});

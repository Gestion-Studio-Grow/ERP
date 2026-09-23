// ============================================================================
// El rastro de los precios: una fila por producto que cambia, y "qué etiqueta falta" como
// cuenta entre el último cambio y la última impresión de CADA producto.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCION_CAMBIO_DE_PRECIO,
  ACCION_ETIQUETA_IMPRESA,
  cambioDePrecioDeUnProducto,
  diasEntre,
  filasCambioDePrecio,
  filasEtiquetaImpresa,
  haceCuanto,
  pendientesDeEtiqueta,
  registrarCambiosDePrecio,
  resumenDeFilaDePrecio,
  resumirUltimoAumento,
  ultimaImpresion,
  whereAumentosGenerales,
  whereAuditoriaDeEtiquetas,
  type GrupoAuditoria,
} from "./precios-auditoria";

const t = (s: string) => new Date(`2026-09-${s}Z`);
const g = (entityId: string | null, action: string, cuando: string | null): GrupoAuditoria => ({
  entityId,
  action,
  _max: { createdAt: cuando ? t(cuando) : null },
});

test("pendientes: cambió después de su última etiqueta → pendiente; impresa después del cambio → al día", () => {
  const grupos = [
    // Vacío: cambió el 20, se imprimió el 18 → pendiente.
    g("vacio", ACCION_CAMBIO_DE_PRECIO, "20T10:00:00"),
    g("vacio", ACCION_ETIQUETA_IMPRESA, "18T10:00:00"),
    // Entraña: cambió el 20, se imprimió el 21 → al día.
    g("entrana", ACCION_CAMBIO_DE_PRECIO, "20T10:00:00"),
    g("entrana", ACCION_ETIQUETA_IMPRESA, "21T09:00:00"),
    // Matambre: cambió y nunca se imprimió → pendiente.
    g("matambre", ACCION_CAMBIO_DE_PRECIO, "22T08:00:00"),
    // Chorizo: sólo se imprimió → al día.
    g("chorizo", ACCION_ETIQUETA_IMPRESA, "22T08:00:00"),
    // Filas que no son de esto (o sin producto) no cuentan.
    g(null, ACCION_CAMBIO_DE_PRECIO, "22T08:00:00"),
    g("otro", "update", "23T08:00:00"),
  ];
  const p = pendientesDeEtiqueta(grupos);
  assert.deepEqual([...p.keys()].sort(), ["matambre", "vacio"]);
  assert.equal(p.get("vacio")?.toISOString(), "2026-09-20T10:00:00.000Z");
  assert.equal(ultimaImpresion(grupos)?.toISOString(), "2026-09-22T08:00:00.000Z");
  assert.equal(ultimaImpresion([]), null);
});

test("pendientes es POR PRODUCTO: reimprimir 10 de los 60 que cambiaron deja 50 pendientes", () => {
  const grupos: GrupoAuditoria[] = [];
  for (let i = 0; i < 60; i++) grupos.push(g(`p${i}`, ACCION_CAMBIO_DE_PRECIO, "20T10:00:00"));
  for (let i = 0; i < 10; i++) grupos.push(g(`p${i}`, ACCION_ETIQUETA_IMPRESA, "21T10:00:00"));
  assert.equal(pendientesDeEtiqueta(grupos).size, 50);
});

test("60 cambios de precio son 60 filas: cada una con su producto, su antes y su después", () => {
  const cambios = Array.from({ length: 60 }, (_, i) => ({
    productId: `p${i}`,
    nombre: `Corte vacuno ${i}`,
    saleUnit: "WEIGHT" as const,
    antes: 10000 + i,
    despues: 10850 + i,
  }));
  const filas = filasCambioDePrecio({
    tenantId: "t-magra",
    actor: "user:u1",
    origen: "actualizar-precios",
    cambios,
    lote: { id: "L1", sentido: "subir", porcentaje: 8, redondeo: 50 },
  });
  assert.equal(filas.length, 60);
  assert.deepEqual(filas[0], {
    tenantId: "t-magra",
    actor: "user:u1",
    action: ACCION_CAMBIO_DE_PRECIO,
    entity: "Product",
    entityId: "p0",
    channel: "admin",
    changes: {
      origen: "actualizar-precios",
      nombre: "Corte vacuno 0",
      forma: "kg",
      antes: 10000,
      despues: 10850,
      lote: { id: "L1", sentido: "subir", porcentaje: 8, redondeo: 50 },
    },
  });
  assert.ok(filas.every((f) => f.tenantId === "t-magra" && f.entityId));
});

test("registrarCambiosDePrecio: UNA sentencia con todas las filas; sin cambios no escribe", async () => {
  const llamadas: unknown[][] = [];
  const tx = {
    auditLog: {
      async createMany(args: { data: unknown[] }) {
        llamadas.push(args.data);
        return { count: args.data.length };
      },
    },
  } as unknown as Parameters<typeof registrarCambiosDePrecio>[0];
  const n = await registrarCambiosDePrecio(tx, {
    tenantId: "t",
    actor: "user:u",
    origen: "planilla",
    cambios: [
      { productId: "a", nombre: "A", saleUnit: "UNIT", antes: 100, despues: 110 },
      { productId: "b", nombre: "B", saleUnit: "WEIGHT", antes: null, despues: 9000 },
    ],
  });
  assert.equal(n, 2);
  assert.equal(llamadas.length, 1);
  assert.equal(await registrarCambiosDePrecio(tx, { tenantId: "t", actor: "u", origen: "planilla", cambios: [] }), 0);
  assert.equal(llamadas.length, 1, "sin cambios, ninguna sentencia");
});

test("la etiqueta impresa guarda el precio que salió en el papel", () => {
  const [f] = filasEtiquetaImpresa({
    tenantId: "t",
    actor: "user:u",
    plantilla: "a4",
    etiquetas: [{ productId: "vacio", nombre: "Vacío", precio: 13500, saleUnit: "WEIGHT" }],
  });
  assert.equal(f.action, ACCION_ETIQUETA_IMPRESA);
  assert.equal(f.entityId, "vacio");
  assert.deepEqual(f.changes, { nombre: "Vacío", precio: 13500, forma: "kg", plantilla: "a4" });
});

test("edición de un producto: sólo deja fila si el precio de venta cambió y queda con precio", () => {
  const antes = { saleUnit: "WEIGHT" as const, price: null, pricePerKg: 12500 };
  const base = { productId: "vacio", nombre: "Vacío" };
  // Cambió el precio por kilo.
  assert.deepEqual(cambioDePrecioDeUnProducto({ ...base, antes, venta: { saleUnit: "WEIGHT", price: null, pricePerKg: 13500 } }), {
    productId: "vacio",
    nombre: "Vacío",
    saleUnit: "WEIGHT",
    antes: 12500,
    despues: 13500,
  });
  // Mismo precio (se editó el nombre o el stock mínimo): nada.
  assert.equal(cambioDePrecioDeUnProducto({ ...base, antes, venta: { saleUnit: "WEIGHT", price: null, pricePerKg: 12500 } }), null);
  // El formulario no trae los campos de venta: no se tocan, nada que anotar.
  assert.equal(cambioDePrecioDeUnProducto({ ...base, antes, venta: {} }), null);
  // Se quedó sin precio: no hay etiqueta que imprimir.
  assert.equal(cambioDePrecioDeUnProducto({ ...base, antes, venta: { saleUnit: "WEIGHT", price: null, pricePerKg: null } }), null);
  // Pasó a venderse por unidad: cambió la forma, cambia la etiqueta.
  assert.deepEqual(
    cambioDePrecioDeUnProducto({ ...base, antes, venta: { saleUnit: "UNIT", price: 9000, pricePerKg: null } }),
    { productId: "vacio", nombre: "Vacío", saleUnit: "UNIT", antes: 12500, despues: 9000 },
  );
  // Un alta con precio: antes null.
  assert.deepEqual(
    cambioDePrecioDeUnProducto({ ...base, antes: null, venta: { saleUnit: "WEIGHT", price: null, pricePerKg: 12500 } }),
    { productId: "vacio", nombre: "Vacío", saleUnit: "WEIGHT", antes: null, despues: 12500 },
  );
  // Un alta sin precio (un insumo): nada.
  assert.equal(cambioDePrecioDeUnProducto({ ...base, antes: null, venta: {} }), null);
});

test("último aumento: días en el calendario del negocio, con el porcentaje del lote", () => {
  assert.equal(diasEntre("2026-08-31", "2026-09-23"), 23);
  assert.equal(diasEntre("2026-09-23", "2026-09-23"), 0);
  assert.equal(diasEntre("2026-02-28", "2026-03-01"), 1);
  const lote = { origen: "actualizar-precios", lote: { id: "L", sentido: "subir", porcentaje: 8, redondeo: 50 } };
  assert.deepEqual(resumirUltimoAumento({ diaDelCambio: "2026-08-31", changes: lote }, "2026-09-23"), {
    dias: 23,
    origen: "actualizar-precios",
    porcentaje: "+8 %",
  });
  assert.deepEqual(
    resumirUltimoAumento({ diaDelCambio: "2026-09-23", changes: { origen: "actualizar-precios", lote: { sentido: "bajar", porcentaje: 5.5 } } }, "2026-09-23"),
    { dias: 0, origen: "actualizar-precios", porcentaje: "−5,5 %" },
  );
  assert.deepEqual(resumirUltimoAumento({ diaDelCambio: "2026-09-20", changes: { origen: "planilla" } }, "2026-09-23"), {
    dias: 3,
    origen: "planilla",
    porcentaje: null,
  });
  assert.equal(resumirUltimoAumento(null, "2026-09-23"), null);
  // Un JSON raro no rompe: se resume lo que se puede.
  assert.deepEqual(resumirUltimoAumento({ diaDelCambio: "2026-09-22", changes: "texto" }, "2026-09-23"), {
    dias: 1,
    origen: null,
    porcentaje: null,
  });
  assert.equal(haceCuanto(0), "hoy");
  assert.equal(haceCuanto(1), "ayer");
  assert.equal(haceCuanto(23), "hace 23 días");
});

test("los where: filtran por negocio, por producto y por acción; el de aumentos deja afuera la edición suelta", () => {
  assert.deepEqual(whereAuditoriaDeEtiquetas("t1"), {
    tenantId: "t1",
    entity: "Product",
    action: { in: [ACCION_CAMBIO_DE_PRECIO, ACCION_ETIQUETA_IMPRESA] },
    entityId: { not: null },
  });
  const w = whereAumentosGenerales("t1");
  assert.equal(w.tenantId, "t1");
  assert.equal(w.action, ACCION_CAMBIO_DE_PRECIO);
  assert.deepEqual(
    w.OR.map((o) => o.changes.equals),
    ["actualizar-precios", "planilla"],
    "ni 'catalogo' (un precio suelto) ni 'alta' cuentan como aumento",
  );
});

test("auditoría: la fila de un cambio de precio y la de una etiqueta se leen en palabras, con lo que se guardó", () => {
  const plata = (n: number) => `$${n}`;
  const [fila] = filasCambioDePrecio({
    tenantId: "t",
    actor: "user:u",
    origen: "actualizar-precios",
    cambios: [{ productId: "p1", nombre: "Vacío", saleUnit: "WEIGHT", antes: 9000, despues: 9900 }],
  });
  assert.equal(resumenDeFilaDePrecio(fila.action, fila.changes, plata), "Vacío: $9000 → $9900 /kg");
  // Un alta (o un producto que se vendía sin precio): "sin precio".
  const [alta] = filasCambioDePrecio({
    tenantId: "t",
    actor: "user:u",
    origen: "alta",
    cambios: [{ productId: "p2", nombre: "Vela", saleUnit: "UNIT", antes: null, despues: 4500 }],
  });
  assert.equal(resumenDeFilaDePrecio(alta.action, alta.changes, plata), "Vela: sin precio → $4500");
  const [etiqueta] = filasEtiquetaImpresa({
    tenantId: "t",
    actor: "user:u",
    plantilla: "gondola",
    etiquetas: [{ productId: "p1", nombre: "Vacío", saleUnit: "WEIGHT", precio: 9900 }],
  } as Parameters<typeof filasEtiquetaImpresa>[0]);
  assert.equal(resumenDeFilaDePrecio(etiqueta.action, etiqueta.changes, plata), "Vacío: $9900 /kg");
  // Otra acción, o una fila con otra forma: null (la pantalla muestra el volcado de siempre).
  assert.equal(resumenDeFilaDePrecio("update", fila.changes, plata), null);
  assert.equal(resumenDeFilaDePrecio(ACCION_CAMBIO_DE_PRECIO, { raro: 1 }, plata), null);
  assert.equal(resumenDeFilaDePrecio(ACCION_ETIQUETA_IMPRESA, null, plata), null);
});

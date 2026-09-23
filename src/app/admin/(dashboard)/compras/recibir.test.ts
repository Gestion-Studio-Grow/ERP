// Recibir mercadería A CUENTA CORRIENTE, ejecutado: la decisión pura y la persistencia real
// (`registrarCompraEnTx`) contra un doble de transacción que anota lo que se escribe. Lo que se
// prueba es lo que pide el criterio de aceptación: la deuda nace en la MISMA transacción que la
// compra, con el vencimiento y la factura, atada a la compra (así la devolución la encuentra) y
// sin sacar plata de la caja; y una compra a cuenta corriente sin proveedor no deja nada escrito.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPurchaseLines,
  lineasDeLaRecepcion,
  pagoDeLaRecepcion,
  registrarCompraEnTx,
  type PurchaseInput,
} from "@/lib/stock/purchase-core";
import { decidirDeudaDeCompra, diaMasDias, leerFactura, leerVencimiento, DIAS_DE_CUENTA_CORRIENTE } from "@/lib/stock/purchase-egreso";
import { dateStrInBusinessTz } from "@/lib/datetime";
import type { LedgerTx } from "@/lib/stock/ledger";

// ── La decisión, pura ───────────────────────────────────────────────────────

test("a 30 días: el vencimiento propuesto cruza de mes y de año bien", () => {
  assert.equal(DIAS_DE_CUENTA_CORRIENTE, 30);
  assert.equal(diaMasDias("2026-09-23", 30), "2026-10-23");
  assert.equal(diaMasDias("2026-12-15", 30), "2027-01-14");
  assert.equal(diaMasDias("2028-02-28", 1), "2028-02-29", "año bisiesto");
});

test("el vencimiento y la factura del formulario", () => {
  assert.equal(leerVencimiento(""), null, "sin vencimiento pactado");
  assert.equal(leerVencimiento("2026-10-23"), "2026-10-23");
  assert.equal(leerVencimiento("2026-02-30"), "invalido");
  assert.equal(leerFactura("  A 0001-00012345  "), "A 0001-00012345");
  assert.equal(leerFactura("   "), null);
  assert.equal(leerFactura("x".repeat(80))?.length, 40, "se recorta: es un detalle, no un documento");
});

test("cómo se pagó, según quién carga: el encargado no deja deudas (no ve el costo)", () => {
  const cc = { pago: "CUENTA_CORRIENTE", vence: "2026-10-23", factura: "A 1-2" };
  assert.deepEqual(pagoDeLaRecepcion("COMPRA", true, cc), {
    estado: "CUENTA_CORRIENTE",
    vence: "2026-10-23",
    factura: "A 1-2",
  });
  assert.equal(pagoDeLaRecepcion("COMPRA", false, cc), null, "RECEPTION: sin pago ni deuda");
  assert.equal(pagoDeLaRecepcion("REPOSICION", true, cc), null, "una reposición no se paga");
  assert.deepEqual(pagoDeLaRecepcion("COMPRA", true, { pago: "MP" }), { estado: "PAGADA", method: "MP" });
  assert.equal(pagoDeLaRecepcion("COMPRA", true, { pago: "CHEQUE" }), null, "un medio que no existe no se inventa");
  assert.throws(() => pagoDeLaRecepcion("COMPRA", true, { ...cc, vence: "30/02" }), /no es una fecha válida/);
});

test("la deuda: sólo una COMPRA a cuenta corriente, con proveedor de la lista y con costo", () => {
  const cc = { estado: "CUENTA_CORRIENTE" as const, vence: "2026-10-23", factura: "A 0001-00012345" };
  assert.deepEqual(decidirDeudaDeCompra({ kind: "COMPRA", code: 12, supplierId: "prov", totalCost: 150000.456, pago: cc }), {
    tipo: "deuda",
    amount: 150000.46,
    concept: "Factura A 0001-00012345 · compra #12",
    vence: "2026-10-23",
  });
  assert.equal(
    decidirDeudaDeCompra({ kind: "COMPRA", code: 12, supplierId: "prov", totalCost: 1, pago: { estado: "CUENTA_CORRIENTE" } }).tipo,
    "deuda",
    "sin vencimiento ni factura también (la deuda queda sin vencimiento pactado)",
  );
  const sinProveedor = decidirDeudaDeCompra({ kind: "COMPRA", code: 1, supplierId: null, totalCost: 1000, pago: cc });
  assert.equal(sinProveedor.tipo, "rechazo");
  assert.match((sinProveedor as { error: string }).error, /elegí el proveedor de la lista/);
  assert.equal(decidirDeudaDeCompra({ kind: "COMPRA", code: 1, supplierId: "prov", totalCost: 0, pago: cc }).tipo, "rechazo");
  assert.equal(decidirDeudaDeCompra({ kind: "REPOSICION", code: 1, supplierId: "prov", totalCost: 1000, pago: cc }).tipo, "rechazo");
  assert.deepEqual(
    decidirDeudaDeCompra({ kind: "COMPRA", code: 1, supplierId: "prov", totalCost: 1000, pago: { estado: "PAGADA", method: "EFECTIVO" } }),
    { tipo: "sin-deuda" },
  );
});

test("las líneas del remito se leen con la regla del mostrador: '12,5' kg a '$6.543'", () => {
  assert.deepEqual(lineasDeLaRecepcion(["vacio"], ["12,5"], ["$6.543"], true), [{ productId: "vacio", qty: 12.5, unitCost: 6543 }]);
  assert.deepEqual(lineasDeLaRecepcion(["vacio"], ["12,5"], ["$6.543"], false), [{ productId: "vacio", qty: 12.5, unitCost: 0 }], "sin costos: no se lee");
  assert.throws(() => lineasDeLaRecepcion(["vacio"], [""], [""], true), /Línea 1: falta la cantidad/);
  assert.throws(() => lineasDeLaRecepcion(["vacio"], ["12"], ["6.5.43"], true), /no es un importe/);
});

// ── La persistencia real, contra un doble de transacción ────────────────────

type Escrito = { modelo: string; data: Record<string, unknown> };

function deposito(opts: { proveedorActivo?: boolean } = {}) {
  const escritos: Escrito[] = [];
  const stock = new Map<string, number>([["vacio", 2]]);
  const tx = {
    $executeRaw: async () => 0,
    supplier: {
      findFirst: async (a: { where: { id: string; tenantId: string } }) =>
        a.where.id === "prov" && opts.proveedorActivo !== false ? { id: "prov", name: "Estancia Don Ramón" } : null,
    },
    stockPurchase: {
      findMany: async () => [],
      findFirst: async () => ({ code: 11 }),
      create: async (a: { data: Record<string, unknown> }) => {
        escritos.push({ modelo: "stockPurchase", data: a.data });
        return { id: "compra-12", code: a.data.code };
      },
    },
    product: {
      updateMany: async (a: { where: { id: string }; data: { stock: { increment: number } | number } }) => {
        const d = a.data.stock;
        stock.set(a.where.id, typeof d === "number" ? d : (stock.get(a.where.id) ?? 0) + d.increment);
        return { count: 1 };
      },
      findUnique: async (a: { where: { id: string } }) => ({ stock: stock.get(a.where.id) ?? 0 }),
    },
    stockMovement: {
      create: async (a: { data: Record<string, unknown> }) => {
        escritos.push({ modelo: "stockMovement", data: a.data });
        return a.data;
      },
    },
    accountPayable: {
      create: async (a: { data: Record<string, unknown> }) => {
        escritos.push({ modelo: "accountPayable", data: a.data });
        return { id: "deuda-1" };
      },
    },
    cashMovement: {
      findFirst: async () => null,
      create: async (a: { data: Record<string, unknown> }) => {
        escritos.push({ modelo: "cashMovement", data: a.data });
        return { id: "mov-1" };
      },
    },
    cashSession: { findFirst: async () => null },
  };
  return { tx: tx as unknown as LedgerTx, escritos, stock };
}

const lines = buildPurchaseLines([{ id: "vacio", name: "Vacío", unit: "kg" }], [{ productId: "vacio", qty: 20, unitCost: 7500 }]);
const previo = { lines, hoy: "2026-09-23", cerradoHasta: null, ahora: new Date("2026-09-23T15:00:00.000Z") };
const compra = (pago: PurchaseInput["pago"], supplierId: string | null = "prov"): PurchaseInput => ({
  kind: "COMPRA",
  supplierId,
  supplier: null,
  notes: null,
  createdBy: "user:duena",
  items: [{ productId: "vacio", qty: 20, unitCost: 7500 }],
  pago,
});

test("criterio: a cuenta corriente a 30 días → la deuda nace con la compra, atada a ella, y no sale plata de la caja", async () => {
  const d = deposito();
  const vence = diaMasDias("2026-09-23", 30);
  const r = await registrarCompraEnTx(d.tx, "t-qa", compra({ estado: "CUENTA_CORRIENTE", vence, factura: "A 0001-00012345" }), previo);

  assert.equal(r.code, 12);
  assert.equal(d.stock.get("vacio"), 22, "la mercadería entró");
  assert.deepEqual(r.deuda, { payableId: "deuda-1", amount: 150000, concept: "Factura A 0001-00012345 · compra #12", vence });
  const deuda = d.escritos.find((e) => e.modelo === "accountPayable")!.data;
  assert.equal(deuda.tenantId, "t-qa");
  assert.equal(deuda.supplierId, "prov");
  assert.equal(deuda.amount, 150000);
  assert.equal(deuda.purchaseId, "compra-12", "la devolución a proveedor busca la deuda por esta compra");
  assert.equal(deuda.createdBy, "user:duena");
  // El vencimiento es un DÍA: en hora del negocio (como lo lee Cuentas a pagar) es el 23/10.
  assert.equal(dateStrInBusinessTz(deuda.dueDate as Date), "2026-10-23");
  // No hay egreso: se debe, no se pagó.
  assert.equal(d.escritos.some((e) => e.modelo === "cashMovement"), false);
  assert.deepEqual(r.egreso, { asentado: false, motivo: "cuenta-corriente" });
  // Y el orden: la deuda se escribe después de la compra y su stock, dentro de la misma tx.
  assert.deepEqual(
    d.escritos.map((e) => e.modelo),
    ["stockPurchase", "stockMovement", "accountPayable"],
  );
});

test("a cuenta corriente SIN proveedor de la lista: se rechaza antes de escribir nada", async () => {
  const d = deposito();
  await assert.rejects(
    registrarCompraEnTx(d.tx, "t-qa", compra({ estado: "CUENTA_CORRIENTE", vence: "2026-10-23" }, null), previo),
    /elegí el proveedor de la lista/,
  );
  assert.deepEqual(d.escritos, [], "ni la compra, ni el stock, ni la deuda");
  assert.equal(d.stock.get("vacio"), 2);
});

test("a cuenta corriente con un proveedor dado de baja: tampoco", async () => {
  const d = deposito({ proveedorActivo: false });
  await assert.rejects(registrarCompraEnTx(d.tx, "t-qa", compra({ estado: "CUENTA_CORRIENTE" }), previo), /dado de baja/);
  assert.deepEqual(d.escritos, []);
});

test("pagada en efectivo: egreso en la caja y ninguna deuda (como siempre)", async () => {
  const d = deposito();
  const r = await registrarCompraEnTx(d.tx, "t-qa", compra({ estado: "PAGADA", method: "EFECTIVO" }), previo);
  assert.equal(r.deuda, null);
  assert.equal(d.escritos.some((e) => e.modelo === "accountPayable"), false);
  const egreso = d.escritos.find((e) => e.modelo === "cashMovement")!.data;
  assert.equal(egreso.amount, 150000);
  assert.equal(egreso.method, "EFECTIVO");
});

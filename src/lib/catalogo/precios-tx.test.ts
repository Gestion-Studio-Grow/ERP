// ============================================================================
// Lo que decide el servidor al APLICAR un aumento, ejecutado contra una transacción falsa:
// escribe sólo si el plan es el que vio la persona, pide la confirmación extra, y un precio
// sin su registro deshace todo.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import type { LedgerTx } from "@/lib/stock/ledger";
import { planificarAumento, type PedidoAumento } from "./aumento-core";
import { aplicarAumentoEnTx, esConflictoDeSerializacion } from "./precios-tx";

type Fila = { id: string; name: string; unit: string; active: boolean; saleUnit: "UNIT" | "WEIGHT"; price: number | null; pricePerKg: number | null };

const CATALOGO: Fila[] = [
  ...Array.from({ length: 60 }, (_, i) => ({
    id: `v${i + 1}`,
    name: `Corte vacuno ${i + 1}`,
    unit: "kg",
    active: true,
    saleUnit: "WEIGHT" as const,
    price: null,
    pricePerKg: 9000 + (i + 1) * 137,
  })),
  { id: "c1", name: "Bondiola de cerdo", unit: "kg", active: true, saleUnit: "WEIGHT", price: null, pricePerKg: 8500 },
];

/** Una tx que contesta el catálogo dado y anota qué se escribió. */
function txFalsa(catalogo: Fila[], opciones: { registrosDevueltos?: number } = {}) {
  const log: { update?: unknown[]; auditoria?: Record<string, unknown>[] } = {};
  const tx = {
    product: { findMany: async () => catalogo },
    $queryRaw: async () => [], // sin góndolas cargadas
    $executeRaw: async (_q: TemplateStringsArray, ...valores: unknown[]) => {
      log.update = valores;
      return (valores[0] as unknown[]).length;
    },
    auditLog: {
      createMany: async (args: { data: Record<string, unknown>[] }) => {
        log.auditoria = args.data;
        return { count: opciones.registrosDevueltos ?? args.data.length };
      },
    },
  };
  return { tx: tx as unknown as LedgerTx, log };
}

const VACUNO: PedidoAumento = { alcance: { tipo: "texto", texto: "vacuno" }, sentido: "subir", porcentaje: "8", redondeo: 50 };
const productos = CATALOGO.map((p) => ({ ...p, category: null }));
const huellaDe = (p: PedidoAumento) => planificarAumento(productos, p).plan.huella;
const base = { tenantId: "t-magra", actor: "user:u1", lote: "L1" };

test("con la huella que vio la persona: 60 precios en UN update y 60 registros con el lote", async () => {
  const { tx, log } = txFalsa(CATALOGO);
  const r = await aplicarAumentoEnTx(tx, { ...base, pedido: VACUNO, huella: huellaDe(VACUNO), confirmado: false });
  assert.deepEqual(r, { ok: true, cambiados: 60, registros: 60 });
  const [ids, precios, preciosKg] = log.update as [string[], (number | null)[], (number | null)[]];
  assert.equal(ids.length, 60);
  assert.ok(!ids.includes("c1"), "la bondiola no dice vacuno: no se toca");
  assert.ok(precios.every((p) => p === null), "por kilo: el precio por unidad no se toca");
  assert.equal(preciosKg[0], 9900);
  assert.equal(log.auditoria?.length, 60);
  assert.deepEqual(log.auditoria?.[0], {
    tenantId: "t-magra",
    actor: "user:u1",
    action: "cambio-de-precio",
    entity: "Product",
    entityId: "v1",
    channel: "admin",
    changes: {
      origen: "actualizar-precios",
      nombre: "Corte vacuno 1",
      forma: "kg",
      antes: 9137,
      despues: 9900,
      lote: { id: "L1", sentido: "subir", porcentaje: 8, redondeo: 50 },
    },
  });
});

test("si un precio cambió desde la vista previa (otra huella), no escribe nada y lo dice", async () => {
  const cambiado = CATALOGO.map((p) => (p.id === "v7" ? { ...p, pricePerKg: 20000 } : p));
  const { tx, log } = txFalsa(cambiado);
  const r = await aplicarAumentoEnTx(tx, { ...base, pedido: VACUNO, huella: huellaDe(VACUNO), confirmado: false });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.catalogoCambio, true);
  assert.ok(!r.ok && r.plan && r.plan.filas.length === 60, "devuelve el plan de ahora para mostrarlo");
  assert.equal(log.update, undefined);
  assert.equal(log.auditoria, undefined);
});

test("80 %: sin la confirmación extra no escribe; con ella, sí", async () => {
  const grande: PedidoAumento = { ...VACUNO, porcentaje: "80" };
  const sin = txFalsa(CATALOGO);
  const r1 = await aplicarAumentoEnTx(sin.tx, { ...base, pedido: grande, huella: huellaDe(grande), confirmado: false });
  assert.equal(!r1.ok && r1.pideConfirmacion, true);
  assert.equal(sin.log.update, undefined, "el primer clic no cambia ningún precio");
  const con = txFalsa(CATALOGO);
  const r2 = await aplicarAumentoEnTx(con.tx, { ...base, pedido: grande, huella: huellaDe(grande), confirmado: true });
  assert.deepEqual(r2, { ok: true, cambiados: 60, registros: 60 });
});

test("un precio cambiado sin su registro lanza: la transacción se deshace", async () => {
  const { tx } = txFalsa(CATALOGO, { registrosDevueltos: 59 });
  await assert.rejects(
    aplicarAumentoEnTx(tx, { ...base, pedido: VACUNO, huella: huellaDe(VACUNO), confirmado: false }),
    /Se cambiaron 60 precios y se registraron 59/,
  );
});

test("un pedido que no cambia nada no escribe", async () => {
  const nada: PedidoAumento = { ...VACUNO, alcance: { tipo: "texto", texto: "pollo" } };
  const { tx, log } = txFalsa(CATALOGO);
  const r = await aplicarAumentoEnTx(tx, { ...base, pedido: nada, huella: huellaDe(nada), confirmado: false });
  assert.deepEqual(r.ok, false);
  assert.equal(log.update, undefined);
});

test("conflicto de serialización: P2034, o P2010 con 40001 (el UPDATE crudo); lo demás no", () => {
  const conCodigo = (code: string, message: string) => Object.assign(new Error(message), { code });
  assert.equal(esConflictoDeSerializacion(conCodigo("P2034", "write conflict")), true);
  assert.equal(
    esConflictoDeSerializacion(conCodigo("P2010", "Raw query failed. Code: `40001`. Message: `could not serialize access due to concurrent update`")),
    true,
  );
  assert.equal(esConflictoDeSerializacion(conCodigo("P2010", "Raw query failed. Code: `42703`. column does not exist")), false);
  assert.equal(esConflictoDeSerializacion(new Error("40001")), false);
  assert.equal(esConflictoDeSerializacion("40001"), false);
});

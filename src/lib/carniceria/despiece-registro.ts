// ============================================================================
// DESPIECE — la escritura, dentro de la transacción del llamador. Sin "use server".
// ============================================================================
//
// Separada de despiece-actions.ts ("use server"): recibe el `tenantId`, así que no puede ser
// un endpoint, y así la escritura REAL se ejecuta contra la base de QA con la migración cárnica
// sin pasar por la sesión. La acción lee el formulario, abre la transacción, audita y responde.
//
// Todo lo que decide se lee ADENTRO de la transacción (el stock de la pieza, su costo y los
// precios de los cortes) y la regla es la de la vista previa (`planDelDespiece`, despiece.ts).
// SQL crudo para ProcessingRun/Output con el `tenantId` escrito a mano (rls.ts); el stock, por
// el registro de movimientos (`recordMovement`), el único que lo cambia.

import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { recordMovement } from "@/lib/stock/ledger";
import { costoVigenteEnTx } from "@/lib/stock/costo";
import { esDeKilo, motivoDeDespiece, planDelDespiece, precioPorKiloDe, type CorteDeSalida, type PlanDelDespiece } from "./despiece";

type Tx = Prisma.TransactionClient;

/** Un error de carga que se le muestra a la persona tal cual. */
export class DespieceInvalido extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "DespieceInvalido";
  }
}

export type DespieceNuevo = {
  piezaId: string;
  kilos: number;
  costoTipeado: number | null;
  note: string | null;
  lineas: { name: string; weightKg: number; productId: string | null }[];
  /** "user:<id>" */
  actor: string;
};

export type DespieceRegistrado = { runId: string; numero: number; plan: Extract<PlanDelDespiece, { ok: true }> };

export async function registrarDespieceEnTx(tx: Tx, tenantId: string, d: DespieceNuevo): Promise<DespieceRegistrado> {
  // Un despiece a la vez por negocio: el correlativo es max(code)+1 y, sin el candado, dos
  // cargas simultáneas chocaban contra el índice único con un error crudo.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`despiece:${tenantId}`}))`;

  const ids = [...new Set([d.piezaId, ...d.lineas.flatMap((l) => (l.productId ? [l.productId] : []))].filter(Boolean))];
  const filas = await tx.product.findMany({
    where: { id: { in: ids }, tenantId, deletedAt: null },
    select: { id: true, name: true, unit: true, saleUnit: true, price: true, pricePerKg: true, stock: true },
  });
  const porId = new Map(filas.map((p) => [p.id, p]));
  const faltante = d.lineas.find((l) => l.productId && !porId.has(l.productId));
  if (faltante) throw new DespieceInvalido(`El producto del corte "${faltante.name}" ya no existe. Recargá la pantalla.`);

  const p = porId.get(d.piezaId);
  const cortes: CorteDeSalida[] = d.lineas.map((l) => {
    const prod = l.productId ? porId.get(l.productId)! : null;
    return {
      name: l.name,
      weightKg: l.weightKg,
      producto: prod ? { id: prod.id, nombre: prod.name, kilo: esDeKilo(prod), precioPorKg: precioPorKiloDe(prod) } : null,
    };
  });
  const plan = planDelDespiece({
    pieza: p ? { productId: p.id, nombre: p.name, kilo: esDeKilo(p), stock: p.stock } : null,
    kilos: d.kilos,
    costoTipeado: d.costoTipeado,
    costoVigentePiezaPorKg: p ? await costoVigenteEnTx(tx, tenantId, p.id) : null,
    cortes,
  });
  if (!plan.ok) throw new DespieceInvalido(plan.error);

  const [{ code }] = await tx.$queryRaw<{ code: number }[]>`
    SELECT COALESCE(MAX("code"), 0) + 1 AS code FROM "ProcessingRun" WHERE "tenantId" = ${tenantId}`;
  const numero = Number(code);
  const runId = randomUUID();
  const reason = motivoDeDespiece(numero, plan.salida.nombre);
  await tx.$executeRaw`
    INSERT INTO "ProcessingRun"
      ("id","tenantId","code","supplierId","inputName","inputWeightKg","inputCost","status","note","createdBy","updatedAt")
    VALUES
      (${runId}, ${tenantId}, ${numero}, NULL, ${plan.salida.nombre}, ${plan.analisis.inputWeightKg},
       ${plan.costoPieza ?? 0}, 'DONE', ${d.note}, ${d.actor}, CURRENT_TIMESTAMP)`;
  for (const c of cortes) {
    await tx.$executeRaw`
      INSERT INTO "ProcessingOutput" ("id","tenantId","runId","productId","name","weightKg")
      VALUES (${randomUUID()}, ${tenantId}, ${runId}, ${c.producto?.id ?? null}, ${c.name}, ${c.weightKg})`;
  }

  // La pieza SALE (la guarda de stock del registro respalda al plan: una venta entre la lectura
  // y esta línea la frena) y los cortes ENTRAN con su costo. Mismo motivo: "Despiece #N — pieza".
  await recordMovement(tx, {
    tenantId,
    productId: plan.salida.productId,
    type: "AJUSTE",
    qty: plan.salida.qty,
    unitCost: plan.salida.unitCost,
    reason,
    createdBy: d.actor,
    label: plan.salida.nombre,
  });
  for (const e of plan.entradas) {
    await recordMovement(tx, {
      tenantId,
      productId: e.productId,
      type: "REPOSICION",
      qty: e.qty,
      unitCost: e.unitCost,
      reason,
      createdBy: d.actor,
      label: e.nombre,
    });
  }
  return { runId, numero, plan };
}

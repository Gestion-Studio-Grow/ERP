// Persistencia de los ajustes de stock (F2): mermas, recuentos y correcciones. Orquesta,
// dentro de una transacción tenant-aware, el asiento del StockMovement tipo AJUSTE por cada
// línea, apoyándose en `recordMovement` (único mutador de `Product.stock`) y en la aritmética
// pura de `adjustment-core.ts`. Vive separado del núcleo puro para no arrastrar Prisma al
// bundle del cliente (el formulario reusa los helpers puros para el preview).

import { tenantTransaction } from "@/lib/rls";
import { recordMovement, registrarConteoSinDiferencia, round3, type LedgerTx } from "@/lib/stock/ledger";
import { costosVigentesEnTx } from "@/lib/stock/costo";
import {
  adjustmentDelta,
  buildReason,
  mensajeDeTope,
  mensajeDeYaRecontado,
  motivoMode,
  movidoDespuesDe,
  recontadoDespuesDe,
  requiresNote,
  stockTeorico,
  superaElTope,
  valorDeLaBaja,
  type AdjustmentMotivo,
} from "@/lib/stock/adjustment-core";

export type AdjustmentInput = {
  motivo: AdjustmentMotivo;
  note: string | null;
  createdBy: string; // actor "user:<id>", lo resuelve la Server Action
  // `value` se interpreta según el motivo (contado / perdido / delta firmado). En un recuento,
  // `contadoA` es la hora en que se contó esa línea (sin ella, se compara contra el stock de
  // ahora, como antes).
  items: { productId: string; value: number; contadoA?: Date | null }[];
  // Tope en pesos de lo que puede dar de baja esta carga (`topeDeMermaPorCarga`), merma o
  // faltante de un recuento. null/ausente = sin tope (la dueña).
  topePesos?: number | null;
};

/** Cómo quedó cada línea. Sirve para mostrar el resultado del recuento sin volver a leer. */
export type LineaAjustada = {
  productId: string;
  nombre: string;
  unidad: string;
  /** Contra qué se comparó: en un recuento, el stock teórico a la hora del conteo. */
  teorico: number;
  delta: number;
  /** Costo vigente guardado en la fila; null si el producto no tiene costo. */
  costo: number | null;
};

export type InsertedAdjustment = {
  motivo: AdjustmentMotivo;
  applied: number; // líneas que efectivamente movieron stock (delta ≠ 0)
  lineas: LineaAjustada[];
  /** Lo que dio de baja la carga, a costo (en un recuento, el faltante). */
  pesosDeBaja: number;
};

/**
 * La carga pasa el tope de merma de quien la hace. El mensaje propio NO lleva montos (es el
 * que llega a cualquiera si nadie lo traduce): la acción arma el de quien ve costos con
 * `mensajeDeTope`, con `pesos` y `tope`.
 */
export class TopeDeMermaSuperado extends Error {
  readonly pesos: number;
  readonly tope: number;
  readonly motivo: AdjustmentMotivo | undefined;
  constructor(pesos: number, tope: number, motivo?: AdjustmentMotivo) {
    super(mensajeDeTope({ pesos, tope }, false, String, motivo));
    this.name = "TopeDeMermaSuperado";
    this.pesos = pesos;
    this.tope = tope;
    this.motivo = motivo;
  }
}

// Registra un ajuste de stock en UNA transacción tenant-aware (o entran todas las líneas o
// ninguna). Lo que depende del estado de la base se lee ADENTRO de la transacción, no se
// confía en lo que vio la pantalla (que pudo quedar vieja):
//   · el stock de cada producto, y en un recuento lo que se movió después de la hora del
//     conteo, para comparar contra el stock TEÓRICO de ese momento (`stockTeorico`);
//   · el costo vigente de cada producto, que se GUARDA en la fila (la merma queda valuada al
//     costo del día) y valúa la carga contra el tope.
// Las lecturas van en lote (3 consultas para toda la planilla, no 3 por línea): un recuento de
// 40 cortes no puede acercarse al tiempo máximo de una transacción.
//
// Una merma mayor al stock lanza (la guarda del ledger): se corrige con un recuento, no
// dejando stock negativo. El RECUENTO, en cambio, manda: si después de contar se vendió más
// de lo que había (la regla MAG-4 deja vender por peso aunque falte), el resultado puede
// quedar bajo cero, y eso es la verdad que hay que ver en la cola "en negativo", no un error
// que impida guardar lo contado. Un recuento que coincide con el sistema no mueve stock pero
// deja su fila en 0 (`registrarConteoSinDiferencia`): así el producto figura como contado.
export async function insertStockAdjustment(
  tenantId: string,
  input: AdjustmentInput,
): Promise<InsertedAdjustment> {
  validarAjuste(input);
  return tenantTransaction((tx) => ajustarEnTx(tx, tenantId, input), { tenantId });
}

/** Lo que se puede rechazar antes de abrir la transacción. */
function validarAjuste(input: AdjustmentInput): void {
  if (requiresNote(input.motivo) && !input.note?.trim()) {
    throw new Error("El ajuste 'Otro' necesita una nota que explique el motivo.");
  }
  if (!input.items.some((l) => l.productId && Number.isFinite(l.value))) {
    throw new Error("Elegí al menos un producto y cargá su valor para registrar el ajuste.");
  }
}

/**
 * El ajuste DENTRO de la transacción del llamador. Separado de `insertStockAdjustment` para
 * poder ejecutarlo en los tests contra un doble de transacción (adjustment-insert.test.ts):
 * el recuento contra la hora del conteo, la fila "sin diferencia" y el tope se prueban con
 * esta función real, no con una copia.
 */
export async function ajustarEnTx(tx: LedgerTx, tenantId: string, input: AdjustmentInput): Promise<InsertedAdjustment> {
  validarAjuste(input);
  const mode = motivoMode(input.motivo);
  // Líneas utilizables: producto elegido y valor numérico. El delta real se resuelve acá
  // adentro (el recuento depende del stock vigente).
  const wanted = input.items.filter((l) => l.productId && Number.isFinite(l.value));
  const reason = buildReason(input.motivo, input.note);
  const ids = [...new Set(wanted.map((l) => l.productId))];

  // Recuento: se bloquean las filas de los productos ANTES de leer su stock y lo que se
  // movió después del conteo. Sin el bloqueo son dos fotos distintas (READ COMMITTED): una
  // venta que se confirma justo entre las dos lecturas entra en los movimientos y no en el
  // stock, y la diferencia sale corrida en lo vendido. Con el bloqueo, una venta en curso
  // termina antes (y entra en las dos lecturas) y una nueva espera a que se guarde el
  // recuento. En orden de id, para que dos recuentos no se traben entre sí. SQL crudo porque
  // Prisma no tiene FOR UPDATE: corre dentro de `tenantTransaction` (RLS lo ve) y lleva el
  // negocio escrito a mano, como pide rls.ts.
  if (mode === "COUNT") {
    await tx.$queryRaw`SELECT id FROM "Product" WHERE "tenantId" = ${tenantId} AND id = ANY(${ids}::text[]) ORDER BY id FOR UPDATE`;
  }
  const [productos, costos] = await Promise.all([
    tx.product.findMany({
      where: { id: { in: ids }, tenantId, deletedAt: null },
      select: { id: true, name: true, unit: true, stock: true },
    }),
    costosVigentesEnTx(tx, tenantId, ids),
  ]);
  const byId = new Map(productos.map((p) => [p.id, p]));
  const faltan = wanted.filter((l) => !byId.has(l.productId));
  if (faltan.length > 0) {
    // Un id que no es del negocio (o un producto borrado) no se saltea callado: la línea
    // se cargó para algo, y registrar las demás dejaría el ajuste a medias.
    throw new Error("Uno de los productos ya no existe o fue dado de baja. Recargá la pantalla y volvé a cargarlo.");
  }

  // Recuento: lo que se movió después de la hora de conteo más vieja, una sola lectura.
  const horas = wanted.flatMap((l) => (l.contadoA ? [l.contadoA] : []));
  const posteriores =
    mode === "COUNT" && horas.length > 0
      ? await tx.stockMovement.findMany({
          where: {
            tenantId,
            productId: { in: ids },
            createdAt: { gt: new Date(Math.min(...horas.map((h) => h.getTime()))) },
          },
          select: { productId: true, qty: true, createdAt: true, type: true, reason: true },
        })
      : [];

  // Recuento con un conteo VIEJO: el producto ya se recontó después de la hora de este conteo
  // (el mismo recuento reenviado desde un borrador cuya respuesta se perdió, dos pestañas, un
  // POST a mano, o el recuento de otra persona). Aplicarlo descontaría la misma diferencia otra
  // vez: el ajuste anterior es posterior a `contadoA`, entra en lo movido después y el teórico
  // vuelve a subir. Se rechaza TODO (nada a medias), con los productos nombrados; la pantalla,
  // al recargar, ya no ofrece esos conteos (borrador.ts). Lo lee con las filas bloqueadas.
  if (mode === "COUNT") {
    const viejos = wanted.filter((l) => l.contadoA && recontadoDespuesDe(posteriores, l.productId, l.contadoA));
    if (viejos.length > 0) {
      throw new Error(mensajeDeYaRecontado([...new Set(viejos.map((l) => byId.get(l.productId)!.name))]));
    }
  }

  const lineas: LineaAjustada[] = [];
  let applied = 0;
  for (const l of wanted) {
    const p = byId.get(l.productId)!;
    const actual = round3(p.stock);
    const teorico =
      mode === "COUNT" && l.contadoA ? stockTeorico(actual, movidoDespuesDe(posteriores, l.productId, l.contadoA)) : actual;
    const delta = adjustmentDelta(mode, l.value, teorico);
    const costo = costos.get(l.productId) ?? null;
    lineas.push({ productId: p.id, nombre: p.name, unidad: p.unit, teorico, delta, costo });

    if (delta === 0) {
      if (mode === "COUNT") {
        await registrarConteoSinDiferencia(tx, {
          tenantId,
          productId: l.productId,
          reason,
          unitCost: costo,
          createdBy: input.createdBy,
        });
      }
      continue;
    }

    await recordMovement(tx, {
      tenantId,
      productId: l.productId,
      type: "AJUSTE",
      qty: delta, // AJUSTE: qty ES el delta firmado (ver signedDelta en ledger.ts).
      unitCost: costo,
      reason,
      createdBy: input.createdBy,
      label: p.name,
      allowNegative: mode === "COUNT",
    });
    applied++;
  }

  // El tope se controla ANTES del commit: si la carga lo pasa, no queda nada escrito. Vale
  // también para el faltante de un recuento (`valorDeLaBaja`): si no, la merma que el tope
  // frena entraba igual cargada como "Recuento".
  const baja = valorDeLaBaja(lineas);
  if (superaElTope(baja.pesos, input.topePesos ?? null)) {
    throw new TopeDeMermaSuperado(baja.pesos, input.topePesos as number, input.motivo);
  }

  return { motivo: input.motivo, applied, lineas, pesosDeBaja: baja.pesos };
}

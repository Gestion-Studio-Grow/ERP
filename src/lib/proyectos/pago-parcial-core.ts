/**
 * Pago parcial a proveedor (GSG-UAT-008 · D2): la misma regla que el cobro parcial. Cada parte es un gasto pagado enlazado a
 * su cuota por el «Asiento» (y, en otra moneda, con lo que se pagó en ella: «20.25 USD»). A la cuota SIN marcar le falta su
 * monto menos las partes vivas, en su moneda; la última parte («todo») la marca. Anular una parte la reabre con lo que le
 * falta. Sin consultas: las lee `pago-parcial.server.ts`.
 */
import { leerOriginal } from "./cobranza-core";
import { redondear } from "./core";
import { aPesos } from "./gestion-core";
import { itemDeClave } from "./ficha-core";

/** Lo que vale una parte pagada en la moneda de su cuota: el original del enlace o, si no lo tiene, los pesos al cambio de hoy. PURA. */
export function parteEnSuMoneda(moneda: string, pesos: number, enlace: string | null | undefined, tc: Readonly<Record<string, number>>): number {
  if (moneda === "ARS") return pesos;
  const original = leerOriginal(enlace);
  if (original?.moneda === moneda) return original.monto;
  const cambio = tc[moneda] ?? 0;
  return cambio > 0 ? redondear(pesos / cambio) : 0;
}

type CuotaDePago = { id?: string | null; tipo: string; monto: number; pagadoEl?: Date | null; anuladoEl?: Date | null };

/** Lo que le falta a una cuota de pago sin marcar, con lo pagado en parte (en su moneda). Nunca negativo. PURA. */
export const faltaDelPago = (monto: number, pagado: number): number => Math.max(0, redondear(monto - pagado));

/**
 * El reparto con las partes ya pagadas a proveedor: a cada cuota de pago SIN marcar con partes le baja lo que falta, y lo
 * pagado queda en `cobrado` (lo que salió por ella). Las de cobro y las marcadas, igual. No cambia el arreglo recibido. PURA.
 */
export function conPagosParciales<R extends { pendiente: number[]; cobrado: number[] }>(cuotas: readonly CuotaDePago[], reparto: R, pagados: ReadonlyMap<string, number>): R {
  if (pagados.size === 0) return reparto;
  const pendiente = [...reparto.pendiente];
  const cobrado = [...reparto.cobrado];
  cuotas.forEach((q, i) => {
    if (q.tipo === "COBRO" || q.pagadoEl || q.anuladoEl || !q.id) return;
    const pagado = pagados.get(q.id);
    if (!pagado) return;
    pendiente[i] = faltaDelPago(q.monto, pagado);
    cobrado[i] = Math.min(redondear(pagado), q.monto);
  });
  return { ...reparto, pendiente, cobrado };
}

/**
 * Lo que falta pagar a proveedores por cuotas, en pesos de hoy: las de pago vivas, reales (no previstas) y sin marcar,
 * menos lo pagado en parte. Es la deuda comprometida que Rentabilidad sumaba en cero (D6). PURA.
 */
export function porPagarDeCuotas(
  cuotas: readonly (CuotaDePago & { moneda: string; prevista?: boolean | null })[],
  pagados: ReadonlyMap<string, number>,
  tc: Readonly<Record<string, number>>,
): number {
  return redondear(
    cuotas.reduce((s, q) => {
      if (q.tipo === "COBRO" || q.pagadoEl || q.anuladoEl || q.prevista) return s;
      // Cada cuota redondeada al centavo, como la tabla por rubro (`porPagarComoGastos`): las dos suman lo mismo.
      return s + redondear(aPesos(faltaDelPago(q.monto, (q.id && pagados.get(q.id)) || 0), q.moneda, tc));
    }, 0),
  );
}

/**
 * Lo mismo que `porPagarDeCuotas`, cuota por cuota y con el rubro de su ítem (`rubroDeItem`, por id; una cuota a mano o de un
 * ítem que no está, «General», el rubro con que la asienta «Marcar pagado»): así la tabla por rubro de Costo real suma lo
 * mismo que su Diferencia (recorrido del PR #166 · 5). Como gastos sin pagar, para `desvioPorRubro`. PURA.
 */
export function porPagarComoGastos(
  cuotas: readonly (CuotaDePago & { clave?: string | null; moneda: string; prevista?: boolean | null })[],
  pagados: ReadonlyMap<string, number>,
  tc: Readonly<Record<string, number>>,
  rubroDeItem: ReadonlyMap<string, string>,
): { rubro: string; neto: number; iva: number; pagadoEl: null; anuladoEl: null }[] {
  return cuotas.flatMap((q) => {
    if (q.tipo === "COBRO" || q.pagadoEl || q.anuladoEl || q.prevista) return [];
    const neto = redondear(aPesos(faltaDelPago(q.monto, (q.id && pagados.get(q.id)) || 0), q.moneda, tc));
    if (!(neto > 0)) return [];
    const item = itemDeClave(q.clave);
    return [{ rubro: (item && rubroDeItem.get(item)) || "General", neto, iva: 0, pagadoEl: null, anuladoEl: null }];
  });
}

/** Quién «pagó» una cuota que sus partes cubrieron: no hubo un pago más, se saldó con lo ya pagado. */
export const SALDADA_CON_PARTES = "Saldada con sus partes";

/**
 * Las cuotas del plan que sus partes ya cubren (lo pagado en parte, en la moneda del plan, llega a su monto al centavo):
 * quedan saldadas, no «Pendiente · Falta $ 0» con un «Marcar pagado» que no tiene nada que pagar (recorrido del PR #166 · 2).
 * Pasa, por ejemplo, cuando el anticipo baja (50 % → 20 %) después de pagar una parte. PURA.
 */
export function cubiertasPorSusPartes(plan: readonly { clave: string; monto: number }[], partes: ReadonlyMap<string, number>): Set<string> {
  return new Set(plan.filter((c) => (partes.get(c.clave) ?? 0) > 0 && faltaDelPago(c.monto, redondear(partes.get(c.clave)!)) === 0).map((c) => c.clave));
}

/**
 * El plan de cuotas cambió (otro anticipo, otro costo): lo pagado en parte cuenta como pagado, igual que una cuota marcada en
 * `ajustarAPagado`. Por ítem (la clave sin su último tramo): la cuota con partes no baja de lo pagado; lo que pagó de más,
 * o lo pagado en una cuota que el plan ya no tiene, se descuenta de las otras cuotas sin marcar del ítem, desde la última.
 * Si no alcanza, quedan en cero (salen del plan) y el gasto sigue siendo gasto. `partes`: por clave, en la moneda de la cuota. PURA.
 */
export function descontarPartes<T extends { clave: string; monto: number }>(plan: readonly T[], partes: ReadonlyMap<string, number>, marcadas: ReadonlySet<string>): T[] {
  const salida = plan.map((c) => ({ ...c }));
  if (partes.size === 0) return salida;
  const base = (clave: string) => clave.slice(0, clave.lastIndexOf(":"));
  for (const b of new Set([...partes.keys()].map(base))) {
    let sacar = 0;
    for (const [clave, pagado] of partes) {
      if (base(clave) !== b) continue;
      const c = salida.find((x) => x.clave === clave);
      if (!c) sacar += pagado;
      else if (c.monto < pagado) {
        sacar += pagado - c.monto;
        c.monto = pagado;
      }
    }
    for (const c of salida.filter((x) => base(x.clave) === b && !marcadas.has(x.clave)).reverse()) {
      if (sacar <= 0) break;
      const quita = Math.min(sacar, redondear(c.monto - (partes.get(c.clave) ?? 0)));
      if (quita <= 0) continue;
      c.monto = redondear(c.monto - quita);
      sacar = redondear(sacar - quita);
    }
  }
  return salida.filter((c) => c.monto > 0);
}

/**
 * Para los resúmenes («A pagar», vencidos, pagado): cada cuota de pago con partes se cuenta como dos, lo pagado en parte
 * (marcado) y lo que le falta (sin marcar; si no falta nada, no queda). Las demás, igual. PURA.
 */
export function conPartesComoPagadas<T extends CuotaDePago & { venceEl: Date }>(cuotas: readonly T[], pagados: ReadonlyMap<string, number>): T[] {
  if (pagados.size === 0) return [...cuotas];
  return cuotas.flatMap((c) => {
    const pagado = c.id ? pagados.get(c.id) : undefined;
    if (!pagado || c.tipo === "COBRO" || c.pagadoEl || c.anuladoEl) return [c];
    const falta = faltaDelPago(c.monto, pagado);
    const parte = { ...c, monto: Math.min(pagado, c.monto), pagadoEl: c.venceEl };
    return falta > 0 ? [parte, { ...c, monto: falta }] : [parte];
  });
}

/**
 * Lo pagado en parte por cuota (`partes`, por id y en la moneda que la cuota tenía) llevado a la moneda que el plan nuevo le
 * da a su ítem, por clave, para `descontarPartes`. Si el ítem cambió de moneda, pasa por pesos al cambio de hoy; sin ese
 * cambio, la parte no se descuenta (se muestra deuda de más, nunca de menos). Un ítem que ya no está en el plan no tiene de
 * dónde descontar. PURA.
 */
export function partesEnMonedaDelPlan(
  cuotas: readonly { id: string; clave: string | null; moneda: string }[],
  partes: ReadonlyMap<string, number>,
  plan: readonly { clave: string; moneda: string }[],
  tc: Readonly<Record<string, number>>,
): Map<string, number> {
  const base = (clave: string) => clave.slice(0, clave.lastIndexOf(":"));
  const monedaDelItem = new Map(plan.map((c) => [base(c.clave), c.moneda]));
  const salida = new Map<string, number>();
  for (const c of cuotas) {
    const pagado = partes.get(c.id);
    const destino = c.clave ? monedaDelItem.get(base(c.clave)) : undefined;
    if (!pagado || !c.clave || !destino) continue;
    if (destino === c.moneda) {
      salida.set(c.clave, pagado);
      continue;
    }
    const pesos = c.moneda === "ARS" ? pagado : (tc[c.moneda] ?? 0) > 0 ? pagado * tc[c.moneda] : null;
    const enDestino = pesos === null ? null : destino === "ARS" ? pesos : (tc[destino] ?? 0) > 0 ? pesos / tc[destino] : null;
    if (enDestino !== null) salida.set(c.clave, redondear(enDestino));
  }
  return salida;
}

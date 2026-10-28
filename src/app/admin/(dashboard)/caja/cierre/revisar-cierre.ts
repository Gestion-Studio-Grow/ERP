// ============================================================================
// CIERRE DEL DÍA — revisar lo contado ANTES de cerrar. DATO PURO (lo usa CierreForm).
// ============================================================================
//
// Cerrar el día es irreversible: congela todo lo fechado hasta ese día y el siguiente arranca
// con lo que se contó. Por eso es de lo poco que lleva confirmación: un segundo paso que dice,
// medio por medio, lo que se va a asentar ("Efectivo: contaste $X, el libro dice $Y, faltan
// $Z"), y recién ahí «Sí, cerrar el día».
//
// Y el cierre se hace ENTERO CON EL TECLADO: Enter en cualquier importe revisa; si falta algo,
// el foco va al campo que falta con el motivo escrito (antes el botón quedaba deshabilitado:
// con el teclado no se llegaba a saber por qué no cerraba); si está todo, aparece la
// confirmación con el foco en «Sí, cerrar el día», y Escape vuelve a revisar.
//
// Las reglas son las del servidor (`cerrarDia`): el efectivo es obligatorio aunque sea 0, lo
// tipeado se lee con `leerImporte` ("12.500" = doce mil quinientos) y, si hay diferencia, la
// nota es obligatoria. El servidor vuelve a decidir todo contra la base; esto sólo evita el
// viaje y dice qué falta en el campo que falta.

import { leerImporte } from "@/lib/pos-peso";
import { round2 } from "@/lib/round";
import { fmtMoneyARS } from "@/components/ui/format";
import type { CashMethod } from "@/lib/caja/cash-register";
import type { ColumnaDelCierre, HechosDelCierre } from "@/lib/caja/cierre-diario";

/**
 * Los medios del formulario de SIEMPRE (CierreForm): MP es «MP y transferencias». La hoja nueva
 * (ContarYCerrar) cuenta las columnas que manda el servidor (`CierreDiarioData.columnas`:
 * EFECTIVO · MP · TRANSFERENCIA y Tarjeta sólo si se puede cobrar con tarjeta, N2 · M1-C2).
 */
export const MEDIOS_DEL_CIERRE: readonly CashMethod[] = ["EFECTIVO", "MP", "TARJETA"];

/** Dónde tiene que ir el foco cuando falta algo: un importe o la nota. */
export type CampoDelCierre = ColumnaDelCierre | "nota";

export type RevisionDelCierre =
  | { listo: false; campo: CampoDelCierre; error: string }
  | { listo: true; renglones: string[]; hayDiferencia: boolean };

/** Diferencia contado − esperado por medio, redondeada como el servidor. null = sin contar. */
export function diferenciasDelCierre<K extends ColumnaDelCierre = CashMethod>(
  declarado: Record<K, string>,
  esperado: Record<K, number>,
  medios: readonly K[] = MEDIOS_DEL_CIERRE as readonly ColumnaDelCierre[] as readonly K[],
): Record<K, number | null> {
  const out = {} as Record<K, number | null>;
  for (const m of medios) {
    const l = leerImporte(declarado[m]);
    out[m] = l.estado === "ok" ? round2(l.valor - esperado[m]) : null;
  }
  return out;
}

export function revisarCierre<K extends ColumnaDelCierre = CashMethod>(o: {
  declarado: Record<K, string>;
  esperado: Record<K, number>;
  nota: string;
  etiquetas: Record<K, string>;
  /** Las columnas que se cuentan. Sin esto: los tres medios de siempre. EFECTIVO tiene que estar. */
  medios?: readonly K[];
}): RevisionDelCierre {
  const medios = o.medios ?? (MEDIOS_DEL_CIERRE as readonly ColumnaDelCierre[] as readonly K[]);
  const efectivo = "EFECTIVO" as K;
  // Lo tipeado que no es un importe se marca en SU campo: callarlo sería cerrar ese medio como
  // "no contado" sin que nadie se entere.
  for (const m of medios) {
    if (leerImporte(o.declarado[m]).estado === "invalida") {
      return {
        listo: false,
        campo: m,
        error: `Lo de ${o.etiquetas[m]} no es un importe: escribí lo que contaste, con coma si tiene centavos (12.500,50).`,
      };
    }
  }
  if (leerImporte(o.declarado[efectivo] ?? "").estado !== "ok") {
    return { listo: false, campo: "EFECTIVO", error: "Falta el efectivo contado. Es obligatorio, aunque sea 0." };
  }
  const dif = diferenciasDelCierre(o.declarado, o.esperado, medios);
  const hayDiferencia = medios.some((m) => dif[m] !== null && dif[m] !== 0);
  if (hayDiferencia && o.nota.trim() === "") {
    return {
      listo: false,
      campo: "nota",
      error: "Hay diferencia: anotá qué pasó. Vale «sin explicación por ahora».",
    };
  }
  const renglones = medios.map((m) => {
    const d = dif[m];
    if (d === null) return `${o.etiquetas[m]}: sin contar, queda sin conciliar.`;
    const contado = leerImporte(o.declarado[m]);
    const valor = contado.estado === "ok" ? contado.valor : 0;
    const base = `${o.etiquetas[m]}: contaste ${fmtMoneyARS(valor)}, el libro dice ${fmtMoneyARS(o.esperado[m])}`;
    if (d === 0) return `${base}. Cuadra.`;
    return `${base}. ${d > 0 ? "Sobran" : "Faltan"} ${fmtMoneyARS(Math.abs(d))}: se asienta como ajuste.`;
  });
  return { listo: true, renglones, hayDiferencia };
}

/**
 * El rótulo de la apertura del turno en la lista de movimientos del cierre. La apertura es el
 * CONTEO del cajón (signo 0 en `movementSign`): se ve, pero no entra en Ingresos ni en Egresos,
 * igual que en el libro. Antes se pintaba en la columna «Ingreso» y la columna no daba lo que
 * dice el cuadro de arriba (UAT de MAGRA, 18/10).
 */
export function textoDeAperturaQueNoSuma(monto: number): string {
  return `Apertura del turno: conteo del cajón de ${fmtMoneyARS(monto)}, no suma`;
}

// ── Causas probables al lado de la diferencia (N2 · M1-C6) ───────────────────

export type CausaProbable = { id: "sin-cobrar" | "reparto" | "pagados-de-mas" | "cuaderno"; texto: string };

const veces = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

/**
 * «Fijate si fue esto»: lo que la base sabe que suele explicar una diferencia del día, en el orden en
 * que conviene mirarlo. Sólo lo que pasó (cantidad > 0). PURA. No acusa: dice dónde mirar.
 */
export function causasProbables(h: HechosDelCierre | null): CausaProbable[] {
  if (!h) return [];
  const out: CausaProbable[] = [];
  if (h.ventasSinCobrar.cantidad > 0) {
    out.push({
      id: "sin-cobrar",
      texto: `${veces(h.ventasSinCobrar.cantidad, "venta de hoy sigue", "ventas de hoy siguen")} sin cobrar (${fmtMoneyARS(h.ventasSinCobrar.monto)}): si ya las cobraron, falta registrar el cobro.`,
    });
  }
  if (h.repartoSinRendir.cantidad > 0) {
    out.push({
      id: "reparto",
      texto: `Rendición de reparto pendiente: ${veces(h.repartoSinRendir.cantidad, "envío salió", "envíos salieron")} y no se ${h.repartoSinRendir.cantidad === 1 ? "rindió" : "rindieron"}${h.repartoSinRendir.monto > 0 ? ` (${fmtMoneyARS(h.repartoSinRendir.monto)} a cobrar: esa plata la tiene el cadete)` : ""}.`,
    });
  }
  if (h.pagadosDeMas.cantidad > 0) {
    out.push({
      id: "pagados-de-mas",
      texto: `${veces(h.pagadosDeMas.cantidad, "pedido quedó pagado", "pedidos quedaron pagados")} de más por ${fmtMoneyARS(h.pagadosDeMas.monto)}: si diste el vuelto del cajón, ese efectivo ya no está.`,
    });
  }
  if (h.cuadernoConFechaVieja.cantidad > 0) {
    out.push({
      id: "cuaderno",
      texto: `${veces(h.cuadernoConFechaVieja.cantidad, "venta del cuaderno se cargó", "ventas del cuaderno se cargaron")} con fecha de otro día (${fmtMoneyARS(h.cuadernoConFechaVieja.monto)}): cuentan en el día que dicen, no en el que se cargaron.`,
    });
  }
  return out;
}

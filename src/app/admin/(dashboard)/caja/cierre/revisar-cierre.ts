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

export const MEDIOS_DEL_CIERRE: readonly CashMethod[] = ["EFECTIVO", "MP", "TARJETA"];

/** Dónde tiene que ir el foco cuando falta algo: un importe o la nota. */
export type CampoDelCierre = CashMethod | "nota";

export type RevisionDelCierre =
  | { listo: false; campo: CampoDelCierre; error: string }
  | { listo: true; renglones: string[]; hayDiferencia: boolean };

/** Diferencia contado − esperado por medio, redondeada como el servidor. null = sin contar. */
export function diferenciasDelCierre(
  declarado: Record<CashMethod, string>,
  esperado: Record<CashMethod, number>,
): Record<CashMethod, number | null> {
  const out = {} as Record<CashMethod, number | null>;
  for (const m of MEDIOS_DEL_CIERRE) {
    const l = leerImporte(declarado[m]);
    out[m] = l.estado === "ok" ? round2(l.valor - esperado[m]) : null;
  }
  return out;
}

export function revisarCierre(o: {
  declarado: Record<CashMethod, string>;
  esperado: Record<CashMethod, number>;
  nota: string;
  etiquetas: Record<CashMethod, string>;
}): RevisionDelCierre {
  // Lo tipeado que no es un importe se marca en SU campo: callarlo sería cerrar ese medio como
  // "no contado" sin que nadie se entere.
  for (const m of MEDIOS_DEL_CIERRE) {
    if (leerImporte(o.declarado[m]).estado === "invalida") {
      return {
        listo: false,
        campo: m,
        error: `Lo de ${o.etiquetas[m]} no es un importe: escribí lo que contaste, con coma si tiene centavos (12.500,50).`,
      };
    }
  }
  if (leerImporte(o.declarado.EFECTIVO).estado !== "ok") {
    return { listo: false, campo: "EFECTIVO", error: "Falta el efectivo contado. Es obligatorio, aunque sea 0." };
  }
  const dif = diferenciasDelCierre(o.declarado, o.esperado);
  const hayDiferencia = MEDIOS_DEL_CIERRE.some((m) => dif[m] !== null && dif[m] !== 0);
  if (hayDiferencia && o.nota.trim() === "") {
    return {
      listo: false,
      campo: "nota",
      error: "Hay diferencia: anotá qué pasó. Vale «sin explicación por ahora».",
    };
  }
  const renglones = MEDIOS_DEL_CIERRE.map((m) => {
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

// El renglón que resume una carga de «Mis Comprobantes Recibidos». PURO y sin imports: lo usa la
// pantalla en el navegador. Distingue lo que ya estaba cargado (no es un error: no se duplica) de lo
// que tiene errores, con los plurales bien dichos (hallazgo QA 26/09: «Entraron 0 comprobantes.
// 13 no se cargaron.» mezclaba las dos cosas y decía «1 notas de crédito»).

export interface CuentasDeLaCarga {
  entraron: number;
  notasDeCredito: number;
  aRevisar: number;
  yaCargados: number;
  conErrores: number;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

export function avisoDeLaCarga(c: CuentasDeLaCarga): string {
  const partes: string[] = [];
  if (c.entraron === 0) partes.push("No entró ningún comprobante nuevo.");
  else {
    const nc =
      c.notasDeCredito > 0
        ? ` (${c.notasDeCredito} ${plural(c.notasDeCredito, "nota de crédito, que resta", "notas de crédito, que restan")})`
        : "";
    partes.push(`${plural(c.entraron, "Entró 1 comprobante", `Entraron ${c.entraron} comprobantes`)}${nc}.`);
  }
  if (c.aRevisar > 0) partes.push(`${c.aRevisar} ${plural(c.aRevisar, "quedó a revisar", "quedaron a revisar")}.`);
  if (c.yaCargados > 0) {
    partes.push(`${c.yaCargados} ${plural(c.yaCargados, "ya estaba cargado (no se duplica)", "ya estaban cargados (no se duplican)")}.`);
  }
  if (c.conErrores > 0) {
    partes.push(`${c.conErrores} con errores: ${plural(c.conErrores, "no se cargó", "no se cargaron")} (el detalle está abajo).`);
  }
  return partes.join(" ");
}

/** El aviso cuando falta el archivo: propio, no el globo del navegador. */
export const FALTA_EL_ARCHIVO = "Elegí el archivo que bajaste de ARCA (CSV o Excel).";

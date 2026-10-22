// ============================================================================
// MI NEGOCIO — las reglas del mostrador que fija la dueña (reingeniería CH, Tanda 3 · 3-D).
// ============================================================================
//
// La lectura y la escritura de las reglas viven en src/lib/settings.ts (3-A: `leerReglasDelNegocio`,
// `guardarReglasDelNegocio`, `validarReglas`, tolerantes a la migración M2 sin aplicar). Acá están las
// piezas PURAS que usan la pantalla «Mi negocio» y el resto del mostrador:
//
//   · `propuestaDeSenia(regla, quien, horasAntes)`: qué PROPONE la hoja de cancelar / «no vino» con
//     la seña (CH-035). Es una propuesta: la recepción siempre ve la pregunta y puede cambiarla (D2).
//   · `aliasParaMensajes(reglas)`: el alias (o el CBU) que va en el WhatsApp de la seña, con la caída
//     al `ALIAS_SENIA_PROVISIONAL` de src/lib/turnos/mensajes-whatsapp.ts.
//   · `leerFormularioMiNegocio(form)`: el formulario → lo que valida `validarReglas`.
//
// CONTRATO PARA LA INTEGRACIÓN (la hoja de cancelar es de otro frente):
//
//   const reglas = await leerReglasDelNegocio(tenantId, tx);          // settings.ts (tolera sin M2)
//   const p = propuestaDeSenia(reglas, "clienta", horasHastaElTurno);  // horas = (inicio − ahora) / 3.6e6
//   // p.destino: "retener" | "devolver" | "a-favor"  → el botón preelegido de la pregunta
//   // p.titulo:  «Se la queda el negocio»            → el texto del botón
//   // p.porque:  «Avisó con 6 h; la regla es 24 h.»  → la línea chica debajo
//   // La recepción puede elegir OTRO destino: la acción de cancelar recibe el elegido, no `p`.
//
// Sin la migración M2 `leerReglasDelNegocio` devuelve el placeholder D2 (24 h · avisa tarde → se la
// queda el negocio · no vino → se la queda el negocio) con `activas: false`: la propuesta igual rige.

import type { DestinoSenia, ReglasDelNegocio } from "@/lib/settings";

/** Quién origina la baja del turno. */
export type QuienCancela = "clienta" | "negocio" | "no-vino";

export type ReglaDeSenia = Pick<ReglasDelNegocio, "cancelacionHoras" | "seniaCancelaTarde" | "seniaNoVino">;

export type PropuestaDeSenia = {
  destino: DestinoSenia;
  /** El texto del botón propuesto («Se la queda el negocio»). */
  titulo: string;
  /** Por qué se propone eso, en una línea. */
  porque: string;
  /** Siempre true: es una propuesta, la recepción la puede cambiar (D2). */
  editable: true;
};

/**
 * La regla de la seña cuando no se sabe la del negocio (la pantalla no la recibió): el placeholder D2
 * del diseño, PROVISIONAL A CONFIRMAR, igual a `REGLAS_POR_DEFECTO` de settings.ts (que no se importa
 * acá porque arrastra Prisma al navegador; mi-negocio.test.ts ata los dos valores).
 */
export const REGLA_DE_SENIA_PROVISIONAL: ReglaDeSenia = { cancelacionHoras: 24, seniaCancelaTarde: "retener", seniaNoVino: "retener" };

/** Cómo se dice cada destino en el botón. */
export const TITULO_DESTINO: Record<DestinoSenia, string> = {
  retener: "Se la queda el negocio",
  devolver: "Se la devolvemos",
  "a-favor": "Queda a favor de la clienta",
};

const horasEnTexto = (h: number) => {
  const redondo = Math.floor(h);
  if (redondo <= 0) return "menos de 1 h";
  if (redondo >= 48 && redondo % 24 === 0) return `${redondo / 24} días`;
  return `${redondo} h`;
};

/**
 * Qué se le propone a la recepción con la seña de un turno que se baja. PURA.
 *
 *   · Cancela el NEGOCIO → se devuelve, siempre (no es culpa de la clienta).
 *   · NO VINO → lo que diga la regla `seniaNoVino` (placeholder D2: se la queda el negocio).
 *   · Cancela la CLIENTA con al menos `cancelacionHoras` de aviso → se devuelve (D2: «se devuelve o
 *     queda a favor»; se propone devolver y la recepción puede elegir «a favor»).
 *   · Cancela la CLIENTA con menos aviso → lo que diga `seniaCancelaTarde` (placeholder: se la queda).
 *
 * `horasAntes` = horas entre AHORA y el inicio del turno (negativo si ya pasó). Si no es un número,
 * se trata como aviso tarde: ante la duda se propone la regla del negocio, nunca algo más permisivo.
 */
export function propuestaDeSenia(regla: ReglaDeSenia, quien: QuienCancela, horasAntes: number): PropuestaDeSenia {
  const propuesta = (destino: DestinoSenia, porque: string): PropuestaDeSenia => ({ destino, titulo: TITULO_DESTINO[destino], porque, editable: true });
  if (quien === "negocio") return propuesta("devolver", "Cancela el negocio: la seña se devuelve.");
  if (quien === "no-vino") return propuesta(regla.seniaNoVino, "No vino: rige la regla de Mi negocio.");
  const limite = regla.cancelacionHoras;
  if (Number.isFinite(horasAntes) && horasAntes >= limite) {
    return propuesta("devolver", `Avisó con ${horasEnTexto(horasAntes)}; la regla pide ${limite} h.`);
  }
  const aviso = Number.isFinite(horasAntes) && horasAntes > 0 ? `Avisó con ${horasEnTexto(horasAntes)}` : "Avisó sobre la hora";
  return propuesta(regla.seniaCancelaTarde, `${aviso}; la regla pide ${limite} h.`);
}

/**
 * El dato para transferir la seña que va en los WhatsApp: el alias de Mi negocio, si no el CBU, y si
 * no hay ninguno (o la migración M2 no está), el provisional de mensajes-whatsapp.ts (`null` hoy: el
 * mensaje sale sin alias, nunca con uno inventado). PURA.
 */
export function aliasParaMensajes(
  reglas: Pick<ReglasDelNegocio, "aliasSenia" | "cbuSenia"> | null,
  provisional: string | null,
): string | null {
  const alias = reglas?.aliasSenia?.trim();
  if (alias) return alias;
  const cbu = reglas?.cbuSenia?.trim();
  if (cbu) return cbu;
  return provisional;
}

/** Un importe en pesos como lo tipea la dueña: "2000", "2.000", "$ 2.000", "2000,50". NaN si no se entiende. */
export function leerPesos(raw: string): number {
  const limpio = raw.replace(/\$/g, "").replace(/\s+/g, "").trim();
  if (limpio === "") return 0;
  // "2.000,50" → 2000.50 ; "2.000" → 2000 ; "2000,5" → 2000.5
  const sinMiles = limpio.includes(",") ? limpio.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(limpio) ? limpio.replace(/\./g, "") : limpio;
  if (!/^\d+(\.\d{1,2})?$/.test(sinMiles)) return NaN;
  return Number(sinMiles);
}

/** Las horas de aviso como las tipea la dueña ("24"). NaN si no es un entero. */
function leerHoras(raw: string): number {
  const t = raw.trim();
  return /^\d{1,4}$/.test(t) ? Number(t) : NaN;
}

/**
 * Lo que manda el formulario de Mi negocio, en la forma que valida `validarReglas`. PURA. Los
 * campos que faltan llegan vacíos y los valida `validarReglas` (que no deja pasar nada raro).
 */
export function leerFormularioMiNegocio(form: { get(nombre: string): FormDataEntryValue | null }) {
  const texto = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  return {
    aliasSenia: texto("aliasSenia"),
    cbuSenia: texto("cbuSenia"),
    cancelacionHoras: leerHoras(texto("cancelacionHoras")),
    seniaCancelaTarde: texto("seniaCancelaTarde"),
    seniaNoVino: texto("seniaNoVino"),
    topeBajaSaldoRecepcion: leerPesos(texto("topeBajaSaldoRecepcion")),
  };
}

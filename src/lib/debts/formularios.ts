// ============================================================================
// FORMULARIOS de cuentas corrientes — leer lo que llega y decir por qué no se pudo. PURO.
// ============================================================================
//
// El cobro de un fiado, el pago a un proveedor y los cheques se cargan con formularios que
// ahora MUESTRAN el rechazo al lado del botón (antes la acción tiraba y el formulario fallaba
// mudo: día cerrado, medio sin elegir o monto de más se veían como "no pasó nada"). Acá vive
// cómo se lee cada campo y cómo se traduce cada rechazo del servidor a una frase que dice qué
// pasó y cómo seguir, sin perder lo cargado.
//
// Sin Prisma ni Next: lo importan las actions y los tests.

import { leerImporte } from "@/lib/pos-peso";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { fmtMoneyARS } from "@/components/ui/format";

/** Lo que devuelve una acción de cuentas corrientes al formulario. */
export type EstadoFormularioCuenta =
  | { estado: "inicial" }
  | { estado: "ok"; mensaje: string }
  | { estado: "error"; mensaje: string };

export const ESTADO_INICIAL: EstadoFormularioCuenta = { estado: "inicial" };

/**
 * El monto que llegó del formulario, en pesos, o `null` si no es un monto. Se lee con la regla
 * de la plata de todo el sistema (`leerImporte`): "100.000" son cien mil pesos, no cien. Antes
 * se leía con `Number(x.replace(",", "."))`, y un pago de "100.000" se registraba por $100. PURA.
 */
export function leerMonto(raw: FormDataEntryValue | null): number | null {
  const l = leerImporte(typeof raw === "string" ? raw : "");
  return l.estado === "ok" && l.valor > 0 ? l.valor : null;
}

/**
 * Una fecha "AAAA-MM-DD" del formulario (un `<input type="date">`), guardada al MEDIODÍA del
 * día del negocio: así ningún corrimiento de zona la mueve de día, ni leída en UTC ni en hora
 * argentina. `null` si no es una fecha válida. PURA.
 */
export function leerFecha(raw: FormDataEntryValue | null): Date | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mm, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mm - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mm - 1 || check.getUTCDate() !== d) return null;
  if (y < 2000 || y > 2100) return null;
  return businessWallTimeToUtc(s, "12:00");
}

/** Un texto corto del formulario (número de cheque, banco, nota), recortado. PURA. */
export function leerTexto(raw: FormDataEntryValue | null, max = 120): string {
  return (typeof raw === "string" ? raw : "").trim().slice(0, max);
}

const nombreDe = (e: unknown) => (e instanceof Error ? e.name : "");
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : "");

/**
 * El rechazo del servidor, dicho para la persona. Los que ya vienen escritos para leerse
 * (día cerrado, medio obligatorio, app no disponible, cuenta anulada) pasan tal cual; los que
 * vienen en idioma de programador se traducen; cualquier otro se dice sin detalle crudo y con
 * cómo seguir. PURA.
 */
export function mensajeDeRechazo(e: unknown, que: "cobro" | "pago" | "cheque"): string {
  const nombre = nombreDe(e);
  const msg = mensajeDe(e);
  // Ya escritos para la persona: día cerrado y medio (asiento-libro.ts), app no disponible
  // (require-app.ts), y las reglas de la deuda con sus cheques (resumen-cuentas.ts: el pago
  // que ya cubre un cheque, el cheque que supera lo que falta cubrir, la cuenta anulada).
  if (nombre === "AsientoRechazadoError" || nombre === "AppNoDisponibleError" || nombre === "PagoRechazadoError") return msg;
  // La guarda de saldo (collection-repo.ts): "Movimiento rechazado (EXCEEDS_BALANCE); saldo pendiente 200000."
  // El punto final es de la ORACIÓN: con centavos llega "saldo pendiente 1500.5." y un
  // `[\d.]+` se lo tragaba (Number("1500.5.") es NaN y la pantalla decía "el saldo es —").
  // Por eso la parte decimal se pide con dígitos después del punto.
  const saldo = /Movimiento rechazado \((\w+)\); saldo pendiente (-?\d+(?:\.\d+)?)/.exec(msg);
  if (saldo) {
    if (saldo[1] === "EXCEEDS_BALANCE") {
      return `El monto supera lo que falta ${que === "cobro" ? "cobrar" : "pagar"}: el saldo es ${fmtMoneyARS(Number(saldo[2]))}. Corregí el monto.`;
    }
    return "El monto tiene que ser mayor a cero.";
  }
  if (/anulada/.test(msg)) return msg;
  if (/no encontrad[ao]/i.test(msg)) {
    return que === "cheque"
      ? "No encontramos ese cheque en tu negocio. Recargá la pantalla."
      : "No encontramos esa cuenta en tu negocio. Recargá la pantalla y volvé a intentar.";
  }
  if (/Transición de cheque inválida|cambió de estado/.test(msg)) {
    return "Ese cheque ya cambió de estado (quizás desde otra pestaña). Recargá la pantalla para verlo como está.";
  }
  if (/monto del cheque|fecha de acreditación/.test(msg)) return msg;
  return `No se pudo registrar el ${que}. Probá de nuevo en un momento; si sigue, avisanos.`;
}

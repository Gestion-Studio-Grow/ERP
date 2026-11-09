// ============================================================================
// FACTOQUE · Botón de arrepentimiento (Res. SCI 424/2020; art. 34 Ley 24.240; art. 1110 CCyC) y
// Botón de baja (Res. 316/2018; art. 10 ter Ley 24.240). Núcleo PURO: validación del formulario,
// número de trámite y el texto del aviso a GSG. Sin DB ni red (se testea solo).
//
//  · Arrepentimiento: público, SIN registrarse. Con sesión del negocio, además vuelve a Gratis en el
//    acto; sin sesión se registra y GSG lo procesa (no se cambia el plan de nadie por saber un CUIT).
//  · Baja: desde Mi cuenta (con sesión) el plan pago vuelve a Gratis en el acto, sin más pasos. La baja
//    de la cuenta entera (borrar datos) queda registrada y la hace GSG: es irreversible.
//  · En los dos: número de trámite a la vista, fila en AuditLog del negocio y aviso a GSG por el canal
//    existente (WhatsApp de GSG o su casilla, src/app/facturita/contacto.ts).
// ============================================================================

import { randomInt } from "node:crypto";
import { cuitValido, normalizarCuit } from "@/lib/cuit";

export type TipoTramite = "arrepentimiento" | "baja";

/** AuditLog.action de cada trámite (entity "Tenant"). */
export const ACCION_TRAMITE: Record<TipoTramite, string> = {
  arrepentimiento: "factoque.arrepentimiento",
  baja: "factoque.baja",
};

export const NOMBRE_TRAMITE: Record<TipoTramite, string> = {
  arrepentimiento: "Botón de arrepentimiento",
  baja: "Botón de baja",
};

const PREFIJO: Record<TipoTramite, string> = { arrepentimiento: "ARR", baja: "BAJ" };
const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O ni 1/I: se dicta por teléfono

/**
 * «ARR-20261108-7KQ2M»: tipo, día (AR) y 5 caracteres al azar criptográfico (32^5 ≈ 33 millones por
 * día y tipo: una repetición es despreciable; el número identifica el pedido, no autoriza nada).
 */
export function numeroDeTramite(tipo: TipoTramite, diaAr: string, azar: (n: number) => number = randomInt): string {
  let cola = "";
  for (let i = 0; i < 5; i++) cola += LETRAS[azar(LETRAS.length) % LETRAS.length];
  return `${PREFIJO[tipo]}-${diaAr.replace(/-/g, "")}-${cola}`;
}

export function esTipoTramite(x: unknown): x is TipoTramite {
  return x === "arrepentimiento" || x === "baja";
}

export interface DatosTramite {
  email: string;
  cuit: string;
  motivo: string;
}

export type LecturaTramite = { ok: true; datos: DatosTramite } | { ok: false; error: string; campo: keyof DatosTramite };

/** Email + CUIT obligatorios (para encontrar el plan y mandarte la constancia); motivo opcional. */
export function leerFormularioTramite(email: unknown, cuit: unknown, motivo: unknown): LecturaTramite {
  const e = typeof email === "string" ? email.trim().toLowerCase().slice(0, 200) : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: "Poné un email válido: ahí te mandamos la constancia.", campo: "email" };
  const c = normalizarCuit(typeof cuit === "string" ? cuit : "");
  if (!cuitValido(c)) return { ok: false, error: "Revisá el CUIT: son 11 números.", campo: "cuit" };
  const m = typeof motivo === "string" ? motivo.trim().replace(/\s+/g, " ").slice(0, 300) : "";
  return { ok: true, datos: { email: e, cuit: c, motivo: m } };
}

/** Qué pasó con el plan, para decírselo a la persona. */
export type Efecto = "plan_a_gratis" | "ya_era_gratis" | "registrado";

/**
 * El mensaje que ve la persona al terminar (el número de trámite va aparte, como título). Con el mail
 * conectado la constancia sale en el acto; sin él, GSG la manda dentro del plazo de la norma.
 */
export function mensajeDelTramite(tipo: TipoTramite, efecto: Efecto, mailEnElActo = false): string {
  const que =
    efecto === "plan_a_gratis"
      ? tipo === "arrepentimiento"
        ? "Tu plan pago quedó cancelado y volviste a Factoque Gratis. Te devolvemos lo que pagaste por el mismo medio."
        : "Tu plan pago quedó dado de baja y volviste a Factoque Gratis. No se te cobra más."
      : efecto === "ya_era_gratis"
        ? tipo === "arrepentimiento"
          ? "No tenías un plan pago activo: no hay nada que cancelar. Si pagaste algo, lo revisamos y te lo devolvemos."
          : "Ya estabas en Factoque Gratis, sin cobros. Si querés cerrar la cuenta y borrar tus datos, lo hacemos nosotros con este trámite."
        : tipo === "arrepentimiento"
          ? "Recibimos tu pedido de arrepentimiento: lo procesamos sin costo y te devolvemos lo que pagaste por el mismo medio."
          : "Recibimos tu pedido de baja: lo procesamos sin costo.";
  if (mailEnElActo) return `${que} Te mandamos la constancia a tu mail, con este número.`;
  const plazo = tipo === "arrepentimiento" ? "dentro de las 24 horas" : "dentro de las 72 horas";
  return `${que} Te mandamos la constancia por mail ${plazo}.`;
}

/** El texto del aviso a GSG (se manda por el canal existente: WhatsApp de GSG o su casilla). */
export function avisoParaGsg(tipo: TipoTramite, numero: string, d: DatosTramite, efecto: Efecto): string {
  return [
    `Factoque · ${NOMBRE_TRAMITE[tipo]} · trámite ${numero}`,
    `CUIT: ${d.cuit}`,
    `Email: ${d.email}`,
    `Motivo: ${d.motivo || "(no lo dijo)"}`,
    `Estado: ${efecto === "plan_a_gratis" ? "plan pago cancelado, ya está en Gratis" : efecto === "ya_era_gratis" ? "ya estaba en Gratis" : "para procesar"}`,
  ].join("\n");
}

/**
 * La constancia por mail (Res. SCI 424/2020: código de identificación; Res. 316/2018: constancia de la
 * baja). Texto plano; la manda `enviarMailInterno` (Resend) cuando el mail está conectado.
 */
export function constanciaPorMail(
  tipo: TipoTramite,
  numero: string,
  d: DatosTramite,
  efecto: Efecto,
  cuando: string,
): { asunto: string; cuerpo: string } {
  return {
    asunto: `Factoque · ${NOMBRE_TRAMITE[tipo]} · trámite ${numero}`,
    cuerpo: [
      `Recibimos tu pedido de ${tipo === "arrepentimiento" ? "arrepentimiento" : "baja"} de Factoque.`,
      "",
      `Número de trámite: ${numero}`,
      `Fecha: ${cuando}`,
      `CUIT: ${d.cuit}`,
      `Motivo: ${d.motivo || "(no lo indicaste)"}`,
      "",
      mensajeDelTramite(tipo, efecto, true).replace(" Te mandamos la constancia a tu mail, con este número.", ""),
      "",
      "Guardá este mail: es tu constancia. Si no hiciste este pedido, respondé este mail y lo anulamos.",
      "",
      "Gestión Studio Grow · Factoque",
    ].join("\n"),
  };
}

// Entrega de la CONTRASEÑA TEMPORAL por mail al titular (GSG-SEG-014, orden del dueño del 10/11/2026).
//
// POR QUÉ. Hasta acá la temporal se mostraba UNA vez en la pantalla del operador y alguien se la
// tenía que pasar a la persona. El dueño ordenó que después de cada alta y de cada reseteo el mail
// salga SOLO, sin paso manual: «mandársela al titular no cuenta como exponer a terceros»
// (Factory-GSG `00-ESTADO/PROPUESTA-ROL-OPS-2026-11-10.md`). Esto reemplaza la regla vieja
// «NUNCA se manda por email».
//
// REGLAS (los tests las fijan):
//   · la clave va SÓLO en el cuerpo del mail: nunca en el asunto, en logs, en la auditoría, en la URL
//     ni en la base en claro. Los logs llevan, como mucho, el negocio y el largo del texto;
//   · el mail avisa que la clave es provisoria y que el sistema obliga a cambiarla al entrar;
//   · sin RESEND_API_KEY o sin RESEND_FROM_EMAIL no sale nada (nunca un remitente inventado) y el
//     llamador lo trata como falla: el reseteo se deshace y el alta se informa;
//   · la pantalla del operador muestra sólo el destino enmascarado («c***@dominio.com»).
//
// El envío es una función inyectable (`EnviarClave`) para que los núcleos (reset, alta, pendientes)
// se prueben sin red: el test le pasa un doble que acierta o falla.

import { direccionDelLocal } from "@/lib/multilocal/multilocal-core";
import { mapaDeHostsVigente } from "@/lib/tenant";

export type MotivoClave = "alta" | "reseteo";

export type MailClaveTemporal = {
  /** Destino: el email de la persona (el mismo con el que entra). */
  email: string;
  /** Nombre de la persona, para el saludo. */
  nombre: string;
  /** Nombre del negocio. */
  negocio: string;
  /** Dirección de ingreso (`https://…/admin/login`), o null si el negocio no tiene una publicada. */
  urlIngreso: string | null;
  clave: string;
  motivo: MotivoClave;
};

export type EnvioClave = { enviado: true } | { enviado: false; motivo: string };
export type EnviarClave = (d: MailClaveTemporal) => Promise<EnvioClave>;

/** «carolina@gmail.com» → «c***@gmail.com». Lo que la pantalla y la auditoría pueden mostrar. PURA. */
export function enmascararEmail(email: string): string {
  const e = String(email ?? "").trim();
  const at = e.lastIndexOf("@");
  if (at < 1) return "***";
  return `${e[0]}***${e.slice(at)}`;
}

/** Asunto y cuerpo del mail. El asunto NO lleva la clave (se ve en notificaciones y listados). PURA. */
export function armarMailClaveTemporal(d: MailClaveTemporal): { asunto: string; cuerpo: string } {
  const asunto =
    d.motivo === "alta"
      ? `Tu acceso a ${d.negocio} ya está listo`
      : `Te reseteamos la contraseña de ${d.negocio}`;
  const intro =
    d.motivo === "alta"
      ? `Ya podés entrar al sistema de ${d.negocio}.`
      : `Reseteamos tu contraseña del sistema de ${d.negocio}. La anterior ya no sirve.`;
  const ingreso = d.urlIngreso
    ? `Entrá acá: ${d.urlIngreso}`
    : "Entrá por la dirección de siempre de tu negocio (si no la tenés, pedísela a Gestión Studio Grow).";
  const cuerpo = [
    `Hola, ${d.nombre}:`,
    "",
    intro,
    "",
    ingreso,
    `Tu email de ingreso: ${d.email}`,
    `Tu contraseña provisoria: ${d.clave}`,
    "",
    "Es provisoria: apenas entres, el sistema te va a pedir que elijas una nueva y no te deja seguir sin cambiarla.",
    "No la compartas con nadie. Si no pediste este acceso, avisanos respondiendo este mail.",
    "",
    "Gestión Studio Grow",
  ].join("\n");
  return { asunto, cuerpo };
}

/** Dirección de ingreso del backoffice de un negocio, o null si no tiene una publicada. */
export function urlDeIngreso(
  subdomain: string | null,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  return direccionDelLocal(
    subdomain,
    { mapaDeHosts: mapaDeHostsVigente({ ...env }), dominioPropio: env.APP_BASE_DOMAIN?.trim() || null },
    "/admin/login",
  );
}

export const MAIL_NO_CONECTADO =
  "El mail del sistema no está conectado (RESEND_API_KEY / RESEND_FROM_EMAIL). La contraseña provisoria " +
  "sólo viaja por mail al titular, así que no se cambió nada.";

/**
 * El envío real, por Resend. Nunca loguea la clave ni la dirección: sólo el resultado. `fetchImpl`
 * inyectable para el test del armado del pedido.
 */
export async function enviarMailClaveTemporal(d: MailClaveTemporal, fetchImpl: typeof fetch = fetch): Promise<EnvioClave> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) return { enviado: false, motivo: "mail no configurado" };
  const { asunto, cuerpo } = armarMailClaveTemporal(d);
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: d.email, subject: asunto, text: cuerpo }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[clave-temporal-mail] el servicio de mail respondió ${res.status}`);
      return { enviado: false, motivo: `el servicio de mail respondió ${res.status}` };
    }
    return { enviado: true };
  } catch (e) {
    const nombre = e instanceof Error ? e.name : "error";
    console.error(`[clave-temporal-mail] no se pudo hablar con el servicio de mail (${nombre})`);
    return { enviado: false, motivo: nombre === "TimeoutError" ? "el servicio de mail no respondió a tiempo" : "no se pudo hablar con el servicio de mail" };
  }
}

/** ¿Está el mail del sistema conectado? Sin esto, ninguna acción emite una provisoria. */
export const mailDeClavesConectado = (): boolean => !!process.env.RESEND_API_KEY?.trim() && !!process.env.RESEND_FROM_EMAIL?.trim();

/**
 * La clave no salió por mail. Se TIRA dentro de la transacción del reseteo o del alta para que se
 * deshaga entera: el hash anterior queda intacto y no nace un usuario con una clave que nadie tiene.
 */
export class ClaveNoEnviada extends Error {
  /** `destino`: el email ENMASCARADO (para la pantalla y la auditoría de la falla). */
  constructor(public readonly motivo: string, public readonly destino?: string) {
    super(`No salió el mail con la contraseña provisoria (${motivo}). No se cambió nada.`);
    this.name = "ClaveNoEnviada";
  }
}

/** Acción de auditoría cuando el mail falla (sin la clave: sólo destino enmascarado y motivo). */
export const AUDIT_CLAVE_MAIL_FALLIDO = "clave_temporal.mail_fallido";
/** Acción de auditoría del envío después de un alta (el reseteo ya audita el suyo). */
export const AUDIT_CLAVE_MAIL_ENVIADO = "clave_temporal.mail_enviado";

// ============================================================================
// MANTENIMIENTO GSG — el permiso del cliente para los agentes (D4, 14/11/2026). PURO.
// ============================================================================
//
// D4: casillas en el panel del negocio (sólo el titular, OWNER), una por nivel, con copia por mail
// y texto legal PROVISORIO (lo revisa el dueño). Cada casilla tildada o destildada es una fila nueva
// (nada se edita): vale la última de cada nivel. Revocable con efecto inmediato. Sin permiso, el
// pedido lo atiende una persona y el n1 sólo deja un borrador interno (DISENO-MANT-001 §8).
// La tabla es `SoporteConsentimiento` (prisma/pending-gate2/MANT_roles_soporte.sql, sin aplicar).

export const NIVELES_DE_CONSENTIMIENTO = ["n1", "n2"] as const;
export type NivelDeConsentimiento = (typeof NIVELES_DE_CONSENTIMIENTO)[number];

/** Cambiar el texto = subir la versión: cada fila guarda la versión que se aceptó. */
export const TEXTO_CONSENTIMIENTO = {
  version: "2026-11-14-provisorio",
  provisorio: true,
  n1: "Autorizo a Gestión Studio Grow a que asistentes de IA lean mis pedidos de soporte para preparar las respuestas. Una persona de GSG revisa cada respuesta antes de enviarla.",
  n2: "Autorizo además a que asistentes de IA propongan cambios de configuración de una lista cerrada (horarios, duración de servicios, recordatorios, textos de mensajes, categorías). Cada cambio queda registrado y se puede deshacer.",
  nunca:
    "Nunca tocan cobros, precios, caja, facturación ni ARCA, contraseñas, claves, permisos de usuarios, la marca, ni borran datos. Los datos personales de tus clientes no se mandan a la IA.",
  revocar: "Podés sacar este permiso cuando quieras desde esta misma pantalla, con efecto inmediato.",
} as const;

export interface FilaDeConsentimiento {
  nivel: string;
  aceptado: boolean;
  createdAt: Date;
}

export interface Consentimiento {
  n1: boolean;
  n2: boolean;
}

export const SIN_CONSENTIMIENTO: Consentimiento = Object.freeze({ n1: false, n2: false });

/**
 * El permiso vigente: la última fila de cada nivel. n2 sin n1 no vale (no se puede configurar lo que
 * no se puede leer). Filas con un nivel desconocido se ignoran. PURA.
 */
export function consentimientoVigente(filas: readonly FilaDeConsentimiento[]): Consentimiento {
  const ultima: Partial<Record<NivelDeConsentimiento, FilaDeConsentimiento>> = {};
  for (const f of filas) {
    if (!(NIVELES_DE_CONSENTIMIENTO as readonly string[]).includes(f.nivel)) continue;
    const n = f.nivel as NivelDeConsentimiento;
    const prev = ultima[n];
    // A igual hora, gana la revocación: ante la duda, sin permiso.
    if (!prev || f.createdAt > prev.createdAt || (f.createdAt.getTime() === prev.createdAt.getTime() && !f.aceptado)) ultima[n] = f;
  }
  const n1 = ultima.n1?.aceptado === true;
  return { n1, n2: n1 && ultima.n2?.aceptado === true };
}

/**
 * Hasta qué nivel puede trabajar un agente en este negocio. CH: sólo borrador para el dueño (D5).
 * Sin permiso n1: borrador interno (lo lee una persona, nunca sale tal cual). n3 trabaja sobre un
 * Issue sin datos del negocio, pero igual pide el permiso n1. PURA.
 */
export function nivelesPermitidos(c: Consentimiento, esCH: boolean): { niveles: ("n1" | "n2" | "n3")[]; nota: string } {
  if (esCH) return { niveles: ["n1"], nota: "CH: sólo un borrador, que aprueba el dueño (D5)." };
  if (!c.n1) return { niveles: ["n1"], nota: "Sin permiso del titular: lo atiende una persona; el n1 deja sólo un borrador interno." };
  if (!c.n2) return { niveles: ["n1", "n3"], nota: "Permiso n1: respuestas revisadas; sin cambios de configuración." };
  return { niveles: ["n1", "n2", "n3"], nota: "Permiso n1 y n2." };
}

export type ValidacionDeConsentimiento =
  | { ok: true; valor: { nivel: NivelDeConsentimiento; aceptado: boolean } }
  | { ok: false; error: string };

/** Sólo el titular (OWNER) da o saca el permiso; un nivel que no existe no se guarda. PURA. */
export function validarConsentimiento(p: { rol: unknown; nivel: unknown; aceptado: unknown }): ValidacionDeConsentimiento {
  if (p.rol !== "OWNER") return { ok: false, error: "Sólo el titular del negocio puede dar o sacar este permiso." };
  if (typeof p.nivel !== "string" || !(NIVELES_DE_CONSENTIMIENTO as readonly string[]).includes(p.nivel)) {
    return { ok: false, error: "Ese permiso no existe." };
  }
  if (typeof p.aceptado !== "boolean") return { ok: false, error: "Falta si lo das o lo sacás." };
  return { ok: true, valor: { nivel: p.nivel as NivelDeConsentimiento, aceptado: p.aceptado } };
}

/** La copia por mail al titular (D4). Sin datos de clientes finales; con el texto aceptado y su versión. PURA. */
export function mailDeCopiaDeConsentimiento(p: {
  negocio: string;
  nivel: NivelDeConsentimiento;
  aceptado: boolean;
  cuando: Date;
}): { asunto: string; cuerpo: string } {
  const fecha = new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(p.cuando);
  const que = p.nivel === "n1" ? "leer tus pedidos de soporte" : "proponer cambios de configuración";
  const asunto = p.aceptado ? `Diste permiso a la IA de soporte para ${que}` : `Sacaste el permiso a la IA de soporte para ${que}`;
  const cuerpo = [
    `Hola. Te dejamos la copia de lo que registramos para ${p.negocio} el ${fecha}.`,
    "",
    p.aceptado ? "Aceptaste este texto:" : "Sacaste el permiso de este texto (desde ahora no se usa):",
    `«${TEXTO_CONSENTIMIENTO[p.nivel]}»`,
    "",
    TEXTO_CONSENTIMIENTO.nunca,
    TEXTO_CONSENTIMIENTO.revocar,
    "",
    `Versión del texto: ${TEXTO_CONSENTIMIENTO.version}.`,
    "Si no fuiste vos, respondé este mail y lo revisamos.",
    "",
    "Gestión Studio Grow",
  ].join("\n");
  return { asunto, cuerpo };
}

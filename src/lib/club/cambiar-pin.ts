// ============================================================================
// «CAMBIAR MI PIN» EN EL SERVIDOR (GSG-SEG-019) — el único camino por el que un PIN cambia sin un dueño del ERP.
// ============================================================================
//
// Desde SEG-019 el guardado de la foto de alguien que no es OWNER no cambia ningún PIN (delicado.ts): el servidor no
// sabe qué usuario del club opera la tablet. Para cambiar el PIN propio, la pantalla manda acá quién es, su PIN
// actual y el nuevo; esto lo comprueba contra la foto VIGENTE de la base (no contra lo que diga el navegador) y
// devuelve la foto con el PIN cambiado, para guardarla con la misma versión optimista del repositorio.
//
// Reglas: el usuario existe y tiene acceso; el PIN de un dueño del club no se cambia si no es un dueño del ERP; el
// PIN actual coincide con el guardado (comparación de largo fijo); el nuevo pasa las reglas del motor (largo del rol,
// no fácil, no en uso por otra persona) con `cambiarMiPin`, que además deja la línea en el registro del club.
//
// PURO: texto de la foto vigente + pedido → texto a guardar o un rechazo con motivo en criollo. Nunca devuelve ni
// registra el PIN.
//
// — Elaborado por GSG

import { timingSafeEqual } from "node:crypto";
import { cambiarMiPin, esPinConHash, hashPin, hidratarEstado } from "./motor.mjs";
import type { Ahora, EstadoClub } from "./motor.mjs";
import { esPinFuerte, pinDelDuenioCoincide } from "./pin-servidor";

export interface PedidoDeCambioDePin {
  usuarioId: string;
  pinActual: string;
  pinNuevo: string;
  /** ¿Quien llama es OWNER del ERP? Sólo así se cambia el PIN de un dueño del club. */
  esDuenioDelErp: boolean;
  ahora?: Ahora;
}

/** Por qué se rechazó (para la auditoría: nunca lleva el PIN). */
export type CodigoDeRechazo = "ilegible" | "usuario" | "duenio" | "pin-actual" | "pin-nuevo";

export type ResultadoDeCambioDePin =
  | { ok: true; texto: string; usuarioId: string }
  | { ok: false; codigo: CodigoDeRechazo; motivo: string };

const MOTIVO_SIN_ACCESO = "Ese usuario no tiene acceso.";

/** Compara dos textos sin cortar en el primer carácter distinto (el largo sí se sabe: es el del rol). */
function igualesSinApuro(a: string, b: string): boolean {
  const te = new TextEncoder();
  const x = te.encode(a);
  const y = te.encode(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * ¿`pin` es el PIN guardado de `u`? La misma regla que `pinCoincide` del motor, con comparación de largo fijo. Un
 * PIN guardado fuerte (h2, sólo de dueños: SEG-020) lo verifica pin-servidor.ts.
 */
function pinActualCoincide(estado: EstadoClub, guardado: string | undefined, pin: string): boolean {
  const p = pin.trim();
  if (!guardado || !p) return false;
  if (esPinFuerte(guardado)) return pinDelDuenioCoincide(guardado, p, estado.salPin);
  if (!esPinConHash(guardado)) return igualesSinApuro(guardado, p);
  return !!estado.salPin && igualesSinApuro(hashPin(p, estado.salPin), guardado);
}

export function cambiarPinEnLaFoto(textoVigente: string, pedido: PedidoDeCambioDePin): ResultadoDeCambioDePin {
  let crudo: unknown;
  try {
    crudo = JSON.parse(textoVigente);
  } catch {
    return { ok: false, codigo: "ilegible", motivo: "No se pudo leer lo guardado del club: probá de nuevo en un rato." };
  }
  const h = hidratarEstado(crudo);
  if (!h.ok) return { ok: false, codigo: "ilegible", motivo: "No se pudo leer lo guardado del club: probá de nuevo en un rato." };
  const estado = h.estado;
  const pinActual = String(pedido.pinActual ?? "");
  const pinNuevo = String(pedido.pinNuevo ?? "").trim();
  const u = estado.usuarios.find((x) => x.id === pedido.usuarioId);
  if (!u || u.activo === false) return { ok: false, codigo: "usuario", motivo: MOTIVO_SIN_ACCESO };
  if (u.rol === "duenio" && !pedido.esDuenioDelErp) return { ok: false, codigo: "duenio", motivo: "El PIN de un dueño se cambia desde el puesto del dueño." };
  if (!pinActualCoincide(estado, u.pin, pinActual)) return { ok: false, codigo: "pin-actual", motivo: "Tu PIN actual no es ese: revisalo." };
  if (pinNuevo === pinActual.trim()) return { ok: false, codigo: "pin-nuevo", motivo: "El PIN nuevo es igual al de ahora: elegí otro." };
  // El motor no entiende el h2: ya comprobado, se le pasa el actual en claro SÓLO en memoria (cambiarMiPin lo
  // reemplaza por el hash del nuevo; si el nuevo no pasa, este estado no se guarda).
  if (esPinFuerte(u.pin)) u.pin = pinActual.trim();
  const r = cambiarMiPin(estado, { usuarioId: u.id, pin: pinActual }, pinNuevo, pedido.ahora);
  // El actual ya se comprobó: si el motor dice que no, es por el nuevo (largo, fácil o en uso).
  if (!r.ok) return { ok: false, codigo: "pin-nuevo", motivo: r.motivo };
  return { ok: true, texto: JSON.stringify({ ...(crudo as object), estado }), usuarioId: u.id };
}

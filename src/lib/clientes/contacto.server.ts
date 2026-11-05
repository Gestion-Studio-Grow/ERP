// Contacto de la clienta según quién mira (casilla 5 de la matriz de permisos). SERVIDOR.
//
// La regla vive en `telefono.ts` (pura, probada); esto sólo le pone la sesión del request. Cada loader
// que entrega `phone`/`email` de clientes pasa sus filas por acá ANTES de devolverlas: el número no
// viaja al navegador de quien no tiene `clients:contact`. `getCurrentUser` va cacheado por request,
// así que llamarlo desde varios loaders del mismo render no suma consultas.

import { getCurrentUser } from "@/lib/session";
import { enmascararContacto, enmascararTelefono, puedeVerContacto } from "./telefono";

/** ¿La persona de este request ve teléfono y mail de las clientas? Para mostrar u ocultar WhatsApp/llamar. */
export async function contactoVisible(): Promise<boolean> {
  return puedeVerContacto(await getCurrentUser());
}

/** Enmascara `phone`/`email` de cada fila si quien mira no tiene `clients:contact`. */
export async function contactoSegunQuienMira<T extends { phone?: string | null; email?: string | null }>(filas: T[]): Promise<T[]> {
  const quien = await getCurrentUser();
  if (puedeVerContacto(quien)) return filas;
  return filas.map((f) => enmascararContacto(f, quien));
}

/** Lo mismo para los loaders que ya entregan el número como `telefono` (p. ej. «Confirmar mañana»). */
export async function telefonosSegunQuienMira<T extends { telefono: string | null }>(filas: T[]): Promise<T[]> {
  const quien = await getCurrentUser();
  if (puedeVerContacto(quien)) return filas;
  return filas.map((f) => ({ ...f, telefono: enmascararTelefono(f.telefono) ?? null }));
}

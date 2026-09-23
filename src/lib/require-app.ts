// ============================================================================
// GUARDIA POR APP — `requireApp(id)` al tope de cada página del panel.
// ============================================================================
//
// UNA APP OCULTA NO ES UNA APP PROTEGIDA. Hoy el rol está protegido en cada página, pero
// el derecho comercial (el módulo), el rubro y la edición sólo dependían de no aparecer
// en el menú: tecleando la URL se entraba igual. `requireApp` aplica en el servidor la
// MISMA regla que decide el menú (`motivoNoDisponible`, src/apps/visibles.ts), así que lo
// que no está en la barra tampoco se abre.
//
// VA EN LA PÁGINA, NUNCA EN EL LAYOUT: Next no vuelve a renderizar los layouts al navegar
// del lado del cliente, así que un chequeo en el layout sólo corre en una carga completa
// (es lo que pasa hoy con layout.tsx:109-114). Un test trinquete impide que crezca la
// cantidad de páginas sin `requireApp`.
//
// Adónde manda: a /admin/no-disponible?app=<id>, que vive FUERA de (dashboard) y sólo
// pide sesión. Ahí se explica qué app es, por qué no está y a quién pedírsela, con un
// botón a la casa del rol. Nunca redirige sola, así que no hay loop posible.
//
// Para CH no cambia nada del menú: su contexto de módulos es `null` (sin gate). Lo que sí
// cambia, en cada página que sume `requireApp`, es la URL tecleada a una pantalla que su
// ROL, su RUBRO o su EDICIÓN no permiten: muestra "App no disponible" en vez de rebotar en
// silencio a la casa del rol (rol) o de abrir la pantalla igual (rubro y edición). Ejemplo:
// hoy un OWNER de CH que teclea /admin/inventario, con el motor de perfiles apagado, entra
// y ve "En preparación" (inventario/page.tsx:41-48); con `requireApp("inventario")` en esa
// página vería "App no disponible", porque CH es de servicios y Stock es de mostrador. El
// módulo, en cambio, no cuenta en CH.
//
// NO lleva "use server": no es una action, es un helper que llaman páginas y actions.

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import type { SessionUser } from "@/lib/session";
import { appPorId, type AppId } from "@/apps/registro";
import { explicarNoDisponible, motivoNoDisponible, type MotivoNoDisponible } from "@/apps/visibles";
import { getNegocioApps } from "@/apps/contexto.server";

/** URL de "App no disponible" para una app. */
export function rutaNoDisponible(id: AppId): string {
  return `/admin/no-disponible?app=${encodeURIComponent(id)}`;
}

/**
 * Exige que la persona pueda abrir la app `id` en este negocio: rol, módulo, rubro y
 * edición. Sin sesión → login (lo hace `requireUser`). Si no puede → "App no disponible".
 * Devuelve el usuario para que la página lo reuse, igual que `requireCapability`.
 */
export async function requireApp(id: AppId): Promise<SessionUser> {
  const app = appPorId(id);
  const user = await requireUser();
  const negocio = await getNegocioApps(user.role);
  if (motivoNoDisponible(app, negocio) !== null) redirect(rutaNoDisponible(id));
  return user;
}

/**
 * Lo que tira `requireAppAccion`. El mensaje es el mismo de "App no disponible" (qué pasa y
 * a quién pedírsela) y se puede mostrar tal cual.
 */
export class AppNoDisponibleError extends Error {
  readonly appId: AppId;
  readonly motivo: MotivoNoDisponible;

  constructor(appId: AppId, motivo: MotivoNoDisponible, mensaje: string) {
    super(mensaje);
    this.name = "AppNoDisponibleError";
    this.appId = appId;
    this.motivo = motivo;
  }
}

/**
 * La misma regla para una server action de derecho comercial (emitir en ARCA, bancos,
 * varios locales). Una action no puede redirigir a mitad de un formulario sin perder lo
 * cargado, así que TIRA `AppNoDisponibleError` con un mensaje listo para mostrar. La action
 * que la llama lo atrapa y devuelve el mensaje a la pantalla: si el error se escapa, Next
 * en producción lo reemplaza por uno genérico. Se suma de a una, en las actions que venden
 * algo; no reemplaza a `requireCapability`.
 */
export async function requireAppAccion(id: AppId): Promise<SessionUser> {
  const app = appPorId(id);
  const user = await requireUser();
  const negocio = await getNegocioApps(user.role);
  const motivo = motivoNoDisponible(app, negocio);
  if (motivo !== null) {
    const { porque, aQuien } = explicarNoDisponible(app, motivo, negocio);
    throw new AppNoDisponibleError(id, motivo, `${porque} ${aQuien}`);
  }
  return user;
}

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
import { appCasa, appDelPanelCerrado, explicarNoDisponible, motivoNoDisponible, rutaDeLaCasa, type MotivoNoDisponible, type NegocioApps } from "@/apps/visibles";
import { getNegocioApps } from "@/apps/contexto.server";
import { appDeGestionVisible, type RolGestion } from "@/lib/proyectos/gestion-core";

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
  const negocio = await getNegocioApps(user.role, user.overrides);
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
  const negocio = await getNegocioApps(user.role, user.overrides);
  const motivo = motivoNoDisponible(app, negocio);
  if (motivo !== null) {
    const { porque, aQuien } = explicarNoDisponible(app, motivo, negocio);
    throw new AppNoDisponibleError(id, motivo, `${porque} ${aQuien}`);
  }
  return user;
}

// ── La regla ENTERA de la pantalla, para las acciones (MIA-ACCIONES-PANEL, certificación CRM-018) ──────────────────
//
// `requireApp` es la guardia de la página, pero dos rebotes viven SÓLO en el layout de (dashboard): la CASA (un negocio
// cuyo panel es una app, Break Point → el club) y la barra del ROL DE GESTIÓN en el panel de Proyectos (una Comercial no
// abre Caja). Con eso, la pantalla rebotaba y la acción de servidor —que sólo pedía el rol del ERP— escribía igual si
// alguien la llamaba a mano. `motivoDeLaPantalla` junta las tres reglas; las acciones de Caja, Libro, Cierre del día y
// Apariencia la exigen con `requirePantallaAccion` (escrituras) o `requirePantalla` (lecturas que alimentan la pantalla).

/** Lo que el layout suma a `motivoNoDisponible`: la casa del negocio y la barra del rol de gestión. */
export type MotivoDeLaPantalla = MotivoNoDisponible | "casa" | "gestion";

/** El rol de gestión de quien mira, sólo cuando el panel es el de Proyectos (como el layout); `null` en el resto. */
export type ActorDelPanel = { rol: RolGestion; permisos: readonly { rol: string; modulo: string; ver: boolean; editar: boolean }[] } | null;

/**
 * Por qué la pantalla de `id` rebota para esta persona, o `null` si se abre. PURA. Es `motivoNoDisponible` (la regla de
 * `requireApp`) más lo que hace el layout: con casa, sólo la casa y las apps de cuenta; en el panel de Proyectos, sólo lo
 * que el rol de gestión abre (`appDeGestionVisible`, la misma función que arma la barra).
 */
export function motivoDeLaPantalla(id: AppId, negocio: NegocioApps, actor: ActorDelPanel): MotivoDeLaPantalla | null {
  const app = appPorId(id);
  const motivo = motivoNoDisponible(app, negocio);
  if (motivo !== null) return motivo;
  const casa = appCasa(negocio);
  if (casa && !rutaDeLaCasa(app.ruta, casa)) return "casa";
  if (actor && !appDeGestionVisible(app.id, actor.rol, actor.permisos)) return "gestion";
  return null;
}

/** La app que se abre de `ids` o el primer motivo; resuelve sesión, negocio y (en el panel de Proyectos) el actor. */
async function primeraAbrible(ids: readonly [AppId, ...AppId[]]): Promise<{ user: SessionUser; negocio: NegocioApps; motivo: MotivoDeLaPantalla | null }> {
  const user = await requireUser();
  const negocio = await getNegocioApps(user.role, user.overrides);
  // Import tardío: gestion.server lee la base y pide `agenda:read`, y sólo hace falta en el panel de Proyectos.
  const actor: ActorDelPanel = appDelPanelCerrado(negocio)?.id === "proyectos" ? await (await import("@/lib/proyectos/gestion.server")).actorActual() : null;
  const motivos = ids.map((id) => motivoDeLaPantalla(id, negocio, actor));
  return { user, negocio, motivo: motivos.includes(null) ? null : motivos[0] };
}

/** Para el texto: la casa se explica como el panel cerrado y la barra de gestión como el rol. */
const motivoParaExplicar = (m: MotivoDeLaPantalla): MotivoNoDisponible => (m === "casa" ? "panel" : m === "gestion" ? "rol" : m);

/**
 * La acción de servidor de una pantalla: pasa si la persona puede abrir ALGUNA de `ids` (una acción que comparten dos
 * pantallas, como abrir la caja desde Caja o desde Vender, lista las dos). Si no, tira `AppNoDisponibleError` con el texto
 * de «App no disponible», para que la acción lo devuelva como su error sin escribir nada.
 */
export async function requirePantallaAccion(...ids: [AppId, ...AppId[]]): Promise<SessionUser> {
  const { user, negocio, motivo } = await primeraAbrible(ids);
  if (motivo !== null) {
    const app = appPorId(ids[0]);
    const { porque, aQuien } = explicarNoDisponible(app, motivoParaExplicar(motivo), negocio);
    throw new AppNoDisponibleError(ids[0], motivoParaExplicar(motivo), `${porque} ${aQuien}`);
  }
  return user;
}

/** Igual, para una lectura que arma la pantalla: sin la app, a «App no disponible» como `requireApp`. */
export async function requirePantalla(...ids: [AppId, ...AppId[]]): Promise<SessionUser> {
  const { user, motivo } = await primeraAbrible(ids);
  if (motivo !== null) redirect(rutaNoDisponible(ids[0]));
  return user;
}

/** `requirePantallaAccion` devuelta como resultado: `{ error }` con el texto listo, o el usuario. */
export async function pantallaAccion(...ids: [AppId, ...AppId[]]): Promise<{ user: SessionUser; error?: undefined } | { user?: undefined; error: string }> {
  try {
    return { user: await requirePantallaAccion(...ids) };
  } catch (e) {
    if (e instanceof AppNoDisponibleError) return { error: e.message };
    throw e;
  }
}

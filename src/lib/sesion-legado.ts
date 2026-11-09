// EXCEPCIÓN ÚNICA al corte del formato viejo de sesión (orden del dueño, 08/11/2026, textual: «los accesos viejos
// se mantienen, solamente el de Macarena Arias se mantiene, los demás no»).
//
// Desde que se publica, un token viejo (`userId.firma`, sin vencimiento) no abre nada de nadie (`readSessionToken`).
// Si tiene firma válida, el proxy lo manda a /admin/login/renovar, que llama a `canjearTokenLegado`: carga el usuario
// DE LA BASE (no confía en nada del token salvo el id firmado) y sólo si
//   · el pedido es del negocio `beauty-spa` (CH Estética) y el usuario es de ese negocio, activo y no borrado, y
//   · su email (el de la base) está en la lista de abajo,
// le emite en silencio un token nuevo (v3, auth.ts). Cualquier otra cosa (firma mala, otro negocio, otro usuario, la base que
// falla, la lista vacía) → null: falla cerrada, y la persona va al login con «tu sesión venció».
//
// Desde ahí rige la vigencia por uso de auth.ts: se renueva mientras la use; con 15 min sin uso se bloquea y, como el
// canje no comprobó su contraseña, no puede definir un PIN hasta entrar con ella: el desbloqueo le pide la contraseña.
//
// UNA SOLA VEZ y CON FECHA TOPE (cert 5, sin migración): el canje exige que `lastLoginAt` del usuario sea anterior a
// `CORTE_LEGADO_V1` (o nulo) y lo marca con la hora del canje en un UPDATE condicional (`reclamarCanje`): dos canjes
// simultáneos no pasan los dos, y un segundo canje de cualquier copia del token viejo ya no encuentra la condición.
// Desde `FIN_LEGADO_V1` no se canjea nada.
//
// PURO (sin Prisma ni cookies): la ruta inyecta la carga del usuario. Detalle: docs/seguridad/sesion-con-vencimiento.md.

import { createSessionToken, idDelTokenLegadoParaCanje, readSessionToken } from "@/lib/auth";
import { destinoInterno } from "@/lib/destino-interno";

/** El único negocio donde vale la excepción. */
export const NEGOCIO_DEL_LEGADO = "beauty-spa";

/**
 * Email de Macarena Arias en el repo (docs/PROXIMOS-PASOS.md:48, «email provisional del OWNER» de CH): PROVISIONAL A
 * CONFIRMAR. Si su usuario real tiene otro email, el dueño carga `LEGADO_V1_USUARIOS`.
 */
/**
 * Corte: momento de esta versión (08/11/2026 18:46 UTC), anterior a cualquier publicación. Sólo se canjea si el último
 * ingreso del usuario es anterior (o nunca entró); el canje lo pone en «ahora», así que no se repite. Si entró con su
 * clave después del corte, ya tiene (o tendrá) sesión por clave y la excepción no hace falta: falla cerrada.
 */
export const CORTE_LEGADO_V1 = Date.parse("2026-11-08T18:46:00Z");

/** Fecha tope fija: desde el 08/12/2026 00:00 (hora argentina) ningún token viejo se canjea. */
export const FIN_LEGADO_V1 = Date.parse("2026-12-08T00:00:00-03:00");

export const LEGADO_V1_POR_DEFECTO: readonly string[] = ["macarenaarias21@gmail.com"];

/**
 * Emails con permiso de canjear su token viejo. `LEGADO_V1_USUARIOS` (emails separados por coma o espacio), si está
 * cargada, REEMPLAZA a la lista por defecto; `ninguno` la vacía. Sin la variable rige `LEGADO_V1_POR_DEFECTO`.
 */
export function usuariosConLegadoV1(env: Record<string, string | undefined> = process.env): ReadonlySet<string> {
  const crudo = env.LEGADO_V1_USUARIOS?.trim();
  const lista = crudo ? (crudo.toLowerCase() === "ninguno" ? [] : crudo.split(/[\s,;]+/)) : LEGADO_V1_POR_DEFECTO;
  return new Set(lista.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@")));
}

export type UsuarioParaCanje = { id: string; email: string; tenantId: string; lastLoginAt?: Date | null };

export type DependenciasDelCanje = {
  /** Slug del negocio del pedido (por host o pin); null si no se resolvió. */
  slugDelPedido: string | null;
  /** Id del negocio del pedido. */
  tenantIdDelPedido: string;
  /** Carga el usuario ACTIVO y no borrado con ese id dentro de ese negocio, o null. */
  cargarUsuario: (userId: string, tenantId: string) => Promise<UsuarioParaCanje | null>;
  /**
   * Marca el canje en la base de forma ATÓMICA: `UPDATE … SET lastLoginAt = ahora WHERE id, tenantId, activo, no
   * borrado AND (lastLoginAt IS NULL OR lastLoginAt < corte)`; true sólo si actualizó la fila. Sin esto, no hay canje.
   */
  reclamarCanje?: (userId: string, tenantId: string, ahora: number, corte: number) => Promise<boolean>;
  lista?: ReadonlySet<string>;
  ahora?: number;
};

/** Token nuevo (v3) para el dueño del token viejo si la excepción lo cubre; si no, null (falla cerrada). */
export async function canjearTokenLegado(
  token: string | undefined | null,
  deps: DependenciasDelCanje,
): Promise<{ userId: string; tokenNuevo: string } | null> {
  const userId = await idDelTokenLegadoParaCanje(token);
  if (!userId) return null;
  if (deps.slugDelPedido !== NEGOCIO_DEL_LEGADO || !deps.tenantIdDelPedido) return null;
  const lista = deps.lista ?? usuariosConLegadoV1();
  if (lista.size === 0) return null;
  let usuario: UsuarioParaCanje | null;
  try {
    usuario = await deps.cargarUsuario(userId, deps.tenantIdDelPedido);
  } catch {
    return null;
  }
  if (!usuario || usuario.id !== userId || usuario.tenantId !== deps.tenantIdDelPedido) return null;
  if (!lista.has(usuario.email.trim().toLowerCase())) return null;
  const ahora = deps.ahora ?? Date.now();
  // Falla cerrada: reloj raro, antes del corte (el «una vez» depende de que ahora >= corte) o después del tope.
  if (!Number.isFinite(ahora) || ahora < CORTE_LEGADO_V1 || ahora >= FIN_LEGADO_V1) return null;
  const ultimo = usuario.lastLoginAt;
  if (ultimo && !(ultimo.getTime() < CORTE_LEGADO_V1)) return null; // ya canjeó o entró con su clave después del corte
  if (!deps.reclamarCanje) return null;
  let reclamado = false;
  try {
    reclamado = await deps.reclamarCanje(userId, deps.tenantIdDelPedido, ahora, CORTE_LEGADO_V1);
  } catch {
    return null;
  }
  if (reclamado !== true) return null;
  // `ingreso` 0: el canje no comprobó ninguna contraseña, así que no habilita definir el PIN (sesion-pin.ts).
  return { userId, tokenNuevo: await createSessionToken(userId, ahora, 0) };
}

/** Destino de `next` para /admin/login/renovar: ruta interna segura (`destinoInterno`) o `/admin`. */
export function destinoDeRenovar(crudo: string | null | undefined): string {
  if (!crudo) return "/admin";
  const d = destinoInterno(crudo);
  return d === "/" && crudo !== "/" ? "/admin" : d;
}

export type PlanDeRenovacion =
  /** Ya tiene una sesión nueva activa: se va a `next` SIN tocar la cookie (un GET cruzado no la borra). */
  | { tipo: "seguir"; next: string }
  | { tipo: "canjeado"; next: string; userId: string; tokenNuevo: string }
  /** Al login con «tu sesión venció»; la cookie se borra sólo si es un token viejo de firma válida no canjeable. */
  | { tipo: "vencida"; next: string; borrarCookie: boolean };

/** Qué hace /admin/login/renovar. Las dependencias del canje se cargan sólo si hay un token viejo; si fallan, cerrada. */
export async function planDeRenovacion(
  token: string | undefined | null,
  nextCrudo: string | null | undefined,
  cargarDeps: () => Promise<DependenciasDelCanje>,
): Promise<PlanDeRenovacion> {
  const next = destinoDeRenovar(nextCrudo);
  if (await readSessionToken(token)) return { tipo: "seguir", next };
  if (!(await idDelTokenLegadoParaCanje(token))) return { tipo: "vencida", next, borrarCookie: false };
  let canje: Awaited<ReturnType<typeof canjearTokenLegado>> = null;
  try {
    canje = await canjearTokenLegado(token, await cargarDeps());
  } catch {
    canje = null;
  }
  if (!canje) return { tipo: "vencida", next, borrarCookie: true };
  return { tipo: "canjeado", next, userId: canje.userId, tokenNuevo: canje.tokenNuevo };
}

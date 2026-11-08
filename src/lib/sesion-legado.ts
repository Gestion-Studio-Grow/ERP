// EXCEPCIÓN ÚNICA al corte del formato viejo de sesión (orden del dueño, 08/11/2026, textual: «los accesos viejos
// se mantienen, solamente el de Macarena Arias se mantiene, los demás no»).
//
// Desde que se publica, un token viejo (`userId.firma`, sin vencimiento) no abre nada de nadie (`readSessionToken`).
// Si tiene firma válida, el proxy lo manda a /admin/login/renovar, que llama a `canjearTokenLegado`: carga el usuario
// DE LA BASE (no confía en nada del token salvo el id firmado) y sólo si
//   · el pedido es del negocio `beauty-spa` (CH Estética) y el usuario es de ese negocio, activo y no borrado, y
//   · su email (el de la base) está en la lista de abajo,
// le emite en silencio un token v2 (8 h). Cualquier otra cosa (firma mala, otro negocio, otro usuario, la base que
// falla, la lista vacía) → null: falla cerrada, y la persona va al login con «tu sesión venció».
//
// Sin renovación deslizante del v2 (no existe en el panel): a las 8 h del canje tiene que volver a entrar con su clave.
//
// PURO (sin Prisma ni cookies): la ruta inyecta la carga del usuario. Detalle: docs/seguridad/sesion-con-vencimiento.md.

import { createSessionToken, idDelTokenLegadoParaCanje } from "@/lib/auth";

/** El único negocio donde vale la excepción. */
export const NEGOCIO_DEL_LEGADO = "beauty-spa";

/**
 * Email de Macarena Arias en el repo (docs/PROXIMOS-PASOS.md:48, «email provisional del OWNER» de CH): PROVISIONAL A
 * CONFIRMAR. Si su usuario real tiene otro email, el dueño carga `LEGADO_V1_USUARIOS`.
 */
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

export type UsuarioParaCanje = { id: string; email: string; tenantId: string };

export type DependenciasDelCanje = {
  /** Slug del negocio del pedido (por host o pin); null si no se resolvió. */
  slugDelPedido: string | null;
  /** Id del negocio del pedido. */
  tenantIdDelPedido: string;
  /** Carga el usuario ACTIVO y no borrado con ese id dentro de ese negocio, o null. */
  cargarUsuario: (userId: string, tenantId: string) => Promise<UsuarioParaCanje | null>;
  lista?: ReadonlySet<string>;
  ahora?: number;
};

/** Token v2 nuevo para el dueño del token viejo si la excepción lo cubre; si no, null (falla cerrada). */
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
  return { userId, tokenNuevo: await createSessionToken(userId, deps.ahora) };
}

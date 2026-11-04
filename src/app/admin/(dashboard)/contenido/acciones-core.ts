// Las acciones de /admin/contenido sin Next: reciben la sesión y la base por parámetro, así el test prueba con dos
// negocios y un Prisma falso que el negocio SIEMPRE sale de la sesión (nunca de lo que manda el navegador) y que uno
// no cambia ni borra lo del otro. El "use server" de verdad está en `acciones.ts`.
import {
  borrarPublicacion,
  cambiarEstadoPublicacion,
  guardarPublicacion,
  listarPublicaciones,
  validarEntrada,
  type DbContenido,
  type ResultadoAlmacen,
} from "@/lib/contenido/almacen.server";
import { esEstado, type Publicacion } from "@/lib/contenido/tipos";

export type RespuestaContenido =
  | { ok: true; modo: "base"; publicaciones: Publicacion[] }
  | { ok: true; modo: "demo" }
  | { ok: false; error: string };

export interface DepsContenido {
  /** Exige la app y el permiso; devuelve el negocio de la sesión o el motivo (listo para mostrar) si no puede. */
  sesion(): Promise<{ tenantId: string } | { error: string }>;
  db: DbContenido;
}

const NO_ENCONTRADA = "Esa publicación no está en la agenda de este negocio.";
const ID = /^[A-Za-z0-9_-]{1,64}$/;

async function conSesion(deps: DepsContenido, fn: (tenantId: string) => Promise<RespuestaContenido>): Promise<RespuestaContenido> {
  const s = await deps.sesion();
  if ("error" in s) return { ok: false, error: s.error || "No tenés acceso a Contenido." };
  if (!s.tenantId) return { ok: false, error: "No tenés acceso a Contenido." };
  return fn(s.tenantId);
}

/** Tras escribir, devuelve la agenda al día (así la pantalla no hace otra vuelta). */
async function cerrar(deps: DepsContenido, tenantId: string, r: ResultadoAlmacen<unknown>): Promise<RespuestaContenido> {
  if (r.estado === "sin-tabla") return { ok: true, modo: "demo" };
  if (r.estado === "no-encontrada") return { ok: false, error: NO_ENCONTRADA };
  const lista = await listarPublicaciones(deps.db, tenantId);
  if (lista.estado === "ok") return { ok: true, modo: "base", publicaciones: lista.valor };
  return lista.estado === "sin-tabla" ? { ok: true, modo: "demo" } : { ok: false, error: NO_ENCONTRADA };
}

export function accionesDeContenido(deps: DepsContenido) {
  return {
    listar: () => conSesion(deps, async (t) => cerrar(deps, t, { estado: "ok", valor: null })),
    guardar: (entrada: unknown) =>
      conSesion(deps, async (t) => {
        const v = validarEntrada(entrada);
        if (!v.ok) return { ok: false, error: v.error };
        return cerrar(deps, t, await guardarPublicacion(deps.db, t, { id: v.id, datos: v.datos }));
      }),
    cambiarEstado: (id: unknown, estado: unknown) =>
      conSesion(deps, async (t) => {
        if (typeof id !== "string" || !ID.test(id) || !esEstado(estado)) return { ok: false, error: "Pedido inválido." };
        return cerrar(deps, t, await cambiarEstadoPublicacion(deps.db, t, id, estado));
      }),
    borrar: (id: unknown) =>
      conSesion(deps, async (t) => {
        if (typeof id !== "string" || !ID.test(id)) return { ok: false, error: "Pedido inválido." };
        return cerrar(deps, t, await borrarPublicacion(deps.db, t, id));
      }),
  };
}

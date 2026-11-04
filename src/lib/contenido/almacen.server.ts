// Contenido — almacén en la base (tabla `PublicacionAgendada`, migración 20261105120000, Gate 2: sin aplicar).
// Plan: docs/producto/contenido/PLAN.md §2.
//
// Sólo del servidor (lo usan las server actions de /admin/contenido). No importa Prisma como valor: recibe el
// cliente por parámetro (`prisma` en las actions, uno falso en los tests), así el aislamiento por negocio se prueba
// sin base. No lleva `import "server-only"` porque ese paquete no resuelve en `node --test`; ningún componente
// client lo importa (sólo `acciones.ts`, que es "use server").
//
// Reglas (lección MT-1): TODA consulta lleva `tenantId` en el `where`; RLS es el respaldo. Un id de otro negocio no
// se encuentra: no se cambia ni se borra nada. Si la tabla falta (P2021/P2022) se devuelve `{ estado: "sin-tabla" }`
// y la pantalla pasa al modo demo (almacén local); cualquier otra falla sigue su curso.
import { esCanal, esEstado, esFormato, esTipo, type EstadoPublicacion, type Publicacion } from "./tipos";
import { validarPublicacion } from "./almacen-local";

/** Lo que se usa del cliente de Prisma (el real cumple esta forma). */
export interface FilaPublicacion {
  id: string;
  tenantId: string;
  fecha: string;
  hora: string;
  canal: string;
  estado: string;
  tipo: string;
  plantilla: string;
  formato: string;
  titulo: string;
  texto: string;
  campos: unknown;
  caption: unknown;
  createdAt: Date;
  updatedAt: Date;
}
// Lo que se escribe: los Json como `type` (no `interface`) para que Prisma los acepte como InputJsonValue.
type CamposJson = { rotulo: string; titulo: string; bajada: string; cta: string };
type CaptionJson = { instagram: string; whatsapp: string };
type DatosFila = Omit<FilaPublicacion, "id" | "tenantId" | "createdAt" | "updatedAt" | "campos" | "caption"> & {
  campos: CamposJson;
  caption: CaptionJson;
};

export interface DbContenido {
  publicacionAgendada: {
    findMany(args: { where: { tenantId: string; fecha?: { gte: string; lte: string } }; orderBy: { fecha?: "asc" | "desc"; hora?: "asc" | "desc" }[]; take: number }): Promise<FilaPublicacion[]>;
    create(args: { data: DatosFila & { tenantId: string } }): Promise<FilaPublicacion>;
    updateMany(args: { where: { id: string; tenantId: string }; data: Partial<DatosFila> }): Promise<{ count: number }>;
    deleteMany(args: { where: { id: string; tenantId: string } }): Promise<{ count: number }>;
  };
}

export type ResultadoAlmacen<T> = { estado: "ok"; valor: T } | { estado: "sin-tabla" } | { estado: "no-encontrada" };

export function faltaLaTabla(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === "P2021" || code === "P2022";
}

async function tolerante<T>(fn: () => Promise<ResultadoAlmacen<T>>): Promise<ResultadoAlmacen<T>> {
  try {
    return await fn();
  } catch (err) {
    if (!faltaLaTabla(err)) throw err;
    return { estado: "sin-tabla" };
  }
}

function exigirTenant(tenantId: string): string {
  const t = String(tenantId ?? "").trim();
  if (!t) throw new Error("Falta el negocio: no se lee ni se escribe la agenda sin tenantId.");
  return t;
}

/** Fila de la base → `Publicacion` (descarta lo que no valida). */
export function aPublicacion(f: FilaPublicacion): Publicacion | null {
  const pub = validarPublicacion({ ...f, creadaEn: undefined, actualizadaEn: undefined });
  if (!pub) return null;
  pub.creadaEn = f.createdAt instanceof Date ? f.createdAt.toISOString() : undefined;
  pub.actualizadaEn = f.updatedAt instanceof Date ? f.updatedAt.toISOString() : undefined;
  if (!pub.creadaEn) delete pub.creadaEn;
  if (!pub.actualizadaEn) delete pub.actualizadaEn;
  return pub;
}

export const MAX_PUBLICACIONES = 500;
const LIMITES = { titulo: 160, texto: 2000, campo: 400, caption: 4000, plantilla: 60 } as const;

/**
 * Valida y normaliza lo que llega del navegador. `id` vacío = alta. Devuelve el error en criollo si no sirve.
 */
export function validarEntrada(x: unknown): { ok: true; id: string | null; datos: DatosFila } | { ok: false; error: string } {
  const o = x && typeof x === "object" ? (x as Record<string, unknown>) : null;
  if (!o) return { ok: false, error: "No llegó la publicación." };
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : null;
  if (id !== null && (id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id))) return { ok: false, error: "La publicación no es válida." };
  const pub = validarPublicacion({ ...o, id: id ?? "nueva" });
  if (!pub) return { ok: false, error: "Revisá el día, la hora, el canal y el estado." };
  if (!esTipo(pub.tipo) || !esCanal(pub.canal) || !esEstado(pub.estado) || !esFormato(pub.formato)) {
    return { ok: false, error: "Revisá el día, la hora, el canal y el estado." };
  }
  const corto = (s: string, n: number) => s.trim().slice(0, n);
  const titulo = corto(pub.titulo, LIMITES.titulo);
  if (!titulo) return { ok: false, error: "Poné un título." };
  return {
    ok: true,
    id,
    datos: {
      fecha: pub.fecha,
      hora: pub.hora,
      canal: pub.canal,
      estado: pub.estado,
      tipo: pub.tipo,
      plantilla: corto(pub.plantilla, LIMITES.plantilla),
      formato: pub.formato,
      titulo,
      texto: corto(pub.texto, LIMITES.texto),
      campos: {
        rotulo: corto(pub.campos.rotulo, LIMITES.campo),
        titulo: corto(pub.campos.titulo, LIMITES.campo),
        bajada: corto(pub.campos.bajada, LIMITES.campo),
        cta: corto(pub.campos.cta, LIMITES.campo),
      },
      caption: { instagram: corto(pub.caption.instagram, LIMITES.caption), whatsapp: corto(pub.caption.whatsapp, LIMITES.caption) },
    },
  };
}

/** Las publicaciones del negocio (opcionalmente entre dos fechas), por día y hora. */
export function listarPublicaciones(
  db: DbContenido,
  tenantId: string,
  rango?: { desde: string; hasta: string },
): Promise<ResultadoAlmacen<Publicacion[]>> {
  const t = exigirTenant(tenantId);
  return tolerante<Publicacion[]>(async () => {
    const filas = await db.publicacionAgendada.findMany({
      where: rango ? { tenantId: t, fecha: { gte: rango.desde, lte: rango.hasta } } : { tenantId: t },
      orderBy: [{ fecha: "asc" }, { hora: "asc" }],
      take: MAX_PUBLICACIONES,
    });
    return { estado: "ok", valor: filas.filter((f) => f.tenantId === t).map(aPublicacion).filter((p): p is Publicacion => p !== null) };
  });
}

/** Alta (sin id) o cambio (con id, sólo si es de este negocio). */
export function guardarPublicacion(db: DbContenido, tenantId: string, entrada: { id: string | null; datos: DatosFila }): Promise<ResultadoAlmacen<Publicacion | null>> {
  const t = exigirTenant(tenantId);
  return tolerante<Publicacion | null>(async () => {
    if (entrada.id === null) {
      const fila = await db.publicacionAgendada.create({ data: { ...entrada.datos, tenantId: t } });
      return { estado: "ok", valor: aPublicacion(fila) };
    }
    const { count } = await db.publicacionAgendada.updateMany({ where: { id: entrada.id, tenantId: t }, data: entrada.datos });
    return count === 0 ? { estado: "no-encontrada" } : { estado: "ok", valor: null };
  });
}

export function cambiarEstadoPublicacion(db: DbContenido, tenantId: string, id: string, estado: EstadoPublicacion): Promise<ResultadoAlmacen<true>> {
  const t = exigirTenant(tenantId);
  if (!esEstado(estado)) throw new Error("Estado inválido.");
  return tolerante<true>(async () => {
    const { count } = await db.publicacionAgendada.updateMany({ where: { id, tenantId: t }, data: { estado } });
    return count === 0 ? { estado: "no-encontrada" } : { estado: "ok", valor: true };
  });
}

export function borrarPublicacion(db: DbContenido, tenantId: string, id: string): Promise<ResultadoAlmacen<true>> {
  const t = exigirTenant(tenantId);
  return tolerante<true>(async () => {
    const { count } = await db.publicacionAgendada.deleteMany({ where: { id, tenantId: t } });
    return count === 0 ? { estado: "no-encontrada" } : { estado: "ok", valor: true };
  });
}

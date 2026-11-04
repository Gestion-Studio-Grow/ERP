// Contenido — almacén local del modo demo (PURO): recibe un Storage-like inyectado (localStorage en el navegador,
// un Map en los tests). Una clave por negocio: `gsg:contenido:<slug>`. Lo que no valida se descarta; JSON roto → [].
import { esFechaValida } from "./calendario";
import { esCanal, esEstado, esFormato, esTipo, type EstadoPublicacion, type Publicacion } from "./tipos";

export interface AlmacenTipoStorage {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function claveDelAlmacen(slug: string): string {
  const s = String(slug ?? "").trim().toLowerCase();
  if (!SLUG.test(s)) throw new Error(`Slug de negocio inválido para el almacén local: «${slug}»`);
  return `gsg:contenido:${s}`;
}

const esTexto = (x: unknown): x is string => typeof x === "string";
const esHora = (x: unknown): x is string => esTexto(x) && /^([01]\d|2[0-3]):[0-5]\d$/.test(x);
const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);

/** Devuelve la publicación normalizada o `null` si no es válida. */
export function validarPublicacion(x: unknown): Publicacion | null {
  const o = obj(x);
  if (!o) return null;
  const campos = obj(o.campos);
  const caption = obj(o.caption);
  if (!esTexto(o.id) || !o.id || !esFechaValida(o.fecha) || !esHora(o.hora)) return null;
  if (!esCanal(o.canal) || !esEstado(o.estado) || !esTipo(o.tipo) || !esFormato(o.formato)) return null;
  if (!esTexto(o.plantilla) || !esTexto(o.titulo) || !esTexto(o.texto) || !campos || !caption) return null;
  const s = (v: unknown) => (esTexto(v) ? v : "");
  const pub: Publicacion = {
    id: o.id,
    fecha: o.fecha,
    hora: o.hora,
    canal: o.canal,
    estado: o.estado,
    tipo: o.tipo,
    plantilla: o.plantilla,
    formato: o.formato,
    titulo: o.titulo,
    texto: o.texto,
    campos: { rotulo: s(campos.rotulo), titulo: s(campos.titulo), bajada: s(campos.bajada), cta: s(campos.cta) },
    caption: { instagram: s(caption.instagram), whatsapp: s(caption.whatsapp) },
  };
  if (esTexto(o.creadaEn)) pub.creadaEn = o.creadaEn;
  if (esTexto(o.actualizadaEn)) pub.actualizadaEn = o.actualizadaEn;
  return pub;
}

export function serializar(pubs: readonly Publicacion[]): string {
  return JSON.stringify({ version: 1, publicaciones: pubs });
}

/** Tolera JSON roto, otra forma o elementos inválidos (los descarta). */
export function deserializar(texto: string | null | undefined): Publicacion[] {
  if (!texto) return [];
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return [];
  }
  const lista = Array.isArray(crudo) ? crudo : obj(crudo)?.publicaciones;
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  const out: Publicacion[] = [];
  for (const x of lista) {
    const p = validarPublicacion(x);
    if (p && !vistos.has(p.id)) {
      vistos.add(p.id);
      out.push(p);
    }
  }
  return out;
}

export interface AlmacenLocal {
  listar(): Publicacion[];
  /** Alta o reemplazo por `id`. Devuelve la lista nueva. */
  guardar(pub: Publicacion): Publicacion[];
  cambiarEstado(id: string, estado: EstadoPublicacion): Publicacion[];
  borrar(id: string): Publicacion[];
}

/** El almacén de UN negocio. `ahora` es inyectable para los tests. */
export function crearAlmacenLocal(storage: AlmacenTipoStorage, slug: string, ahora: () => string = () => new Date().toISOString()): AlmacenLocal {
  const clave = claveDelAlmacen(slug);
  const leer = (): Publicacion[] => {
    try {
      return deserializar(storage.getItem(clave));
    } catch {
      return [];
    }
  };
  const escribir = (pubs: Publicacion[]) => {
    try {
      storage.setItem(clave, serializar(pubs));
    } catch {
      // Cupo lleno o almacenamiento bloqueado: se sigue con lo que hay en memoria.
    }
    return pubs;
  };
  return {
    listar: leer,
    guardar(pub) {
      const valida = validarPublicacion(pub);
      if (!valida) throw new Error("Publicación inválida: revisá fecha, hora, canal y estado.");
      const pubs = leer();
      const i = pubs.findIndex((p) => p.id === valida.id);
      const sello = ahora();
      if (i >= 0) pubs[i] = { ...valida, creadaEn: pubs[i].creadaEn ?? sello, actualizadaEn: sello };
      else pubs.push({ ...valida, creadaEn: valida.creadaEn ?? sello, actualizadaEn: sello });
      return escribir(pubs);
    },
    cambiarEstado(id, estado) {
      if (!esEstado(estado)) return leer();
      const pubs = leer();
      const p = pubs.find((x) => x.id === id);
      if (!p) return pubs;
      p.estado = estado;
      p.actualizadaEn = ahora();
      return escribir(pubs);
    },
    borrar(id) {
      return escribir(leer().filter((p) => p.id !== id));
    },
  };
}

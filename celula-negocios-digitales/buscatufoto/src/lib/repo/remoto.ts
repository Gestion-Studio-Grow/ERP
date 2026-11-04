"use client";

import { MARCA_POR_DEFECTO } from "../marca-agua";
import type { Album, Cotizacion, Fotografo, MarcaAgua, Medio, Pedido } from "../tipos";
import { avisarCambio } from "./cambios";
import {
  ErrorRepo,
  type AltaConCodigo,
  type AltaFotografo,
  type CodigoErrorRepo,
  type DatosAlbum,
  type DatosPedido,
  type NuevoMedio,
  type Repositorio,
} from "./tipos";

/**
 * Repositorio contra el servidor (`/api/btf/*`, contrato en docs/API.md). La sesión es la cookie HttpOnly
 * `btf_sesion`; acá nunca se ve. Los originales viajan directo al almacén por PUT prefirmado.
 */
const BASE = "/api/btf";

const CODIGOS: readonly CodigoErrorRepo[] = [
  "no-encontrado",
  "duplicado",
  "invalido",
  "prohibido",
  "cupon",
  "precio",
  "no-autenticado",
  "no-configurado",
];

function codigoPorEstado(status: number): CodigoErrorRepo {
  if (status === 401) return "no-autenticado";
  if (status === 403) return "prohibido";
  if (status === 404) return "no-encontrado";
  if (status === 409) return "duplicado";
  if (status === 503) return "no-configurado";
  return "invalido";
}

const MENSAJES: Record<CodigoErrorRepo, string> = {
  "no-encontrado": "No encontramos lo que buscabas.",
  duplicado: "Eso ya existe.",
  invalido: "Revisá los datos y probá de nuevo.",
  prohibido: "No tenés permiso para hacer eso.",
  cupon: "El cupón no aplica.",
  precio: "El total cambió. Revisalo y confirmá de nuevo.",
  "no-autenticado": "Tu sesión se cerró. Ingresá de nuevo.",
  "no-configurado": "El servicio no está disponible en este momento.",
};

async function errorDe(r: Response): Promise<ErrorRepo> {
  let cuerpo: { error?: unknown; mensaje?: unknown } = {};
  try {
    cuerpo = (await r.json()) as typeof cuerpo;
  } catch {
    /* cuerpo vacío o no JSON */
  }
  const codigo = CODIGOS.includes(cuerpo.error as CodigoErrorRepo) ? (cuerpo.error as CodigoErrorRepo) : codigoPorEstado(r.status);
  const mensaje = typeof cuerpo.mensaje === "string" && cuerpo.mensaje ? cuerpo.mensaje : MENSAJES[codigo];
  return new ErrorRepo(mensaje, codigo);
}

async function api<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(BASE + ruta, {
      method: metodo,
      credentials: "include",
      headers: cuerpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorRepo("No hay conexión con el servidor. Revisá internet y probá de nuevo.", "no-configurado");
  }
  if (!r.ok) throw await errorDe(r);
  if (r.status === 204) return undefined as T;
  const texto = await r.text();
  return (texto ? JSON.parse(texto) : undefined) as T;
}

/** Igual que `api`, pero un 401/403/404 es «no hay» (null). */
async function apiONulo<T>(metodo: string, ruta: string): Promise<T | null> {
  try {
    return await api<T>(metodo, ruta);
  } catch (e) {
    if (e instanceof ErrorRepo && (e.codigo === "no-encontrado" || e.codigo === "prohibido" || e.codigo === "no-autenticado")) return null;
    throw e;
  }
}

/** PUT directo al almacén (URL prefirmada; sin cookies: es otro origen). */
async function subir(url: string, blob: Blob): Promise<void> {
  let r: Response;
  try {
    r = await fetch(url, { method: "PUT", body: blob, headers: { "Content-Type": blob.type || "application/octet-stream" }, credentials: "omit" });
  } catch {
    throw new ErrorRepo("Se cortó la subida. Revisá internet y probá de nuevo.", "invalido");
  }
  if (!r.ok) throw new ErrorRepo("El almacén rechazó el archivo. Probá de nuevo.", "invalido");
}

/** GET que sigue el 302 al GET prefirmado y devuelve el archivo. La cookie sólo va al primer salto (mismo origen). */
async function bajar(ruta: string): Promise<Blob> {
  let r: Response;
  try {
    r = await fetch(BASE + ruta, { credentials: "same-origin", redirect: "follow" });
  } catch {
    throw new ErrorRepo("No se pudo descargar. Revisá internet y probá de nuevo.", "invalido");
  }
  if (!r.ok) throw await errorDe(r);
  return r.blob();
}

// ---------- Formas por red ----------

type MedioRed = Omit<Medio, "previa" | "miniatura"> & { previaUrl: string; miniaturaUrl: string };

function deRed(m: MedioRed): Medio {
  const { previaUrl, miniaturaUrl, ...resto } = m;
  return { ...resto, previa: previaUrl, miniatura: miniaturaUrl };
}

/** El álbum público llega sin cupones y con colaboradores reducidos. */
function albumDeRed(a: Album): Album {
  return {
    ...a,
    paquetes: a.paquetes ?? [],
    escalones: a.escalones ?? [],
    cupones: a.cupones ?? [],
    colaboradores: (a.colaboradores ?? []).map((c, i) => ({ id: c.id ?? `c${i}`, email: c.email ?? "", nombre: c.nombre, rol: c.rol })),
  };
}

interface FotografoPublicoMin {
  nombre: string;
  usuario: string;
  whatsapp?: string;
}

/** Fotógrafo armado con lo poco que trae el álbum público (sin email ni cobro). */
function fotografoMinimo(id: string, f: FotografoPublicoMin): Fotografo {
  return {
    id,
    nombre: f.nombre,
    usuario: f.usuario,
    email: "",
    bio: "",
    instagram: "",
    plan: "libre",
    cobro: null,
    marca: { ...MARCA_POR_DEFECTO },
    creadoEn: 0,
  };
}

function fotografoPublico(f: Partial<Fotografo> & Pick<Fotografo, "id" | "nombre" | "usuario">): Fotografo {
  return {
    email: "",
    bio: "",
    instagram: "",
    plan: "libre",
    cobro: null,
    marca: { ...MARCA_POR_DEFECTO },
    creadoEn: 0,
    ...f,
  };
}

type CambiosFotografo = Partial<Omit<Fotografo, "id" | "creadoEn">>;
type Vistas = { previa: string; miniatura: string };

export class RepositorioRemoto implements Repositorio {
  /** fotógrafo de la sesión (cache de /yo) */
  private miId: string | null = null;
  /** slug por álbum, para las rutas públicas (/a/:slug/...) */
  private slugs = new Map<string, string>();
  /** cómo se cargó el álbum por última vez: decide si los medios salen de la vista pública o del panel */
  private vista = new Map<string, "publica" | "dueno">();
  private publicos = new Map<string, { album: Album; medios: Medio[] }>();
  private fotografos = new Map<string, Fotografo>();

  private recordarAlbum(a: Album, vista: "publica" | "dueno"): Album {
    this.slugs.set(a.id, a.slug);
    this.vista.set(a.id, vista);
    return a;
  }

  private recordarYo(f: Fotografo): Fotografo {
    this.miId = f.id;
    this.fotografos.set(f.id, f);
    return f;
  }

  private slugDe(albumId: string): string {
    const slug = this.slugs.get(albumId);
    if (!slug) throw new ErrorRepo("Ese álbum no está disponible. Volvé a abrir el enlace.", "no-encontrado");
    return slug;
  }

  // ---------- Sesión ----------

  async ingresar(email: string, contrasena: string): Promise<Fotografo> {
    const f = await api<Fotografo>("POST", "/ingreso", { email: email.trim().toLowerCase(), contrasena });
    avisarCambio("fotografos");
    return this.recordarYo(f);
  }

  async alta(d: AltaConCodigo): Promise<Fotografo> {
    const f = await api<Fotografo>("POST", "/ingreso/alta", {
      nombre: d.nombre.trim(),
      email: d.email.trim().toLowerCase(),
      contrasena: d.contrasena,
      codigo: d.codigo.trim(),
    });
    avisarCambio("fotografos");
    return this.recordarYo(f);
  }

  async salir(): Promise<void> {
    await api<void>("DELETE", "/ingreso");
    this.miId = null;
    avisarCambio("fotografos");
  }

  async yo(): Promise<Fotografo | null> {
    const f = await apiONulo<Fotografo>("GET", "/yo");
    if (!f) {
      this.miId = null;
      return null;
    }
    return this.recordarYo(f);
  }

  async guardarTokenMp(token: string): Promise<void> {
    await api<{ mpConfigurado: boolean }>("PUT", "/yo/mp", { accessToken: token.trim() });
    avisarCambio("fotografos");
  }

  async quitarTokenMp(): Promise<void> {
    await api<void>("DELETE", "/yo/mp");
    avisarCambio("fotografos");
  }

  // ---------- Fotógrafos ----------

  async registrarFotografo(d: AltaFotografo): Promise<Fotografo> {
    void d;
    throw new ErrorRepo("Para crear la cuenta hace falta una contraseña y el código de invitación.", "invalido");
  }

  /** No hay búsqueda por email en el servidor (no se exponen cuentas ajenas). */
  async fotografoPorEmail(email: string): Promise<Fotografo | null> {
    void email;
    return null;
  }

  async fotografoPorUsuario(usuario: string): Promise<Fotografo | null> {
    const r = await apiONulo<{ fotografo: Fotografo; albumes: Album[] }>("GET", `/fotografos/${encodeURIComponent(usuario)}`);
    if (!r) return null;
    const f = fotografoPublico(r.fotografo);
    if (f.id !== this.miId) this.fotografos.set(f.id, f);
    for (const a of r.albumes) this.recordarAlbum(albumDeRed(a), "publica");
    return f;
  }

  async obtenerFotografo(id: string): Promise<Fotografo | null> {
    if (this.miId === null || this.miId === id) {
      const f = await this.yo();
      if (f && f.id === id) return f;
    }
    return this.fotografos.get(id) ?? null;
  }

  async actualizarFotografo(id: string, cambios: CambiosFotografo): Promise<Fotografo> {
    void id;
    const permitido: CambiosFotografo = {};
    if (cambios.nombre !== undefined) permitido.nombre = cambios.nombre;
    if (cambios.usuario !== undefined) permitido.usuario = cambios.usuario;
    if (cambios.bio !== undefined) permitido.bio = cambios.bio;
    if (cambios.instagram !== undefined) permitido.instagram = cambios.instagram;
    if (cambios.cobro !== undefined) permitido.cobro = cambios.cobro;
    if (cambios.marca !== undefined) permitido.marca = cambios.marca;
    const f = await api<Fotografo>("PATCH", "/yo", permitido);
    avisarCambio("fotografos");
    return this.recordarYo(f);
  }

  actualizarMarca(id: string, marca: MarcaAgua): Promise<Fotografo> {
    return this.actualizarFotografo(id, { marca });
  }

  // ---------- Álbumes ----------

  async crearAlbum(fotografoId: string, d: DatosAlbum): Promise<Album> {
    void fotografoId;
    const a = await api<Album>("POST", "/albumes", d);
    avisarCambio("albumes");
    return this.recordarAlbum(a, "dueno");
  }

  async actualizarAlbum(id: string, cambios: Partial<Omit<Album, "id" | "fotografoId" | "creadoEn">>): Promise<Album> {
    const a = await api<Album>("PATCH", `/albumes/${encodeURIComponent(id)}`, cambios);
    avisarCambio("albumes");
    return this.recordarAlbum(a, "dueno");
  }

  async eliminarAlbum(id: string): Promise<void> {
    await api<void>("DELETE", `/albumes/${encodeURIComponent(id)}`);
    this.slugs.delete(id);
    this.vista.delete(id);
    avisarCambio("albumes");
  }

  async obtenerAlbum(id: string): Promise<Album | null> {
    const pub = this.vista.get(id) === "publica" ? this.publicos.get(id) : undefined;
    if (pub) return pub.album;
    const a = await apiONulo<Album>("GET", `/albumes/${encodeURIComponent(id)}`);
    return a ? this.recordarAlbum(a, "dueno") : null;
  }

  async albumPorSlug(slug: string): Promise<Album | null> {
    const r = await apiONulo<{ album: Album; medios: MedioRed[]; fotografo: FotografoPublicoMin }>("GET", `/a/${encodeURIComponent(slug)}`);
    if (!r) return null;
    const album = this.recordarAlbum(albumDeRed(r.album), "publica");
    this.publicos.set(album.id, { album, medios: r.medios.map(deRed) });
    if (album.fotografoId !== this.miId) this.fotografos.set(album.fotografoId, fotografoMinimo(album.fotografoId, r.fotografo));
    return album;
  }

  async albumesDe(fotografoId: string): Promise<Album[]> {
    void fotografoId;
    const l = await api<Album[]>("GET", "/albumes");
    return l.map((a) => this.recordarAlbum(a, "dueno")).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoEn - a.creadoEn);
  }

  // ---------- Medios ----------

  async agregarMedio(albumId: string, m: NuevoMedio): Promise<Medio> {
    const r = await api<{ medio: MedioRed; subir: { original: string; previa: string; miniatura: string } }>(
      "POST",
      `/albumes/${encodeURIComponent(albumId)}/medios`,
      {
        nombreArchivo: m.nombreArchivo,
        tipo: m.tipo,
        ancho: m.ancho,
        alto: m.alto,
        duracion: m.duracion,
        peso: m.peso ?? m.original.size,
        dorsales: m.dorsales,
        mimeOriginal: m.original.type || "application/octet-stream",
        mimePrevia: m.previa.type || "image/jpeg",
      },
    );
    await subir(r.subir.original, m.original);
    await subir(r.subir.previa, m.previa);
    await subir(r.subir.miniatura, m.miniatura);
    const medio = await api<MedioRed>("POST", `/medios/${encodeURIComponent(r.medio.id)}/confirmar`);
    avisarCambio("medios");
    avisarCambio("albumes");
    return deRed(medio);
  }

  async mediosDe(albumId: string): Promise<Medio[]> {
    const pub = this.vista.get(albumId) === "publica" ? this.publicos.get(albumId) : undefined;
    const l = pub ? pub.medios : (await api<MedioRed[]>("GET", `/albumes/${encodeURIComponent(albumId)}/medios`)).map(deRed);
    return [...l].sort((a, b) => a.nombreArchivo.localeCompare(b.nombreArchivo, "es", { numeric: true }));
  }

  async actualizarDorsales(medioId: string, dorsales: string[]): Promise<Medio> {
    const m = await api<MedioRed>("PATCH", `/medios/${encodeURIComponent(medioId)}`, { dorsales: [...new Set(dorsales)] });
    avisarCambio("medios");
    return deRed(m);
  }

  async ocultarMedio(medioId: string, oculto: boolean): Promise<Medio> {
    const m = await api<MedioRed>("PATCH", `/medios/${encodeURIComponent(medioId)}`, { oculto });
    avisarCambio("medios");
    return deRed(m);
  }

  async reemplazarVistas(medioId: string, previa: Blob, miniatura: Blob): Promise<void> {
    const v = await api<Vistas>("POST", `/medios/${encodeURIComponent(medioId)}/vistas`);
    await subir(v.previa, previa);
    await subir(v.miniatura, miniatura);
    avisarCambio("medios");
  }

  async eliminarMedio(medioId: string): Promise<void> {
    await api<void>("DELETE", `/medios/${encodeURIComponent(medioId)}`);
    avisarCambio("medios");
    avisarCambio("albumes");
  }

  originalParaDueno(medioId: string, fotografoId: string): Promise<Blob> {
    void fotografoId;
    return bajar(`/medios/${encodeURIComponent(medioId)}/original`);
  }

  // ---------- Ventas ----------

  cotizar(albumId: string, items: string[], cupon: string | null): Promise<Cotizacion> {
    return api<Cotizacion>("POST", `/a/${encodeURIComponent(this.slugDe(albumId))}/cotizar`, { items: [...new Set(items)], cupon });
  }

  async crearPedido(d: DatosPedido): Promise<Pedido> {
    const r = await api<{ pedido: Pedido; pagar?: { initPoint: string } }>("POST", `/a/${encodeURIComponent(this.slugDe(d.albumId))}/pedidos`, {
      items: [...new Set(d.items)],
      comprador: d.comprador,
      cupon: d.cupon,
      totalEsperado: d.totalEsperado,
      metodo: d.metodo ?? "mercadopago",
    });
    avisarCambio("pedidos");
    return r.pagar?.initPoint ? { ...r.pedido, initPoint: r.pagar.initPoint } : r.pedido;
  }

  obtenerPedido(id: string, clave: string): Promise<Pedido | null> {
    if (!clave) return Promise.resolve(null);
    return apiONulo<Pedido>("GET", `/pedidos/${encodeURIComponent(id)}?clave=${encodeURIComponent(clave)}`);
  }

  pedidosDe(albumId: string): Promise<Pedido[]> {
    return api<Pedido[]>("GET", `/albumes/${encodeURIComponent(albumId)}/pedidos`);
  }

  pedidosDeFotografo(fotografoId: string): Promise<Pedido[]> {
    void fotografoId;
    return api<Pedido[]>("GET", "/pedidos");
  }

  descargarOriginal(pedidoId: string, clave: string, medioId: string): Promise<Blob> {
    const q = new URLSearchParams({ pedido: pedidoId, clave, medio: medioId });
    return bajar(`/descarga?${q.toString()}`);
  }

  async marcarPagado(pedidoId: string): Promise<Pedido> {
    const p = await api<Pedido>("POST", `/pedidos/${encodeURIComponent(pedidoId)}/marcar-pagado`);
    avisarCambio("pedidos");
    return p;
  }

  /** Sin ruta propia: suma el peso de los medios de mis álbumes. */
  async almacenamientoDe(fotografoId: string): Promise<number> {
    const albumes = await this.albumesDe(fotografoId);
    const listas = await Promise.all(albumes.map((a) => this.mediosDe(a.id)));
    return listas.flat().reduce((t, m) => t + (m.peso || 0), 0);
  }
}

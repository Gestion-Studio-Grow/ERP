"use client";

import { aSlug, nuevaClave, nuevoId } from "../ids";
import { MARCA_POR_DEFECTO, OPACIDAD_MIN } from "../marca-agua";
import { plata } from "../dinero";
import { PLANES } from "../planes";
import { cotizar, motivoCuponInvalido } from "../precios";
import type { Album, Fotografo, MarcaAgua, Medio, Pedido } from "../tipos";
import { avisarCambio } from "./cambios";
import { ErrorRepo, type AltaFotografo, type DatosAlbum, type DatosPedido, type NuevoMedio, type Repositorio } from "./tipos";

const NOMBRE_DB = "buscatufoto";
const VERSION = 1;

type Store = "fotografos" | "albumes" | "medios" | "originales" | "pedidos";

interface Original {
  id: string;
  albumId: string;
  fotografoId: string;
  blob: Blob;
  peso: number;
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(NOMBRE_DB, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      const f = db.createObjectStore("fotografos", { keyPath: "id" });
      f.createIndex("email", "email", { unique: true });
      f.createIndex("usuario", "usuario", { unique: true });
      const a = db.createObjectStore("albumes", { keyPath: "id" });
      a.createIndex("slug", "slug", { unique: true });
      a.createIndex("fotografoId", "fotografoId");
      const m = db.createObjectStore("medios", { keyPath: "id" });
      m.createIndex("albumId", "albumId");
      const o = db.createObjectStore("originales", { keyPath: "id" });
      o.createIndex("albumId", "albumId");
      o.createIndex("fotografoId", "fotografoId");
      const p = db.createObjectStore("pedidos", { keyPath: "id" });
      p.createIndex("albumId", "albumId");
      p.createIndex("fotografoId", "fotografoId");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error ?? new Error("No se pudo abrir la base del navegador."));
    r.onblocked = () => rej(new Error("Cerrá las otras pestañas de buscatufoto y recargá."));
  });
}

function pedir<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function terminar(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error ?? new Error("Operación cancelada."));
  });
}

export class RepositorioIDB implements Repositorio {
  private db: Promise<IDBDatabase> | null = null;

  private base(): Promise<IDBDatabase> {
    if (!this.db) this.db = abrir();
    return this.db;
  }

  private async tx(stores: Store[], modo: IDBTransactionMode) {
    const db = await this.base();
    return db.transaction(stores, modo);
  }

  private async uno<T>(store: Store, clave: string): Promise<T | null> {
    const t = await this.tx([store], "readonly");
    return ((await pedir(t.objectStore(store).get(clave))) as T | undefined) ?? null;
  }

  private async porIndice<T>(store: Store, indice: string, valor: string): Promise<T[]> {
    const t = await this.tx([store], "readonly");
    return (await pedir(t.objectStore(store).index(indice).getAll(valor))) as T[];
  }

  private async unoPorIndice<T>(store: Store, indice: string, valor: string): Promise<T | null> {
    const t = await this.tx([store], "readonly");
    return ((await pedir(t.objectStore(store).index(indice).get(valor))) as T | undefined) ?? null;
  }

  private async guardar<T>(store: Store, v: T): Promise<T> {
    const t = await this.tx([store], "readwrite");
    t.objectStore(store).put(v);
    await terminar(t);
    avisarCambio(store);
    return v;
  }

  // ---------- Fotógrafos ----------

  async registrarFotografo(d: AltaFotografo): Promise<Fotografo> {
    const email = d.email.trim().toLowerCase();
    const nombre = d.nombre.trim();
    if (!nombre) throw new ErrorRepo("Poné tu nombre o el de tu estudio.", "invalido");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorRepo("Ese email no parece válido.", "invalido");
    if (await this.fotografoPorEmail(email)) throw new ErrorRepo("Ya hay una cuenta con ese email. Ingresá.", "duplicado");
    let usuario = aSlug(nombre) || "fotografo";
    let n = 1;
    while (await this.fotografoPorUsuario(usuario)) usuario = `${aSlug(nombre) || "fotografo"}-${++n}`;
    const f: Fotografo = {
      id: nuevoId("f_"),
      nombre,
      email,
      usuario,
      bio: "",
      instagram: "",
      plan: "libre",
      cobro: null,
      marca: { ...MARCA_POR_DEFECTO },
      creadoEn: Date.now(),
    };
    return this.guardar("fotografos", f);
  }

  fotografoPorEmail(email: string) {
    return this.unoPorIndice<Fotografo>("fotografos", "email", email.trim().toLowerCase());
  }

  fotografoPorUsuario(usuario: string) {
    return this.unoPorIndice<Fotografo>("fotografos", "usuario", usuario);
  }

  obtenerFotografo(id: string) {
    return this.uno<Fotografo>("fotografos", id);
  }

  async actualizarFotografo(id: string, cambios: Partial<Omit<Fotografo, "id" | "creadoEn">>) {
    const f = await this.obtenerFotografo(id);
    if (!f) throw new ErrorRepo("No encontramos tu cuenta.", "no-encontrado");
    if (cambios.usuario !== undefined) {
      const u = aSlug(cambios.usuario);
      if (!u) throw new ErrorRepo("El usuario no puede quedar vacío.", "invalido");
      const otro = await this.fotografoPorUsuario(u);
      if (otro && otro.id !== id) throw new ErrorRepo("Ese usuario ya está tomado.", "duplicado");
      cambios = { ...cambios, usuario: u };
    }
    if (cambios.email !== undefined) {
      const e = cambios.email.trim().toLowerCase();
      const otro = await this.fotografoPorEmail(e);
      if (otro && otro.id !== id) throw new ErrorRepo("Ese email ya está en otra cuenta.", "duplicado");
      cambios = { ...cambios, email: e };
    }
    return this.guardar("fotografos", { ...f, ...cambios, id: f.id, creadoEn: f.creadoEn });
  }

  actualizarMarca(id: string, marca: MarcaAgua) {
    if (!marca.texto.trim() && !marca.logo) throw new ErrorRepo("La marca necesita un texto o un logo: sin eso la vista previa saldría limpia.", "invalido");
    if (!(marca.opacidad >= OPACIDAD_MIN)) throw new ErrorRepo(`La opacidad mínima es ${Math.round(OPACIDAD_MIN * 100)} %: más transparente no protege la foto.`, "invalido");
    return this.actualizarFotografo(id, { marca });
  }

  // ---------- Álbumes ----------

  async crearAlbum(fotografoId: string, d: DatosAlbum): Promise<Album> {
    if (!(await this.obtenerFotografo(fotografoId))) throw new ErrorRepo("No encontramos tu cuenta.", "no-encontrado");
    validarAlbum(d);
    const base = aSlug(d.slug || d.nombre) || "album";
    let slug = base;
    let n = 1;
    while (await this.albumPorSlug(slug)) slug = `${base}-${++n}`;
    const a: Album = {
      ...d,
      slug,
      id: nuevoId("a_"),
      fotografoId,
      portadaId: null,
      creadoEn: Date.now(),
    };
    return this.guardar("albumes", a);
  }

  async actualizarAlbum(id: string, cambios: Partial<Omit<Album, "id" | "fotografoId" | "creadoEn">>) {
    const a = await this.obtenerAlbum(id);
    if (!a) throw new ErrorRepo("No encontramos el álbum.", "no-encontrado");
    const nuevo = { ...a, ...cambios, id: a.id, fotografoId: a.fotografoId, creadoEn: a.creadoEn };
    if (cambios.slug !== undefined) {
      nuevo.slug = aSlug(cambios.slug);
      if (!nuevo.slug) throw new ErrorRepo("El enlace no puede quedar vacío.", "invalido");
      const otro = await this.albumPorSlug(nuevo.slug);
      if (otro && otro.id !== id) throw new ErrorRepo("Ese enlace ya lo usa otro álbum.", "duplicado");
    }
    validarAlbum(nuevo);
    return this.guardar("albumes", nuevo);
  }

  async eliminarAlbum(id: string) {
    if ((await this.pedidosDe(id)).length > 0)
      throw new ErrorRepo("Este álbum ya tiene ventas: despublicalo en vez de borrarlo, así quien compró puede seguir descargando.", "prohibido");
    const t = await this.tx(["albumes", "medios", "originales"], "readwrite");
    t.objectStore("albumes").delete(id);
    const m = t.objectStore("medios");
    for (const k of await pedir(m.index("albumId").getAllKeys(id))) m.delete(k);
    const o = t.objectStore("originales");
    for (const k of await pedir(o.index("albumId").getAllKeys(id))) o.delete(k);
    await terminar(t);
    avisarCambio("albumes");
  }

  obtenerAlbum(id: string) {
    return this.uno<Album>("albumes", id);
  }

  albumPorSlug(slug: string) {
    return this.unoPorIndice<Album>("albumes", "slug", slug);
  }

  async albumesDe(fotografoId: string) {
    const l = await this.porIndice<Album>("albumes", "fotografoId", fotografoId);
    return l.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoEn - a.creadoEn);
  }

  // ---------- Medios ----------

  async agregarMedio(albumId: string, m: NuevoMedio): Promise<Medio> {
    const album = await this.obtenerAlbum(albumId);
    if (!album) throw new ErrorRepo("No encontramos el álbum.", "no-encontrado");
    const medio: Medio = {
      id: nuevoId("m_"),
      albumId,
      tipo: m.tipo,
      nombreArchivo: m.nombreArchivo,
      ancho: m.ancho,
      alto: m.alto,
      duracion: m.duracion,
      peso: m.original.size,
      dorsales: m.dorsales,
      previa: m.previa,
      miniatura: m.miniatura,
      creadoEn: Date.now(),
    };
    const original: Original = { id: medio.id, albumId, fotografoId: album.fotografoId, blob: m.original, peso: m.original.size };
    const t = await this.tx(["medios", "originales", "albumes"], "readwrite");
    t.objectStore("medios").put(medio);
    t.objectStore("originales").put(original);
    if (!album.portadaId && m.tipo === "foto") t.objectStore("albumes").put({ ...album, portadaId: medio.id });
    await terminar(t);
    avisarCambio("medios");
    return medio;
  }

  async mediosDe(albumId: string) {
    const l = await this.porIndice<Medio>("medios", "albumId", albumId);
    return l.sort((a, b) => a.nombreArchivo.localeCompare(b.nombreArchivo, "es", { numeric: true }));
  }

  async actualizarDorsales(medioId: string, dorsales: string[]) {
    const m = await this.uno<Medio>("medios", medioId);
    if (!m) throw new ErrorRepo("No encontramos esa foto.", "no-encontrado");
    return this.guardar("medios", { ...m, dorsales: [...new Set(dorsales)] });
  }

  async reemplazarVistas(medioId: string, previa: Blob, miniatura: Blob) {
    const m = await this.uno<Medio>("medios", medioId);
    if (!m) throw new ErrorRepo("No encontramos esa foto.", "no-encontrado");
    await this.guardar("medios", { ...m, previa, miniatura });
  }

  async eliminarMedio(medioId: string) {
    const m = await this.uno<Medio>("medios", medioId);
    if (m && (await this.pedidosDe(m.albumId)).some((p) => p.items.includes(medioId)))
      throw new ErrorRepo("Esta foto ya se vendió: no se puede borrar porque quien la compró tiene que poder descargarla.", "prohibido");
    const t = await this.tx(["medios", "originales", "albumes"], "readwrite");
    t.objectStore("medios").delete(medioId);
    t.objectStore("originales").delete(medioId);
    if (m) {
      const a = (await pedir(t.objectStore("albumes").get(m.albumId))) as Album | undefined;
      if (a && a.portadaId === medioId) t.objectStore("albumes").put({ ...a, portadaId: null });
    }
    await terminar(t);
    avisarCambio("medios");
  }

  async originalParaDueno(medioId: string, fotografoId: string) {
    const o = await this.uno<Original>("originales", medioId);
    if (!o) throw new ErrorRepo("No encontramos el original.", "no-encontrado");
    if (o.fotografoId !== fotografoId) throw new ErrorRepo("Ese original no es tuyo.", "prohibido");
    return o.blob;
  }

  // ---------- Ventas ----------

  async crearPedido(d: DatosPedido): Promise<Pedido> {
    const items = [...new Set(d.items)];
    if (items.length === 0) throw new ErrorRepo("El carrito está vacío.", "invalido");
    const nombre = d.comprador.nombre.trim();
    const email = d.comprador.email.trim().toLowerCase();
    if (!nombre) throw new ErrorRepo("Poné tu nombre.", "invalido");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorRepo("Revisá el email: ahí te mandaríamos las fotos.", "invalido");

    // Una sola transacción de escritura sobre álbum + medios + pedidos + fotógrafos: IndexedDB serializa las
    // transacciones que se pisan, así que dos pagos simultáneos (incluso en dos pestañas) no pueden usar el
    // mismo último uso de un cupón.
    const t = await this.tx(["albumes", "medios", "pedidos", "fotografos"], "readwrite");
    const album = (await pedir(t.objectStore("albumes").get(d.albumId))) as Album | undefined;
    if (!album || !album.publicado) {
      t.abort();
      throw new ErrorRepo("Ese álbum no está disponible.", "no-encontrado");
    }
    const medios = (await pedir(t.objectStore("medios").index("albumId").getAll(d.albumId))) as Medio[];
    const porId = new Map(medios.map((m) => [m.id, m]));
    const elegidos = items.map((id) => porId.get(id));
    if (elegidos.some((m) => !m)) {
      t.abort();
      throw new ErrorRepo("Alguna foto del carrito ya no está en el álbum. Revisá el carrito.", "invalido");
    }
    const cot = cotizar(album, elegidos.map((m) => ({ tipo: m!.tipo })), d.cupon, medios.length);
    if (d.totalEsperado !== undefined && cot.errorCupon === null && cot.total !== d.totalEsperado) {
      t.abort();
      throw new ErrorRepo(`El total cambió mientras pagabas: ahora es ${plata(cot.total)}. Revisalo y confirmá de nuevo.`, "precio");
    }
    if (d.cupon && d.cupon.trim()) {
      if (cot.errorCupon || !cot.cupon) {
        t.abort();
        throw new ErrorRepo(cot.errorCupon ?? "El cupón no aplica.", "cupon");
      }
      const idx = album.cupones.findIndex((c) => c.codigo.toUpperCase() === cot.cupon!.codigo.toUpperCase());
      const motivo = motivoCuponInvalido(album.cupones[idx]);
      if (idx < 0 || motivo) {
        t.abort();
        throw new ErrorRepo(motivo ?? "El cupón no aplica.", "cupon");
      }
      const cupones = album.cupones.map((c, i) => (i === idx ? { ...c, usos: c.usos + 1 } : c));
      t.objectStore("albumes").put({ ...album, cupones });
    }
    const fot = (await pedir(t.objectStore("fotografos").get(album.fotografoId))) as Fotografo | undefined;
    const comision = Math.round(cot.total * PLANES[fot?.plan ?? "libre"].comision);
    const pedido: Pedido = {
      id: nuevoId("p_"),
      albumId: album.id,
      fotografoId: album.fotografoId,
      items,
      comprador: { nombre, email, whatsapp: d.comprador.whatsapp.trim() },
      cotizacion: cot,
      comision,
      estado: "pagado",
      clave: nuevaClave(),
      referenciaPago: `DEMO-${nuevoId().toUpperCase().slice(0, 8)}`,
      creadoEn: Date.now(),
    };
    t.objectStore("pedidos").put(pedido);
    await terminar(t);
    avisarCambio("pedidos");
    avisarCambio("albumes");
    return pedido;
  }

  async obtenerPedido(id: string, clave: string) {
    const p = await this.uno<Pedido>("pedidos", id);
    if (!p || !clave || p.clave !== clave) return null;
    return p;
  }

  async pedidosDe(albumId: string) {
    const l = await this.porIndice<Pedido>("pedidos", "albumId", albumId);
    return l.sort((a, b) => b.creadoEn - a.creadoEn);
  }

  async pedidosDeFotografo(fotografoId: string) {
    const l = await this.porIndice<Pedido>("pedidos", "fotografoId", fotografoId);
    return l.sort((a, b) => b.creadoEn - a.creadoEn);
  }

  async descargarOriginal(pedidoId: string, clave: string, medioId: string) {
    const p = await this.obtenerPedido(pedidoId, clave);
    if (!p || p.estado !== "pagado") throw new ErrorRepo("Ese pedido no existe o la clave no coincide.", "prohibido");
    if (!p.items.includes(medioId)) throw new ErrorRepo("Esa foto no está en tu pedido.", "prohibido");
    const o = await this.uno<Original>("originales", medioId);
    if (!o) throw new ErrorRepo("El fotógrafo borró ese original. Escribile.", "no-encontrado");
    return o.blob;
  }

  async almacenamientoDe(fotografoId: string) {
    const t = await this.tx(["originales"], "readonly");
    const idx = t.objectStore("originales").index("fotografoId");
    let total = 0;
    await new Promise<void>((res, rej) => {
      const c = idx.openCursor(IDBKeyRange.only(fotografoId));
      c.onsuccess = () => {
        const cur = c.result;
        if (!cur) return res();
        total += (cur.value as Original).peso;
        cur.continue();
      };
      c.onerror = () => rej(c.error);
    });
    return total;
  }
}

function validarAlbum(d: Pick<Album, "nombre" | "fecha" | "precioFoto" | "precioVideo" | "paquetes" | "escalones" | "cupones">) {
  if (!d.nombre.trim()) throw new ErrorRepo("El álbum necesita un nombre.", "invalido");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) throw new ErrorRepo("Poné la fecha del evento.", "invalido");
  if (!(d.precioFoto > 0)) throw new ErrorRepo("El precio por foto tiene que ser mayor a cero.", "invalido");
  if (d.precioVideo < 0) throw new ErrorRepo("El precio por video no puede ser negativo.", "invalido");
  for (const p of d.paquetes) {
    if (!p.nombre.trim() || p.cantidad < 0 || !(p.precio > 0)) throw new ErrorRepo("Revisá los paquetes: nombre, cantidad y precio.", "invalido");
  }
  for (const e of d.escalones) {
    if (!(e.desde >= 2) || !(e.porcentaje > 0 && e.porcentaje <= 90)) throw new ErrorRepo("Los descuentos por cantidad van desde 2 unidades y entre 1 % y 90 %.", "invalido");
  }
  const codigos = new Set<string>();
  for (const c of d.cupones) {
    const k = c.codigo.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,20}$/.test(k)) throw new ErrorRepo("Los cupones usan de 3 a 20 letras o números, sin espacios.", "invalido");
    if (codigos.has(k)) throw new ErrorRepo(`El cupón ${k} está repetido.`, "invalido");
    codigos.add(k);
    if (!(c.valor > 0) || (c.tipo === "porcentaje" && c.valor > 100)) throw new ErrorRepo(`Revisá el valor del cupón ${k}.`, "invalido");
    if (c.tope < 0 || c.usosMax < 0 || c.usos < 0) throw new ErrorRepo(`Revisá el tope y los usos del cupón ${k}.`, "invalido");
  }
}

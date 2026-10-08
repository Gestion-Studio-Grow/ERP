import type { Album, Comprador, Fotografo, MarcaAgua, Medio, Pedido, TipoMedio } from "../tipos";

export interface AltaFotografo {
  nombre: string;
  email: string;
}

export type DatosAlbum = Omit<Album, "id" | "fotografoId" | "creadoEn" | "slug" | "portadaId"> & {
  /** si no viene, se genera desde el nombre; si choca, se le agrega un sufijo */
  slug?: string;
};

export interface NuevoMedio {
  original: Blob;
  nombreArchivo: string;
  tipo: TipoMedio;
  ancho: number;
  alto: number;
  duracion: number | null;
  previa: Blob;
  miniatura: Blob;
  dorsales: string[];
}

export interface DatosPedido {
  albumId: string;
  items: string[];
  comprador: Comprador;
  cupon: string | null;
  /** total que vio el comprador al confirmar; si el recalculado difiere, el pago se rechaza */
  totalEsperado?: number;
}

/**
 * Contrato de datos de buscatufoto. Hoy lo implementa IndexedDB (src/lib/repo/idb.ts); mañana un backend.
 * Regla: ningún método pensado para el comprador devuelve el original. El único camino al original es
 * `descargarOriginal`, que exige un pedido pagado y su clave.
 */
export interface Repositorio {
  // Fotógrafos
  registrarFotografo(d: AltaFotografo): Promise<Fotografo>;
  fotografoPorEmail(email: string): Promise<Fotografo | null>;
  fotografoPorUsuario(usuario: string): Promise<Fotografo | null>;
  obtenerFotografo(id: string): Promise<Fotografo | null>;
  actualizarFotografo(id: string, cambios: Partial<Omit<Fotografo, "id" | "creadoEn">>): Promise<Fotografo>;
  actualizarMarca(id: string, marca: MarcaAgua): Promise<Fotografo>;

  // Álbumes
  crearAlbum(fotografoId: string, d: DatosAlbum): Promise<Album>;
  actualizarAlbum(id: string, cambios: Partial<Omit<Album, "id" | "fotografoId" | "creadoEn">>): Promise<Album>;
  eliminarAlbum(id: string): Promise<void>;
  obtenerAlbum(id: string): Promise<Album | null>;
  albumPorSlug(slug: string): Promise<Album | null>;
  albumesDe(fotografoId: string): Promise<Album[]>;

  // Medios (sin original)
  agregarMedio(albumId: string, m: NuevoMedio): Promise<Medio>;
  mediosDe(albumId: string): Promise<Medio[]>;
  actualizarDorsales(medioId: string, dorsales: string[]): Promise<Medio>;
  reemplazarVistas(medioId: string, previa: Blob, miniatura: Blob): Promise<void>;
  eliminarMedio(medioId: string): Promise<void>;
  /** para el panel: reprocesar la marca. Exige ser el dueño del álbum. */
  originalParaDueno(medioId: string, fotografoId: string): Promise<Blob>;

  // Ventas
  /** Recalcula el precio, valida y consume el cupón en una sola transacción. */
  crearPedido(d: DatosPedido): Promise<Pedido>;
  obtenerPedido(id: string, clave: string): Promise<Pedido | null>;
  pedidosDe(albumId: string): Promise<Pedido[]>;
  pedidosDeFotografo(fotografoId: string): Promise<Pedido[]>;
  descargarOriginal(pedidoId: string, clave: string, medioId: string): Promise<Blob>;

  /** bytes de originales guardados por un fotógrafo */
  almacenamientoDe(fotografoId: string): Promise<number>;
}

export class ErrorRepo extends Error {
  constructor(
    message: string,
    public codigo: "no-encontrado" | "duplicado" | "invalido" | "prohibido" | "cupon" | "precio",
  ) {
    super(message);
    this.name = "ErrorRepo";
  }
}

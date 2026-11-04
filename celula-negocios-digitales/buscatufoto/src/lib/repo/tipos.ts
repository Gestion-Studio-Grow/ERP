import type { Album, Comprador, Cotizacion, Fotografo, MarcaAgua, Medio, MetodoCobro, Pedido, TipoMedio } from "../tipos";

export interface AltaFotografo {
  nombre: string;
  email: string;
}

export interface AltaConCodigo {
  nombre: string;
  email: string;
  contrasena: string;
  /** código de invitación (modo servidor) */
  codigo: string;
}

export type DatosAlbum = Omit<Album, "id" | "fotografoId" | "creadoEn" | "slug" | "portadaId"> & {
  /** si no viene, se genera desde el nombre; si choca, se le agrega un sufijo */
  slug?: string;
  /** modo servidor: el fotógrafo declara tener el consentimiento de quienes aparecen (sin esto, 422) */
  consentimiento?: true;
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
  /** bytes del original; si no viene se toma `original.size` */
  peso?: number;
}

export interface DatosPedido {
  albumId: string;
  items: string[];
  comprador: Comprador;
  cupon: string | null;
  /** total que vio el comprador al confirmar; si el recalculado difiere, el pago se rechaza */
  totalEsperado?: number;
  /** cómo paga; si no viene, Mercado Pago */
  metodo?: MetodoCobro;
}

/**
 * Contrato de datos de buscatufoto. Lo implementan IndexedDB (demo, src/lib/repo/idb.ts) y el servidor
 * (`/api/btf/*`, src/lib/repo/remoto.ts; contrato en docs/API.md).
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

  // Sesión (en la demo: la cuenta de este navegador, sin contraseña)
  ingresar(email: string, contrasena: string): Promise<Fotografo>;
  alta(d: AltaConCodigo): Promise<Fotografo>;
  salir(): Promise<void>;
  /** fotógrafo de la sesión actual, o null */
  yo(): Promise<Fotografo | null>;
  /** guarda el access token de Mercado Pago (cifrado en el servidor; nunca se devuelve) */
  guardarTokenMp(token: string): Promise<void>;
  quitarTokenMp(): Promise<void>;

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
  /** retira (o devuelve) el medio de la galería pública */
  ocultarMedio(medioId: string, oculto: boolean): Promise<Medio>;
  /** para el panel: reprocesar la marca. Exige ser el dueño del álbum. */
  originalParaDueno(medioId: string, fotografoId: string): Promise<Blob>;

  // Ventas
  /** cotización del carrito (en el servidor la calcula `lib/precios.cotizar` con los cupones reales) */
  cotizar(albumId: string, items: string[], cupon: string | null): Promise<Cotizacion>;
  /** Recalcula el precio, valida y consume el cupón en una sola transacción. */
  crearPedido(d: DatosPedido): Promise<Pedido>;
  obtenerPedido(id: string, clave: string): Promise<Pedido | null>;
  pedidosDe(albumId: string): Promise<Pedido[]>;
  pedidosDeFotografo(fotografoId: string): Promise<Pedido[]>;
  descargarOriginal(pedidoId: string, clave: string, medioId: string): Promise<Blob>;
  /** sólo pedidos por transferencia pendientes: el fotógrafo confirma que le llegó la plata */
  marcarPagado(pedidoId: string): Promise<Pedido>;

  /** bytes de originales guardados por un fotógrafo */
  almacenamientoDe(fotografoId: string): Promise<number>;
}

export type CodigoErrorRepo =
  | "no-encontrado"
  | "duplicado"
  | "invalido"
  | "prohibido"
  | "cupon"
  | "precio"
  | "no-autenticado"
  | "no-configurado";

export class ErrorRepo extends Error {
  constructor(
    message: string,
    public codigo: CodigoErrorRepo,
  ) {
    super(message);
    this.name = "ErrorRepo";
  }
}

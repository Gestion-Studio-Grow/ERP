/** Modelo de datos de buscatufoto. Todo en pesos argentinos (ARS), enteros. */

export type PlanId = "libre" | "pro";

export type MetodoCobro = "mercadopago" | "transferencia";

export interface DatosCobro {
  metodo: MetodoCobro;
  titular: string;
  /** Alias o CVU/CBU. En la demo no se valida contra nada real. */
  alias: string;
  cuit: string;
}

export type ModoMarca = "mosaico" | "centro";

export interface MarcaAgua {
  texto: string;
  /** Logo como data URL (PNG/JPG/SVG). null = sólo texto. */
  logo: string | null;
  color: string;
  /** 0.05 – 0.9 */
  opacidad: number;
  /** 0.5 – 2.5 (relativo al tamaño de la foto) */
  escala: number;
  /** grados, -60 a 60 */
  angulo: number;
  modo: ModoMarca;
}

export interface Fotografo {
  id: string;
  nombre: string;
  email: string;
  /** usuario público: /f/[usuario] */
  usuario: string;
  bio: string;
  instagram: string;
  plan: PlanId;
  cobro: DatosCobro | null;
  marca: MarcaAgua;
  creadoEn: number;
}

export interface Paquete {
  id: string;
  nombre: string;
  /** cantidad de fotos/videos del paquete; 0 = "todo el álbum" */
  cantidad: number;
  precio: number;
}

export interface EscalonDescuento {
  /** a partir de esta cantidad… */
  desde: number;
  /** …este porcentaje de descuento (1-90) */
  porcentaje: number;
}

export interface Cupon {
  codigo: string;
  tipo: "porcentaje" | "monto";
  /** porcentaje (1-100) o monto fijo en ARS */
  valor: number;
  /** tope de descuento en ARS para cupones de porcentaje; 0 = sin tope */
  tope: number;
  /** usos máximos; 0 = ilimitado */
  usosMax: number;
  usos: number;
  activo: boolean;
}

export type RolColaborador = "fotografo" | "asistente";

export interface Colaborador {
  id: string;
  nombre: string;
  email: string;
  rol: RolColaborador;
}

export type TipoEvento = "carrera" | "torneo" | "fiesta" | "otro";

export interface Album {
  id: string;
  /** /a/[slug] */
  slug: string;
  fotografoId: string;
  nombre: string;
  evento: TipoEvento;
  lugar: string;
  /** AAAA-MM-DD */
  fecha: string;
  descripcion: string;
  precioFoto: number;
  /** precio por video; 0 = mismo que foto */
  precioVideo: number;
  paquetes: Paquete[];
  escalones: EscalonDescuento[];
  cupones: Cupon[];
  colaboradores: Colaborador[];
  /** id del medio usado de portada */
  portadaId: string | null;
  publicado: boolean;
  creadoEn: number;
}

export type TipoMedio = "foto" | "video";

/** Lo que ve cualquiera: SIN original. */
export interface Medio {
  id: string;
  albumId: string;
  tipo: TipoMedio;
  nombreArchivo: string;
  ancho: number;
  alto: number;
  /** segundos, sólo video */
  duracion: number | null;
  /** bytes del original (para créditos/almacenamiento) */
  peso: number;
  dorsales: string[];
  /** vista previa con marca de agua, lado mayor ≤ 1280 px */
  previa: Blob;
  /** miniatura con marca de agua, lado mayor ≤ 480 px */
  miniatura: Blob;
  creadoEn: number;
}

export interface Comprador {
  nombre: string;
  email: string;
  whatsapp: string;
}

export type EstadoPedido = "pagado";

export interface Pedido {
  id: string;
  albumId: string;
  fotografoId: string;
  items: string[];
  comprador: Comprador;
  cotizacion: Cotizacion;
  /** comisión de la plataforma según el plan del fotógrafo al momento de la venta */
  comision: number;
  estado: EstadoPedido;
  /** clave para descargar; sólo la tiene quien pagó */
  clave: string;
  /** referencia del pago simulado */
  referenciaPago: string;
  creadoEn: number;
}

export interface Cotizacion {
  cantidad: number;
  /** precio de lista: suma de precios unitarios */
  lista: number;
  /** cómo se llegó al subtotal */
  regla: { tipo: "unitario" | "escalon" | "paquete"; etiqueta: string };
  /** lista − subtotal */
  ahorroCantidad: number;
  subtotal: number;
  cupon: { codigo: string; descuento: number } | null;
  /** motivo si el cupón ingresado no aplica */
  errorCupon: string | null;
  total: number;
}

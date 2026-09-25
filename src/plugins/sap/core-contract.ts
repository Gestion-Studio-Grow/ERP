/**
 * Contrato del plugin SAP (modo Archivo) con el Core de rendiciones.
 *
 * Es la ÚNICA vista que el plugin tiene del Core: tipos, no código. NO importa `@/lib/rendiciones`
 * (ADR-002: el Core no importa plugins y el plugin no importa el interior del Core). Las formas están
 * REDECLARADAS y tienen que ser compatibles por estructura con `LoteContable` de
 * `src/lib/rendiciones/tipos.ts`: el Core entrega su lote y el plugin lo recibe sin conversión.
 * La prueba de compatibilidad vive donde se juntan los dos, en la app
 * (`src/app/demo/rendiciones/escenario.test.ts`): si alguien cambia un lado, `tsc` lo marca ahí.
 *
 * Los arreglos son `readonly`: el plugin lee el lote, nunca lo modifica.
 *
 * DINERO: centavos enteros, como el Core de rendiciones. El plugin los escribe con punto decimal
 * ("1234.56") recién al armar el CSV.
 */

export type Centavos = number;
/** `AAAA-MM-DD`. */
export type FechaISO = string;
export type MonedaSap = "ARS" | "USD";

export interface PosicionFacturaSap {
  cuentaMayor: string;
  importe: Centavos;
  indicadorIva: string;
  centroCosto: string;
  numeroPersonal: string;
  asignacion: string;
  texto: string;
}

export interface FacturaProveedorSap {
  idFactura: string;
  comprobanteId: string;
  sociedad: string;
  claseDocumento: string;
  fechaDocumento: FechaISO;
  fechaContabilizacion: FechaISO;
  emisor: string;
  referencia: string;
  lugarComercial: string;
  importeBruto: Centavos;
  moneda: MonedaSap;
  asignacion: string;
  posiciones: readonly PosicionFacturaSap[];
}

export interface PosicionAsientoSap {
  cuentaMayor: string;
  debe: Centavos;
  haber: Centavos;
  indicadorIva?: string;
  centroCosto?: string;
  asignacion: string;
  texto: string;
}

export interface AsientoSap {
  idAsiento: string;
  rendicionId: string;
  sociedad: string;
  claseDocumento: string;
  fechaDocumento: FechaISO;
  fechaContabilizacion: FechaISO;
  moneda: MonedaSap;
  referencia: string;
  texto: string;
  posiciones: readonly PosicionAsientoSap[];
}

/** En modo Archivo NO es una planilla de carga: es la instrucción de compensación para Tesorería. */
export interface CancelacionFacturaSap {
  idFactura: string;
  comprobanteId: string;
  emisor: string;
  referencia: string;
  importe: Centavos;
  cuentaContrapartida: string;
  asignacion: string;
}

export interface AltaProveedorPendiente {
  cuit: string;
  razonSocial: string;
  comprobanteId: string;
}

/** La vista del plugin sobre `LoteContable` del Core. */
export interface LoteContableSap {
  facturas: readonly FacturaProveedorSap[];
  asientos: readonly AsientoSap[];
  cancelaciones: readonly CancelacionFacturaSap[];
  altasPendientes: readonly AltaProveedorPendiente[];
  derivadosCxP: readonly string[];
}

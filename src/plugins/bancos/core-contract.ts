/**
 * Contrato del plugin BANCOS con el Core (superficies II y III de ADR-020).
 *
 * Este archivo es la ÚNICA vista que el plugin tiene del Core: tipos, no código.
 * NO importa nada del Core (`src/lib/*`) ni de Prisma — convención fijada por
 * ARCA (ADR-022). El glue de `src/lib` que cablee la UI implementará estas
 * formas; hasta entonces el plugin compila y se testea contra ellas.
 *
 * DINERO (ADR-057): los importes son `number` = PESOS con dos decimales, igual
 * que todo el camino fiscal (invoice-core, fiscal.ts, plugin ARCA). El ADR
 * rechaza explícitamente centavos-enteros; la exactitud la garantiza la regla
 * de redondeo única EPSILON-safe (acá: `redondear2` en domain/valores.ts, copia
 * local porque el plugin no puede importar `src/lib/round`).
 */

/**
 * De dónde salió el movimiento. "mercadopago" aparece cuando el extracto
 * importado es el export de actividad de MP (mismo pipeline, otra fuente);
 * sirve para la detección cruzada banco↔MP de domain/reglas.ts.
 */
export type OrigenMovimiento = "banco" | "mercadopago";

/**
 * Un movimiento del extracto, ya normalizado (salida del mapeador). Es el
 * vocabulario común del plugin: parsers y mapeador producen esto; clasificador
 * y reglas consumen esto.
 */
export interface MovimientoBancario {
  /**
   * Id IDEMPOTENTE: hash de (fecha, monto, descripción normalizada). Importar
   * el mismo extracto dos veces produce los mismos ids → la deduplicación es
   * gratis (misma idea que el `payment_id` de MP en ADR-025 §3).
   */
  id: string;
  /** Fecha del movimiento, formato ARCA `AAAAMMDD` (como el resto del camino fiscal). */
  fecha: string;
  /** Pesos con 2 decimales (ADR-057). Positivo = crédito (ingreso); negativo = débito (egreso). */
  monto: number;
  /** Concepto/detalle tal como lo trae el banco (insumo del clasificador). */
  descripcion: string;
  /** Titular/CUIT de la contraparte si el extracto lo trae (detecta cuentas propias). */
  contraparte?: string;
  /** Referencia/nro. de comprobante del banco (trazabilidad). */
  referencia?: string;
  origen: OrigenMovimiento;
}

/**
 * Estado de una propuesta de factura:
 *  - "auto":          lista para emitir sin intervención (consumidor final genérico).
 *  - "revision":      espera decisión/datos humanos (identificación, posible duplicado, cap).
 *  - "no_facturable": el clasificador determinó que no es una venta.
 *  - "descartado":    duplicado (mismo hash ya visto / ya procesado antes).
 */
export type EstadoPropuesta = "auto" | "revision" | "no_facturable" | "descartado";

/**
 * Propuesta de factura generada a partir de un movimiento FACTURABLE (o el
 * registro de por qué no se factura). La UI la muestra; recién al confirmarse
 * se llama el comando `CreateInvoice` del Core.
 */
export interface PropuestaFactura {
  movimientoId: string;
  /** Monto TOTAL IVA-incluido (pesos, 2 decimales). El neto/IVA los calcula el Core (ADR-006). */
  montoTotal: number;
  /** true ⇒ monto >= umbral de identificación: exige CUIL/CUIT + nombre + descripción. */
  requiereIdentificacion: boolean;
  /** Tipo de documento ARCA del receptor (99 = consumidor final). Se completa en revisión si falta. */
  docTipo?: number;
  /** Nro. de documento del receptor (0 = consumidor final genérico). */
  docNro?: number;
  /** Nombre del receptor (solo si requiere identificación; se completa en revisión). */
  nombre?: string;
  /** Descripción del servicio/venta (solo si requiere identificación; se completa en revisión). */
  descripcionServicio?: string;
  estado: EstadoPropuesta;
  /** Por qué quedó en este estado (para el panel de revisión). */
  motivo?: string;
}

/**
 * Superficie II — Plugin → Core.
 * Input del comando público `CreateInvoice` tal como el plugin lo ve: el monto
 * es el TOTAL IVA-incluido del banco; el Core calcula neto/iva/total con su
 * perfil fiscal (`fiscal.ts`, ADR-006) y encola `InvoiceCreated` → plugin ARCA.
 */
export interface CreateInvoiceDesdeBancoInput {
  tenantId: string;
  /** Fecha del comprobante, `AAAAMMDD` (la del movimiento bancario). */
  fecha: string;
  /** Total IVA-incluido (pesos, 2 decimales). */
  montoTotal: number;
  /** Tipo de documento ARCA del receptor (99 = consumidor final). */
  docTipo: number;
  docNro: number;
  nombre?: string;
  descripcionServicio?: string;
  /** Punto de venta del emisor (config del módulo). */
  puntoVenta: number;
  /** Domicilio del emisor, obligatorio en el comprobante (config del módulo). */
  domicilioEmisor: string;
  /** Movimiento bancario de origen (trazabilidad + idempotencia por venta). */
  movimientoId: string;
}

/**
 * Firma del comando público del Core que el plugin invoca. La implementación
 * real la inyecta el glue de la UI; el plugin depende solo de esta firma.
 * Devuelve el `invoiceId` (o null si el Core no pudo crearla).
 */
export type CreateInvoiceCommand = (
  input: CreateInvoiceDesdeBancoInput,
) => Promise<string | null>;

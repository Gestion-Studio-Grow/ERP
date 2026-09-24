/**
 * Motor de reglas de clasificación de ingresos MP (ADR-025 §12.1) — LO MÁS
 * IMPORTANTE del producto: NO se factura todo a ciegas. Distingue una venta
 * facturable de lo que no lo es (transferencias entre cuentas propias,
 * devoluciones, reintegros, préstamos). Es prevención fiscal: facturar de más
 * infla la facturación anual y fuerza recategorización indebida del monotributo.
 *
 * Se aplica ENTRE la ingesta y la facturación (ver ingest.ts): solo se factura
 * lo FACTURABLE; NO_FACTURABLE se descarta; REVISAR espera decisión humana
 * (panel del contador §12.2 o confirmación por WhatsApp §12.4).
 *
 * v2: además de las reglas por defecto, soporta CONFIG por comercio (cuentas
 * propias, reglas extra) y APRENDIZAJE (correcciones que el comercio/contador
 * hace sobre un REVISAR se recuerdan y se aplican solas a operaciones parecidas).
 */

import { PagoMP, TipoOperacionMP } from "./port";
import { normalizarReferencia, type VentaDeReferencia } from "./core-contract";

export type Clasificacion = "FACTURABLE" | "NO_FACTURABLE" | "REVISAR";

export interface ResultadoClasificacion {
  clasificacion: Clasificacion;
  motivo: string;
  reglaId?: string;
  /** true si vino del aprendizaje (corrección previa), no de una regla. */
  aprendido?: boolean;
}

/**
 * Lo que el pipeline sabe del pago y el clasificador (puro) no puede averiguar solo: la venta de
 * ESTE negocio detrás de la `external_reference`, resuelta ANTES contra la base (ingest.ts, un
 * lote por página). `venta`: la venta; `null` = no hay venta detrás (sin referencia, texto libre,
 * turno inexistente, pedido de otro negocio); ausente = no se resolvió.
 */
export interface ContextoClasificacion {
  venta?: VentaDeReferencia | null;
}

export interface ClasificadorPort {
  clasificar(pago: PagoMP, tenantId: string, contexto?: ContextoClasificacion): Promise<ResultadoClasificacion>;
}

/**
 * El paso 0: qué hacer con un cobro que SÍ tiene un turno o un pedido del negocio detrás. PURA.
 *   · con factura → NO_FACTURABLE: la venta ya tiene la suya, una suelta sería la segunda;
 *   · sin factura → REVISAR, NUNCA NO_FACTURABLE (que es terminal y la dejaría sin factura para
 *     siempre): la persona la factura desde su venta o aprueba la factura suelta en la cola.
 * Una factura RECHAZADA por ARCA no cuenta como factura.
 */
export function decisionPorVenta(venta: VentaDeReferencia): ResultadoClasificacion {
  const nombre = `${venta.tipo} ${venta.etiqueta}`;
  if (venta.facturada) {
    return { clasificacion: "NO_FACTURABLE", motivo: `Ya facturado con el ${nombre}.`, reglaId: "cobro-ya-facturado" };
  }
  const desde = venta.tipo === "pedido" ? "desde Ventas del día («Facturar»)" : "desde el turno";
  const rechazo = venta.facturaRechazada ? " (ARCA rechazó la que tenía)" : "";
  return {
    clasificacion: "REVISAR",
    motivo: `Cobro del ${nombre} sin factura${rechazo}: facturalo ${desde} o aprobá la factura suelta.`,
    reglaId: "cobro-sin-factura",
  };
}

/** Una regla: si `cuando(pago)` matchea, aplica `clasificacion`. */
export interface ReglaClasificacion {
  id: string;
  descripcion: string;
  cuando: (pago: PagoMP) => boolean;
  clasificacion: Clasificacion;
}

/** Config de clasificación por comercio (v1+: editable por el comercio/contador). */
export interface ConfigClasificacion {
  /** Ids de contraparte que son cuentas PROPIAS del comercio → NO_FACTURABLE. */
  cuentasPropias?: string[];
  /** Reglas extra del comercio, evaluadas ANTES de las default. */
  reglasExtra?: ReglaClasificacion[];
}

/**
 * Reglas por defecto (MVP). Orden importa: la primera que matchea gana.
 * Un comercio puede sumar/pisar reglas (config) sin tocar este motor.
 */
export const REGLAS_DEFAULT: ReglaClasificacion[] = [
  {
    id: "no-aprobado",
    descripcion: "Pago no acreditado: no se factura.",
    cuando: (p) => p.estado !== "approved",
    clasificacion: "NO_FACTURABLE",
  },
  {
    id: "transferencia-propia",
    descripcion: "Transferencia entre cuentas propias: no es venta.",
    cuando: (p) => p.operacion === "transferencia",
    clasificacion: "NO_FACTURABLE",
  },
  {
    id: "devolucion-reintegro",
    descripcion: "Devolución/reintegro: no es venta.",
    cuando: (p) => p.operacion === "devolucion" || p.operacion === "reintegro",
    clasificacion: "NO_FACTURABLE",
  },
  {
    id: "prestamo",
    descripcion: "Préstamo/adelanto de MP: no es venta.",
    cuando: (p) => p.operacion === "prestamo",
    clasificacion: "NO_FACTURABLE",
  },
  {
    id: "monto-no-positivo",
    descripcion: "Monto no positivo: no se factura.",
    cuando: (p) => !(p.monto > 0),
    clasificacion: "NO_FACTURABLE",
  },
  {
    id: "pago-cobro",
    descripcion: "Cobro a cliente acreditado: venta facturable.",
    cuando: (p) => p.operacion === undefined || p.operacion === "pago",
    clasificacion: "FACTURABLE",
  },
];

/** Una corrección aprendida: un patrón de pago → cómo clasificarlo. */
export interface Correccion {
  /** Empareja por contraparte (prioritario) y/o por tipo de operación. */
  contraparteId?: string;
  operacion?: TipoOperacionMP;
  clasificacion: Clasificacion;
}

/**
 * Memoria de aprendizaje: recuerda las correcciones del comercio/contador y las
 * reaplica. Real = tabla por tenant; stub = en memoria. Empareja por
 * `contraparteId` (lo más confiable) y, si no, por `operacion`.
 */
export interface AprendizajePort {
  buscar(pago: PagoMP): Promise<Clasificacion | null>;
  registrar(correccion: Correccion): Promise<void>;
}

export class AprendizajeEnMemoria implements AprendizajePort {
  private porContraparte = new Map<string, Clasificacion>();
  private porOperacion = new Map<TipoOperacionMP, Clasificacion>();

  async buscar(pago: PagoMP): Promise<Clasificacion | null> {
    if (pago.contraparteId && this.porContraparte.has(pago.contraparteId)) {
      return this.porContraparte.get(pago.contraparteId)!;
    }
    if (pago.operacion && this.porOperacion.has(pago.operacion)) {
      return this.porOperacion.get(pago.operacion)!;
    }
    return null;
  }

  async registrar(c: Correccion): Promise<void> {
    if (c.contraparteId) this.porContraparte.set(c.contraparteId, c.clasificacion);
    else if (c.operacion) this.porOperacion.set(c.operacion, c.clasificacion);
  }
}

export interface OpcionesClasificador {
  reglas?: ReglaClasificacion[];
  config?: ConfigClasificacion;
  aprendizaje?: AprendizajePort;
}

/**
 * Clasificador por reglas (v2). Prioridad:
 *   0. Cobro de un turno/pedido de ESTE negocio (`contexto.venta`): con factura → NO_FACTURABLE;
 *      sin factura → REVISAR. Una referencia que no es venta del negocio sigue a las reglas.
 *   1. Aprendizaje (correcciones previas del comercio).
 *   2. Cuentas propias del comercio (config) → NO_FACTURABLE.
 *   3. Reglas extra del comercio, luego las default.
 *   4. Fallback REVISAR (no se factura solo).
 */
export class ClasificadorPorReglas implements ClasificadorPort {
  private readonly reglas: ReglaClasificacion[];
  private readonly config?: ConfigClasificacion;
  private readonly aprendizaje?: AprendizajePort;

  constructor(opts: OpcionesClasificador | ReglaClasificacion[] = {}) {
    // Compat: acepta un array de reglas directo o un objeto de opciones.
    if (Array.isArray(opts)) {
      this.reglas = opts;
    } else {
      this.reglas = [...(opts.config?.reglasExtra ?? []), ...(opts.reglas ?? REGLAS_DEFAULT)];
      this.config = opts.config;
      this.aprendizaje = opts.aprendizaje;
    }
  }

  // El negocio no cambia la decisión de las reglas: la firma del puerto lo trae y acá no se usa.
  async clasificar(pago: PagoMP, _tenantId?: string, contexto?: ContextoClasificacion): Promise<ResultadoClasificacion> {
    // 0. La referencia del pago. Va ANTES que todo, incluso del aprendizaje: ninguna corrección
    // ni regla del comercio puede sacar una factura suelta de una venta que ya tiene la suya.
    //   · sin referencia, o una que NO es un turno/pedido de este negocio (`venta: null`: texto
    //     libre del link manual, turno inexistente, pedido de otro negocio) → sigue a las reglas,
    //     como cualquier venta directa;
    //   · un turno/pedido del negocio → `decisionPorVenta` (facturado: no; sin factura: revisar);
    //   · una referencia que nadie resolvió → REVISAR: sin saber si hay una venta detrás no se
    //     factura suelto (podría ser la segunda) ni se descarta (podría ser la única).
    if (normalizarReferencia(pago.externalReference)) {
      if (contexto?.venta === undefined) {
        return {
          clasificacion: "REVISAR",
          motivo: "El cobro trae una referencia que no se pudo verificar contra los turnos y pedidos: revisalo antes de facturar.",
          reglaId: "referencia-sin-verificar",
        };
      }
      if (contexto.venta) return decisionPorVenta(contexto.venta);
    }

    if (this.aprendizaje) {
      const aprendido = await this.aprendizaje.buscar(pago);
      if (aprendido) {
        return { clasificacion: aprendido, motivo: "Corrección aprendida del comercio.", reglaId: "aprendizaje", aprendido: true };
      }
    }

    if (pago.contraparteId && this.config?.cuentasPropias?.includes(pago.contraparteId)) {
      return { clasificacion: "NO_FACTURABLE", motivo: "Cuenta propia del comercio (config): no es venta.", reglaId: "cuenta-propia" };
    }

    for (const regla of this.reglas) {
      if (regla.cuando(pago)) {
        return { clasificacion: regla.clasificacion, motivo: regla.descripcion, reglaId: regla.id };
      }
    }
    return { clasificacion: "REVISAR", motivo: "Ninguna regla aplica: requiere revisión." };
  }
}

/** Registra una corrección de clasificación para que se aprenda (§12.1). */
export async function registrarCorreccion(
  aprendizaje: AprendizajePort,
  pago: PagoMP,
  clasificacion: Clasificacion,
): Promise<void> {
  await aprendizaje.registrar({
    contraparteId: pago.contraparteId,
    operacion: pago.contraparteId ? undefined : pago.operacion,
    clasificacion,
  });
}

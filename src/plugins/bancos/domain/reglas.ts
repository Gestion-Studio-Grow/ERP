/**
 * REGLAS DEL DUEÑO — movimiento clasificado → propuesta de factura.
 *
 *   1. monto <  umbral → propuesta AUTO: consumidor final genérico (DocTipo 99,
 *      DocNro 0), SIN descripción del servicio, lista para emitir.
 *   2. monto >= umbral → REVISION: exige CUIL/CUIT + nombre + descripción del
 *      servicio antes de emitir. El límite ES revisión (== umbral va a revisión).
 *   3. Cap de facturas/mes: contra `capFacturasMes`. Al 90% alerta; al 100% se
 *      BLOQUEA la emisión automática (las auto restantes bajan a revisión: solo
 *      manual con confirmación).
 *   4. Deduplicación: por el hash idempotente del movimiento (mismo archivo dos
 *      veces / extractos solapados) + detección CRUZADA banco↔MP (mismo monto y
 *      misma fecha ya facturado por MP → posible duplicado, REVISION).
 *
 * Los montos del banco son IVA INCLUIDO: el cálculo neto/IVA lo hace el Core
 * (src/lib/fiscal.ts) — acá NO se calcula IVA (ADR-006).
 */

import type { MovimientoBancario, PropuestaFactura } from "../core-contract";
import type { ResultadoClasificacionBanco } from "./clasificador";

/**
 * Umbral de identificación por defecto (pesos): regla COMERCIAL del dueño.
 * El umbral LEGAL de ARCA para exigir identificación del receptor es
 * $10.000.000 desde 05/2025 — este es MÁS ESTRICTO a propósito (prudencia
 * fiscal del producto, no un error de ceros).
 */
export const UMBRAL_IDENTIFICACION_DEFAULT = 600_000;

/** Tope de facturas automáticas por mes, por defecto (regla comercial del dueño). */
export const CAP_FACTURAS_MES_DEFAULT = 159;

/** Catálogo ARCA: DocTipo 99 = consumidor final sin identificar, DocNro 0. */
export const DOC_TIPO_CONSUMIDOR_FINAL = 99;
export const DOC_NRO_CONSUMIDOR_FINAL = 0;

/** Config efectiva del módulo (los valores del configSchema de module.ts, con defaults). */
export interface ConfigBancos {
  umbralIdentificacion: number;
  capFacturasMes: number;
  /** Obligatorio para el comprobante; el placeholder vacío es "provisional a confirmar". */
  domicilioEmisor: string;
  puntoVenta: number;
}

/** Completa la config parcial del tenant con los defaults del producto. */
export function configConDefaults(parcial: Partial<ConfigBancos> = {}): ConfigBancos {
  return {
    umbralIdentificacion: parcial.umbralIdentificacion ?? UMBRAL_IDENTIFICACION_DEFAULT,
    capFacturasMes: parcial.capFacturasMes ?? CAP_FACTURAS_MES_DEFAULT,
    domicilioEmisor: parcial.domicilioEmisor ?? "",
    puntoVenta: parcial.puntoVenta ?? 1,
  };
}

/**
 * Detección cruzada banco↔MP: ¿ya se facturó por OTRA vía un cobro de este
 * monto en esta fecha? (típico: el cliente pagó por MP, MP lo facturó, y el
 * mismo cobro aparece acreditado en el banco). Real = consulta a la
 * conciliación de MP; stub = lista en memoria.
 */
export interface DeteccionCruzadaPort {
  facturadoPorOtraVia(fecha: string, monto: number): Promise<boolean>;
}

/** Stub en memoria de la detección cruzada (tests/simulador). */
export class DeteccionCruzadaEnMemoria implements DeteccionCruzadaPort {
  private claves: Set<string>;

  constructor(facturados: { fecha: string; monto: number }[] = []) {
    this.claves = new Set(facturados.map((f) => `${f.fecha}|${f.monto.toFixed(2)}`));
  }

  async facturadoPorOtraVia(fecha: string, monto: number): Promise<boolean> {
    return this.claves.has(`${fecha}|${monto.toFixed(2)}`);
  }
}

/** Alerta operativa del lote (la UI las muestra arriba del resultado). */
export interface AlertaBancos {
  tipo: "cap-90" | "cap-100" | "mapeo-baja-confianza" | "extracto-vacio";
  mensaje: string;
}

export interface ContextoReglas {
  config: ConfigBancos;
  /** Facturas automáticas YA emitidas este mes (el glue lo trae de la DB). */
  facturasEmitidasEsteMes: number;
  deteccionCruzada?: DeteccionCruzadaPort;
  /** ¿Este movimiento ya fue procesado en una corrida anterior? (idempotencia entre importaciones). */
  yaProcesado?: (movimientoId: string) => boolean | Promise<boolean>;
}

export interface ResultadoReglas {
  propuestas: PropuestaFactura[];
  alertas: AlertaBancos[];
}

/**
 * Aplica las reglas del dueño a los movimientos ya clasificados y devuelve las
 * propuestas + alertas. PURA respecto de la DB: todo entra por el contexto.
 */
export async function generarPropuestas(
  movimientos: MovimientoBancario[],
  clasificaciones: Map<string, ResultadoClasificacionBanco>,
  ctx: ContextoReglas,
): Promise<ResultadoReglas> {
  const { config } = ctx;
  const propuestas: PropuestaFactura[] = [];
  const alertas: AlertaBancos[] = [];
  const vistosEnLote = new Set<string>();
  // Contador PROYECTADO contra el cap: lo ya emitido + las auto que este lote suma.
  let proyectadas = ctx.facturasEmitidasEsteMes;
  let capBloqueo = false;

  for (const mov of movimientos) {
    const montoTotal = Math.abs(mov.monto);

    // 4a) Dedup dentro del lote: el mismo hash dos veces = misma operación repetida.
    if (vistosEnLote.has(mov.id)) {
      propuestas.push({
        movimientoId: mov.id,
        montoTotal,
        requiereIdentificacion: false,
        estado: "descartado",
        motivo: "Movimiento duplicado dentro del archivo (misma fecha, monto y descripción).",
      });
      continue;
    }
    vistosEnLote.add(mov.id);

    // 4b) Dedup entre corridas: ya procesado en una importación anterior.
    if (ctx.yaProcesado && (await ctx.yaProcesado(mov.id))) {
      propuestas.push({
        movimientoId: mov.id,
        montoTotal,
        requiereIdentificacion: false,
        estado: "descartado",
        motivo: "Movimiento ya procesado en una importación anterior.",
      });
      continue;
    }

    const clasif = clasificaciones.get(mov.id);
    if (!clasif || clasif.clasificacion === "REVISAR") {
      propuestas.push({
        movimientoId: mov.id,
        montoTotal,
        requiereIdentificacion: montoTotal >= config.umbralIdentificacion,
        estado: "revision",
        motivo: clasif?.motivo ?? "Sin clasificación: requiere revisión.",
      });
      continue;
    }
    if (clasif.clasificacion === "NO_FACTURABLE") {
      propuestas.push({
        movimientoId: mov.id,
        montoTotal,
        requiereIdentificacion: false,
        estado: "no_facturable",
        motivo: clasif.motivo,
      });
      continue;
    }

    // FACTURABLE de acá en adelante.

    // 4c) Detección cruzada banco↔MP: mismo monto y misma fecha ya facturado por
    //     la otra vía → posible duplicado, decide un humano (REVISION).
    if (
      ctx.deteccionCruzada &&
      (await ctx.deteccionCruzada.facturadoPorOtraVia(mov.fecha, montoTotal))
    ) {
      propuestas.push({
        movimientoId: mov.id,
        montoTotal,
        requiereIdentificacion: montoTotal >= config.umbralIdentificacion,
        estado: "revision",
        motivo:
          "Posible duplicado: ya hay una factura por Mercado Pago con el mismo monto y la misma fecha.",
      });
      continue;
    }

    // 2) monto >= umbral → REVISION con identificación obligatoria (el límite
    //    exacto TAMBIÉN: la regla es estricta a propósito).
    if (montoTotal >= config.umbralIdentificacion) {
      propuestas.push({
        movimientoId: mov.id,
        montoTotal,
        requiereIdentificacion: true,
        estado: "revision",
        motivo: `Monto igual o mayor al umbral de identificación ($${config.umbralIdentificacion.toLocaleString("es-AR")}): requiere CUIL/CUIT, nombre y descripción del servicio.`,
      });
      continue;
    }

    // 3) Cap de facturas/mes: al 100% se bloquea la emisión automática — la
    //    propuesta baja a revisión (solo manual con confirmación).
    if (capBloqueo || proyectadas + 1 > config.capFacturasMes) {
      capBloqueo = true;
      propuestas.push({
        movimientoId: mov.id,
        montoTotal,
        requiereIdentificacion: false,
        docTipo: DOC_TIPO_CONSUMIDOR_FINAL,
        docNro: DOC_NRO_CONSUMIDOR_FINAL,
        estado: "revision",
        motivo: `Cap de ${config.capFacturasMes} facturas automáticas del mes alcanzado: emisión solo manual con confirmación.`,
      });
      continue;
    }

    // 1) monto < umbral → AUTO: consumidor final genérico, sin descripción,
    //    lista para emitir. El neto/IVA los calcula el Core al emitir (ADR-006).
    proyectadas++;
    propuestas.push({
      movimientoId: mov.id,
      montoTotal,
      requiereIdentificacion: false,
      docTipo: DOC_TIPO_CONSUMIDOR_FINAL,
      docNro: DOC_NRO_CONSUMIDOR_FINAL,
      estado: "auto",
    });
  }

  // Alertas del cap (una sola de cada tipo por lote; 100% pisa a 90%).
  if (capBloqueo || proyectadas >= config.capFacturasMes) {
    alertas.push({
      tipo: "cap-100",
      mensaje: `Se alcanzó el tope de ${config.capFacturasMes} facturas automáticas del mes: el resto se emite solo manualmente.`,
    });
  } else if (proyectadas >= config.capFacturasMes * 0.9) {
    alertas.push({
      tipo: "cap-90",
      mensaje: `Atención: van ${proyectadas} de ${config.capFacturasMes} facturas automáticas del mes (más del 90% del cap).`,
    });
  }

  return { propuestas, alertas };
}

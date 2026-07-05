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
 * Hexagonal: `ClasificadorPort` + un stub por reglas. Las reglas por defecto son
 * el MVP; configurables por comercio (v1+) y con aprendizaje (visión).
 */

import { PagoMP } from "./port";

export type Clasificacion = "FACTURABLE" | "NO_FACTURABLE" | "REVISAR";

export interface ResultadoClasificacion {
  clasificacion: Clasificacion;
  motivo: string;
  reglaId?: string;
}

export interface ClasificadorPort {
  clasificar(pago: PagoMP, tenantId: string): Promise<ResultadoClasificacion>;
}

/** Una regla: si `cuando(pago)` matchea, aplica `clasificacion`. */
export interface ReglaClasificacion {
  id: string;
  descripcion: string;
  cuando: (pago: PagoMP) => boolean;
  clasificacion: Clasificacion;
}

/**
 * Reglas por defecto (MVP). Orden importa: la primera que matchea gana.
 * Un comercio puede sumar/pisar reglas (v1+) sin tocar este motor.
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

/**
 * Clasificador por reglas. Si ninguna regla matchea (ej. `operacion === "otro"`),
 * devuelve REVISAR: no se factura solo, queda para decisión humana.
 */
export class ClasificadorPorReglas implements ClasificadorPort {
  constructor(private readonly reglas: ReglaClasificacion[] = REGLAS_DEFAULT) {}

  async clasificar(pago: PagoMP, _tenantId: string): Promise<ResultadoClasificacion> {
    for (const regla of this.reglas) {
      if (regla.cuando(pago)) {
        return { clasificacion: regla.clasificacion, motivo: regla.descripcion, reglaId: regla.id };
      }
    }
    return { clasificacion: "REVISAR", motivo: "Ninguna regla aplica: requiere revisión." };
  }
}

/**
 * Clasificador de movimientos bancarios — mismo rol (y mismo molde) que el
 * clasificador de MP (src/plugins/mercadopago/classifier.ts, ADR-025 §12.1):
 * NO se factura todo a ciegas. Separa CRÉDITOS facturables (ventas) de todo lo
 * que no lo es: débitos (egresos), comisiones e impuestos bancarios,
 * transferencias entre cuentas propias, contraasientos/reversos y
 * préstamos/plazos fijos. Facturar de más infla la facturación anual y fuerza
 * recategorización indebida del monotributo — es prevención fiscal.
 *
 * NOTA sobre `TipoOperacion` de src/plugins/pagos/port.ts: se evaluó reusarla
 * y NO encaja — esa taxonomía describe operaciones de un gateway de cobros
 * (pago/devolución/préstamo ya tipados por la API); un extracto bancario no
 * trae tipo, solo una LEYENDA de texto, y suma categorías que el gateway no
 * tiene (comisión, impuesto al cheque, SIRCREB). Los nombres de las reglas se
 * mantienen alineados a esa taxonomía para que el vocabulario del producto sea
 * uno solo.
 *
 * Extensible por tenant, igual que MP: config (CUITs propios, reglas extra) +
 * APRENDIZAJE (si el usuario marca "no facturable" un patrón, se guarda la
 * regla y se aplica sola la próxima vez).
 */

import type { MovimientoBancario } from "../core-contract";
import { normalizarTexto } from "./valores";

export type ClasificacionBanco = "FACTURABLE" | "NO_FACTURABLE" | "REVISAR";

export interface ResultadoClasificacionBanco {
  clasificacion: ClasificacionBanco;
  motivo: string;
  reglaId?: string;
  /** true si vino del aprendizaje (corrección previa), no de una regla. */
  aprendido?: boolean;
}

export interface ClasificadorBancoPort {
  clasificar(mov: MovimientoBancario, tenantId: string): Promise<ResultadoClasificacionBanco>;
}

/** Una regla: si `cuando(mov)` matchea, aplica `clasificacion`. */
export interface ReglaClasificacionBanco {
  id: string;
  descripcion: string;
  cuando: (mov: MovimientoBancario) => boolean;
  clasificacion: ClasificacionBanco;
}

/** Config de clasificación por tenant (editable por el comercio/contador). */
export interface ConfigClasificacionBanco {
  /** CUITs/identificadores PROPIOS del comercio: contraparte propia → NO_FACTURABLE. */
  cuitsPropios?: string[];
  /** Reglas extra del tenant, evaluadas ANTES de las default. */
  reglasExtra?: ReglaClasificacionBanco[];
}

/** ¿La descripción normalizada contiene alguna de las keywords? */
function contiene(mov: MovimientoBancario, ...keywords: string[]): boolean {
  const desc = normalizarTexto(mov.descripcion);
  return keywords.some((k) => desc.includes(k));
}

/**
 * Reglas por defecto. El orden importa: la primera que matchea gana — las
 * leyendas específicas (comisión, contraasiento) van antes que la genérica
 * "es un débito", para que el motivo que ve el usuario sea el correcto.
 */
export const REGLAS_DEFAULT_BANCO: ReglaClasificacionBanco[] = [
  {
    id: "comision-impuesto",
    descripcion: "Comisión o impuesto bancario: no es venta.",
    // "ley 25413" = impuesto al cheque; SIRCREB = retención de IIBB sobre créditos.
    // Solo refina DÉBITOS (que ya son NO_FACTURABLE por "debito-egreso"): así el
    // motivo que ve el usuario es el correcto SIN riesgo de comerse un crédito
    // cuya leyenda mencione "IVA" (p. ej. una venta "con IVA incluido").
    cuando: (m) =>
      m.monto < 0 &&
      (contiene(
        m,
        "comision",
        "imp. deb",
        "imp deb",
        "imp.deb",
        "impuesto deb",
        "imp. cred",
        "imp cred",
        "sircreb",
        "ley 25413",
        "ley 25.413",
        "percepcion",
        "retencion",
        "mantenimiento de cuenta",
      ) ||
        /\biva\b/.test(normalizarTexto(m.descripcion))),
    clasificacion: "NO_FACTURABLE",
  },
  {
    id: "transferencia-propia",
    descripcion: "Transferencia entre cuentas propias: no es venta.",
    cuando: (m) => contiene(m, "transferencia entre cuentas", "entre cuentas propias", "cuentas propias"),
    clasificacion: "NO_FACTURABLE",
  },
  {
    id: "contraasiento-reverso",
    descripcion: "Contraasiento/reverso/devolución de una operación: no es venta.",
    cuando: (m) =>
      contiene(m, "contraasiento", "reverso", "reversa", "extorno", "anulacion", "devolucion", "reintegro"),
    clasificacion: "NO_FACTURABLE",
  },
  {
    id: "prestamo-plazo-fijo",
    descripcion: "Préstamo o acreditación de plazo fijo: no es venta.",
    cuando: (m) => contiene(m, "prestamo", "plazo fijo", "adelanto de haberes", "credito otorgado"),
    clasificacion: "NO_FACTURABLE",
  },
  {
    id: "debito-egreso",
    descripcion: "Débito (egreso de la cuenta): no se factura.",
    cuando: (m) => m.monto < 0,
    clasificacion: "NO_FACTURABLE",
  },
  {
    id: "monto-cero",
    descripcion: "Movimiento sin monto: no se factura.",
    cuando: (m) => m.monto === 0,
    clasificacion: "NO_FACTURABLE",
  },
  {
    id: "credito-venta",
    descripcion: "Crédito acreditado en la cuenta: venta facturable.",
    cuando: (m) => m.monto > 0,
    clasificacion: "FACTURABLE",
  },
];

/** Una corrección aprendida: un patrón de movimiento → cómo clasificarlo. */
export interface CorreccionBanco {
  /** Empareja por contraparte (prioritario) y/o por descripción normalizada. */
  contraparte?: string;
  descripcionNormalizada?: string;
  clasificacion: ClasificacionBanco;
}

/**
 * Memoria de aprendizaje (mismo patrón que `AprendizajePort` de MP): recuerda
 * las correcciones del comercio/contador y las reaplica. Real = tabla por
 * tenant; stub = en memoria. Empareja por contraparte (lo más confiable) y,
 * si no, por descripción normalizada exacta (las leyendas bancarias se
 * repiten literales).
 */
export interface AprendizajeBancoPort {
  buscar(mov: MovimientoBancario): Promise<ClasificacionBanco | null>;
  registrar(correccion: CorreccionBanco): Promise<void>;
}

export class AprendizajeBancoEnMemoria implements AprendizajeBancoPort {
  private porContraparte = new Map<string, ClasificacionBanco>();
  private porDescripcion = new Map<string, ClasificacionBanco>();

  async buscar(mov: MovimientoBancario): Promise<ClasificacionBanco | null> {
    if (mov.contraparte && this.porContraparte.has(mov.contraparte)) {
      return this.porContraparte.get(mov.contraparte)!;
    }
    const desc = normalizarTexto(mov.descripcion);
    if (this.porDescripcion.has(desc)) {
      return this.porDescripcion.get(desc)!;
    }
    return null;
  }

  async registrar(c: CorreccionBanco): Promise<void> {
    if (c.contraparte) this.porContraparte.set(c.contraparte, c.clasificacion);
    else if (c.descripcionNormalizada) this.porDescripcion.set(c.descripcionNormalizada, c.clasificacion);
  }
}

export interface OpcionesClasificadorBanco {
  reglas?: ReglaClasificacionBanco[];
  config?: ConfigClasificacionBanco;
  aprendizaje?: AprendizajeBancoPort;
}

/**
 * Clasificador por reglas. Prioridad (igual que el de MP):
 *   1. Aprendizaje (correcciones previas del comercio).
 *   2. CUITs propios del comercio (config) → NO_FACTURABLE.
 *   3. Reglas extra del tenant, luego las default.
 *   4. Fallback REVISAR (no se factura solo).
 */
export class ClasificadorBancarioPorReglas implements ClasificadorBancoPort {
  private readonly reglas: ReglaClasificacionBanco[];
  private readonly config?: ConfigClasificacionBanco;
  private readonly aprendizaje?: AprendizajeBancoPort;

  constructor(opts: OpcionesClasificadorBanco = {}) {
    this.reglas = [...(opts.config?.reglasExtra ?? []), ...(opts.reglas ?? REGLAS_DEFAULT_BANCO)];
    this.config = opts.config;
    this.aprendizaje = opts.aprendizaje;
  }

  async clasificar(mov: MovimientoBancario, _tenantId: string): Promise<ResultadoClasificacionBanco> {
    if (this.aprendizaje) {
      const aprendido = await this.aprendizaje.buscar(mov);
      if (aprendido) {
        return {
          clasificacion: aprendido,
          motivo: "Corrección aprendida del comercio.",
          reglaId: "aprendizaje",
          aprendido: true,
        };
      }
    }

    if (mov.contraparte && this.config?.cuitsPropios?.some((c) => mov.contraparte!.includes(c))) {
      return {
        clasificacion: "NO_FACTURABLE",
        motivo: "Cuenta propia del comercio (config): no es venta.",
        reglaId: "cuenta-propia",
      };
    }

    for (const regla of this.reglas) {
      if (regla.cuando(mov)) {
        return { clasificacion: regla.clasificacion, motivo: regla.descripcion, reglaId: regla.id };
      }
    }
    return { clasificacion: "REVISAR", motivo: "Ninguna regla aplica: requiere revisión." };
  }
}

/** Registra una corrección para que se aprenda (mismo contrato que MP §12.1). */
export async function registrarCorreccionBanco(
  aprendizaje: AprendizajeBancoPort,
  mov: MovimientoBancario,
  clasificacion: ClasificacionBanco,
): Promise<void> {
  await aprendizaje.registrar({
    contraparte: mov.contraparte,
    descripcionNormalizada: mov.contraparte ? undefined : normalizarTexto(mov.descripcion),
    clasificacion,
  });
}

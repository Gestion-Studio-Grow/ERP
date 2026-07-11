/**
 * Orquestación del plugin BANCOS: el flujo de punta a punta de una importación.
 *
 *   archivo (CSV/XLSX subido por el usuario)
 *     → parsear (formato por contenido, no por extensión: los bancos mienten)
 *     → mapear columnas (templates + heurística; asistido SOLO si confianza < 0.8)
 *     → normalizar movimientos (fechas AAAAMMDD, pesos con signo, hash idempotente)
 *     → clasificar (ventas vs comisiones/impuestos/transferencias/reversos)
 *     → reglas del dueño (umbral, cap, dedup, cruce banco↔MP)
 *     → { movimientos, propuestas, mapeo, alertas }
 *
 * PURO y determinista: no toca DB ni red — clasificador, detección cruzada e
 * idempotencia entran por inyección (mismo molde que ingest.ts de MP). El glue
 * de src/lib (persistir propuestas, llamar CreateInvoice al confirmar) lo
 * cablea la UI después.
 */

import type { MovimientoBancario, PropuestaFactura } from "./core-contract";
import type { ClasificadorBancoPort, ResultadoClasificacionBanco } from "./domain/clasificador";
import {
  CONFIANZA_MINIMA,
  mapearColumnas,
  normalizarMovimientos,
  type Celda,
  type MapeadorAsistido,
  type MapeoColumnas,
} from "./domain/mapeador";
import {
  configConDefaults,
  generarPropuestas,
  type AlertaBancos,
  type ConfigBancos,
  type DeteccionCruzadaPort,
} from "./domain/reglas";
import { parsearCsv } from "./parser/csv";
import { esXlsx, parsearXlsx } from "./parser/xlsx";

/** El archivo tal como llegó del upload (los bytes mandan, la extensión ayuda). */
export interface ArchivoExtracto {
  nombre: string;
  contenido: Uint8Array;
}

export type FormatoExtracto = "csv" | "xlsx";

export interface BancosHandlerDeps {
  tenantId: string;
  /** Clasificador de movimientos (ventas vs no facturable). */
  clasificador: ClasificadorBancoPort;
  /** Config del módulo por tenant (parcial: se completa con defaults). */
  config?: Partial<ConfigBancos>;
  /** Facturas automáticas ya emitidas este mes (para el cap). Default 0. */
  facturasEmitidasEsteMes?: number;
  /** Cruce banco↔MP (posibles duplicados). Opcional. */
  deteccionCruzada?: DeteccionCruzadaPort;
  /** Idempotencia entre importaciones: ¿este movimiento ya se procesó? Opcional. */
  yaProcesado?: (movimientoId: string) => boolean | Promise<boolean>;
  /** Mapeador asistido (IA), consultado SOLO si la heurística no llega a 0.8. */
  mapeadorAsistido?: MapeadorAsistido;
  /**
   * Mapeo CONFIRMADO por el usuario (flujo de confianza < 0.8): saltea la
   * detección heurística y el asistido, y procesa con ESTE mapeo tal cual.
   * Es lo que cablea `confirmarMapeoAction` del glue — el usuario ya decidió,
   * no se vuelve a adivinar ni a alertar por confianza.
   */
  mapeoConfirmado?: MapeoColumnas;
}

export interface ResultadoExtracto {
  movimientos: MovimientoBancario[];
  propuestas: PropuestaFactura[];
  /** Mapeo detectado (null = archivo ilegible como tabla). La UI lo muestra si `requiereConfirmacion`. */
  mapeo: MapeoColumnas | null;
  alertas: AlertaBancos[];
  /**
   * Clasificación por movimiento (key = id/hash). El glue la persiste junto con
   * la propuesta — sin esto tendría que re-clasificar afuera (doble camino).
   */
  clasificaciones: Map<string, ResultadoClasificacionBanco>;
}

/**
 * Decide el formato por CONTENIDO primero (magic bytes de ZIP/OLE) y por
 * extensión después: hay bancos que entregan un XLSX renombrado `.csv` y
 * viceversa; los bytes no mienten.
 */
export function detectarFormato(archivo: ArchivoExtracto): FormatoExtracto {
  if (esXlsx(archivo.contenido)) return "xlsx";
  const ext = archivo.nombre.toLowerCase().split(".").pop();
  return ext === "xlsx" || ext === "xls" ? "xlsx" : "csv";
}

/**
 * Procesa un extracto de punta a punta y devuelve las propuestas SIN tocar la
 * DB. Determinista: mismo archivo + misma config = mismo resultado.
 */
export async function procesarExtracto(
  archivo: ArchivoExtracto,
  deps: BancosHandlerDeps,
): Promise<ResultadoExtracto> {
  // 1) Parsear según formato real.
  const formato = detectarFormato(archivo);
  const matriz: Celda[][] =
    formato === "xlsx" ? parsearXlsx(archivo.contenido) : parsearCsv(archivo.contenido);

  if (matriz.length === 0) {
    return {
      movimientos: [],
      propuestas: [],
      mapeo: null,
      alertas: [{ tipo: "extracto-vacio", mensaje: "El archivo no tiene contenido legible." }],
      clasificaciones: new Map(),
    };
  }

  // 2) Mapear columnas: si el usuario YA confirmó un mapeo (re-proceso), va ese
  //    tal cual; si no, heurística/templates primero y el asistido (IA) SOLO
  //    si la confianza no llega al mínimo (unit-economics: lo caro es excepción).
  let mapeo: MapeoColumnas | null;
  if (deps.mapeoConfirmado) {
    mapeo = { ...deps.mapeoConfirmado, requiereConfirmacion: false };
  } else {
    mapeo = mapearColumnas(matriz);
    if ((mapeo === null || mapeo.requiereConfirmacion) && deps.mapeadorAsistido) {
      mapeo = (await deps.mapeadorAsistido.proponerMapeo(matriz, mapeo)) ?? mapeo;
    }
  }
  if (mapeo === null) {
    return {
      movimientos: [],
      propuestas: [],
      mapeo: null,
      alertas: [
        {
          tipo: "mapeo-baja-confianza",
          mensaje:
            "No se pudo reconocer la tabla del extracto (fecha, importe y descripción). Revisá el archivo o mapeá las columnas a mano.",
        },
      ],
      clasificaciones: new Map(),
    };
  }

  const alertasMapeo: AlertaBancos[] =
    !deps.mapeoConfirmado && mapeo.confianza < CONFIANZA_MINIMA
      ? [
          {
            tipo: "mapeo-baja-confianza",
            mensaje: `El mapeo automático de columnas tiene confianza ${mapeo.confianza}: confirmalo antes de emitir.`,
          },
        ]
      : [];

  // 3) Normalizar movimientos (hash idempotente incluido).
  const movimientos = normalizarMovimientos(matriz, mapeo);

  // 4) Clasificar cada movimiento.
  const clasificaciones = new Map<string, ResultadoClasificacionBanco>();
  for (const mov of movimientos) {
    if (clasificaciones.has(mov.id)) continue; // duplicado en el lote: la regla de dedup lo maneja
    clasificaciones.set(mov.id, await deps.clasificador.clasificar(mov, deps.tenantId));
  }

  // 5) Reglas del dueño → propuestas + alertas de cap.
  const { propuestas, alertas } = await generarPropuestas(movimientos, clasificaciones, {
    config: configConDefaults(deps.config),
    facturasEmitidasEsteMes: deps.facturasEmitidasEsteMes ?? 0,
    deteccionCruzada: deps.deteccionCruzada,
    yaProcesado: deps.yaProcesado,
  });

  return { movimientos, propuestas, mapeo, alertas: [...alertasMapeo, ...alertas], clasificaciones };
}

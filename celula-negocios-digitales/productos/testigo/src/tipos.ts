/**
 * Tipos de entrada/configuración del pipeline Testigo.
 * El esquema del PARTE (salida del núcleo) vive en `esquema-parte.ts`.
 */

/** Una foto ya procesada por visión: descripción + momento del trabajo. */
export interface FotoProcesada {
  url: string;
  /** Caption generado por el modelo de visión. */
  descripcion: string;
  /** Clasificación del momento del trabajo. */
  momento: "antes" | "durante" | "despues" | "indeterminado";
}

/** Lo que el operario mandó por WhatsApp, ya pre-procesado. */
export interface EntradaOperario {
  /** Transcripción de la nota de voz (STT). */
  transcripcion: string;
  /** Texto libre que el operario haya tipeado además del audio (opcional). */
  textoAdicional?: string;
  /** Fotos ya pasadas por visión. */
  fotos: FotoProcesada[];
  /** Fecha/hora del servicio (ISO). Si falta, se usa la de recepción del mensaje. */
  fechaServicio?: string;
}

/** Configuración de la plantilla por contratista (sin tocar código). */
export interface ConfigContratista {
  nombreEmpresa: string;
  matriculaEmpresa: string;
  operarioNombre: string;
  /** URL del logo (para el PDF). */
  logoUrl?: string;
  /** Texto legal al pie del parte. */
  textoLegalPie?: string;
  /** Datos del cliente final, si el contratista los precargó. */
  cliente?: {
    nombre?: string;
    direccion?: string;
    tipoEstablecimiento?: string;
  };
  /** Número correlativo del parte. */
  numeroParte: string;
}

/** Rubro activo. En el MVP, sólo control de plagas. */
export type Rubro = "control_plagas";

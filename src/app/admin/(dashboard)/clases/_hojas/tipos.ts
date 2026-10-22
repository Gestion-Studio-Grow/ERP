// La clase como la reciben las acciones y las hojas del profe (lo mínimo: sin el token del alumno
// ni nada que no se use en la pantalla). Las pantallas de antes pasaban sólo los seis primeros
// campos; el resto es opcional y, si falta, la hoja hace lo más simple.

export interface ClaseAcciones {
  id: string;
  estado: string;
  pagoEstado: string;
  nombre: string;
  comprobante: string | null;
  precio: number;
  empiezaEn?: Date | string;
  terminaEn?: Date | string;
  telefono?: string;
  tipo?: string;
  personas?: number;
  motivoCancel?: string | null;
}

/** Duración en minutos (60 si no se sabe). */
export const duracionDe = (c: Pick<ClaseAcciones, "empiezaEn" | "terminaEn">): number =>
  c.empiezaEn && c.terminaEn ? Math.round((new Date(c.terminaEn).getTime() - new Date(c.empiezaEn).getTime()) / 60_000) : 60;

/** ¿Ya terminó? (sin hora, se toma que no). */
export const yaTermino = (c: Pick<ClaseAcciones, "terminaEn">, ahora = new Date()): boolean =>
  c.terminaEn ? new Date(c.terminaEn).getTime() <= ahora.getTime() : false;

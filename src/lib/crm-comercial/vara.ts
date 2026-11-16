// CRM COMERCIAL · la vara de «calificado» (GSG-CRM-010).
//
// PROVISIONAL A CONFIRMAR con Dirección del negocio (diseño §2 y §9): los puntos, el umbral, los días
// mínimos y qué cuenta como «estandarizado» viven acá, en un archivo de configuración, hasta que la vara
// se pueda editar en pantalla (tanda «Después»). Cambiar un número acá no toca el motor.

export const VARA = {
  /** El evento tiene que estar a más de estos días para que valga la fecha. */
  diasMinimos: 21,
  /** Puntaje mínimo para pasar a CALIFICADA. */
  umbral: 80,
  puntos: {
    fechaConocida: 25,
    tipoTrabajo: 20,
    presupuesto: 20,
    quienDecide: 20,
    encaje: 15,
  },
  /** Tipos de trabajo que hoy se resuelven como producto estandarizado (destino Taller). */
  tiposEstandarizados: ["stand_modular", "kit_estandar", "corporeo_estandar"],
  /** Pedidos de datos sin respuesta antes de proponer DESCARTADA «sin datos» (E9). */
  pedidosDeDatosMax: 2,
  /** Seguimientos sin respuesta antes de proponer DORMIDA o PERDIDA (E23). */
  seguimientosMax: 3,
  /** Horas que una oportunidad CALIFICADA puede esperar asignación antes de vencer en «Hoy» (E7). */
  horasParaAsignar: 48,
} as const;

export type Vara = {
  diasMinimos: number;
  umbral: number;
  puntos: { fechaConocida: number; tipoTrabajo: number; presupuesto: number; quienDecide: number; encaje: number };
  tiposEstandarizados: readonly string[];
  pedidosDeDatosMax: number;
  seguimientosMax: number;
  horasParaAsignar: number;
};

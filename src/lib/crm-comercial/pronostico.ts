// CRM COMERCIAL · probabilidad y plazo de seguimiento por etapa (GSG-CRM-011).
//
// PROVISIONAL A CONFIRMAR con Dirección del negocio (diseño §2, «por etapa, en configuración»), igual que la
// vara (vara.ts): vive acá hasta que se pueda editar en pantalla. Cambiar un número acá no toca el motor.
// - `probabilidad`: % (0 a 100) con que se espera ganar una oportunidad en esa etapa → monto ponderado.
// - `seguimientoDias`: días sin actividad que se toleran en esa etapa antes de que vaya a «Hoy» como
//   «sin seguimiento». null = no aplica (cerrada, o DORMIDA: la despierta su fecha).

import type { Etapa } from "./motor";

export type ConfigEtapa = { probabilidad: number; seguimientoDias: number | null };
export type Pronostico = Record<Etapa, ConfigEtapa>;

export const PRONOSTICO: Pronostico = {
  DETECTADA: { probabilidad: 2, seguimientoDias: 7 },
  VERIFICADA: { probabilidad: 5, seguimientoDias: 7 },
  SIN_CONTACTO: { probabilidad: 5, seguimientoDias: 5 },
  CONTACTADA: { probabilidad: 10, seguimientoDias: 5 },
  RECIBIDA: { probabilidad: 15, seguimientoDias: 1 },
  EN_CONVERSACION: { probabilidad: 25, seguimientoDias: 3 },
  FALTAN_DATOS: { probabilidad: 20, seguimientoDias: 3 },
  CALIFICADA: { probabilidad: 40, seguimientoDias: 2 },
  ASIGNADA: { probabilidad: 60, seguimientoDias: 5 },
  DORMIDA: { probabilidad: 5, seguimientoDias: null },
  GANADA: { probabilidad: 100, seguimientoDias: null },
  PERDIDA: { probabilidad: 0, seguimientoDias: null },
  DESCARTADA: { probabilidad: 0, seguimientoDias: null },
  // Va al Taller: no es venta de la Agencia (provisional a confirmar si suma al pronóstico).
  DERIVADA_AL_TALLER: { probabilidad: 0, seguimientoDias: null },
};

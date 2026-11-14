// Medio con que se ofrece pagar una liquidación de comisiones, preseleccionado en los formularios.
//
// PROVISIONAL A CONFIRMAR (F5, decisión del dueño): hoy es Efectivo, como siempre fue. La operación
// real de CH (informe OPERACION-REAL-2026-11, l.152-154) pregunta si debería ser Transferencia.
// Cuando el dueño decida, se cambia SÓLO esta constante: los tres formularios la leen de acá.
export const MEDIO_POR_DEFECTO_LIQUIDACION = "EFECTIVO" as const;

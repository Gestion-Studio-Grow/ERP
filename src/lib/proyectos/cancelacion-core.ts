// ============================================================================
// CANCELAR DESPUÉS DE APROBADO (MIA-50 T09 · O04). PURO.
// «Cancelado» es una salida distinta de «Perdido»: sólo Dirección, con motivo, y sólo con una versión aprobada. El sistema
// no mueve plata solo: anula todas las cuotas pendientes (el plan sin cuotas, `planQueSigue`; un perdido conserva las del
// proveedor, MIA-224 · D2), no toca cobros ni pagos hechos, no genera liquidación y lista lo que queda por resolver a mano (parámetro
// `cancelacion.despuesDeAprobado`, provisional: «la resuelve Dirección»).
// ============================================================================

export const PREFIJO_CANCELADO = "Cancelado: ";

/** Un proyecto fuera del tablero es cancelado si su motivo lo dice (la marca vive en Proyecto aunque M7b falte). */
export const esCancelado = (motivoPerdida: string | null | undefined): boolean => !!motivoPerdida?.startsWith(PREFIJO_CANCELADO);

/** El motivo que se ve, sin el prefijo. */
export const motivoDeCancelacion = (motivoPerdida: string): string => motivoPerdida.slice(PREFIJO_CANCELADO.length);

export interface HechosDelProyecto {
  cobros: { cantidad: number; total: number };
  pagos: { cantidad: number; total: number };
  cuotasPagoMarcadas: number;
  rendicionesAbiertas: number;
  anticiposAbiertos: number;
}

/** Lo que queda por resolver a mano después de cancelar. Vacío si no hay nada hecho. */
export function pendientesDeCancelar(h: HechosDelProyecto, pesos: (n: number) => string): string[] {
  const salida: string[] = [];
  if (h.cobros.cantidad > 0) salida.push(`Cobros del cliente: ${h.cobros.cantidad} por ${pesos(h.cobros.total)}. Definir si se devuelven o quedan a cuenta.`);
  if (h.pagos.cantidad > 0) salida.push(`Pagos a proveedores: ${h.pagos.cantidad} por ${pesos(h.pagos.total)}. Definir si se recuperan.`);
  if (h.cuotasPagoMarcadas > 0) salida.push(`Cuotas a proveedores ya marcadas como pagadas: ${h.cuotasPagoMarcadas}.`);
  if (h.rendicionesAbiertas > 0) salida.push(`Rendiciones de gastos sin cerrar: ${h.rendicionesAbiertas}.`);
  if (h.anticiposAbiertos > 0) salida.push(`Anticipos al equipo sin rendir: ${h.anticiposAbiertos}.`);
  salida.push("Comisiones del equipo: no se liquidan solas; las define Dirección.");
  return salida;
}

/** Valida el pedido: rol, motivo y que haya una aprobación. Devuelve el motivo del rechazo o null. */
export function rechazoDeCancelar(d: { rol: string; motivo: string; aprobada: boolean; perdido: boolean; cancelado: boolean }): string | null {
  if (d.rol !== "DIRECCION") return "Sólo Dirección puede cancelar un proyecto aprobado.";
  if (!d.motivo.trim()) return "Escribí por qué se cancela.";
  if (d.cancelado) return "Este proyecto ya está cancelado.";
  if (d.perdido) return "Este proyecto está perdido: no se cancela.";
  if (!d.aprobada) return "Sólo se cancela un proyecto con una versión aprobada. Si no se aprobó, marcalo como perdido.";
  return null;
}

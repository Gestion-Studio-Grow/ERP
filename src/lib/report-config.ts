// Constantes del reporte de ingresos (ADR-023 F3). Viven fuera de `actions.ts` porque
// ese módulo es `"use server"` y solo puede exportar funciones async; estas constantes
// las consumen tanto la Server Action (`getReportData`) como la página de reportes.

// Rangos permitidos para el reporte, en días. El reporte se acota SIEMPRE a uno de estos
// (rango obligatorio) para que la lectura no escale con toda la historia de pagos.
export const REPORT_RANGE_DAYS = [30, 90, 180, 365] as const;

// Rango por defecto cuando la URL no especifica uno válido.
export const DEFAULT_REPORT_RANGE_DAYS = 90;

// Etiqueta legible de cada método de pago. Fuente única consumida por la página de
// reportes (`/admin/reportes`) y por el export CSV (`report-csv.ts`) — antes estaba
// duplicada en ambos. Un método no mapeado cae a su propio código (fallback ?? m.method).
export const METODO_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  MERCADOPAGO: "Mercado Pago",
  TRANSFERENCIA: "Transferencia",
};

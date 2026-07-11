// Helpers PUROS de presentación de la sección "Facturación automática" (módulo
// BANCOS). Sin "use client" ni "use server": los importan por igual la página
// (server) y los componentes interactivos (client). Cero lógica de negocio —
// la de verdad vive en src/plugins/bancos y src/lib/bancos-glue.

import type { BadgeTone } from "@/components/ui";

/** AAAAMMDD → DD/MM/AAAA (criollo, mismo criterio que FacturasSection). */
export function fechaAr(aaaammdd: string): string {
  if (!/^\d{8}$/.test(aaaammdd)) return aaaammdd;
  return `${aaaammdd.slice(6, 8)}/${aaaammdd.slice(4, 6)}/${aaaammdd.slice(0, 4)}`;
}

// Fecha+hora corta (createdAt de importaciones): usar fmtDateTimeAr de
// `@/lib/datetime` — la copia local que vivía acá usaba la TZ del server
// (getDate/getHours) y mostraba la fecha corrida de día (fix 1 del gate).

/** Catálogo ARCA de tipos de documento que acepta la revisión (glue: validarDatosRevision). */
export const DOC_TIPOS = [
  { value: 80, label: "CUIT" },
  { value: 86, label: "CUIL" },
  { value: 96, label: "DNI" },
] as const;

export function docTipoLabel(docTipo: number | null): string {
  const found = DOC_TIPOS.find((d) => d.value === docTipo);
  if (found) return found.label;
  if (docTipo === 99) return "Consumidor final";
  return "—";
}

/**
 * Resume el `motivoRevision` largo del glue en un chip corto para la cola.
 * El texto completo se muestra en el panel de detalle.
 */
export function motivoCorto(motivo: string | null): { label: string; tone: BadgeTone } {
  const m = motivo ?? "";
  if (m.includes("umbral")) return { label: "Necesita datos del comprador", tone: "warning" };
  if (m.toLowerCase().includes("duplicado")) return { label: "Posible duplicado", tone: "warning" };
  if (m.includes("Cap") || m.includes("tope")) return { label: "Tope del mes alcanzado", tone: "danger" };
  if (m.toLowerCase().includes("procesado")) return { label: "Ya procesado antes", tone: "neutral" };
  return { label: "Revisar clasificación", tone: "neutral" };
}

/** Estado de propuesta → etiqueta criolla + tono de Badge. */
export const ESTADO_PROPUESTA_UI: Record<string, { label: string; tone: BadgeTone }> = {
  auto: { label: "Lista para emitir", tone: "success" },
  revision: { label: "En revisión", tone: "warning" },
  no_facturable: { label: "No facturable", tone: "neutral" },
  descartado: { label: "Descartada", tone: "neutral" },
  emitida: { label: "Factura emitida", tone: "accent" },
};

/** Celda cruda del extracto (string | number | boolean | Date | null) → texto para la vista previa. */
export function celdaATexto(celda: unknown): string {
  if (celda == null || celda === "") return "";
  if (celda instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(celda.getDate())}/${p(celda.getMonth() + 1)}/${celda.getFullYear()}`;
  }
  if (typeof celda === "number") return celda.toLocaleString("es-AR");
  return String(celda);
}

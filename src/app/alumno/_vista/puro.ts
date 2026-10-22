// Lo puro de las islas de «Mis clases» que viajan al teléfono (Pagar, Instalar): sin imports, para
// no arrastrar la librería de reglas al navegador y para probarlo sin servidor.

export interface ItemPago {
  id: string;
  /** «jueves 16/10 18:00». */
  cuando: string;
  precio: number;
  /** Dada (o «no vino · se cobra») sin pagar: entra en «Debés». */
  deuda: boolean;
  /** Ya mandó comprobante y espera que el profe lo valide (puede mandar otro). */
  enRevision: boolean;
  /** Por qué el profe devolvió el comprobante anterior («El monto no coincide»). */
  nota: string | null;
}

/** Qué arranca tildado: lo que debe; si no debe nada, lo que puede adelantar; si sólo hay en revisión, eso. */
export function seleccionInicial(items: readonly ItemPago[]): string[] {
  const deudas = items.filter((i) => i.deuda);
  if (deudas.length) return deudas.map((i) => i.id);
  const adelantar = items.filter((i) => !i.enRevision);
  return (adelantar.length ? adelantar.slice(0, 1) : items).map((i) => i.id);
}

export const esPdf = (f: { type: string; name: string }): boolean => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

/** ¿Es un iPhone/iPad con Safari, sin la app ya abierta desde el inicio? */
export function esIosSinInstalar(ua: string, standalone: boolean): boolean {
  return /iPhone|iPad|iPod/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua) && !standalone;
}

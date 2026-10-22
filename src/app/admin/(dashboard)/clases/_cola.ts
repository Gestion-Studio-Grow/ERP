// La cola de avisos (matias-DISENO.md §1.1 principio 3 · M-034/M-035): con N alumnos para
// avisar, «Avisar a Juan (1 de 6)» → WhatsApp → vuelve y sigue con el 2. Nunca se cierra sola:
// la cierra el profe. Puro (sin React): lo usa _aviso.tsx y lo prueba _cola.test.ts.

export type ItemAviso = {
  /** Lo que pasó, para el profe: «Confirmada: jue 23/10 19:00». */
  texto: string;
  /** El nombre del alumno («Juan Pérez»): el botón dice el primero. */
  nombre: string;
  /** El link de WhatsApp con el mensaje listo. Sin link (o ya enviado solo), no hay botón verde. */
  wa?: string | null;
  /** Ya salió solo por WhatsApp Business (Cloud API). */
  enviado?: boolean;
  /** El aviso guardado, para marcarle `enviadoEl` al tocar el link (marcarAvisado, M-034). */
  avisoId?: string | null;
};

export type EstadoCola = {
  items: ItemAviso[];
  /** El que se está mostrando. `indice === items.length` = ya pasó por todos. */
  indice: number;
  /** Los que abrió en WhatsApp. */
  avisados: number;
  /** Los que dejó «Después»: quedan en la Bandeja → «Sin avisar». */
  despues: number;
  /** El último que abrió, por si volvió sin mandar y quiere abrirlo de nuevo. */
  ultimo: ItemAviso | null;
};

export type AccionCola =
  | { tipo: "encolar"; items: ItemAviso[] }
  | { tipo: "avisado" }
  | { tipo: "despues" }
  | { tipo: "siguiente" }
  | { tipo: "cerrar" };

export const COLA_VACIA: EstadoCola = { items: [], indice: 0, avisados: 0, despues: 0, ultimo: null };

export const terminada = (e: EstadoCola) => e.items.length > 0 && e.indice >= e.items.length;
export const actual = (e: EstadoCola): ItemAviso | null => e.items[e.indice] ?? null;
export const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] || "el alumno";

/** El botón verde: «Avisar a Juan (1 de 6)»; con uno solo, «Avisarle a Juan por WhatsApp». */
export function etiquetaAvisar(e: EstadoCola): string {
  const it = actual(e);
  if (!it) return "";
  const nombre = primerNombre(it.nombre);
  return e.items.length > 1 ? `Avisar a ${nombre} (${e.indice + 1} de ${e.items.length})` : `Avisarle a ${nombre} por WhatsApp`;
}

/**
 * Lo que queda a la vista cuando pasó por todos. Si no hubo nada que mandar (resultados sin
 * WhatsApp) y nada quedó para después, la cola se cierra con el último «Listo»: no tiene sentido
 * un tercer toque. Si avisó o dejó alguno para después, queda el resumen hasta que la cierre.
 */
function alPasar(e: EstadoCola): EstadoCola {
  if (e.indice < e.items.length) return e;
  return e.avisados === 0 && e.despues === 0 ? COLA_VACIA : e;
}

export function cola(e: EstadoCola, a: AccionCola): EstadoCola {
  switch (a.tipo) {
    case "encolar": {
      const nuevos = a.items.filter((i) => i && (i.texto || i.wa));
      if (nuevos.length === 0) return e;
      // Con la cola terminada (o vacía) arranca de cero; si estaba a mitad, se suman al final:
      // un aviso nuevo nunca pisa a los que faltan.
      if (e.items.length === 0 || terminada(e)) return { ...COLA_VACIA, items: nuevos };
      return { ...e, items: [...e.items, ...nuevos] };
    }
    case "avisado": {
      const it = actual(e);
      if (!it) return e;
      return alPasar({ ...e, indice: e.indice + 1, avisados: e.avisados + 1, ultimo: it });
    }
    case "despues": {
      if (!actual(e)) return e;
      return alPasar({ ...e, indice: e.indice + 1, despues: e.despues + 1 });
    }
    case "siguiente": {
      if (!actual(e)) return e;
      return alPasar({ ...e, indice: e.indice + 1 });
    }
    case "cerrar":
      return COLA_VACIA;
  }
}

/** El resumen del final, en criollo. */
export function resumenFinal(e: EstadoCola): string {
  const partes: string[] = [];
  if (e.avisados > 0) partes.push(e.avisados === 1 ? `Le avisaste a ${primerNombre(e.ultimo?.nombre ?? "")}` : `Avisaste a ${e.avisados}`);
  if (e.despues > 0) partes.push(`${e.despues} ${e.despues === 1 ? "quedó" : "quedaron"} en «Sin avisar»`);
  return partes.join(" · ");
}

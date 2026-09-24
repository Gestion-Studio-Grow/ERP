// ============================================================================
// BORRADOR DEL RECUENTO — lo contado sobrevive a que se bloquee el teléfono. PURO.
// ============================================================================
//
// POR QUÉ. Una góndola de 20 productos se cuenta con el teléfono en una mano y la mercadería en
// la otra: entre producto y producto la pantalla se apaga, y al bloquearse Android puede
// descartar la pestaña para liberar memoria. Al volver, la página se arma de nuevo y lo tipeado
// (que vivía sólo en la memoria del formulario) se perdía: había que volver a contar todo.
// Ahora cada cambio se anota en el almacenamiento del navegador y, al volver, la planilla
// arranca con lo que ya estaba cargado.
//
// Es un BORRADOR de quien cuenta, no un dato del negocio: vive en ese teléfono, se borra al
// guardar el recuento y nunca viaja al servidor por sí mismo. La clave lleva el negocio y la
// persona: en un teléfono compartido por la dueña y el encargado, cada uno ve sólo lo suyo.
//
// QUÉ SE DESCARTA AL VOLVER. Lo que ya no se puede guardar tal cual:
// - un producto que salió de la planilla (se desactivó o dejó de controlar stock);
// - un conteo de hace más de un día: el servidor lo rechaza ("el conteo tiene más de un día",
//   `horaDelConteo`) y, peor, rechaza el recuento ENTERO. Se descarta y se dice cuántos;
// - algo que no tiene la forma que escribe este formulario (otra versión, datos rotos);
// - un conteo de un producto que se RECONTÓ DESPUÉS (`ultimoRecuento` de la planilla de hoy es
//   posterior a la hora de ese conteo). Es el caso de un Guardar que llegó al servidor pero cuya
//   respuesta no volvió (sin señal en la cámara, o la pestaña descartada con Guardar en curso):
//   el borrador sigue vivo y, si se volviera a guardar, el servidor descontaría la misma
//   diferencia otra vez (el ajuste del primer envío es posterior a la hora del conteo, entra en
//   "lo movido después" y el stock teórico sube de nuevo). Lo mismo si otra persona recontó
//   ese producto mientras tanto: su recuento manda. Por eso, antes de mandar, el borrador anota
//   que se está guardando (`enviadoA`) y la pantalla lo dice al volver.
//
// Sin imports de servidor: lo usan el formulario (client component) y los tests.

import { VENTANA_DE_CONTEO_MS } from "@/lib/stock/adjustment-core";

/** Una línea contada, como la tiene el formulario: el texto tipeado y la hora del teléfono. */
export type ConteoDelBorrador = { texto: string; contadoA: number };

export interface Borrador {
  v: typeof VERSION;
  /** Hora del teléfono de la última anotación. */
  guardadoA: number;
  gondola: string;
  ciego: boolean;
  nota: string;
  conteos: Record<string, ConteoDelBorrador>;
  /**
   * Hora del teléfono en que se tocó Guardar, mientras no volvió respuesta del servidor. Si el
   * borrador se recupera con esto puesto, ese Guardar pudo haber entrado.
   */
  enviadoA?: number;
}

const VERSION = 1;
/** Un texto contado no pasa de esto (el campo es una cantidad: "12,345"). */
const MAX_TEXTO = 32;
const MAX_NOTA = 500;

const esNumero = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Dónde se guarda: por negocio y por persona. */
export function claveDelBorrador(tenantId: string, userId: string): string {
  return `gsg.recuento.v${VERSION}.${tenantId}.${userId}`;
}

/**
 * Lo que se anota. `null` = no hay nada que guardar (sin conteos ni nota): el llamador borra la
 * clave, así una planilla vacía no deja un borrador vacío que después se anuncia como
 * "recuperado". Los conteos sin hora (texto vacío) no se anotan. PURA.
 */
export function serializarBorrador(
  estado: {
    gondola: string;
    ciego: boolean;
    nota: string;
    conteos: Record<string, { texto: string; contadoA: number | null }>;
    enviadoA?: number | null;
  },
  ahora: number,
): string | null {
  const conteos: Record<string, ConteoDelBorrador> = {};
  for (const [id, c] of Object.entries(estado.conteos)) {
    if (c.texto.trim() === "" || c.contadoA === null) continue;
    conteos[id] = { texto: c.texto, contadoA: c.contadoA };
  }
  if (Object.keys(conteos).length === 0 && estado.nota.trim() === "") return null;
  const b: Borrador = { v: VERSION, guardadoA: ahora, gondola: estado.gondola, ciego: estado.ciego, nota: estado.nota, conteos };
  if (esNumero(estado.enviadoA)) b.enviadoA = estado.enviadoA;
  return JSON.stringify(b);
}

/**
 * El último recuento de cada producto de la planilla, pasado al reloj del TELÉFONO. La planilla
 * trae la hora del servidor (`ultimoRecuento`) y el borrador la del teléfono (`contadoA`), y
 * los dos relojes pueden estar corridos minutos. El corrimiento se estima con la hora del
 * servidor al armar la pantalla (`ahoraServidor`) contra la del teléfono al abrirla: el viaje
 * de la página hace que el teléfono parezca atrasado unos segundos, así que el último recuento
 * cae apenas MÁS TARDE de lo real, y la duda se resuelve descartando (volver a contar un
 * producto cuesta un minuto; guardarlo dos veces deja mal el stock). PURA.
 */
export function recuentosEnHoraDelTelefono(
  productos: readonly { id: string; ultimoRecuento: string | null }[],
  ahoraServidor: number,
  ahoraTelefono: number,
): Map<string, number> {
  const corrimiento = ahoraTelefono - ahoraServidor;
  const out = new Map<string, number>();
  for (const p of productos) {
    const t = p.ultimoRecuento ? Date.parse(p.ultimoRecuento) : NaN;
    if (Number.isFinite(t)) out.set(p.id, t + corrimiento);
  }
  return out;
}

/**
 * Lo que se recupera al volver, contra la planilla de HOY (`idsValidos`) y la hora del
 * teléfono. `null` si no hay nada que recuperar. `descartados` = conteos que estaban anotados y
 * no se pueden guardar (producto que ya no está en la planilla, o contado hace más de un día).
 * `yaRecontados` = conteos de productos que se recontaron DESPUÉS de ese conteo
 * (`recontadoA`, en hora del teléfono): lo más probable, un Guardar cuya respuesta no llegó.
 * Volver a mandarlos descontaría la diferencia dos veces, así que no vuelven a la planilla.
 * La pantalla dice las dos cosas, para que nadie crea que quedaron cargados. PURA.
 */
export function leerBorrador(
  raw: string | null,
  idsValidos: ReadonlySet<string>,
  ahora: number,
  recontadoA: ReadonlyMap<string, number> = new Map(),
): { borrador: Borrador; recuperados: number; descartados: number; yaRecontados: number; seEstabaGuardando: boolean } | null {
  if (!raw) return null;
  let crudo: unknown;
  try {
    crudo = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!crudo || typeof crudo !== "object") return null;
  const o = crudo as Record<string, unknown>;
  if (o.v !== VERSION || !esNumero(o.guardadoA)) return null;
  // Un borrador de hace más de un día ya no describe el local: ni la nota se recupera.
  if (ahora - o.guardadoA > VENTANA_DE_CONTEO_MS) return null;

  const conteos: Record<string, ConteoDelBorrador> = {};
  let descartados = 0;
  let yaRecontados = 0;
  const lista = o.conteos && typeof o.conteos === "object" ? Object.entries(o.conteos as Record<string, unknown>) : [];
  for (const [id, c] of lista) {
    if (!c || typeof c !== "object") continue;
    const { texto, contadoA } = c as Record<string, unknown>;
    if (typeof texto !== "string" || texto.trim() === "" || texto.length > MAX_TEXTO || !esNumero(contadoA)) continue;
    if (!idsValidos.has(id) || ahora - contadoA > VENTANA_DE_CONTEO_MS) {
      descartados++;
      continue;
    }
    const otro = recontadoA.get(id);
    if (otro !== undefined && otro >= contadoA) {
      yaRecontados++;
      continue;
    }
    conteos[id] = { texto, contadoA };
  }
  const nota = typeof o.nota === "string" ? o.nota.slice(0, MAX_NOTA) : "";
  const recuperados = Object.keys(conteos).length;
  const seEstabaGuardando = esNumero(o.enviadoA);
  if (recuperados === 0 && nota.trim() === "" && descartados === 0 && yaRecontados === 0) return null;
  return {
    borrador: {
      v: VERSION,
      guardadoA: o.guardadoA,
      gondola: typeof o.gondola === "string" ? o.gondola : "",
      ciego: o.ciego === true,
      nota,
      conteos,
    },
    recuperados,
    descartados,
    yaRecontados,
    seEstabaGuardando,
  };
}

/**
 * Los conteos que ya no se pueden guardar por viejos (más de un día desde que se contaron),
 * con la hora del teléfono de AHORA. Sirve antes de mandar: el servidor rechaza el recuento
 * ENTERO si una sola línea pasó el día ("El conteo tiene más de un día"), y en la misma
 * sesión la planilla no se vuelve a leer del borrador. PURA.
 */
export function conteosVencidos(conteos: Record<string, { contadoA: number | null }>, ahora: number): string[] {
  return Object.entries(conteos).flatMap(([id, c]) => (c.contadoA !== null && ahora - c.contadoA > VENTANA_DE_CONTEO_MS ? [id] : []));
}

/** "hace 3 minutos" / "hace 2 horas" — cuándo se anotó lo último del borrador. PURA. */
export function haceCuanto(desde: number, ahora: number): string {
  const min = Math.max(0, Math.round((ahora - desde) / 60_000));
  if (min < 1) return "recién";
  if (min === 1) return "hace 1 minuto";
  if (min < 60) return `hace ${min} minutos`;
  const h = Math.floor(min / 60);
  return h === 1 ? "hace 1 hora" : `hace ${h} horas`;
}

/**
 * El campo que sigue al tocar "Siguiente" en el teclado del teléfono: el próximo producto de
 * la góndola y, al terminarla, `null` (la pantalla ofrece la góndola siguiente o Guardar). PURA.
 */
export function siguienteDeLaGondola(ids: readonly string[], actual: string): string | null {
  const i = ids.indexOf(actual);
  return i === -1 || i + 1 >= ids.length ? null : ids[i + 1];
}

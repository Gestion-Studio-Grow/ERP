// ============================================================================
// LA BANDEJA «PARA RESOLVER AHORA» — qué mostrar y qué hace cada botón. PURO (sin DOM ni React).
// ============================================================================
//
// Es la del club vanilla (public/previews/breakpoint/club/app.mjs, `vistaAgenda` y la acción `alerta`): la lista
// sale ENTERA del motor (`alertas`, en su orden: lo urgente primero) y lo que es sólo de un dueño se esconde a quien
// no lo es. Acá no se decide nada de plata ni de reglas: se traduce cada alerta a lo que hace su botón.
//
//   · `armarBandeja`: las alertas que ve quien opera, con su rótulo (Urgente · Atender · Aviso · Para el dueño) y
//     una firma para que la bandeja sólo se repinte si algo cambió;
//   · `queHace`: a dónde lleva cada botón (abrir el turno, devolver o cobrar la falta acá mismo, apagar la luz,
//     ofrecer el hueco por WhatsApp, ir a otra solapa).
//
// Corre sólo en el navegador (y en los tests): el motor tiene un contador de ids de módulo.

import { ALERTAS_POSPONIBLES, alertas, cancha as canchaDe, claveDeAlerta, hhmm, mensajeWhatsApp, ofertasEspera, posponerAlerta } from "@/lib/club/motor.mjs";
import type { Ahora, Alerta, Auth, EstadoClub, Fecha, NivelAlerta, TipoAlerta } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";
import type { TipoMarca } from "@/components/ui/Marca";
import { celularDeLaEspera, enlaceWhatsApp, type EnlaceWhatsApp, type ModoDelClub } from "./whatsapp-core";

export interface ItemBandeja {
  /** Estable entre armados (tipo + a qué se refiere): `key` de React y para recordar cuál está abierta. */
  clave: string;
  nivel: NivelAlerta;
  /** «Urgente» · «Atender» · «Aviso» · «Para el dueño» (los del vanilla). */
  rotulo: string;
  marca: TipoMarca;
  texto: string;
  /** El texto del botón, tal cual lo da el motor. */
  accion: string;
  alerta: Alerta;
}

export interface VistaBandeja {
  items: ItemBandeja[];
  /** Cuántas son urgentes (nivel alta): el contador de arriba. */
  urgentes: number;
  firma: string;
}

function rotuloDe(a: Alerta): { rotulo: string; marca: TipoMarca } {
  if (a.paraDuenio) return { rotulo: "Para el dueño", marca: "info" };
  if (a.nivel === "alta") return { rotulo: "Urgente", marca: "atencion" };
  if (a.nivel === "media") return { rotulo: "Atender", marca: "pendiente" };
  return { rotulo: "Aviso", marca: "info" };
}

/** La del motor (`claveDeAlerta`): la misma que guarda una alerta pospuesta. */
const claveDe = (a: Alerta): string => claveDeAlerta(a);

/**
 * Lo que ve quien opera: TODAS las alertas del motor, en su orden, menos las que son sólo de un dueño si quien
 * opera no lo es (el vanilla: `!a.paraDuenio || esDuenio()`).
 */
export function armarBandeja(estado: EstadoClub, ahora: Ahora, esDuenio: boolean): VistaBandeja {
  const vistas = new Map<string, number>();
  const items = alertas(estado, ahora)
    .filter((a) => !a.paraDuenio || esDuenio)
    .map((a): ItemBandeja => {
      // Dos alertas del mismo tipo sobre lo mismo no pasan hoy; si pasaran, la clave sigue siendo única.
      const base = claveDe(a);
      const n = vistas.get(base) ?? 0;
      vistas.set(base, n + 1);
      return { clave: n ? `${base}#${n}` : base, nivel: a.nivel, ...rotuloDe(a), texto: a.texto, accion: a.accion, alerta: a };
    });
  const urgentes = items.filter((i) => i.nivel === "alta").length;
  return { items, urgentes, firma: items.map(firmaDelItem).join("|") };
}

function firmaDelItem(i: ItemBandeja): string {
  return JSON.stringify([i.clave, i.nivel, i.rotulo, i.marca, i.texto, i.accion, i.alerta.canchaId ?? null, i.alerta.inicio ?? null]);
}

/**
 * Reusa lo que no cambió: si la bandeja entera es igual, la MISMA vista (no se repinta); si no, las alertas que siguen
 * iguales como el MISMO objeto (React sólo pinta las nuevas o las que cambiaron).
 */
export function compartirBandeja<V extends { items: ItemBandeja[]; firma: string }>(previa: V | undefined, nueva: V): V {
  if (!previa) return nueva;
  if (previa.firma === nueva.firma) return previa;
  const viejas = new Map(previa.items.map((i) => [i.clave, i]));
  const items = nueva.items.map((i) => {
    const v = viejas.get(i.clave);
    return v && firmaDelItem(v) === firmaDelItem(i) ? v : i;
  }) as V["items"];
  return { ...nueva, items };
}

/** Lo que hace el botón de una alerta. */
export type QueHace =
  /** Abre la cuenta del turno (en su día), en la agenda. */
  | { tipo: "verTurno"; reservaId: string }
  /** Se resuelve acá mismo, eligiendo el medio: devolver en mano (sale de la caja) o cobrar la falta (entra). */
  | { tipo: "devolver"; reservaId: string }
  | { tipo: "cobrarFalta"; reservaId: string }
  | { tipo: "apagarLuz"; canchaId: string }
  /** El mensaje para el de la lista de espera y, si dice que sí, darle el turno. */
  | { tipo: "ofrecerEspera"; esperaId: string; canchaId: string; inicio: number; mensaje: string; whatsapp: EnlaceWhatsApp }
  /** Va a otra solapa; si no está, `siNoEsta` es lo que se le dice a quien opera. */
  | { tipo: "solapa"; solapa: string; siNoEsta: string };

/**
 * A dónde lleva cada botón (la acción `alerta` del vanilla, en el mismo orden de decisión):
 *   · devolución y falta sin ficha → se resuelven acá con el medio;
 *   · cualquier otra con turno (seña, no llegó, llega, terminó, termina) → se abre el turno;
 *   · luz sin juego → se apaga;
 *   · lluvia y mantenimiento → «Mantenimiento y lluvia»;
 *   · autorización y acceso → el Tablero del dueño;
 *   · stock → la solapa de stock (si quien opera no la tiene: «Avisale al dueño: hay que reponer.»);
 *   · lista de espera → el mensaje de WhatsApp y «Dijo que sí: reservar»;
 *   · pedido de la tienda → la solapa Tienda (el vanilla no lo resolvía: el botón no hacía nada).
 */
/**
 * `modo`: con datos reales, la oferta va al celular de quien espera (el anotado o el de su ficha), normalizado a formato
 * argentino; en la demo, sin número (whatsapp-core.ts).
 */
export function queHace(estado: EstadoClub, a: Alerta, modo: ModoDelClub): QueHace | null {
  if (a.tipo === "devolucion" && a.reservaId) return { tipo: "devolver", reservaId: a.reservaId };
  if (a.tipo === "falta_sin_ficha" && a.reservaId) return { tipo: "cobrarFalta", reservaId: a.reservaId };
  if (a.reservaId) return { tipo: "verTurno", reservaId: a.reservaId };
  switch (a.tipo) {
    case "luz":
      return a.canchaId ? { tipo: "apagarLuz", canchaId: a.canchaId } : null;
    case "lluvia":
    case "mantenimiento":
      return { tipo: "solapa", solapa: "canchas", siNoEsta: "Andá a «Mantenimiento y lluvia»." };
    case "autorizacion":
      return { tipo: "solapa", solapa: "tablero", siNoEsta: "El pedido de crédito lo resuelve un dueño: avisale por WhatsApp para que te pase el código." };
    case "acceso":
      return { tipo: "solapa", solapa: "tablero", siNoEsta: "El pedido de acceso lo resuelve un dueño desde su tablero." };
    case "stock":
      return { tipo: "solapa", solapa: "stock", siNoEsta: "Avisale al dueño: hay que reponer." };
    case "pedido":
      return { tipo: "solapa", solapa: "tienda", siNoEsta: "Andá a la solapa «Tienda»." };
    // Tanda 2B: la caja (sin cerrar, o el cierre que no cuadró), el pago que vence y lo que chocó entre puestos.
    case "caja":
    case "cierreConDiferencia":
      return { tipo: "solapa", solapa: "caja", siNoEsta: "Andá a la solapa «Caja»." };
    case "vencePago":
      return { tipo: "solapa", solapa: "proveedores", siNoEsta: "El pago a proveedores lo ve un dueño." };
    case "aparte":
      return { tipo: "solapa", solapa: "configuracion", siNoEsta: "Lo que chocó entre puestos lo revisa un dueño en Configuración." };
    case "espera": {
      const e = estado.espera.find((x) => x.id === a.esperaId);
      const c = a.canchaId ? canchaDe(estado, a.canchaId) : undefined;
      if (!e || !c || a.inicio === undefined) return null;
      const mensaje = mensajeWhatsApp("espera", { nombre: e.titular.split(" ")[0], cancha: c.nombre, hora: hhmm(a.inicio), fecha: "hoy" });
      return { tipo: "ofrecerEspera", esperaId: e.id, canchaId: c.id, inicio: a.inicio, mensaje, whatsapp: enlaceWhatsApp(celularDeLaEspera(estado, e), mensaje, modo) };
    }
    default:
      return null;
  }
}

export type OfertaDeHueco = Extract<QueHace, { tipo: "ofrecerEspera" }>;

/**
 * El hueco que se acaba de liberar (cancelar, la falta, «esta semana no vienen»), ofrecido a quienes esperan ese día y
 * a esa hora: el `ofrecer` del club de hoy, con el mismo mensaje y el mismo «Dijo que sí: reservar» de la bandeja.
 */
export function ofertasDelHueco(estado: EstadoClub, hueco: { fecha: Fecha; canchaId: string; inicio: number; duracion: number }, hoy: Fecha, modo: ModoDelClub): OfertaDeHueco[] {
  const c = canchaDe(estado, hueco.canchaId);
  if (!c) return [];
  const fecha = hueco.fecha === hoy ? "hoy" : `${Number(hueco.fecha.slice(8))}/${Number(hueco.fecha.slice(5, 7))}`;
  return ofertasEspera(estado, hueco.fecha, hueco.canchaId, hueco.inicio, hueco.duracion).map((e) => {
    const mensaje = mensajeWhatsApp("espera", { nombre: e.titular.split(" ")[0], cancha: c.nombre, hora: hhmm(hueco.inicio), fecha });
    return { tipo: "ofrecerEspera", esperaId: e.id, canchaId: c.id, inicio: hueco.inicio, mensaje, whatsapp: enlaceWhatsApp(celularDeLaEspera(estado, e), mensaje, modo) };
  });
}

// ── dos bandejas: Mostrador (Agenda) y Dueño (Tablero) · Tanda 2B ─────────────────────────────────────────────────

/** Lo que va en las DOS bandejas (le importa a quien esté): la caja que quedó sin cerrar. */
const PARA_LOS_DOS: ReadonlySet<TipoAlerta> = new Set(["caja"]);
/** La plata pendiente no va en la lista de alertas: tiene su sección propia, de cualquier día (plata-pendiente-core.ts). */
const DE_LA_PLATA: ReadonlySet<TipoAlerta> = new Set(["devolucion", "falta_sin_ficha"]);

/**
 * Parte las alertas del motor por bandeja: `mostrador` (la Agenda: lo del día de la recepción y la caja) y `duenio` (el
 * Tablero: lo que sólo resuelve un dueño y la caja). La plata pendiente no va en ninguna: tiene su sección. Mantiene el
 * orden del motor (lo urgente primero).
 */
export function partir(lista: readonly Alerta[]): { mostrador: Alerta[]; duenio: Alerta[] } {
  const mostrador: Alerta[] = [];
  const duenio: Alerta[] = [];
  for (const a of lista) {
    if (DE_LA_PLATA.has(a.tipo)) continue;
    if (PARA_LOS_DOS.has(a.tipo)) {
      mostrador.push(a);
      duenio.push(a);
    } else if (a.paraDuenio) duenio.push(a);
    else mostrador.push(a);
  }
  return { mostrador, duenio };
}

/** Plazo de una alerta en la bandeja del dueño: urgente (alta) · hoy (media) · esta semana (info). */
export type Plazo = "urgente" | "hoy" | "semana";
const PLAZO: Record<NivelAlerta, Plazo> = { alta: "urgente", media: "hoy", info: "semana" };
export const TITULO_DEL_PLAZO: Record<Plazo, string> = { urgente: "Urgente", hoy: "Hoy", semana: "Esta semana" };

export interface ItemDeBandeja extends ItemBandeja {
  /** Se puede dejar para mañana (`ALERTAS_POSPONIBLES` del motor). */
  posponible: boolean;
  plazo: Plazo;
}

export interface VistaDeDosBandejas {
  mostrador: ItemDeBandeja[];
  duenio: ItemDeBandeja[];
  /** Urgentes de cada una (el contador de arriba). */
  urgentesMostrador: number;
  urgentesDuenio: number;
  firma: string;
}

function itemsDe(lista: readonly Alerta[], vistas: Map<string, number>): ItemDeBandeja[] {
  return lista.map((a) => {
    const base = claveDe(a);
    const n = vistas.get(base) ?? 0;
    vistas.set(base, n + 1);
    return {
      clave: n ? `${base}#${n}` : base,
      nivel: a.nivel,
      ...rotuloDe(a),
      texto: a.texto,
      accion: a.accion,
      alerta: a,
      posponible: (ALERTAS_POSPONIBLES as readonly string[]).includes(a.tipo),
      plazo: PLAZO[a.nivel],
    };
  });
}

/**
 * Las dos bandejas para quien opera. A quien no es dueño, la del dueño le llega vacía (ni la ve ni la cuenta): el motor
 * vuelve a controlar al resolver cada cosa.
 */
export function armarDosBandejas(estado: EstadoClub, ahora: Ahora, esDuenio: boolean): VistaDeDosBandejas {
  const { mostrador, duenio } = partir(alertas(estado, ahora));
  const m = itemsDe(mostrador, new Map());
  const d = esDuenio ? itemsDe(duenio, new Map()) : [];
  const firma = [...m, ...d.map((i) => ({ ...i, clave: `d:${i.clave}` }))].map(firmaDelItem).join("|");
  return { mostrador: m, duenio: d, urgentesMostrador: m.filter((i) => i.nivel === "alta").length, urgentesDuenio: d.filter((i) => i.nivel === "alta").length, firma };
}

export interface VistaDeUnaBandeja {
  items: ItemDeBandeja[];
  urgentes: number;
  firma: string;
}
const unaBandeja = (items: ItemDeBandeja[]): VistaDeUnaBandeja => ({ items, urgentes: items.filter((i) => i.nivel === "alta").length, firma: items.map(firmaDelItem).join("|") });

/**
 * La bandeja del MOSTRADOR (Agenda). No depende de quién opera: lo del dueño ya no está acá (va al Tablero), así que
 * cambiar de operador no la repinta.
 */
export function bandejaDelMostrador(estado: EstadoClub, ahora: Ahora): VistaDeUnaBandeja {
  return unaBandeja(itemsDe(partir(alertas(estado, ahora)).mostrador, new Map()));
}
/** La bandeja del DUEÑO (Tablero): quién la ve lo decide quien la monta (el Tablero, sólo a un dueño). */
export function bandejaDelDuenio(estado: EstadoClub, ahora: Ahora): VistaDeUnaBandeja {
  return unaBandeja(itemsDe(partir(alertas(estado, ahora)).duenio, new Map()));
}

/** Lo que la bandeja hace sin ir a otro lado (comando `bandeja` de la lista blanca). */
export type AccionBandeja = { tipo: "posponer"; clave: string };

export function ejecutarBandeja(estado: EstadoClub, accion: AccionBandeja, ahora: Ahora, auth: Auth): Desenlace {
  if (accion.tipo === "posponer") {
    const res = posponerAlerta(estado, accion.clave, auth, ahora);
    if (!res.ok) return { ok: false, mensaje: res.motivo };
    const d = res.hasta;
    return { ok: true, mensaje: `Listo: vuelve a aparecer el ${Number(d.slice(8))}/${Number(d.slice(5, 7))} si sigue pendiente.` };
  }
  return { ok: false, mensaje: "Esta operación no se reconoce. Recargá la página." };
}

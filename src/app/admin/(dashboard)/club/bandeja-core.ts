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

import { alertas, cancha as canchaDe, hhmm, mensajeWhatsApp } from "@/lib/club/motor.mjs";
import type { Ahora, Alerta, EstadoClub, NivelAlerta } from "@/lib/club/motor.mjs";
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

function claveDe(a: Alerta): string {
  const ref = a.reservaId ?? a.pedidoId ?? a.novedadId ?? a.solicitudId ?? a.esperaId ?? a.productoId ?? a.canchaId ?? "";
  return `${a.tipo}:${ref}`;
}

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
export function compartirBandeja(previa: VistaBandeja | undefined, nueva: VistaBandeja): VistaBandeja {
  if (!previa) return nueva;
  if (previa.firma === nueva.firma) return previa;
  const viejas = new Map(previa.items.map((i) => [i.clave, i]));
  const items = nueva.items.map((i) => {
    const v = viejas.get(i.clave);
    return v && firmaDelItem(v) === firmaDelItem(i) ? v : i;
  });
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

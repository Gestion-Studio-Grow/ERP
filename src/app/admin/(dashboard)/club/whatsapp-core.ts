// ============================================================================
// WHATSAPP DEL CLUB — los avisos al cliente, listos para mandar. PURO.
// ============================================================================
//
// Los mismos cuatro avisos del club vanilla (public/previews/breakpoint/club/app.mjs), con los textos del motor
// (`mensajeWhatsApp`: una sola fuente; whatsapp-core.test.ts los compara contra el texto esperado):
//   · la confirmación al dar el turno (con la seña, el alias y el código si pide seña);
//   · el recordatorio desde el turno;
//   · el aviso de lluvia (movido a techada, suspendido con crédito o sin cargo, o con plata para devolver);
//   · la oferta del hueco a la lista de espera;
//   · «Compartir lo libre» (`textoLoLibre`, bp-DISENO §3.16 · Rec. 48): la respuesta a la pregunta más común («¿tenés
//     cancha hoy a la noche?») con los huecos de la duración de siempre, el precio y el link del turnero.
//
// Nada se manda solo: el link abre WhatsApp con el texto escrito y la persona aprieta enviar.
//   · En la DEMO el link abre sin número (se elige el chat), como en el vanilla: los teléfonos de ejemplo podrían
//     ser de alguien real.
//   · Con datos reales va al celular del cliente, normalizado a formato argentino (549 + área + número, sin el 0 ni
//     el 15): `waLinkClienta` de src/lib/whatsapp-cta.ts, el mismo helper del resto del ERP.
//   · Sin celular (o con uno que no es un número argentino), el link abre para elegir el chat y la pantalla lo
//     dice: nunca un link a un número roto.

import { cancha as canchaDe, cliente as clienteDe, diaSemana, hhmm, horarioDe, mensajeWhatsApp, minutosHasta, pesos, precioTurno, reserva as reservaDe, sumarDias, validarHueco } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub, Espera, Fecha, Reserva, ResultadoLluvia } from "@/lib/club/motor.mjs";
import { normalizarTelefono } from "@/lib/clientes/telefono";
import { buildWhatsAppHref, waLinkClienta } from "@/lib/whatsapp-cta";

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;

/** «mié 14/10», como el vanilla. */
export const fechaCorta = (f: Fecha) => `${DIAS[diaSemana(f)]} ${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;

/** El nombre de pila, como el vanilla (`titular.split(" ")[0]`). */
const dePila = (titular: string) => titular.split(" ")[0];

export type ModoDelClub = "demo" | "real";

export interface EnlaceWhatsApp {
  href: string;
  texto: string;
  /** true: abre el chat del cliente; false: WhatsApp abre para elegir el chat. */
  directo: boolean;
  /** Por qué abre sin número (null si va directo). */
  nota: string | null;
}

export const NOTA_DEMO = "En la demo WhatsApp abre sin número: elegís el chat (los teléfonos de ejemplo podrían ser de alguien real).";
export const NOTA_SIN_CELULAR = "No tiene celular cargado: WhatsApp abre para que elijas el chat.";
export const NOTA_CELULAR_RARO = "El celular cargado no parece un número argentino: WhatsApp abre para que elijas el chat.";

/**
 * ¿La clave (área + número, 10 dígitos) empieza con un código de área argentino? Son 11 (el único de dos dígitos) o
 * empiezan con 2 o 3. `waLinkClienta` mira sólo el largo: «15 4000-7919» (el 15 sin el área) mide 10 y pasaría.
 */
const AREA_ARGENTINA = /^(11|[23])/;

/** El link de WhatsApp a un cliente: directo a su celular (formato argentino) o, si no se puede, para elegir el chat. */
export function enlaceWhatsApp(tel: string | null | undefined, texto: string, modo: ModoDelClub): EnlaceWhatsApp {
  const elegir = buildWhatsAppHref("", texto);
  if (modo === "demo") return { href: elegir, texto, directo: false, nota: NOTA_DEMO };
  const directo = AREA_ARGENTINA.test(normalizarTelefono(tel)) ? waLinkClienta(tel, texto) : null;
  if (directo) return { href: directo, texto, directo: true, nota: null };
  return { href: elegir, texto, directo: false, nota: String(tel ?? "").trim() ? NOTA_CELULAR_RARO : NOTA_SIN_CELULAR };
}

/** El celular del titular del turno (el de su ficha), o "" si no tiene ficha. */
export function celularDelTurno(estado: EstadoClub, r: Pick<Reserva, "clienteId">): string {
  return (r.clienteId && clienteDe(estado, r.clienteId)?.tel) || "";
}

/** El celular de quien espera: el que se anotó o el de su ficha. */
export function celularDeLaEspera(estado: EstadoClub, e: Pick<Espera, "tel" | "clienteId">): string {
  return e.tel?.trim() || (e.clienteId && clienteDe(estado, e.clienteId)?.tel) || "";
}

// ───────────── los textos (del motor) ─────────────

/** La confirmación al reservar (app.mjs, «Turno reservado ✔»). */
export function textoConfirmacion(estado: EstadoClub, r: Reserva): string {
  return mensajeWhatsApp("confirmacion", {
    nombre: dePila(r.titular),
    cancha: canchaDe(estado, r.canchaId)?.nombre ?? "",
    fecha: fechaCorta(r.fecha),
    hora: hhmm(r.inicio),
    sena: r.sena.monto ? pesos(r.sena.monto) : "",
    alias: estado.config.cobro?.alias,
    ref: r.ref,
  });
}

/** El recordatorio desde el turno (app.mjs, botón «WhatsApp» del turno reservado o en juego). */
export function textoRecordatorio(estado: EstadoClub, r: Reserva): string {
  return mensajeWhatsApp("recordatorio", { nombre: dePila(r.titular), hora: hhmm(r.inicio), cancha: canchaDe(estado, r.canchaId)?.nombre ?? "" });
}

/** ¿Se le manda el recordatorio? Como el vanilla: mientras el turno está reservado o en juego. */
export const recordatorioDisponible = (r: Pick<Reserva, "estado">) => r.estado === "reservada" || r.estado === "en_cancha";

/** La oferta del hueco a quien espera (app.mjs, la bandeja: «Ofrecer el hueco»). */
export function textoOfertaEspera(estado: EstadoClub, e: Pick<Espera, "titular" | "fecha">, canchaId: string, inicio: number, hoy: Fecha): string {
  return mensajeWhatsApp("espera", { nombre: dePila(e.titular), cancha: canchaDe(estado, canchaId)?.nombre ?? "", hora: hhmm(inicio), fecha: e.fecha === hoy ? "hoy" : fechaCorta(e.fecha) });
}

export interface AvisoLluvia {
  reservaId: string;
  titular: string;
  /** Qué le pasó al turno, en una línea. */
  que: string;
  /** El texto para mandar; null si estaban jugando (se cobra lo jugado y se cierra la cancha: no hay aviso). */
  texto: string | null;
  celular: string;
}

/** Los avisos después de aplicar el plan lluvia (app.mjs, «Plan lluvia aplicado»). Se arma con el estado YA aplicado. */
export function avisosLluvia(estado: EstadoClub, resultado: readonly ResultadoLluvia[]): AvisoLluvia[] {
  return resultado.map((x) => {
    const r = reservaDe(estado, x.reservaId);
    const hora = r ? hhmm(r.inicio) : "";
    const nombre = dePila(x.titular);
    const celular = r ? celularDelTurno(estado, r) : "";
    if (x.accion === "cortado") {
      return { reservaId: x.reservaId, titular: x.titular, que: `estaban jugando: ${x.noJugados}′ sin jugar, se reconocen ${pesos(x.credito ?? 0)}. Cobrá lo jugado y cerrá la cancha.`, texto: null, celular };
    }
    const texto =
      x.accion === "movido"
        ? mensajeWhatsApp("lluvia_movido", { nombre, hora, cancha: x.cancha })
        : x.devolverEnMano
          ? mensajeWhatsApp("lluvia_devolucion", { nombre, hora, monto: pesos(x.devolverEnMano) })
          : mensajeWhatsApp("lluvia_suspendido", { nombre, hora, credito: x.credito ? pesos(x.credito) : "" });
    const que =
      x.accion === "movido"
        ? `pasa a ${x.cancha}`
        : `suspendido${x.credito ? `, ${pesos(x.credito)} como crédito` : x.devolverEnMano ? `, hay que devolverle ${pesos(x.devolverEnMano)}` : ""}`;
    return { reservaId: x.reservaId, titular: x.titular, que, texto, celular };
  });
}

// ───────────── «Compartir lo libre» ─────────────

/** El día que se comparte: hoy o mañana (la pregunta de todos los días). */
export type DiaLibre = "hoy" | "manana";
/** La franja: la tarde (14 a 18), la noche (desde las 18 hasta el cierre) o todo el día. */
export type FranjaLibreWa = "tarde" | "noche" | "todo";

export const FRANJAS_LIBRE: Readonly<Record<FranjaLibreWa, { texto: string; desde: number | null; hasta: number | null }>> = {
  tarde: { texto: "a la tarde", desde: 14 * 60, hasta: 18 * 60 },
  noche: { texto: "a la noche", desde: 18 * 60, hasta: null },
  todo: { texto: "", desde: null, hasta: null },
};

/** Cuántos renglones de horarios entran en el mensaje (más, es ruido en el chat). */
export const MAX_RENGLONES_LIBRE = 8;

export interface RenglonLibre {
  inicio: number;
  canchas: string[];
  /** El precio del turno a esa hora (si cambia entre canchas, el más barato: «desde»). */
  precio: number;
  desde: boolean;
}

/**
 * Los huecos libres de `duracion` (la de siempre: `config.duracionTurno`) que ARRANCAN en la franja, sin pisarse dentro de
 * cada cancha (18:00 y 19:30, no 18:00, 18:30, 19:00…: lo que de verdad se puede dar), agrupados por hora. Hoy, sólo lo
 * que todavía no empezó. PURO.
 */
export function loLibre(estado: EstadoClub, fecha: Fecha, franja: FranjaLibreWa, ahora: Ahora, duracion = estado.config.duracionTurno): RenglonLibre[] {
  const { abre, cierra } = horarioDe(estado, fecha);
  const f = FRANJAS_LIBRE[franja];
  const desde = Math.max(abre, f.desde ?? abre);
  const hasta = Math.min(cierra, f.hasta ?? cierra);
  const { paso } = estado.config;
  const porHora = new Map<number, { canchas: string[]; precios: number[] }>();
  for (const c of estado.canchas) {
    let m = Math.ceil(desde / paso) * paso;
    while (m < hasta) {
      const hueco = { canchaId: c.id, fecha, inicio: m, duracion };
      if (minutosHasta(ahora, fecha, m) >= 0 && validarHueco(estado, hueco).ok) {
        const h = porHora.get(m) ?? { canchas: [], precios: [] };
        h.canchas.push(c.nombre);
        h.precios.push(precioTurno(estado, hueco));
        porHora.set(m, h);
        m += duracion;
      } else m += paso;
    }
  }
  return [...porHora.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([inicio, h]) => ({ inicio, canchas: h.canchas, precio: Math.min(...h.precios), desde: new Set(h.precios).size > 1 }));
}

const unirCanchas = (n: string[]) => (n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} y ${n.at(-1)}`);

/**
 * El texto para mandar por WhatsApp: «¡Hola! Esto es lo que nos queda libre hoy (mié 14/10) a la noche, turnos de 90
 * min: • 18:00 · Cancha 1 y Cancha 3 · $ 42.000 …» con el link del turnero (si hay) para reservar. Sin nada libre, lo
 * dice y ofrece otro horario. En criollo, voz del club.
 */
export function textoLoLibre(estado: EstadoClub, dia: DiaLibre, franja: FranjaLibreWa, ahora: Ahora, link?: string | null): string {
  const fecha = dia === "hoy" ? ahora.fecha : sumarDias(ahora.fecha, 1);
  const duracion = estado.config.duracionTurno;
  const renglones = loLibre(estado, fecha, franja, ahora, duracion);
  const cuando = `${dia === "hoy" ? "hoy" : "mañana"} (${fechaCorta(fecha)})${FRANJAS_LIBRE[franja].texto ? ` ${FRANJAS_LIBRE[franja].texto}` : ""}`;
  const club = estado.config.nombre?.trim();
  if (!renglones.length) return `¡Hola! ${cuando.charAt(0).toUpperCase()}${cuando.slice(1)} no nos queda cancha libre para ${duracion} min${club ? ` en ${club}` : ""}. ¿Te sirve otro horario? Decime y te busco lugar.`;
  const lineas = renglones.slice(0, MAX_RENGLONES_LIBRE).map((r) => `• ${hhmm(r.inicio)} · ${unirCanchas(r.canchas)} · ${r.desde ? "desde " : ""}${pesos(r.precio)}`);
  if (renglones.length > MAX_RENGLONES_LIBRE) lineas.push("• …y algunos horarios más.");
  return [
    `¡Hola! Esto es lo que nos queda libre${club ? ` en ${club}` : ""} ${cuando}, turnos de ${duracion} min:`,
    ...lineas,
    link ? `Reservalo desde acá: ${link}` : "",
    link ? "O contestame por acá y te lo guardo." : "Contestame por acá y te lo guardo.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** El link para compartir lo libre: WhatsApp abre para elegir el chat (es para quien preguntó, no para una ficha). */
export function enlaceLoLibre(texto: string): string {
  return buildWhatsAppHref("", texto);
}

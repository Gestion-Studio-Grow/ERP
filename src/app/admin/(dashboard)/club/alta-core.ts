// ============================================================================
// DAR UN TURNO — el alta desde la agenda. PURO.
// ============================================================================
//
// Recepción toca una franja libre (o «+ Turno») y carga: la cancha, la hora, cuánto dura y a nombre de quién. La
// pantalla sólo ofrece horarios que el motor acepta (`huecosLibres`: no se pisa con otro turno ni con un bloqueo,
// dentro del horario del día y alineado a la grilla) y muestra, ANTES de reservar, el precio (valle/pico integrado
// minuto a minuto por `precioTurno`) y si pide seña (`requiereSena`: reincidentes, con deuda, sin ficha). Reservar
// es `crearReserva`, que vuelve a validar todo: la pantalla propone, el motor decide.

import { buscarClientes, cancha as canchaDe, crearReserva, franjaDe, hhmm, huecosLibres, minutosHasta, pesos, precioTurno, requiereSena, validarHueco } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub, Fecha, TipoReserva } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";

export const DURACIONES = [60, 90, 120] as const;
export const TIPOS_ALTA: readonly { valor: Extract<TipoReserva, "turno" | "clase" | "abierto">; etiqueta: string }[] = [
  { valor: "turno", etiqueta: "Turno" },
  { valor: "clase", etiqueta: "Clase" },
  { valor: "abierto", etiqueta: "Partido abierto" },
];

export interface DatosAlta {
  canchaId: string;
  fecha: Fecha;
  inicio: number;
  duracion: number;
  tipo: "turno" | "clase" | "abierto";
  titular: string;
  clienteId: string | null;
  /** Los demás jugadores, separados por coma (hasta 3). */
  otros: string;
}

/** Los horarios libres de una cancha para esa duración, que todavía no pasaron. */
export function horariosLibres(estado: EstadoClub, fecha: Fecha, canchaId: string, duracion: number, ahora: Ahora): { min: number; texto: string }[] {
  return huecosLibres(estado, fecha, canchaId, duracion)
    .filter((m) => minutosHasta(ahora, fecha, m) + duracion > 0)
    .map((m) => ({ min: m, texto: `${hhmm(m)} a ${hhmm(m + duracion)}` }));
}

export type Previa =
  | { ok: true; precio: number; franja: "pico" | "valle"; pideSena: boolean; texto: string }
  | { ok: false; motivo: string };

/** Lo que va a costar y si pide seña, antes de reservar (o por qué no se puede). */
export function previaDelTurno(estado: EstadoClub, d: Pick<DatosAlta, "canchaId" | "fecha" | "inicio" | "duracion" | "tipo" | "clienteId">): Previa {
  const v = validarHueco(estado, d);
  if (!v.ok) return { ok: false, motivo: v.motivo };
  const precio = precioTurno(estado, d);
  const franja = franjaDe(estado, d.fecha, d.inicio);
  // Si pide seña lo dice el motor (`requiereSena`); el monto exacto lo calcula `crearReserva` al reservar (y se ve en
  // el aviso y en la cuenta). Acá no se recalcula para no duplicar la regla (motor.mjs: `senaMonto`).
  const pideSena = requiereSena(estado, d.clienteId, d.tipo);
  const texto = `${pesos(precio)} · ${franja === "pico" ? "horario pico" : "horario valle"}${pideSena ? ` · pide seña (${estado.config.politica.senaPct} %)` : " · sin seña"}`;
  return { ok: true, precio, franja, pideSena, texto };
}

/** Fichas que coinciden con lo que se tipea (hasta 5), para atar el turno a un cliente. */
export function clientesQueCoinciden(estado: EstadoClub, texto: string): { id: string; nombre: string; detalle: string }[] {
  if (texto.trim().length < 2) return [];
  return buscarClientes(estado, texto)
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      detalle: [c.deuda > 0 ? `debe ${pesos(c.deuda)}` : null, c.monedero > 0 ? `créditos ${pesos(c.monedero)}` : null, c.strikes > 0 ? `${c.strikes} falta${c.strikes > 1 ? "s" : ""}` : null]
        .filter(Boolean)
        .join(" · "),
    }));
}

/** Reserva el turno. Devuelve el aviso y el id del turno nuevo (para abrir su cuenta). */
export function reservar(estado: EstadoClub, d: DatosAlta, ahora: Ahora): Desenlace & { reservaId?: string } {
  const otros = d.otros
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 3);
  const titular = d.titular.trim();
  const res = crearReserva(
    estado,
    {
      canchaId: d.canchaId,
      fecha: d.fecha,
      inicio: d.inicio,
      duracion: d.duracion,
      tipo: d.tipo,
      clienteId: d.clienteId,
      titular,
      jugadores: titular ? [d.clienteId ? { nombre: titular, clienteId: d.clienteId } : titular, ...otros] : undefined,
    },
    ahora,
  );
  if (!res.ok) return { ok: false, mensaje: res.motivo };
  const r = res.reserva;
  const sena = r.sena.monto > 0 ? ` Pide seña de ${pesos(r.sena.monto)}${r.ref ? ` (código ${r.ref} para la transferencia)` : ""}.` : "";
  const liberadas = res.liberadas.length ? ` Se liberó la seña de ${res.liberadas.map((x) => x.cliente).join(", ")}: vuelve como crédito.` : "";
  return {
    ok: true,
    reservaId: r.id,
    mensaje: `Turno de ${r.titular} en ${canchaDe(estado, r.canchaId)?.nombre ?? "la cancha"}, ${hhmm(r.inicio)} a ${hhmm(r.inicio + r.duracion)}: ${pesos(r.precio)}.${sena}${liberadas}`,
  };
}

// ============================================================================
// VENDER (hoja global, tecla V) — lo que no es pantalla: pasar la venta a una cuenta y el lector. PURO.
// ============================================================================
//
// La hoja «Vender» (VentaDeMostrador.tsx → `HojaDeVender`) cobra de una con el comando «venta» de siempre
// (`venderEnMostrador`, buffet-mesa-core.ts: entra a la caja con su medio). Lo nuevo vive acá:
//   · «Pasar a la cuenta de…» (BP-043): el carrito entero a la cuenta ABIERTA de alguien, como cargos (baja el stock),
//     sin tocar la caja: se cobra cuando se cobre esa cuenta. Todo o nada: si un producto no alcanza, no se carga
//     ninguno. Viaja como el comando «ventaACuenta» (comandos-core.ts), re-aplicable byte a byte.
//   · El lector de códigos «siempre escuchando»: un lector de barras tipea el código muy rápido y termina con Enter.
//     Con la hoja abierta, aunque el foco esté en un favorito o en un − / +, esas teclas rápidas se juntan y el Enter
//     final da el código (y no aprieta el botón enfocado). Lo que tipea una persona, más lento, no se toma.

import { cargarEnCuenta, cuenta as cuentaDe, pesos, producto as productoDe } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";
import { aCobrarDe } from "./buffet-core";
import type { Carrito } from "./buffet-mesa-core";

/** Las cuentas a las que se puede pasar la venta: las abiertas a nombre de alguien (no las del mostrador). */
export interface CuentaParaPasar {
  id: string;
  titular: string;
  /** Lo que debe hoy esa cuenta (antes de sumarle esto). */
  debe: number;
}

export function cuentasParaPasar(estado: EstadoClub): CuentaParaPasar[] {
  return estado.cuentas
    .filter((c) => c.estado === "abierta" && !String(c.reservaId ?? "").startsWith("mostrador"))
    .map((c) => ({ id: c.id, titular: c.titular, debe: aCobrarDe(estado, c) }))
    .sort((a, b) => a.titular.localeCompare(b.titular, "es"));
}

const lineasDe = (carrito: Carrito) =>
  Object.entries(carrito ?? {})
    .map(([productoId, cant]) => ({ productoId, cant: Math.round(Number(cant)) }))
    .filter((l) => l.cant > 0);

/**
 * El carrito de la hoja a la cuenta abierta `cuentaId` (MUTA el estado). Valida todo ANTES de cargar nada: la cuenta,
 * cada producto (que exista, esté activo y no sea de alquiler) y el stock. La caja no se toca.
 */
export function pasarVentaACuenta(estado: EstadoClub, cuentaId: string, carrito: Carrito, ahora: Ahora): Desenlace {
  const cta = cuentaDe(estado, cuentaId);
  if (!cta || cta.estado !== "abierta") return { ok: false, mensaje: "Esa cuenta ya no está abierta: elegí otra." };
  const lineas = lineasDe(carrito);
  if (!lineas.length) return { ok: false, mensaje: "No hay nada cargado." };
  let total = 0;
  for (const { productoId, cant } of lineas) {
    const p = productoDe(estado, productoId);
    if (!p || p.activo === false) return { ok: false, mensaje: "No encuentro un producto: sacalo y volvé a cargarlo." };
    if (p.alquiler) return { ok: false, mensaje: `${p.nombre} es de alquiler: va a la cuenta de un jugador desde su turno.` };
    if (p.stock != null && p.stock < cant) return { ok: false, mensaje: `No alcanza el stock de ${p.nombre} (quedan ${p.stock}).` };
    total += cant * p.precio;
  }
  for (const { productoId, cant } of lineas) {
    const r = cargarEnCuenta(estado, cuentaId, productoId, cant, ahora);
    // Ya validado: si igual dijera que no, se corta (el almacén no guarda una acción que salió mal).
    if (!r.ok) return { ok: false, mensaje: r.motivo };
  }
  const n = lineas.reduce((s, l) => s + l.cant, 0);
  return { ok: true, mensaje: `${pesos(total)} a la cuenta de ${cta.titular} (${n} producto${n === 1 ? "" : "s"}). No entró a la caja: se cobra con su cuenta.` };
}

// ── el lector de códigos ──────────────────────────────────────────────────────────────────────────────────────────

/** Entre dos teclas de un lector pasan pocos milisegundos; una persona tarda más. */
export const PAUSA_DEL_LECTOR_MS = 60;
/** Un código de producto tiene al menos esto (BP-002 son 6; los de fábrica, 13). */
export const LARGO_MINIMO_DEL_CODIGO = 4;

export interface Lector {
  /**
   * Una tecla (`key` del evento) y cuándo llegó (ms). Devuelve el código cuando el Enter cierra una ráfaga de lector;
   * si no, `null`. Cualquier otra tecla que no sea un carácter (Tab, flechas, Escape) corta la ráfaga.
   */
  tecla(key: string, ms: number): string | null;
}

export function crearLector({ pausaMs = PAUSA_DEL_LECTOR_MS, minimo = LARGO_MINIMO_DEL_CODIGO } = {}): Lector {
  let rafaga = "";
  let ultima = Number.NEGATIVE_INFINITY;
  return {
    tecla(key, ms) {
      const rapida = ms - ultima <= pausaMs;
      if (key === "Enter") {
        const codigo = rapida && rafaga.length >= minimo ? rafaga : null;
        rafaga = "";
        ultima = Number.NEGATIVE_INFINITY;
        return codigo;
      }
      if (key.length !== 1 || key === " ") {
        rafaga = "";
        ultima = Number.NEGATIVE_INFINITY;
        return null;
      }
      rafaga = rapida ? rafaga + key : key;
      ultima = ms;
      return null;
    },
  };
}

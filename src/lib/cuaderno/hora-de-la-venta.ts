// ============================================================================
// LA HORA DE UNA VENTA DEL CUADERNO — cuándo se puede cargar una venta con su hora real.
// ============================================================================
//
// Magra, tanda 2 · 2E (E19 del mostrador, MG-060). El sábado a las 11 se corta internet: el
// mostrador sigue vendiendo y anota en el cuaderno (hora, corte, peso, cómo pagó). Cuando vuelve la
// señal, esas ventas se cargan CON LA HORA EN QUE SE VENDIERON (`occurredAt`), no con la hora de
// carga: así caen en su día de caja, en su libro y en el total del día.
//
// La regla la decide ESTA función, pura y la misma en la pantalla y en el servidor
// (`createOrder` la llama con lo que lee de la base; la pantalla, para avisar antes de mandar).
// El servidor nunca confía en lo que decidió la pantalla.
//
//   · Sólo una venta de mostrador, cobrada en el acto con UN medio (Efectivo, Mercado Pago o
//     Transferencia). Sin «a cuenta», sin pago dividido y sin cupón: el cuaderno no tiene eso, y
//     cada una de esas piezas decide con la fecha de HOY (el cupón vence, la deuda nace hoy).
//   · Nunca en el futuro (con 2 minutos de tolerancia por el reloj del equipo).
//   · Nunca en un día cerrado: el día que ya se arqueó y firmó no se toca (la MISMA frontera que
//     frena el cobro en Vender, `isFrozenDay`). Si el día está cerrado, la venta no entra y se dice
//     por qué.
//   · Hasta cuántos días atrás, según el rol (provisional a confirmar con el dueño): el Mostrador,
//     hoy y los 2 días anteriores (el sábado se carga el lunes); el Dueño, hasta 7. Más atrás es un
//     error de tipeo (el año, el mes) más que un cuaderno olvidado.
//
// Client-safe: sin Prisma ni nada de servidor.

import type { Role } from "@/lib/capabilities";
import { dateStrInBusinessTz, horarioDeNegocioDelFormulario } from "@/lib/datetime";
import { formatDayLabel, isFrozenDay, type DayKey } from "@/lib/caja/cierre-diario";

/** El campo del formulario de `createOrder` con la hora de la venta del cuaderno ("2026-10-22T11:20"). */
export const CAMPO_HORA_DEL_CUADERNO = "occurredAt";

/** Hasta cuántos días atrás carga cada rol (provisional a confirmar con el dueño). null = no carga. */
export const VENTANA_DEL_CUADERNO: Readonly<Record<Role, number | null>> = {
  OWNER: 7,
  RECEPTION: 2,
  PROFESSIONAL: null,
};

/** El reloj del celular puede ir un poco adelantado: hasta 2 minutos no es «el futuro». */
export const TOLERANCIA_DEL_RELOJ_MS = 2 * 60_000;

export const CUADERNO_SOLO_VENTA_COBRADA =
  "Del cuaderno se cargan ventas del mostrador cobradas en el momento, con un solo medio (Efectivo, Mercado Pago o Transferencia): sin «a cuenta», sin pago dividido y sin cupón.";

export const CUADERNO_SIN_PERMISO = "Tu usuario no carga ventas del cuaderno: pedíselo al dueño.";

export const CUADERNO_APAGADO = "La carga de ventas del cuaderno no está encendida en este negocio.";

/** "2026-10-22" + "11:20" → "2026-10-22T11:20", lo que viaja en `occurredAt`. */
export function horaDelCuaderno(dia: string, hora: string): string {
  return `${dia.trim()}T${hora.trim()}`;
}

/** Días de calendario entre dos días ("2026-10-20" → "2026-10-22" = 2). */
export function diasEntre(desde: DayKey, hasta: DayKey): number {
  const a = Date.UTC(Number(desde.slice(0, 4)), Number(desde.slice(5, 7)) - 1, Number(desde.slice(8, 10)));
  const b = Date.UTC(Number(hasta.slice(0, 4)), Number(hasta.slice(5, 7)) - 1, Number(hasta.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

/** El día más viejo que este rol puede cargar hoy (para el `min` del campo de la fecha). */
export function primerDiaDelCuaderno(rol: Role, hoy: DayKey): DayKey | null {
  const ventana = VENTANA_DEL_CUADERNO[rol];
  if (ventana === null) return null;
  const d = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1, Number(hoy.slice(8, 10)) - ventana));
  return d.toISOString().slice(0, 10);
}

/** Lo que importa de la venta para saber si es del cuaderno (lo que leyó `createOrder`). */
export type VentaParaElCuaderno = {
  channel: "COUNTER" | "ONLINE";
  fulfillment: "PICKUP" | "DELIVERY";
  /** Cobrada con un medio que el libro asienta. */
  cobrada: boolean;
  aCuenta: boolean;
  pagoDividido: boolean;
  cupon: boolean;
};

export type HoraDelCuaderno = { ok: true; en: Date; dia: DayKey } | { ok: false; error: string };

/**
 * ¿Esta venta se puede grabar con esta hora? Devuelve el instante (UTC) y el día del negocio, o el
 * motivo en palabras. PURA: `ahora` y `cerradoHasta` los pasa quien llama.
 */
export function decidirHoraDelCuaderno(p: {
  /** "2026-10-22T11:20", en la zona del negocio. */
  crudo: string;
  ahora: Date;
  rol: Role;
  /** Hasta qué día está cerrada la caja (`lastClosedDay`), o null si nunca se cerró. */
  cerradoHasta: DayKey | null;
  venta: VentaParaElCuaderno;
}): HoraDelCuaderno {
  const v = p.venta;
  if (v.channel !== "COUNTER" || v.fulfillment !== "PICKUP" || !v.cobrada || v.aCuenta || v.pagoDividido || v.cupon) {
    return { ok: false, error: CUADERNO_SOLO_VENTA_COBRADA };
  }
  const ventana = VENTANA_DEL_CUADERNO[p.rol];
  if (ventana === null) return { ok: false, error: CUADERNO_SIN_PERMISO };

  const en = horarioDeNegocioDelFormulario(p.crudo);
  if (!en) {
    return { ok: false, error: "No entendimos el día y la hora de la venta: cargalos como están en el cuaderno (por ejemplo, 11:20)." };
  }
  const dia = dateStrInBusinessTz(en);
  const hora = p.crudo.trim().slice(11, 16);
  if (en.getTime() > p.ahora.getTime() + TOLERANCIA_DEL_RELOJ_MS) {
    return { ok: false, error: `Las ${hora} del ${formatDayLabel(dia)} todavía no pasaron: revisá la hora del cuaderno.` };
  }
  const hoy = dateStrInBusinessTz(p.ahora);
  if (diasEntre(dia, hoy) > ventana) {
    return {
      ok: false,
      error:
        p.rol === "OWNER"
          ? `El cuaderno se carga hasta ${ventana} días después, y esta venta es del ${formatDayLabel(dia)}: revisá la fecha.`
          : `Las ventas de hace más de ${ventana} días las carga el dueño (esta es del ${formatDayLabel(dia)}).`,
    };
  }
  if (p.cerradoHasta && isFrozenDay(dia, p.cerradoHasta)) {
    return {
      ok: false,
      error:
        `El ${formatDayLabel(dia)} ya está cerrado (la caja se cerró hasta el ${formatDayLabel(p.cerradoHasta)}): ` +
        `esta venta no entra, porque cambiaría la caja de un día ya contado y firmado. No se grabó nada; avisale al dueño.`,
    };
  }
  return { ok: true, en, dia };
}

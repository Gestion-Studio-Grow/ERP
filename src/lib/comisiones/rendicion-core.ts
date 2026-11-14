// RENDICIÓN DE LA PROFESIONAL QUE COBRA APARTE — reglas puras (sin Prisma, sin sesión).
//
// Diseño: docs/producto/comisiones/RENDICION.md. Resumen:
//   · Una profesional con `cobraEnMostrador = false` cobra SUS turnos y esa plata queda en SU
//     bolsillo, no en el cajón. Su cobro NO entra al libro de caja: queda «a rendir».
//   · Cuando la profesional entrega la plata, la dueña o la recepción registran la RENDICIÓN:
//     ahí, y recién ahí, entra al libro (un INGRESO marcado `rendicion:<id>`).
//   · Lo que la profesional se queda (su comisión o lo acordado) es la RETENCIÓN: nunca más que
//     lo cobrado, y sólo la registra quien liquida comisiones (`commissions:manage`).
//
// Vive puro por la misma razón que `cobro-mostrador.ts`: el caso que importa —la plata que no
// está en el cajón— se prueba con una llamada, no montando media base.

import { round2 } from "@/lib/round";

/** Marca del asiento de la rendición en `CashMovement.createdBy` (lo protege de borrarse a mano). */
export const RENDICION_ACTOR_PREFIX = "rendicion:";
export const marcaDeRendicion = (rendicionId: string): string => `${RENDICION_ACTOR_PREFIX}${rendicionId}`;
export const esAsientoDeRendicion = (m: { createdBy?: string | null }): boolean =>
  String(m.createdBy ?? "").startsWith(RENDICION_ACTOR_PREFIX);

/** El medio que no es plata de la profesional: el voucher lo liquida OpenKey al local. */
const MEDIOS_QUE_NUNCA_SE_RINDEN = new Set(["VOUCHER"]);

export type DestinoDelCobro = "caja" | "a-rendir";

/**
 * ¿Adónde va este cobro de turno? «a-rendir» sólo si lo cobró LA PROFESIONAL DEL TURNO y esa
 * profesional cobra aparte. Si la dueña le cobra un turno a la de uñas, la plata entra al cajón
 * como siempre. `cobraEnMostrador` ausente (columna sin migrar) = true = caja, como hoy.
 *
 * Todos los medios salvo el voucher (provisional a confirmar, ver RENDICION.md §Medios): si la
 * profesional cobra, la plata va a su efectivo o a su cuenta, no a la del local.
 */
export function destinoDelCobro(i: {
  cobraEnMostrador: boolean | null | undefined;
  cobradoPorLaProfesionalDelTurno: boolean;
  method: string;
}): DestinoDelCobro {
  if (i.cobraEnMostrador !== false) return "caja";
  if (!i.cobradoPorLaProfesionalDelTurno) return "caja";
  if (MEDIOS_QUE_NUNCA_SE_RINDEN.has(i.method)) return "caja";
  return "a-rendir";
}

export type CobroPendiente = { id: string; monto: number };

export type MotivoRendicionRechazada =
  | "sin-cobros" // no se eligió ningún cobro
  | "cobro-ajeno" // un id que no es un cobro a rendir pendiente de esta profesional (o ya rendido)
  | "entregado-invalido" // vacío, negativo, no numérico
  | "entregado-de-mas" // más de lo que cobró: nunca se rinde de más
  | "retencion-sin-permiso"; // se queda con algo y quien registra no liquida comisiones

export type RendicionValida = { ok: true; ids: string[]; cobrado: number; entregado: number; retenido: number };
export type RendicionRechazada = { ok: false; motivo: MotivoRendicionRechazada };

/**
 * Valida una rendición contra los cobros que SIGUEN pendientes (leídos con lock, dentro de la tx).
 * Todo o nada: si un solo id ya no está pendiente, no se rinde nada (otra rendición se lo llevó).
 */
export function validarRendicion(i: {
  pendientes: readonly CobroPendiente[];
  idsPedidos: readonly string[];
  entregado: number;
  puedeRetener: boolean;
}): RendicionValida | RendicionRechazada {
  const ids = [...new Set(i.idsPedidos.map((s) => s.trim()).filter(Boolean))];
  if (ids.length === 0) return { ok: false, motivo: "sin-cobros" };
  const porId = new Map(i.pendientes.map((c) => [c.id, c]));
  if (ids.some((id) => !porId.has(id))) return { ok: false, motivo: "cobro-ajeno" };

  // En centavos: Σ de Decimal(14,2) sin arrastrar el error del float.
  const cobradoCent = ids.reduce((s, id) => s + Math.round(porId.get(id)!.monto * 100), 0);
  if (!Number.isFinite(i.entregado) || i.entregado < 0) return { ok: false, motivo: "entregado-invalido" };
  const entregadoCent = Math.round(i.entregado * 100);
  if (entregadoCent > cobradoCent) return { ok: false, motivo: "entregado-de-mas" };
  const retenidoCent = cobradoCent - entregadoCent;
  if (retenidoCent > 0 && !i.puedeRetener) return { ok: false, motivo: "retencion-sin-permiso" };

  return { ok: true, ids, cobrado: cobradoCent / 100, entregado: entregadoCent / 100, retenido: retenidoCent / 100 };
}

export function mensajeRendicionRechazada(m: MotivoRendicionRechazada | "dia-cerrado" | "sin-tabla" | "medio"): string {
  switch (m) {
    case "sin-cobros":
      return "Elegí al menos un cobro para rendir.";
    case "cobro-ajeno":
      return "Uno de esos cobros ya se rindió o ya no está pendiente. No se registró nada: recargá la pantalla.";
    case "entregado-invalido":
      return "El monto entregado tiene que ser un número igual o mayor a cero.";
    case "entregado-de-mas":
      return "Entregó más de lo que cobró: revisá el monto. Nunca se rinde de más.";
    case "retencion-sin-permiso":
      return "Lo que se queda la profesional (su comisión) lo registra quien liquida comisiones. Cargá el total cobrado o pedíselo a la dueña.";
    case "dia-cerrado":
      return "La caja de hoy ya está cerrada: la rendición entra al libro el próximo día abierto. Registrala mañana.";
    case "sin-tabla":
      return "La rendición todavía no está habilitada en este negocio (falta la actualización de la base).";
    case "medio":
      return "Este negocio todavía no separa la transferencia en el libro. No se registró nada: elegí otro medio.";
  }
}

/**
 * Comisión ESTIMADA sobre los cobros elegidos: lo que la profesional podría retener. Es una
 * sugerencia para la pantalla, no la liquidación (esa sigue en `calcularLiquidacion`).
 * El % de la profesional, con el override por servicio si lo hay.
 */
export function comisionEstimada(
  cobros: readonly { monto: number; serviceId: string | null }[],
  porcentaje: number,
  overridePorServicio: ReadonlyMap<string, number> = new Map(),
): number {
  let total = 0;
  for (const c of cobros) {
    const override = c.serviceId ? overridePorServicio.get(c.serviceId) : undefined;
    const pct = override ?? porcentaje;
    total += round2((c.monto * (Number.isFinite(pct) ? pct : 0)) / 100);
  }
  return round2(total);
}

/** Detalle del asiento en el libro: se reconoce entre las filas tipeadas a mano. */
export function detalleDeRendicion(profesional: string, cantidad: number, retenido: number): string {
  const quien = profesional.trim() || "profesional";
  const base = `Rendición · ${quien} · ${cantidad} ${cantidad === 1 ? "cobro" : "cobros"}`;
  return retenido > 0 ? `${base} (retuvo $${retenido.toLocaleString("es-AR")})` : base;
}

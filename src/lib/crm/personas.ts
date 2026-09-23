// ============================================================================
// LA PERSONA DEL MOTOR COMERCIAL — una ficha con sus visitas, lista para evaluar. PURO.
// ============================================================================
//
// La lectura (lecturas.ts) trae filas de la base; acá se convierten, una sola vez, en lo que
// el motor entiende: días de visita en la zona del negocio, el próximo turno, los turnos que
// todavía no tienen reseña y el cumpleaños como "MM-DD". Todo lo que sigue (ciclo, segmento,
// bandeja) trabaja sobre esto y se prueba sin base.
//
// QUÉ ES UNA VISITA depende del rubro, y lo decide quien arma la persona:
//   · servicios (turnos): un turno COMPLETADO que ya ocurrió;
//   · mostrador (pedidos): un pedido no anulado.
// Dos visitas el mismo día son UNA (uñas y pestañas el mismo sábado no son "volvió en 0 días").

import { dateStrInBusinessTz } from "@/lib/datetime";
import { mesDiaDeNacimiento } from "./fechas";

export type TurnoCrudo = {
  id: string;
  status: string;
  startsAt: Date;
  serviceId: string;
  priceAtBooking: number | null;
  service: { name: string; price: number };
  review?: { id: string } | null;
};

export type PedidoCrudo = { id: string; createdAt: Date; total: number };

/** Lo que la lectura trae de cada ficha. `turnos` o `pedidos` según el rubro. */
export type FichaCruda = {
  id: string;
  name: string;
  phone: string;
  birthDate: Date | null;
  appointments?: readonly TurnoCrudo[];
  orders?: readonly PedidoCrudo[];
};

export type Visita = { fecha: string; monto: number; servicioId: string | null; servicio: string | null };

export type Persona = {
  id: string;
  nombre: string;
  telefono: string;
  /** "MM-DD", o null si la ficha no tiene fecha de nacimiento. */
  cumple: string | null;
  /** En orden, un día por visita. */
  visitas: Visita[];
  /** El turno Reservado o Confirmado más próximo, si tiene. */
  proximoTurno: { startsAt: Date; servicio: string } | null;
  /** Turnos completados que todavía no tienen reseña (para pedirla). */
  sinResena: { appointmentId: string; fecha: string; servicio: string }[];
};

/** ¿Cómo cuenta las visitas este negocio? */
export type Rubro = "servicios" | "mostrador";

export function armarPersona(f: FichaCruda, rubro: Rubro, ahora: Date): Persona {
  const crudas: Visita[] = [];
  let proximoTurno: Persona["proximoTurno"] = null;
  const sinResena: Persona["sinResena"] = [];

  if (rubro === "servicios") {
    for (const t of f.appointments ?? []) {
      const fecha = dateStrInBusinessTz(t.startsAt);
      if (t.status === "COMPLETED" && t.startsAt.getTime() <= ahora.getTime()) {
        crudas.push({ fecha, monto: t.priceAtBooking ?? t.service.price, servicioId: t.serviceId, servicio: t.service.name });
        if (!t.review) sinResena.push({ appointmentId: t.id, fecha, servicio: t.service.name });
      } else if ((t.status === "PENDING" || t.status === "CONFIRMED") && t.startsAt.getTime() > ahora.getTime()) {
        if (!proximoTurno || t.startsAt.getTime() < proximoTurno.startsAt.getTime()) {
          proximoTurno = { startsAt: t.startsAt, servicio: t.service.name };
        }
      }
    }
  } else {
    for (const p of f.orders ?? []) {
      crudas.push({ fecha: dateStrInBusinessTz(p.createdAt), monto: p.total, servicioId: null, servicio: null });
    }
  }

  return {
    id: f.id,
    nombre: f.name,
    telefono: f.phone,
    cumple: mesDiaDeNacimiento(f.birthDate),
    visitas: juntarPorDia(crudas),
    proximoTurno,
    sinResena,
  };
}

/** Una visita por día: los montos se suman y queda el servicio de la primera. En orden. */
export function juntarPorDia(visitas: readonly Visita[]): Visita[] {
  const porDia = new Map<string, Visita>();
  for (const v of [...visitas].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))) {
    const previa = porDia.get(v.fecha);
    if (previa) previa.monto += v.monto;
    else porDia.set(v.fecha, { ...v });
  }
  return [...porDia.values()];
}

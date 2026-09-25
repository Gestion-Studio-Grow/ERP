// ============================================================================
// DAR UN TURNO en el orden de la llamada — lo que se decide sin DOM. PURO, client-safe.
// ============================================================================
//
// La recepcionista atiende el teléfono: «Hola, soy Camila Ortiz, quería un peeling para el jueves».
// El orden de esa frase es el del alta: QUIÉN → QUÉ → CUÁNDO (cualquier profesional que lo haga) →
// CON QUIÉN, si hay más de una libre. El alta de siempre pedía primero la profesional y después el
// servicio, y la fecha y el horario de UNA profesional: para ofrecer «el jueves hay a las 15 con
// Carla o a las 16 con Marina» había que probar profesional por profesional.
//
// Acá: los servicios del negocio (una vez cada uno, con quién lo hace), los horarios libres de todas
// las que lo hacen juntos, y los CAMPOS que viajan a `createManualAppointment`, los mismos que el
// alta de siempre (alta-core.test.ts los compara con los que lee la acción).

import { importeParaFormulario } from "@/lib/pos-peso";
import type { Campos } from "./campos";

export type ServicioDeProfesional = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  residentPrice: number | null;
  depositAmount: number | null;
};

export type ProfesionalDelAlta = {
  id: string;
  name: string;
  box: { name: string } | null;
  cobraEnMostrador?: boolean;
  services: ServicioDeProfesional[];
};

export type ServicioDelNegocio = ServicioDeProfesional & { profesionales: string[] };

/** Cada servicio una vez, con las profesionales que lo hacen, por nombre. */
export function serviciosDelNegocio(profesionales: readonly ProfesionalDelAlta[]): ServicioDelNegocio[] {
  const porId = new Map<string, ServicioDelNegocio>();
  for (const p of profesionales) {
    for (const s of p.services) {
      const ya = porId.get(s.id);
      if (ya) ya.profesionales.push(p.id);
      else porId.set(s.id, { ...s, profesionales: [p.id] });
    }
  }
  return [...porId.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export type HorarioLibre = { inicio: string; profesionales: string[] };

/**
 * Los horarios libres de todas las profesionales juntos: cada horario una vez, con quiénes están
 * libres a esa hora, en el orden de las profesionales que se pasaron (la primera es la propuesta).
 */
export function horariosLibres(porProfesional: Readonly<Record<string, readonly string[]>>, orden: readonly string[]): HorarioLibre[] {
  const porHora = new Map<string, string[]>();
  for (const id of orden) {
    for (const inicio of porProfesional[id] ?? []) {
      const lista = porHora.get(inicio);
      if (lista) lista.push(id);
      else porHora.set(inicio, [id]);
    }
  }
  return [...porHora.entries()]
    .map(([inicio, profesionales]) => ({ inicio, profesionales }))
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
}

export type Franja = "De mañana" | "De tarde" | "De noche";

/**
 * Los horarios libres partidos en renglones por franja, en orden y sin franjas vacías. La hora se
 * lee con el MISMO formateador que dibuja el botón (la del negocio, «HH:MM»), así un horario nunca
 * cae en una franja que no coincide con lo que dice: antes de las 13 es mañana, antes de las 19 es
 * tarde, de ahí en más noche.
 */
export function franjasDeHorarios<H extends { inicio: string }>(horarios: readonly H[], hora: (inicio: string) => string): { franja: Franja; horarios: H[] }[] {
  const franjas: { franja: Franja; horarios: H[] }[] = [
    { franja: "De mañana", horarios: [] },
    { franja: "De tarde", horarios: [] },
    { franja: "De noche", horarios: [] },
  ];
  for (const h of horarios) {
    const hhmm = hora(h.inicio);
    franjas[hhmm < "13:00" ? 0 : hhmm < "19:00" ? 1 : 2].horarios.push(h);
  }
  return franjas.filter((f) => f.horarios.length > 0);
}

/** Los próximos días para elegir con un toque (hoy incluido). */
export function diasParaElegir(hoy: string, cuantos: number): string[] {
  const base = new Date(`${hoy}T12:00:00.000Z`);
  return Array.from({ length: cuantos }, (_, i) => new Date(base.getTime() + i * 86_400_000).toISOString().slice(0, 10));
}

export type AltaParaMandar = {
  profesionalId: string;
  servicioId: string;
  /** ISO del horario elegido (el que devolvió `getAvailableSlots`). */
  inicio: string;
  nombre: string;
  telefono: string;
  deLaZona: boolean;
  cupon: string;
  /** Cobrar algo en el acto: el monto y el medio. `null` = no se cobra nada ahora. */
  cobro: { monto: number; metodo: string } | null;
  estado: "PENDING" | "CONFIRMED";
  notas: string;
};

/**
 * Los campos de `createManualAppointment`, con los nombres de siempre (`senaCobrar`/`senaMonto`/
 * `senaMetodo` aunque se cobre el total: así los lee el servidor). «De la zona» viaja sólo tildado,
 * como un checkbox; el monto, en la forma canónica.
 */
export function camposDelAlta(a: AltaParaMandar): Campos {
  const c: [string, string][] = [
    ["professionalId", a.profesionalId],
    ["serviceId", a.servicioId],
    ["startsAt", a.inicio],
    ["clientName", a.nombre.trim()],
    ["clientPhone", a.telefono.trim()],
  ];
  if (a.deLaZona) c.push(["isResident", "on"]);
  c.push(["couponCode", a.cupon.trim()]);
  if (a.cobro && a.cobro.monto > 0) {
    c.push(["senaCobrar", "on"], ["senaMonto", importeParaFormulario(a.cobro.monto)], ["senaMetodo", a.cobro.metodo]);
  }
  c.push(["status", a.estado], ["notes", a.notas]);
  return c;
}

/** ¿Qué falta para poder dar el turno? (en el orden de la llamada). `null` = nada. */
export function queFalta(p: { nombre: string; telefono: string; servicioId: string; inicio: string; profesionalId: string }): string | null {
  if (!p.nombre.trim() || !p.telefono.trim()) return "Falta quién: el nombre y el teléfono.";
  if (!p.servicioId) return "Falta qué servicio.";
  if (!p.inicio) return "Falta el día y la hora.";
  if (!p.profesionalId) return "Falta con quién.";
  return null;
}

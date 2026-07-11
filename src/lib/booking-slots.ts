// Núcleo PURO de disponibilidad de franjas — sin Prisma, sin "use server", sin
// zonas horarias. Es la matemática de solapes y generación de horarios que antes
// vivía inline dentro de `getAvailableSlots` (actions.ts) y `assertSlotAvailable`
// (booking-core.ts). Extraída acá para blindarla con tests (node:test) y para que
// alta, panel y sitio público compartan EXACTAMENTE la misma semántica de choques
// (mismos bordes `<`/`>`, mismo buffer) — el corazón de "no doblar una cancha/box".
//
// Toda función es determinista sobre sus argumentos: recibe intervalos ya en UTC
// y no toca la DB ni el reloj. La resolución de horarios de pared → UTC y el
// fetch de turnos ocupados quedan en las capas que la llaman.

export interface Interval {
  startsAt: Date;
  endsAt: Date;
}

// Semántica canónica de solape de dos rangos semiabiertos [aStart,aEnd) y
// [bStart,bEnd): se tocan sólo si uno empieza antes de que el otro termine y
// termina después de que el otro empiece. Con bordes ESTRICTOS, dos turnos
// pegados (uno termina 10:00, el otro empieza 10:00) NO se solapan.
export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

// Expande un rango con un margen de limpieza/preparación a cada lado. Un buffer 0
// devuelve el mismo rango. Se usa para que dos turnos reales no queden pegados sin
// aire entre medio (BUFFER_MIN).
export function withBuffer(startsAt: Date, endsAt: Date, bufferMin: number): Interval {
  return {
    startsAt: new Date(startsAt.getTime() - bufferMin * 60000),
    endsAt: new Date(endsAt.getTime() + bufferMin * 60000),
  };
}

// ¿El rango [startsAt,endsAt) choca contra ALGUNO de los intervalos ocupados?
export function hasOverlap(startsAt: Date, endsAt: Date, busy: Interval[]): boolean {
  return busy.some((b) => intervalsOverlap(startsAt, endsAt, b.startsAt, b.endsAt));
}

// Genera los inicios de franja (ISO) dentro de la ventana [dayStart, dayEnd),
// avanzando de a `stepMin` minutos. Una franja entra si:
//   - termina (inicio + durationMin) en o antes de `dayEnd` (no se pasa del cierre),
//   - no se solapa con ningún intervalo de `busy` (turnos con su buffer, bloqueos),
//   - `capacityOk` (si se pasa) la acepta — para recursos compartidos con cupo.
// No muta sus argumentos. Devuelve ISO strings, listas para el cliente.
export function generateSlots(params: {
  dayStart: Date;
  dayEnd: Date;
  durationMin: number;
  stepMin: number;
  busy: Interval[];
  capacityOk?: (slotStart: Date, slotEnd: Date) => boolean;
}): string[] {
  const { dayStart, dayEnd, durationMin, stepMin, busy, capacityOk } = params;
  const slots: string[] = [];
  if (durationMin <= 0 || stepMin <= 0) return slots;

  const durationMs = durationMin * 60000;
  const stepMs = stepMin * 60000;
  for (
    let t = dayStart.getTime();
    t + durationMs <= dayEnd.getTime();
    t += stepMs
  ) {
    const slotStart = new Date(t);
    const slotEnd = new Date(t + durationMs);
    if (hasOverlap(slotStart, slotEnd, busy)) continue;
    if (capacityOk && !capacityOk(slotStart, slotEnd)) continue;
    slots.push(slotStart.toISOString());
  }
  return slots;
}

// --- Batch multi-día (perf) ---
// Un turno ya ocupado que consume unidades de recursos compartidos. `resources`
// son SOLO los links a recursos relevantes para el servicio consultado.
export interface OccupiedAppointment extends Interval {
  resources: { resourceId: string; units: number }[];
}

// Un recurso requerido por el servicio y su cupo total.
export interface RequiredResource {
  resourceId: string;
  units: number;
  quantity: number;
}

export interface DayWindow {
  date: string;
  dayStart: Date;
  dayEnd: Date;
}

// Calcula las franjas libres de VARIOS días a partir de los datos del RANGO
// completo ya traídos de la DB (una query por tabla, no una por día). Reparte
// turnos/bloqueos por día en memoria con EXACTAMENTE los mismos predicados que la
// versión por-día —turnos por `startsAt` dentro de la ventana; bloqueos por solape
// estricto— y corre `generateSlots` por día. PURA: no toca DB ni reloj, por eso es
// testeable. `busyAppointments` incluye el buffer aplicado por el llamador; los
// bloqueos van sin buffer (ya son rangos explícitos). Devuelve fecha → franjas ISO.
export function generateSlotsForDays(params: {
  windows: DayWindow[];
  durationMin: number;
  stepMin: number;
  bufferMin: number;
  busyAppointments: Interval[];
  boxBlocks: Interval[];
  professionalBlocks: Interval[];
  resourceUsage: OccupiedAppointment[];
  requiredResources: RequiredResource[];
}): Record<string, string[]> {
  const {
    windows,
    durationMin,
    stepMin,
    bufferMin,
    busyAppointments,
    boxBlocks,
    professionalBlocks,
    resourceUsage,
    requiredResources,
  } = params;

  const out: Record<string, string[]> = {};
  for (const { date, dayStart, dayEnd } of windows) {
    const dayExisting = busyAppointments.filter((a) => a.startsAt >= dayStart && a.startsAt < dayEnd);
    const dayBoxBlocks = boxBlocks.filter((b) => b.startsAt < dayEnd && b.endsAt > dayStart);
    const dayProBlocks = professionalBlocks.filter((b) => b.startsAt < dayEnd && b.endsAt > dayStart);
    const dayResourceUsage = resourceUsage.filter((a) => a.startsAt >= dayStart && a.startsAt < dayEnd);

    const busy = [
      ...dayExisting.map((a) => withBuffer(a.startsAt, a.endsAt, bufferMin)),
      ...dayBoxBlocks,
      ...dayProBlocks,
    ];

    const capacityOk = (slotStart: Date, slotEnd: Date) => {
      for (const sr of requiredResources) {
        const overlapUnits = dayResourceUsage
          .filter((a) => intervalsOverlap(slotStart, slotEnd, a.startsAt, a.endsAt))
          .reduce((sum, a) => {
            const link = a.resources.find((r) => r.resourceId === sr.resourceId);
            return sum + (link?.units ?? 0);
          }, 0);
        if (overlapUnits + sr.units > sr.quantity) return false;
      }
      return true;
    };

    out[date] = generateSlots({
      dayStart,
      dayEnd,
      durationMin,
      stepMin,
      busy,
      capacityOk: requiredResources.length > 0 ? capacityOk : undefined,
    });
  }
  return out;
}

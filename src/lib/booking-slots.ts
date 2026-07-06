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

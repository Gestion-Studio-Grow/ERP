// Leer los anotados sin que una base sin la tabla tire la pantalla de error.
//
// Donde la migración de la campaña no se aplicó, Prisma tira P2021 (tabla) o P2022 (columna).
// La pantalla lo dice con un estado vacío (como el número del Inicio, que muestra '—'); cualquier
// otra falla sigue su curso. Se reconoce por FORMA, sin importar Prisma como valor, igual que
// src/lib/turnos/anulacion.ts y src/lib/crm/cargas.server.ts: la misma regla vive repetida en
// varios módulos porque no hay todavía un helper común client-safe (anotado para afuera).
//
// Puro: recibe la lectura por parámetro, así el test ejecuta los dos caminos sin base.

export type Anotados<T> = { estado: "ok"; leads: T[] } | { estado: "sin-tabla" };

export function faltaLaTabla(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === "P2021" || code === "P2022";
}

export async function leerAnotados<T>(leer: () => Promise<T[]>): Promise<Anotados<T>> {
  try {
    return { estado: "ok", leads: await leer() };
  } catch (err) {
    if (!faltaLaTabla(err)) throw err;
    return { estado: "sin-tabla" };
  }
}

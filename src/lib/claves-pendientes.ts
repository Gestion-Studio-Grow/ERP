// RESETEOS PENDIENTES declarados en código (GSG-SEG-014, orden del dueño del 10/11/2026).
//
// POR QUÉ. El dueño no resetea nada a mano en la consola de producción. Cuando hace falta resetear
// la clave del dueño de un negocio sin que nadie intervenga, se DECLARA acá y la corre sola el cron
// diario `/api/cron/claves-pendientes` (sólo producción: los crons de Vercel no corren en preview),
// con los secretos del server. Mismo núcleo y mismas reglas que el botón de la consola: cambio
// obligatorio primero, la provisoria sale SÓLO por mail al titular y, si el mail no sale, no cambia
// nada y se reintenta al otro día.
//
// IDEMPOTENTE. Cada entrada tiene una `clave` única que queda en la auditoría del reseteo
// (`changes.pendiente`). Antes de resetear, el ejecutor toma un candado por esa clave y busca esa
// fila: si ya está, no hace nada. Así un cron repetido, dos llamadas a la vez o un deploy nuevo no
// vuelven a resetear. Para volver a resetear al mismo negocio se declara una entrada con OTRA clave.
//
// Una entrada ya cumplida se puede dejar (no hace nada, cuesta una consulta) o borrar en un PR aparte.

export type ResetPendiente = {
  /** Única para siempre: fecha + negocio + a quién. Es lo que hace idempotente al reseteo. */
  clave: string;
  /** `Tenant.slug` del negocio. */
  slug: string;
  /** Por qué (queda en la auditoría). */
  motivo: string;
};

export const RESETEOS_PENDIENTES: readonly ResetPendiente[] = [
  // CH Estética (Carolina Haponiuk): orden del dueño del 10/11/2026, sin intervención manual.
  { clave: "2026-11-10-beauty-spa-owner", slug: "beauty-spa", motivo: "orden del dueño 10/11/2026 (GSG-SEG-014)" },
];

export type EstadoPendiente =
  | { estado: "hecho"; enviadaA: string }
  | { estado: "ya-estaba" }
  | { estado: "sin-negocio" }
  | { estado: "fallo"; error: string };

export type ResultadoPendiente = { clave: string } & EstadoPendiente;

export interface PendientesPort {
  /** El id del negocio por su slug, o null si no existe en esta base. */
  buscarNegocio(slug: string): Promise<string | null>;
  /** Resetea si todavía no se hizo (candado + búsqueda en la auditoría, en la misma transacción). */
  resetearSiFalta(tenantId: string, p: ResetPendiente): Promise<EstadoPendiente>;
}

/** Corre todos los pendientes. Uno que falla no frena a los demás. PURO sobre el puerto. */
export async function correrResetsPendientes(
  port: PendientesPort,
  pendientes: readonly ResetPendiente[] = RESETEOS_PENDIENTES,
): Promise<ResultadoPendiente[]> {
  const claves = new Set<string>();
  const salida: ResultadoPendiente[] = [];
  for (const p of pendientes) {
    if (claves.has(p.clave)) {
      salida.push({ clave: p.clave, estado: "fallo", error: "clave repetida en RESETEOS_PENDIENTES" });
      continue;
    }
    claves.add(p.clave);
    try {
      const tenantId = await port.buscarNegocio(p.slug);
      if (!tenantId) {
        salida.push({ clave: p.clave, estado: "sin-negocio" });
        continue;
      }
      salida.push({ clave: p.clave, ...(await port.resetearSiFalta(tenantId, p)) });
    } catch (e) {
      // Sin el detalle del error (podría traer datos de la base): sólo su tipo.
      salida.push({ clave: p.clave, estado: "fallo", error: e instanceof Error ? e.name : "error" });
    }
  }
  return salida;
}

/** Actor de la auditoría de un reseteo pendiente. */
export const ACTOR_PENDIENTES = "system:claves-pendientes";

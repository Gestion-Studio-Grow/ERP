// ============================================================================
// Apoyo para los tests del equipo de agentes (src/lib/agentes/*-postgres.test.ts).
// ============================================================================
// Reloj fijo, vistas, el equipo de Administración con un modelo de lectura de prueba (Client) y una
// herramienta de lectura. Los interruptores los prende cada archivo de test (el trinquete de
// src/cambios/interruptores-escritura.test.ts sólo deja escribir esa entidad a la consola y a los tests).
// Ningún dato real de MIA: los negocios A y B son los de la base efímera.

import type { Equipo, Fila, Herramienta, PuertaDeGasto, RegistroDeHerramientas, Reloj, Vista } from "@/lib/agentes/tipos";
import { EQUIPO_ADMINISTRACION } from "@/lib/agentes/puestos/administracion";

/** Instante base de todos los tests: miércoles 12/11/2026 15:00 (Argentina). Nunca el reloj real. */
export const T0 = new Date("2026-11-12T18:00:00.000Z");

/** Un reloj que avanza sólo cuando el test lo dice. */
export function relojFijo(inicio: Date = T0): { reloj: Reloj; avanzar(ms: number): void; poner(d: Date): void } {
  let t = inicio.getTime();
  return { reloj: () => new Date(t), avanzar: (ms) => void (t += ms), poner: (d) => void (t = d.getTime()) };
}

export function vistaDe(tenantId: string, userId: string, otros: Partial<Vista> = {}): Vista {
  return { tenantId, userId, nombre: "Persona de prueba", puedeVer: () => true, proyectos: "todos", veSinProyecto: true, columnasOcultas: new Set(), ...otros };
}

/** Administración, con Cobranzas leyendo `client` (modelo de prueba: la base efímera trae clientes). */
export const EQUIPO_DE_PRUEBA: Equipo = {
  ...EQUIPO_ADMINISTRACION,
  puestos: EQUIPO_ADMINISTRACION.puestos.map((p) => (p.id === "administracion.cobranzas" ? { ...p, modelos: { client: {} } } : p)),
};
export const EQUIPOS_DE_PRUEBA: readonly Equipo[] = [EQUIPO_DE_PRUEBA];
export const COBRANZAS = "administracion.cobranzas";
export const COORDINACION = "administracion.coordinacion";

/** Lectura de prueba: los clientes del negocio por `ctx.db` (con su `tenantId`, para ver que el motor lo quita). */
export const herramientaClientes: Herramienta = {
  nombre: "cobranzas.resumen",
  descripcion: "Clientes del negocio.",
  esquema: { type: "object", properties: {}, additionalProperties: false },
  clase: "lectura",
  tarea: "C1",
  modulo: "pagos",
  async leer(ctx) {
    const clientes = (await ctx.db.client.findMany({ select: { id: true, name: true, tenantId: true }, orderBy: { id: "asc" } })) as { id: string; name: string; tenantId: string }[];
    const filas: Fila[] = clientes.map((c) => ({
      id: c.id,
      entidad: "Client",
      entidadId: c.id,
      proyectoId: null,
      etiquetas: [c.name],
      cifras: [],
      origen: { etiqueta: `Clientes · ${c.name}`, enlace: `/admin/clientes/${c.id}`, leidoEl: ctx.ahora.toISOString() },
    }));
    return { ok: true, datos: { cantidad: clientes.length, clientes }, filas };
  },
};

export const HERRAMIENTAS_DE_PRUEBA: RegistroDeHerramientas = new Map([[herramientaClientes.nombre, herramientaClientes]]);

export const actorDePrueba = (p: { id: string; modulos: readonly string[] }) => ({ puesto: p.id as `${string}.${string}`, id: `agente:${p.id}` as const, rolBase: "ADMINISTRACION", modulos: p.modulos });

/** Gasto de prueba: siempre hay saldo (o nunca), y cuenta reservas y cierres. */
export function gastoDePrueba(conSaldo = true): PuertaDeGasto & { reservas: number; cierres: number[] } {
  const g = {
    reservas: 0,
    cierres: [] as number[],
    async reservar() {
      if (!conSaldo) return { ok: false as const, motivo: "sin_saldo" as const };
      g.reservas++;
      return { ok: true as const, reservaId: `reserva-${g.reservas}` };
    },
    async cerrar(_tx: unknown, p: { realMicroUsd: number }) {
      g.cierres.push(p.realMicroUsd);
    },
    estimar: () => 100,
    costo: ({ uso }: { uso: { entrada: number; salida: number } }) => uso.entrada + uso.salida,
  };
  return g;
}

/** Corre `fn` N veces a la vez. */
export function aLaVez<T>(n: number, fn: (i: number) => Promise<T>): Promise<T[]> {
  return Promise.all([...Array(n).keys()].map((i) => fn(i)));
}

// ============================================================================
// RENDÍ en MIA — lecturas para las pantallas. Siempre con el negocio y la persona de la sesión.
// Sin la migración `20261104120000_rendiciones` aplicada devuelven `disponible: false` en vez de romper.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import type { EstadoRendicion } from "@/lib/rendiciones/tipos";
import type { Actor } from "./gestion.server";
import { urlDelComprobante } from "./comprobante.server";
import { actorDelMotor, cierreDeAnticipo, faltaLaMigracion, motivoNoRinde, muestraReintegro, muestraRevision, rendicionDelMotor, type MedioRendicion } from "./rendiciones-core";

export interface FilaRendicion {
  id: string;
  proyectoId: string;
  proyecto: string;
  persona: string;
  descripcion: string;
  fecha: Date;
  medio: MedioRendicion;
  montoCentavos: number;
  estado: EstadoRendicion;
  /** La ruta propia del comprobante (sólo quien rindió y Dirección/Administración); `null` si no hay foto. */
  comprobante: string | null;
  puedeReintegrar: boolean;
  enLiquidacion: boolean;
  ultimoComentario: string | null;
  puedeRevisar: boolean;
}

export interface AnticipoAbierto {
  id: string;
  montoCentavos: number;
  entregadoEl: Date;
}

const SELECT = {
  id: true,
  proyectoId: true,
  gastoId: true,
  personaId: true,
  medio: true,
  anticipoId: true,
  montoCentavos: true,
  estado: true,
  eventos: true,
  proyecto: { select: { nombre: true } },
  persona: { select: { nombre: true } },
  gasto: { select: { descripcion: true, fecha: true } },
  liquidacionId: true,
  archivoId: true,
} as const;

type Cruda = { id: string; proyectoId: string; gastoId: string; personaId: string; medio: string; anticipoId: string | null; montoCentavos: number; estado: string; eventos: unknown; proyecto: { nombre: string }; persona: { nombre: string }; gasto: { descripcion: string; fecha: Date }; liquidacionId: string | null; archivoId: string | null };

function aFila(a: Actor, f: Cruda): FilaRendicion {
  const r = rendicionDelMotor(f);
  const conComentario = [...r.eventos].reverse().find((e) => e.comentario);
  return {
    id: f.id,
    proyectoId: f.proyectoId,
    proyecto: f.proyecto.nombre,
    persona: f.persona.nombre,
    descripcion: f.gasto.descripcion,
    fecha: f.gasto.fecha,
    medio: f.medio === "ANTICIPO" ? "ANTICIPO" : "PROPIO",
    montoCentavos: f.montoCentavos,
    estado: r.estado,
    comprobante: f.archivoId ? urlDelComprobante(f.id) : null,
    puedeReintegrar: muestraReintegro(a.rol, actorDelMotor({ personaId: a.personaId, userId: a.user.id }), { personaId: f.personaId, medio: f.medio, estado: r.estado, liquidacionId: f.liquidacionId }),
    enLiquidacion: !!f.liquidacionId,
    ultimoComentario: conComentario?.comentario ?? null,
    puedeRevisar: muestraRevision(a.rol, actorDelMotor({ personaId: a.personaId, userId: a.user.id }), f.personaId, r.estado),
  };
}

async function tolerante<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    if (faltaLaMigracion(e)) return null;
    throw e;
  }
}

/** Las rendiciones de un proyecto que esta persona puede ver (quien revisa: todas; el resto: las suyas) y si puede rendir. */
export async function rendicionesDelProyecto(a: Actor, proyectoId: string) {
  const revisa = a.rol === "DIRECCION" || a.rol === "ADMINISTRACION";
  const enEquipo = a.personaId ? !!(await prisma.proyectoEquipo.findFirst({ where: { tenantId: a.tenantId, proyectoId, personaId: a.personaId }, select: { id: true } })) : false;
  const motivo = motivoNoRinde(a.rol, a.personaId, enEquipo);
  const datos = await tolerante(async () => {
    const [filas, anticipos] = await Promise.all([
      revisa || a.personaId
        ? prisma.proyectoRendicion.findMany({ where: { tenantId: a.tenantId, proyectoId, ...(revisa ? {} : { personaId: a.personaId! }) }, orderBy: { createdAt: "desc" }, take: 200, select: SELECT })
        : [],
      motivo ? [] : misAnticiposAbiertos(a, proyectoId),
    ]);
    return { filas: filas.map((f) => aFila(a, f)), anticipos };
  });
  return { disponible: datos !== null, filas: datos?.filas ?? [], anticipos: datos?.anticipos ?? [], motivoNoRinde: motivo, revisa };
}

/** Las de la persona de la sesión, en todos sus proyectos. No hay manera de pedir las de otro desde acá. */
export async function misRendiciones(a: Actor) {
  if (!a.personaId) return { disponible: true, filas: [] as FilaRendicion[] };
  const filas = await tolerante(() => prisma.proyectoRendicion.findMany({ where: { tenantId: a.tenantId, personaId: a.personaId! }, orderBy: { createdAt: "desc" }, take: 200, select: SELECT }));
  return { disponible: filas !== null, filas: (filas ?? []).map((f) => aFila(a, f)) };
}

async function misAnticiposAbiertos(a: Actor, proyectoId: string): Promise<AnticipoAbierto[]> {
  if (!a.personaId) return [];
  return prisma.proyectoAnticipo.findMany({
    where: { tenantId: a.tenantId, personaId: a.personaId, estado: "ENTREGADO", OR: [{ proyectoId: null }, { proyectoId }] },
    orderBy: { entregadoEl: "desc" },
    select: { id: true, montoCentavos: true, entregadoEl: true },
  });
}

export interface AnticipoDelProyecto {
  id: string;
  persona: string;
  montoCentavos: number;
  entregadoEl: Date;
  estado: string;
  devueltoCentavos: number;
  reintegradoCentavos: number;
  /** Lo que diría la cuadratura si se cerrara hoy, o por qué no se puede cerrar. */
  cierre: string;
  sePuedeCerrar: boolean;
}

/** Para Dirección/Administración: los anticipos del proyecto y a quién se le puede entregar uno (su equipo). */
export async function anticiposDelProyecto(a: Actor, proyectoId: string): Promise<{ anticipos: AnticipoDelProyecto[]; equipo: { id: string; nombre: string }[] } | null> {
  if (a.rol !== "DIRECCION" && a.rol !== "ADMINISTRACION") return null;
  return tolerante(async () => {
    const [filas, equipo] = await Promise.all([
      prisma.proyectoAnticipo.findMany({
        where: { tenantId: a.tenantId, proyectoId },
        orderBy: { entregadoEl: "desc" },
        take: 50,
        select: { id: true, montoCentavos: true, entregadoEl: true, estado: true, devueltoCentavos: true, reintegradoCentavos: true, persona: { select: { nombre: true } }, rendiciones: { select: { id: true, gastoId: true, personaId: true, medio: true, anticipoId: true, montoCentavos: true, estado: true, eventos: true } } },
      }),
      prisma.proyectoEquipo.findMany({ where: { tenantId: a.tenantId, proyectoId, persona: { activa: true } }, select: { persona: { select: { id: true, nombre: true } } } }),
    ]);
    return {
      anticipos: filas.map((f) => {
        const c = cierreDeAnticipo(f, f.rendiciones);
        return { id: f.id, persona: f.persona.nombre, montoCentavos: f.montoCentavos, entregadoEl: f.entregadoEl, estado: f.estado, devueltoCentavos: f.devueltoCentavos, reintegradoCentavos: f.reintegradoCentavos, cierre: c.ok ? c.mensaje : c.error, sePuedeCerrar: c.ok && f.estado !== "CERRADO" };
      }),
      equipo: equipo.map((e) => e.persona),
    };
  });
}

// ============================================================================
// RENDÍ en MIA — lecturas para las pantallas. Siempre con el negocio y la persona de la sesión.
// Sin la migración `20261104120000_rendiciones` aplicada devuelven `disponible: false` en vez de romper.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import type { EstadoRendicion } from "@/lib/rendiciones/tipos";
import type { Actor } from "./gestion.server";
import { actorDelMotor, faltaLaMigracion, motivoNoRinde, muestraRevision, rendicionDelMotor, type MedioRendicion } from "./rendiciones-core";

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
  foto: string | null;
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
  archivo: { select: { datos: true } },
} as const;

type Cruda = { id: string; proyectoId: string; gastoId: string; personaId: string; medio: string; anticipoId: string | null; montoCentavos: number; estado: string; eventos: unknown; proyecto: { nombre: string }; persona: { nombre: string }; gasto: { descripcion: string; fecha: Date }; archivo: { datos: string | null } | null };

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
    foto: f.archivo?.datos ?? null,
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

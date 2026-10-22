// ============================================================================
// NOVEDADES DE LA CAJA — qué entradas de la auditoría le suben a la dueña y cómo se escriben. PURO.
// ============================================================================
//
// Reingeniería CH, Tanda 3 (§1.1 principio 6, §2.8, CH-037/056/067): «la plata no queda en silencio».
// Toda anulación de un cobro, baja de saldo, seña devuelta, asiento borrado del libro y cierre del día
// con diferencia llega al Inicio de la dueña escrita como lo diría alguien del local:
//
//   11:20 · Lu anuló un cobro de $8.000 — «cobré con el medio equivocado»
//   10:05 · Vero devolvió la seña de $5.000 a Carla M. — cancelado por el negocio
//
// Sale de lo que YA se audita (no hay tabla nueva): `void_collection` y `write_off_balance`
// (src/lib/actions.ts, cobro-actions.ts), `cancel`/`no_show` con `devuelto > 0` (cerrarTurnoSinPrestar),
// `libro.delete` (libro-caja-actions.ts) y `caja.cierre-diario` con diferencia (cierre-diario-actions.ts).
// Lo que no movió plata no sube: una cancelación sin seña, una seña que se quedó el negocio, un cierre
// que cuadró. La lectura (con `tenantId`) vive en novedades.server.ts; esto sólo decide y escribe.

import { pesosEnTexto } from "@/lib/turnos/mensajes-whatsapp";

/**
 * La acción con que `cerrarDia` deja el cierre en la auditoría (`CIERRE_DIARIO_ACTION`,
 * src/lib/caja/frontera-cierre.ts). Copiada y no importada: ese módulo trae Prisma y éste es puro. La
 * prueba de Postgres (cerrar-el-dia-postgres.test.ts) cierra un día de verdad y ve la novedad.
 */
export const CIERRE_DIARIO_ACTION = "caja.cierre-diario";

/** Las acciones de la auditoría que pueden ser una novedad de la caja (el `where` de la lectura). */
export const ACCIONES_DE_NOVEDAD = ["void_collection", "write_off_balance", "cancel", "no_show", "libro.delete", CIERRE_DIARIO_ACTION] as const;

/** Cuántas se muestran (las más nuevas). */
export const TOPE_DE_NOVEDADES = 8;

export type FilaDeAuditoria = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actor: string;
  createdAt: Date;
  changes: unknown;
};

export type TonoDeNovedad = "peligro" | "atencion";

export type Novedad = {
  id: string;
  /** ISO del momento. */
  cuando: string;
  /** «Lu», «la clienta», «alguien del panel». */
  quien: string;
  /** La frase, con quién, qué y cuánto. */
  texto: string;
  /** El porqué que escribió quien lo hizo (sin comillas), si hay. */
  motivo: string | null;
  monto: number | null;
  tono: TonoDeNovedad;
  /** Dónde se ve el detalle. */
  href: string | null;
};

export type Nombres = {
  /** El nombre de un usuario por su id (el actor viaja como «user:<id>»). */
  usuario: (id: string) => string | null | undefined;
  /** La clienta de un turno por el id del turno. */
  clientaDelTurno: (appointmentId: string) => string | null | undefined;
};

const objeto = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const texto = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, 200) : null;
};

/** El actor en palabras: el nombre del usuario, «la clienta» o «alguien del panel». */
export function quienFue(actor: string, nombres: Pick<Nombres, "usuario">): string {
  if (actor.startsWith("user:")) {
    const n = texto(nombres.usuario(actor.slice("user:".length)));
    return n ?? "Alguien del panel";
  }
  if (actor.startsWith("cliente")) return "La clienta";
  return "Alguien del panel";
}

/** «24/10» de un día «2026-10-24». */
function diaMes(dia: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  return m ? `${m[3]}/${m[2]}` : dia;
}

const turnoHref = (id: string | null) => (id ? `/admin/turnos/lista#turno-${id}` : null);

/** Una fila de la auditoría como novedad de la caja, o `null` si no movió plata (no sube). */
export function novedadDeLaCaja(fila: FilaDeAuditoria, nombres: Nombres): Novedad | null {
  const c = objeto(fila.changes);
  const quien = quienFue(fila.actor, nombres);
  const base = { id: fila.id, cuando: fila.createdAt.toISOString(), quien };

  switch (fila.action) {
    case "void_collection": {
      const monto = numero(c.monto);
      if (monto === null || monto <= 0) return null;
      if (c.deshacer === true) {
        return { ...base, texto: `${quien} deshizo una seña de ${pesosEnTexto(monto)} recién cobrada`, motivo: null, monto, tono: "atencion", href: turnoHref(fila.entityId) };
      }
      return { ...base, texto: `${quien} anuló un cobro de ${pesosEnTexto(monto)}`, motivo: texto(c.motivo), monto, tono: "peligro", href: turnoHref(fila.entityId) };
    }
    case "write_off_balance": {
      const monto = numero(c.monto);
      if (monto === null || monto <= 0) return null;
      return { ...base, texto: `${quien} dio de baja un saldo de ${pesosEnTexto(monto)}`, motivo: texto(c.motivo), monto, tono: "peligro", href: turnoHref(fila.entityId) };
    }
    case "cancel":
    case "no_show": {
      const devuelto = numero(c.devuelto);
      if (devuelto === null || devuelto <= 0) return null;
      const clienta = fila.entityId ? texto(nombres.clientaDelTurno(fila.entityId)) : null;
      const porque =
        fila.action === "no_show" ? "no vino" : c.quien === "negocio" ? "cancelado por el negocio" : c.quien === "clienta" ? "canceló la clienta" : "cancelado";
      return {
        ...base,
        texto: `${quien} devolvió la seña de ${pesosEnTexto(devuelto)}${clienta ? ` a ${clienta}` : ""}`,
        motivo: porque,
        monto: devuelto,
        tono: "atencion",
        href: turnoHref(fila.entityId),
      };
    }
    case "libro.delete": {
      const monto = numero(c.amount);
      if (monto === null || monto <= 0) return null;
      const detalle = texto(c.reason);
      return {
        ...base,
        texto: `${quien} borró del libro ${detalle ? `«${detalle}»` : "un movimiento"} de ${pesosEnTexto(monto)}`,
        motivo: null,
        monto,
        tono: "atencion",
        href: "/admin/caja/libro",
      };
    }
    case CIERRE_DIARIO_ACTION: {
      const porMedio = objeto(c.porMedio);
      let diferencia = 0;
      for (const m of Object.values(porMedio)) diferencia += numero(objeto(m).diferencia) ?? 0;
      diferencia = Math.round(diferencia * 100) / 100;
      if (diferencia === 0) return null;
      const dia = texto(c.day) ?? fila.entityId ?? "";
      return {
        ...base,
        texto: `${quien} cerró el ${diaMes(dia)} con ${diferencia < 0 ? "un faltante" : "un sobrante"} de ${pesosEnTexto(Math.abs(diferencia))}`,
        motivo: texto(c.note),
        monto: diferencia,
        tono: diferencia < 0 ? "peligro" : "atencion",
        href: dia ? `/admin/caja/cierre?dia=${dia}` : "/admin/caja/cierre",
      };
    }
    default:
      return null;
  }
}

/**
 * Las novedades, de la más nueva a la más vieja, hasta `tope`. `excluirActor`: lo que hizo quien mira
 * no le sube a ella misma («lo que hizo la recepción»).
 */
export function novedadesDeLaCaja(
  filas: readonly FilaDeAuditoria[],
  nombres: Nombres,
  opciones: { excluirActor?: string | null; tope?: number } = {},
): Novedad[] {
  const tope = opciones.tope ?? TOPE_DE_NOVEDADES;
  return [...filas]
    .filter((f) => !opciones.excluirActor || f.actor !== opciones.excluirActor)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .flatMap((f) => {
      const n = novedadDeLaCaja(f, nombres);
      return n ? [n] : [];
    })
    .slice(0, tope);
}

/** Los ids que la lectura tiene que resolver a nombres: usuarios (actores) y turnos con seña devuelta. */
export function idsParaNombrar(filas: readonly FilaDeAuditoria[]): { usuarios: string[]; turnos: string[] } {
  const usuarios = new Set<string>();
  const turnos = new Set<string>();
  for (const f of filas) {
    if (f.actor.startsWith("user:")) usuarios.add(f.actor.slice("user:".length));
    if ((f.action === "cancel" || f.action === "no_show") && f.entityId && (numero(objeto(f.changes).devuelto) ?? 0) > 0) turnos.add(f.entityId);
  }
  return { usuarios: [...usuarios], turnos: [...turnos] };
}

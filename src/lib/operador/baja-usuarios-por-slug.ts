// Baja de usuarios de un negocio SIN sesión de operador, para el Operador de producción (Factory-GSG
// `CLAUDE.md` § «Autorización del dueño: roles y accesos (10/11/2026)» y `10-GOBIERNO/roles-y-accesos.md`).
// Es la misma regla que la baja del panel (`setUserActive`, src/lib/user-actions.ts:144): `active=false`,
// auditoría `deactivate` sobre `User` con `{ active: false }`, y nunca dejar el negocio sin dueño activo.
// Lo único distinto es quién firma la auditoría (`operator:<actor>`, como el reset por slug).
//
// Cómo es segura:
//   - confirmación tipeando el slug; los ids se buscan SIEMPRE con el tenantId de ese slug: un id de otro
//     negocio no aparece y frena todo sin escribir nada;
//   - una sola transacción parada en el negocio (`enElNegocio`) con el MISMO candado de usuarios que el
//     panel y la consola (`pg_advisory_xact_lock(hashtext('usuarios:'+tenantId))`): nadie cuenta dueños
//     a la vez;
//   - la guarda de último dueño se evalúa sobre el lote entero: dueños activos después de la baja ≥ 1;
//   - idempotente: quien ya está inactivo no cambia ni se audita de nuevo;
//   - por defecto NO escribe (`aplicar: false`): devuelve el plan. Con `aplicar: true` escribe y VERIFICA
//     dentro de la misma transacción que cada baja quedó y tiene su auditoría; si algo no cierra, tira y
//     se deshace todo.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { enElNegocio } from "@/lib/operator-db";

export type FilaDeBaja = {
  id: string;
  nombre: string;
  rol: string;
  dominio: string;
  activoAntes: boolean;
  activoDespues: boolean;
  cambia: boolean;
  auditId?: string;
};

export type ResultadoBajaPorSlug =
  | {
      ok: true;
      aplicado: boolean;
      tenantId: string;
      filas: FilaDeBaja[];
      dueniosActivosDespues: { id: string; nombre: string; dominio: string }[];
    }
  | { ok: false; error: string };

export const AUDIT_ACTION_BAJA = "deactivate";

/** Sólo el dominio del email: alcanza para identificar sin exponer la dirección completa. */
export function dominioDe(email: string): string {
  const i = email.lastIndexOf("@");
  return i >= 0 ? email.slice(i + 1) : "(sin dominio)";
}

export async function bajaDeUsuariosPorSlug(
  db: PrismaClient,
  {
    slug,
    confirmacion,
    actor,
    ids,
    aplicar,
  }: { slug: string; confirmacion: string; actor: string; ids: string[]; aplicar: boolean },
): Promise<ResultadoBajaPorSlug> {
  if (!actor.trim()) return { ok: false, error: "Falta quién firma la auditoría." };
  if (!slug.trim() || confirmacion.trim().toLowerCase() !== slug.trim().toLowerCase()) {
    return { ok: false, error: "La confirmación no coincide con el slug del negocio." };
  }
  const unicos = [...new Set(ids.map((s) => s.trim()).filter(Boolean))];
  if (unicos.length === 0) return { ok: false, error: "No se indicó a quién dar de baja." };
  const tenant = await db.tenant.findUnique({ where: { slug: slug.trim().toLowerCase() }, select: { id: true } });
  if (!tenant) return { ok: false, error: "Ese negocio no existe." };
  const tenantId = tenant.id;
  const firma = `operator:${actor.trim()}`;

  return enElNegocio(
    tenantId,
    async (tx: Prisma.TransactionClient): Promise<ResultadoBajaPorSlug> => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`usuarios:${tenantId}`}))`;

      const usuarios = await tx.user.findMany({
        where: { tenantId, id: { in: unicos } },
        select: { id: true, name: true, email: true, role: true, active: true, deletedAt: true },
      });
      const faltan = unicos.filter((id) => !usuarios.some((u) => u.id === id));
      if (faltan.length) return { ok: false, error: `No son usuarios de este negocio: ${faltan.join(", ")}. No se tocó nada.` };

      const filas: FilaDeBaja[] = unicos.map((id) => {
        const u = usuarios.find((x) => x.id === id)!;
        return {
          id: u.id,
          nombre: u.name,
          rol: u.role,
          dominio: dominioDe(u.email),
          activoAntes: u.active,
          activoDespues: false,
          cambia: u.active,
        };
      });

      const dueniosAntes = await tx.user.findMany({
        where: { tenantId, role: "OWNER", active: true, deletedAt: null },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, name: true, email: true },
      });
      const seVan = new Set(filas.filter((f) => f.cambia).map((f) => f.id));
      const quedan = dueniosAntes.filter((d) => !seVan.has(d.id));
      if (quedan.length < 1) return { ok: false, error: "El negocio quedaría sin dueño activo. No se tocó nada." };
      const dueniosActivosDespues = quedan.map((d) => ({ id: d.id, nombre: d.name, dominio: dominioDe(d.email) }));

      if (!aplicar) return { ok: true, aplicado: false, tenantId, filas, dueniosActivosDespues };

      for (const f of filas) {
        if (!f.cambia) continue;
        const r = await tx.user.updateMany({ where: { id: f.id, tenantId, active: true }, data: { active: false } });
        if (r.count !== 1) throw new Error(`La baja de ${f.id} no se escribió: se deshace todo.`);
        const a = await tx.auditLog.create({
          data: {
            tenantId,
            actor: firma,
            action: AUDIT_ACTION_BAJA,
            entity: "User",
            entityId: f.id,
            changes: { active: false },
            channel: "admin",
          },
          select: { id: true },
        });
        f.auditId = a.id;
      }

      // Verificación dentro de la misma transacción: cada fila inactiva y, la que cambió, con su auditoría.
      const despues = await tx.user.findMany({ where: { tenantId, id: { in: unicos } }, select: { id: true, active: true } });
      for (const f of filas) {
        if (despues.find((d) => d.id === f.id)?.active !== false) throw new Error(`${f.id} sigue activo: se deshace todo.`);
      }
      const duenios = await tx.user.count({ where: { tenantId, role: "OWNER", active: true, deletedAt: null } });
      if (duenios < 1) throw new Error("El negocio quedó sin dueño activo: se deshace todo.");

      return { ok: true, aplicado: true, tenantId, filas, dueniosActivosDespues };
    },
    db,
  );
}

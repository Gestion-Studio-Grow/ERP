// Acceso común del LABORATORIO (pedido del dueño, 2026-09-25): un mismo usuario y una misma clave
// para entrar en todos los negocios de una base local, y todos los usuarios que ya había vuelven a
// entrar (activos, sin baja) con esa misma clave. Es para probar: nunca corre contra Neon (la
// guarda es la del seed, src/lib/seed/guarda-base.ts, y la aplica scripts/lab-acceso-comun.mts).
//
// Se corre con el ROL DUEÑO de las tablas (exento de RLS): tiene que ver a todos los negocios.
// Todo va en una transacción. Antes de confirmar se entrega el RESPALDO (cómo estaba cada usuario y
// qué filas se crearon, y cómo queda cada negocio) a quien llama; si guardarlo falla, no cambia nada. `revertirAccesoComun`
// deja cada usuario exactamente como estaba (clave, rol, alta/baja, updatedAt) y borra los creados.
//
// La clave llega ya convertida en hash (scrypt, src/lib/auth-password.ts): este módulo no la ve.

import { randomUUID } from "node:crypto";
import type pg from "pg";

export const EMAIL_COMUN = "gsg@gsg.lab";
export const NOMBRE_COMUN = "GSG (acceso común del laboratorio)";

export interface UsuarioComoEstaba {
  id: string;
  tenantId: string;
  email: string;
  role: string;
  passwordHash: string;
  active: boolean;
  deletedAt: string | null;
  updatedAt: string;
}

export interface RespaldoDeAcceso {
  version: 1;
  tomadoEn: string;
  usuarios: UsuarioComoEstaba[];
  /** Ids de los usuarios comunes que se crearon (la reversa los borra). */
  creados: string[];
}

export interface AccesoDelNegocio {
  slug: string;
  nombre: string;
  subdominio: string | null;
  usuarios: { email: string; rol: string }[];
}

export interface OpcionesAccesoComun {
  email: string;
  nombre: string;
  hashDeLaClave: string;
  /** Se llama antes de confirmar, con el respaldo y cómo queda cada negocio: si falla, no cambia nada. */
  guardarRespaldo: (respaldo: RespaldoDeAcceso, negocios: AccesoDelNegocio[]) => void | Promise<void>;
}

async function enTransaccion<T>(db: pg.ClientBase, fn: () => Promise<T>): Promise<T> {
  await db.query("BEGIN");
  try {
    const r = await fn();
    await db.query("COMMIT");
    return r;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
}

export async function restaurarAccesoComun(
  db: pg.ClientBase,
  o: OpcionesAccesoComun,
): Promise<AccesoDelNegocio[]> {
  return enTransaccion(db, async () => {
    const negocios = await db.query<{ id: string; slug: string; name: string; subdomain: string | null }>(
      `SELECT id, slug, name, subdomain FROM "Tenant" ORDER BY slug FOR UPDATE`,
    );
    if (negocios.rows.length === 0) {
      throw new Error("No se ve ningún negocio: este paso se corre con el rol dueño de las tablas.");
    }
    const antes = await db.query<{
      id: string; tenantId: string; email: string; role: string; passwordHash: string;
      active: boolean; deletedAt: string | null; updatedAt: string;
    }>(
      // Las fechas viajan como TEXTO de la columna (timestamp(3) sin zona): la reversa las
      // escribe tal cual, sin pasar por la zona horaria del proceso ni de la sesión.
      `SELECT id, "tenantId", email, role::text AS role, "passwordHash", active,
              "deletedAt"::text AS "deletedAt", "updatedAt"::text AS "updatedAt"
         FROM "User" ORDER BY id FOR UPDATE`,
    );
    const conComun = new Set(antes.rows.filter((u) => u.email === o.email).map((u) => u.tenantId));
    const aCrear = negocios.rows
      .filter((n) => !conComun.has(n.id))
      .map((n) => ({ id: `lab-${randomUUID()}`, tenantId: n.id }));

    const respaldo: RespaldoDeAcceso = {
      version: 1,
      tomadoEn: new Date().toISOString(),
      usuarios: antes.rows.map((u) => ({
        id: u.id,
        tenantId: u.tenantId,
        email: u.email,
        role: u.role,
        passwordHash: u.passwordHash,
        active: u.active,
        deletedAt: u.deletedAt,
        updatedAt: u.updatedAt,
      })),
      creados: aCrear.map((u) => u.id),
    };

    for (const u of aCrear) {
      await db.query(
        `INSERT INTO "User" (id, "tenantId", name, email, "passwordHash", role, active, "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 'OWNER', true, now())`,
        [u.id, u.tenantId, o.nombre, o.email, o.hashDeLaClave],
      );
    }
    await db.query(
      `UPDATE "User" SET "passwordHash" = $1, active = true, "deletedAt" = NULL, "updatedAt" = now()`,
      [o.hashDeLaClave],
    );
    await db.query(`UPDATE "User" SET role = 'OWNER' WHERE email = $1`, [o.email]);

    const despues = await db.query<{ tenantId: string; email: string; role: string }>(
      `SELECT "tenantId", email, role::text AS role FROM "User" ORDER BY email`,
    );
    const acceso = negocios.rows.map((n) => ({
      slug: n.slug,
      nombre: n.name,
      subdominio: n.subdomain,
      usuarios: despues.rows
        .filter((u) => u.tenantId === n.id)
        .map((u) => ({ email: u.email, rol: u.role })),
    }));
    await o.guardarRespaldo(respaldo, acceso);
    return acceso;
  });
}

/** Deja cada usuario como estaba en el respaldo y borra los usuarios comunes que se crearon. */
export async function revertirAccesoComun(db: pg.ClientBase, respaldo: RespaldoDeAcceso): Promise<number> {
  if (respaldo.version !== 1 || !Array.isArray(respaldo.usuarios) || !Array.isArray(respaldo.creados)) {
    throw new Error("El archivo no es un respaldo de acceso común reconocible.");
  }
  return enTransaccion(db, async () => {
    await db.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [respaldo.creados]);
    let restaurados = 0;
    for (const u of respaldo.usuarios) {
      const r = await db.query(
        `UPDATE "User"
            SET "passwordHash" = $2, role = $3::"UserRole", active = $4,
                "deletedAt" = $5::timestamp(3), "updatedAt" = $6::timestamp(3)
          WHERE id = $1`,
        [u.id, u.passwordHash, u.role, u.active, u.deletedAt, u.updatedAt],
      );
      restaurados += r.rowCount ?? 0;
    }
    return restaurados;
  });
}

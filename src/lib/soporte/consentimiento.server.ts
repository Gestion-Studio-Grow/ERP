// ============================================================================
// MANTENIMIENTO GSG — guardar y leer el permiso del cliente (D4). SERVIDOR.
// ============================================================================
//
// La tabla `SoporteConsentimiento` está en prisma/pending-gate2/MANT_roles_soporte.sql (SIN aplicar:
// Gate 2 del dueño). Mientras no exista: leer da «sin permiso» (fail-closed) y guardar se rechaza
// sin escribir nada. Se pregunta con to_regclass ANTES de tocarla, para no abortar la transacción.
// Cada cambio es una fila nueva + su AuditLog, en la misma transacción parada en el negocio (RLS).
// La copia por mail (D4) la arma `mailDeCopiaDeConsentimiento` y NO se envía («Mails: sólo
// borradores»): queda como BORRADOR en AuditLog (entity `MailBorrador`, misma transacción) y la
// pantalla la muestra. Mandarla de verdad es una decisión aparte (T-B), que lee esos borradores.

import "server-only";
export type { CopiaEnBorrador } from "./consentimiento-core";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { enElNegocio } from "@/lib/operator-db";
import {
  SIN_CONSENTIMIENTO,
  TEXTO_CONSENTIMIENTO,
  consentimientoVigente,
  mailDeCopiaDeConsentimiento,
  validarConsentimiento,
  type Consentimiento,
  type CopiaEnBorrador,
  type FilaDeConsentimiento,
} from "./consentimiento-core";

type Tx = Prisma.TransactionClient;

async function hayTablaDeConsentimiento(tx: Tx): Promise<boolean> {
  const r = await tx.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('"SoporteConsentimiento"') IS NOT NULL AS ok`;
  return r[0]?.ok === true;
}

/** El permiso vigente del negocio. Sin tabla o sin filas: sin permiso. */
export async function leerConsentimiento(tenantId: string, db?: PrismaClient): Promise<Consentimiento> {
  return enElNegocio(
    tenantId,
    async (tx) => {
      if (!(await hayTablaDeConsentimiento(tx))) return SIN_CONSENTIMIENTO;
      const filas = await tx.$queryRaw<FilaDeConsentimiento[]>`
        SELECT nivel, aceptado, "versionTexto", "createdAt" FROM "SoporteConsentimiento"
        WHERE "tenantId" = ${tenantId} ORDER BY "createdAt" ASC`;
      return consentimientoVigente(filas);
    },
    db,
  );
}

/** Para la pantalla: si la tabla ya está (Gate 2) y el permiso vigente. Sin tabla: deshabilitado, sin permiso. */
export async function leerEstadoDelPermiso(tenantId: string, db?: PrismaClient): Promise<{ habilitado: boolean; vigente: Consentimiento }> {
  return enElNegocio(
    tenantId,
    async (tx) => {
      if (!(await hayTablaDeConsentimiento(tx))) return { habilitado: false, vigente: SIN_CONSENTIMIENTO };
      const filas = await tx.$queryRaw<FilaDeConsentimiento[]>`
        SELECT nivel, aceptado, "versionTexto", "createdAt" FROM "SoporteConsentimiento" WHERE "tenantId" = ${tenantId}`;
      return { habilitado: true, vigente: consentimientoVigente(filas) };
    },
    db,
  );
}

export type ResultadoDeConsentimiento =
  | { ok: true; vigente: Consentimiento }
  | { ok: false; error: string };

export type ResultadoConCopia =
  | { ok: true; vigente: Consentimiento; copia: CopiaEnBorrador }
  | { ok: false; error: string };

export const ENTIDAD_MAIL_BORRADOR = "MailBorrador";
export const ACCION_COPIA_DE_PERMISO = "soporte.permiso.copia_borrador";

const NO_ES_EL_TITULAR = "Sólo el titular del negocio puede dar o sacar este permiso.";

/**
 * Registra una casilla tildada o destildada. Sólo el titular (OWNER): el rol y el usuario los pasa
 * quien llama, leídos de la sesión, nunca del formulario; además el usuario tiene que ser un OWNER
 * activo DE ESTE negocio en la base (un id de otro negocio no escribe acá). Fila + AuditLog + borrador
 * de la copia por mail, todo en la misma transacción.
 */
export async function registrarConsentimientoConCopia(
  p: { tenantId: string; userId: string; rol: unknown; nivel: unknown; aceptado: unknown },
  db?: PrismaClient,
  ahora: Date = new Date(),
): Promise<ResultadoConCopia> {
  const v = validarConsentimiento(p);
  if (!v.ok) return v;
  return enElNegocio(
    p.tenantId,
    async (tx): Promise<ResultadoConCopia> => {
      if (!(await hayTablaDeConsentimiento(tx))) {
        return { ok: false, error: "Este permiso todavía no está habilitado. Avisanos y lo activamos." };
      }
      const titular = await tx.user.findFirst({
        where: { id: p.userId, tenantId: p.tenantId, role: "OWNER", active: true },
        select: { email: true },
      });
      if (!titular) return { ok: false, error: NO_ES_EL_TITULAR };
      // Candado por negocio: dos clics a la vez no leen el mismo «antes».
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`soporte-permiso:${p.tenantId}`}))`;
      if (v.valor.nivel === "n2" && v.valor.aceptado) {
        const antes = await tx.$queryRaw<FilaDeConsentimiento[]>`
          SELECT nivel, aceptado, "versionTexto", "createdAt" FROM "SoporteConsentimiento" WHERE "tenantId" = ${p.tenantId}`;
        if (!consentimientoVigente(antes).n1) return { ok: false, error: "Primero da el permiso de lectura: sin él, el segundo no vale." };
      }
      const negocio = await tx.tenant.findUnique({ where: { id: p.tenantId }, select: { name: true } });
      const id = randomUUID();
      await tx.$executeRaw`
        INSERT INTO "SoporteConsentimiento" (id, "tenantId", nivel, aceptado, "versionTexto", "userId")
        VALUES (${id}, ${p.tenantId}, ${v.valor.nivel}, ${v.valor.aceptado}, ${TEXTO_CONSENTIMIENTO.version}, ${p.userId})`;
      await tx.auditLog.create({
        data: {
          tenantId: p.tenantId,
          actor: `user:${p.userId}`,
          action: v.valor.aceptado ? "soporte.permiso.dar" : "soporte.permiso.sacar",
          entity: "SoporteConsentimiento",
          entityId: id,
          changes: { nivel: v.valor.nivel, aceptado: v.valor.aceptado, versionTexto: TEXTO_CONSENTIMIENTO.version },
          channel: "admin",
        },
      });
      const mail = mailDeCopiaDeConsentimiento({ negocio: negocio?.name ?? "tu negocio", nivel: v.valor.nivel, aceptado: v.valor.aceptado, cuando: ahora });
      const copia: CopiaEnBorrador = { para: titular.email, ...mail };
      await tx.auditLog.create({
        data: {
          tenantId: p.tenantId,
          actor: `user:${p.userId}`,
          action: ACCION_COPIA_DE_PERMISO,
          entity: ENTIDAD_MAIL_BORRADOR,
          entityId: id,
          changes: { ...copia, enviado: false, versionTexto: TEXTO_CONSENTIMIENTO.version },
          channel: "admin",
        },
      });
      const filas = await tx.$queryRaw<FilaDeConsentimiento[]>`
        SELECT nivel, aceptado, "versionTexto", "createdAt" FROM "SoporteConsentimiento" WHERE "tenantId" = ${p.tenantId}`;
      return { ok: true, vigente: consentimientoVigente(filas), copia };
    },
    db,
  );
}

/** Lo mismo, sin devolver la copia (la deja igual en borrador). */
export async function registrarConsentimiento(
  p: { tenantId: string; userId: string; rol: unknown; nivel: unknown; aceptado: unknown },
  db?: PrismaClient,
): Promise<ResultadoDeConsentimiento> {
  const r = await registrarConsentimientoConCopia(p, db);
  return r.ok ? { ok: true, vigente: r.vigente } : r;
}

/**
 * La última copia en borrador del negocio (para mostrarla en pantalla). Sin filas: null. Sólo las que
 * escribió el panel del titular (actor `user:…`, canal admin, acción y entidad exactas): nunca una fila
 * de un agente (`agente:…`), que además la base le impide escribir (MANT_roles_soporte.sql §5).
 */
export async function ultimaCopiaEnBorrador(tenantId: string, db?: PrismaClient): Promise<(CopiaEnBorrador & { createdAt: Date }) | null> {
  return enElNegocio(
    tenantId,
    async (tx) => {
      const f = await tx.auditLog.findFirst({
        where: { tenantId, entity: ENTIDAD_MAIL_BORRADOR, action: ACCION_COPIA_DE_PERMISO, actor: { startsWith: "user:" }, channel: "admin" },
        orderBy: { createdAt: "desc" },
        select: { changes: true, createdAt: true },
      });
      const c = f?.changes as Record<string, unknown> | null | undefined;
      if (!f || !c || typeof c.asunto !== "string" || typeof c.cuerpo !== "string") return null;
      return { para: typeof c.para === "string" ? c.para : "", asunto: c.asunto, cuerpo: c.cuerpo, createdAt: f.createdAt };
    },
    db,
  );
}

// ============================================================================
// MANTENIMIENTO GSG — guardar y leer el permiso del cliente (D4). SERVIDOR.
// ============================================================================
//
// La tabla `SoporteConsentimiento` está en prisma/pending-gate2/MANT_roles_soporte.sql (SIN aplicar:
// Gate 2 del dueño). Mientras no exista: leer da «sin permiso» (fail-closed) y guardar se rechaza
// sin escribir nada. Se pregunta con to_regclass ANTES de tocarla, para no abortar la transacción.
// Cada cambio es una fila nueva + su AuditLog, en la misma transacción parada en el negocio (RLS).
// La copia por mail (D4) la arma `mailDeCopiaDeConsentimiento`; el envío lo hace quien llama (T-B).

import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { enElNegocio } from "@/lib/operator-db";
import {
  SIN_CONSENTIMIENTO,
  TEXTO_CONSENTIMIENTO,
  consentimientoVigente,
  validarConsentimiento,
  type Consentimiento,
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
        SELECT nivel, aceptado, "createdAt" FROM "SoporteConsentimiento"
        WHERE "tenantId" = ${tenantId} ORDER BY "createdAt" ASC`;
      return consentimientoVigente(filas);
    },
    db,
  );
}

export type ResultadoDeConsentimiento =
  | { ok: true; vigente: Consentimiento }
  | { ok: false; error: string };

/**
 * Registra una casilla tildada o destildada. Sólo el titular (OWNER): el rol lo pasa quien llama,
 * leído de la sesión, nunca del formulario. Fila + AuditLog en la misma transacción.
 */
export async function registrarConsentimiento(
  p: { tenantId: string; userId: string; rol: unknown; nivel: unknown; aceptado: unknown },
  db?: PrismaClient,
): Promise<ResultadoDeConsentimiento> {
  const v = validarConsentimiento(p);
  if (!v.ok) return v;
  return enElNegocio(
    p.tenantId,
    async (tx): Promise<ResultadoDeConsentimiento> => {
      if (!(await hayTablaDeConsentimiento(tx))) {
        return { ok: false, error: "Este permiso todavía no está habilitado. Avisanos y lo activamos." };
      }
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
      const filas = await tx.$queryRaw<FilaDeConsentimiento[]>`
        SELECT nivel, aceptado, "createdAt" FROM "SoporteConsentimiento" WHERE "tenantId" = ${p.tenantId}`;
      return { ok: true, vigente: consentimientoVigente(filas) };
    },
    db,
  );
}

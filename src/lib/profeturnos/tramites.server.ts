// PROFETURNOS · Registrar un trámite de arrepentimiento o de baja (núcleo puro en
// src/lib/factoque-tramites.ts, producto PROFETURNOS). Separado de las server actions para probarlo
// contra Postgres sin la sesión de Next.
//
//  · Público (sin cuenta, Res. SCI 424/2020): busca el negocio ProfeTurnos (blueprint `profe-padel`)
//    por el usuario de su link (subdominio o slug; Tenant no tiene RLS, `basePrisma` como el ruteo) y
//    sólo REGISTRA en su AuditLog, dentro de SU transacción (RLS). Anota si el email coincide con un
//    usuario del negocio, para que GSG lo valide; no se cambia el plan de nadie por saber un link.
//  · Con sesión del profe: en su transacción, con candado por negocio, pasa por el ENGANCHE de T2
//    (`efectoDelTramite`) y deja la fila. Hoy el efecto es siempre «registrado».

import "server-only";
import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import { logger } from "@/lib/logger";
import { PROFETURNOS, type DatosTramiteProfeturnos, type Efecto, type TipoTramite } from "@/lib/factoque-tramites";

type TenantTx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

/** Blueprint de los negocios ProfeTurnos (src/blueprints/oficios/rubros.ts). */
export const BLUEPRINT_PROFETURNOS = "profe-padel";

/**
 * ENGANCHE T2 (prueba gratis + abono MP, PLAN-SALIDA-2026-11 §5). Corre dentro de la transacción del
 * negocio y con el candado `profeturnos-plan:<tenantId>` ya tomado. Cuando exista el plan ProfeTurnos
 * (fila `profeturnos.plan` con `vigenciaHasta`), T2 tiene que:
 *   · arrepentimiento: cortar la vigencia del abono hoy (panel en modo lectura) y marcar la devolución;
 *   · baja: no renovar el abono (sin más cobros), sin borrar datos;
 * escribir la fila del plan con `por: PROFETURNOS.accion[tipo]` y `tramite: numero`, y devolver
 * «plan_a_gratis» (abono cancelado) o «ya_era_gratis» (no tenía abono). Los textos ya están en
 * `mensajeDelTramite(…, PROFETURNOS)`. Hasta entonces: «registrado», GSG lo procesa a mano.
 */
async function efectoDelTramite(_tx: TenantTx, _tenantId: string, _tipo: TipoTramite, _numero: string): Promise<Efecto> {
  return "registrado";
}

export async function registrarTramiteProfeturnos(
  tipo: TipoTramite,
  numero: string,
  datos: DatosTramiteProfeturnos,
  sesion: { tenantId: string; userId: string },
): Promise<{ numero: string; efecto: Efecto; tenantId: string }> {
  const { tenantId, userId } = sesion;
  const efecto = await tenantTransaction(
    async (tx): Promise<Efecto> => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`profeturnos-plan:${tenantId}`}))`;
      const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { blueprintId: true } });
      if (t?.blueprintId !== BLUEPRINT_PROFETURNOS) throw new Error("El trámite es del producto ProfeTurnos.");
      const efecto = await efectoDelTramite(tx, tenantId, tipo, numero);
      await tx.auditLog.create({
        data: {
          tenantId,
          actor: `user:${userId}`,
          action: PROFETURNOS.accion[tipo],
          entity: "Tenant",
          entityId: tenantId,
          changes: { tramite: numero, ...datos, efecto },
          channel: "admin",
        },
      });
      return efecto;
    },
    { tenantId },
  );
  return { numero, efecto, tenantId };
}

/**
 * Sin cuenta: sólo registra en el negocio ProfeTurnos de ese usuario. La acción lo llama con `after()`
 * (después de responder), así la respuesta no revela quién es cliente. Devuelve el negocio o null.
 */
export async function registrarTramiteProfeturnosPublico(tipo: TipoTramite, numero: string, datos: DatosTramiteProfeturnos): Promise<string | null> {
  const negocio = await basePrisma.tenant.findFirst({
    where: { blueprintId: BLUEPRINT_PROFETURNOS, OR: [{ subdomain: datos.usuario }, { slug: datos.usuario }] },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!negocio) {
    // Igual tiene número y el aviso a GSG: puede haber pagado sin haber terminado el alta.
    logger.info("profeturnos", "trámite público sin negocio con ese usuario", { tipo, numero });
    return null;
  }
  await tenantTransaction(
    async (tx) => {
      const usuario = await tx.user.findFirst({ where: { tenantId: negocio.id, email: datos.email, deletedAt: null }, select: { id: true } });
      await tx.auditLog.create({
        data: {
          tenantId: negocio.id,
          actor: `publico:${datos.email}`,
          action: PROFETURNOS.accion[tipo],
          entity: "Tenant",
          entityId: negocio.id,
          changes: { tramite: numero, ...datos, efecto: "registrado", emailCoincide: !!usuario },
          channel: "public",
        },
      });
    },
    { tenantId: negocio.id },
  );
  return negocio.id;
}

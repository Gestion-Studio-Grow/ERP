"use server";

// ============================================================================
// «CONFIRMAR SIN SEÑA» — la excepción de la seña obligatoria
// ============================================================================
//
// Con el interruptor «sena-obligatoria» prendido, `confirmarTurno` rechaza un turno que pide seña y
// no la tiene (`exigirSeniaParaConfirmar`). La dueña puede confirmarlo igual, con un motivo de al
// menos 10 letras que queda en la auditoría con su usuario. Capability propia
// (`agenda:confirmar-sin-senia`), sólo OWNER por defecto y fuera de la matriz por usuario.
// Escritura condicional `status = PENDING` y la auditoría en la MISMA transacción: si otro lo
// confirmó, canceló o completó, no pisa nada; si la auditoría no se escribe, no se confirma. Con el
// interruptor apagado se rechaza (no hay regla que exceptuar).
//
// Cada export de un archivo "use server" es un endpoint: acá hay UNO.

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { RechazoDeDominio, motivoMostrable } from "@/lib/rechazo-de-dominio";
import { esConflictoDeEscritura } from "@/lib/conflicto-de-escritura";
import { requireCapability, filtroSoloLoSuyo } from "@/lib/authz";
import { permisoEfectivo } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { isDemoSandbox } from "@/lib/demo-flag";
import { ACCION_CONFIRMAR_SIN_SENIA, validarConfirmarSinSenia } from "./sena-obligatoria-core";
import { auditarEnTx, senaObligatoriaEnTx } from "./sena-obligatoria";

const MENSAJE_SIN_REGLA = "Este negocio no exige la seña para confirmar: confirmalo con «Confirmar el turno».";
const CONFLICTO = "Hubo otro cambio en este turno al mismo tiempo. Recargá la agenda y probá de nuevo.";

export type ResultadoSinSenia = { ok: true } | { ok: false; error: string };

export async function confirmarSinSenia(appointmentId: unknown, motivo: unknown): Promise<ResultadoSinSenia> {
  const user = await requireCapability("agenda:confirmar-sin-senia");
  const v = validarConfirmarSinSenia({ puede: permisoEfectivo(user, "agenda:confirmar-sin-senia"), motivo });
  if (!v.ok) return v;
  if (isDemoSandbox()) return { ok: true }; // modo demo: no persiste
  const id = typeof appointmentId === "string" ? appointmentId.trim() : "";
  if (!id) return { ok: false, error: "Falta identificar el turno." };
  const tenantId = await getCurrentTenantId();
  // Todo o nada: el cambio de estado y su fila de auditoría (usuario + motivo) en la MISMA tx.
  try {
    await tenantTransaction(
      async (tx) => {
        // La excepción existe sólo donde la regla existe: con el interruptor apagado se confirma como siempre.
        if (!(await senaObligatoriaEnTx(tx, tenantId))) throw new RechazoDeDominio(MENSAJE_SIN_REGLA);
        const res = await tx.appointment.updateMany({
          where: { id, tenantId, status: "PENDING", ...filtroSoloLoSuyo(user) },
          data: { status: "CONFIRMED" },
        });
        if (res.count === 0) throw new RechazoDeDominio("Ese turno cambió recién (ya no está reservado). Recargá la agenda.");
        await auditarEnTx(tx, {
          tenantId,
          actor: `user:${user.id}`,
          action: ACCION_CONFIRMAR_SIN_SENIA,
          appointmentId: id,
          changes: { status: "CONFIRMED", sinSenia: true, motivo: v.motivo, usuario: { id: user.id, nombre: user.name, rol: user.role } },
        });
      },
      { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (e) {
    unstable_rethrow(e);
    if (esConflictoDeEscritura(e)) return { ok: false, error: CONFLICTO };
    const motivo = motivoMostrable(e);
    if (motivo !== null) return { ok: false, error: motivo };
    throw e;
  }
  revalidatePath("/admin");
  revalidatePath("/admin/turnos");
  revalidatePath("/admin/turnos/lista");
  revalidatePath("/admin/turnos/manana");
  return { ok: true };
}

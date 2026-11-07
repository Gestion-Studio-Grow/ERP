"use server";

// ============================================================================
// «CONFIRMAR SIN SEÑA» — la excepción de la seña obligatoria
// ============================================================================
//
// Con el interruptor «sena-obligatoria» prendido, `confirmarTurno` rechaza un turno que pide seña y
// no la tiene (`exigirSeniaParaConfirmar`). La dueña puede confirmarlo igual, con un motivo de al
// menos 10 letras que queda en la auditoría con su usuario. Capability propia
// (`agenda:confirmar-sin-senia`), sólo OWNER por defecto y fuera de la matriz por usuario.
// Escritura condicional `status = PENDING`: si otro lo confirmó, canceló o completó, no pisa nada.
//
// Cada export de un archivo "use server" es un endpoint: acá hay UNO.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability, filtroSoloLoSuyo } from "@/lib/authz";
import { permisoEfectivo } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { isDemoSandbox } from "@/lib/demo-flag";
import { auditAdmin } from "@/lib/audit-core";
import { validarConfirmarSinSenia } from "./sena-obligatoria-core";

export type ResultadoSinSenia = { ok: true } | { ok: false; error: string };

export async function confirmarSinSenia(appointmentId: unknown, motivo: unknown): Promise<ResultadoSinSenia> {
  const user = await requireCapability("agenda:confirmar-sin-senia");
  const v = validarConfirmarSinSenia({ puede: permisoEfectivo(user, "agenda:confirmar-sin-senia"), motivo });
  if (!v.ok) return v;
  if (isDemoSandbox()) return { ok: true }; // modo demo: no persiste
  const id = typeof appointmentId === "string" ? appointmentId.trim() : "";
  if (!id) return { ok: false, error: "Falta identificar el turno." };
  const tenantId = await getCurrentTenantId();
  const res = await prisma.appointment.updateMany({
    where: { id, tenantId, status: "PENDING", ...filtroSoloLoSuyo(user) },
    data: { status: "CONFIRMED" },
  });
  if (res.count === 0) return { ok: false, error: "Ese turno cambió recién (ya no está reservado). Recargá la agenda." };
  await auditAdmin({
    action: "confirm_sin_senia",
    entity: "Appointment",
    entityId: id,
    changes: { status: "CONFIRMED", sinSenia: true, motivo: v.motivo, usuario: { id: user.id, nombre: user.name, rol: user.role } },
  });
  revalidatePath("/admin");
  revalidatePath("/admin/turnos");
  revalidatePath("/admin/turnos/lista");
  revalidatePath("/admin/turnos/manana");
  return { ok: true };
}
